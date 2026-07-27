begin;

create table if not exists public.debt_plans (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  original_amount numeric(15, 2) not null default 0,
  target_date date,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint debt_plans_original_amount_non_negative
    check (original_amount >= 0),
  constraint debt_plans_description_length
    check (description is null or char_length(description) <= 180)
);

create table if not exists public.debt_payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  amount numeric(15, 2) not null,
  balance_before numeric(15, 2) not null,
  balance_after numeric(15, 2) not null,
  notes text,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint debt_payments_amount_positive check (amount > 0),
  constraint debt_payments_balances_non_negative
    check (balance_before >= 0 and balance_after >= 0),
  constraint debt_payments_notes_length
    check (notes is null or char_length(notes) <= 120)
);

create index if not exists debt_plans_workspace_id_idx
  on public.debt_plans(workspace_id);

create index if not exists debt_payments_workspace_account_paid_at_idx
  on public.debt_payments(workspace_id, account_id, paid_at desc);

alter table public.debt_plans enable row level security;
alter table public.debt_payments enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'debt_plans'
      and policyname = 'Owners can view debt plans'
  ) then
    create policy "Owners can view debt plans"
      on public.debt_plans
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.workspaces as workspace
          where workspace.id = debt_plans.workspace_id
            and workspace.owner_id = auth.uid()
            and workspace.is_active = true
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'debt_payments'
      and policyname = 'Owners can view debt payments'
  ) then
    create policy "Owners can view debt payments"
      on public.debt_payments
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.workspaces as workspace
          where workspace.id = debt_payments.workspace_id
            and workspace.owner_id = auth.uid()
            and workspace.is_active = true
        )
      );
  end if;
end
$$;

grant select on public.debt_plans to authenticated;
grant select on public.debt_payments to authenticated;

insert into public.debt_plans (
  account_id,
  workspace_id,
  original_amount
)
select
  account.id,
  account.workspace_id,
  coalesce(latest.balance, 0)
from public.accounts as account
left join lateral (
  select snapshot.balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = account.id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1
) as latest on true
where account.account_type::text = 'credit'
  and account.is_active = true
on conflict (account_id) do update
set
  original_amount = greatest(
    public.debt_plans.original_amount,
    excluded.original_amount
  ),
  updated_at = now();

create or replace function public.update_debt_plan(
  p_account_id uuid,
  p_original_amount numeric,
  p_target_date date,
  p_description text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_current_balance numeric;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select account.workspace_id
    into v_workspace_id
  from public.accounts as account
  join public.workspaces as workspace
    on workspace.id = account.workspace_id
  where account.id = p_account_id
    and account.account_type::text = 'credit'
    and account.is_active = true
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of account;

  if not found then
    raise exception 'No encontramos la deuda o no tienes permisos para editarla.';
  end if;

  select snapshot.balance
    into v_current_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = p_account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

  if p_original_amount is null or p_original_amount <= 0 then
    raise exception 'El monto inicial debe ser mayor a cero.';
  end if;

  if p_original_amount < v_current_balance then
    raise exception 'El monto inicial no puede ser menor al saldo pendiente.';
  end if;

  if p_description is not null and char_length(btrim(p_description)) > 180 then
    raise exception 'La nota del plan no puede exceder 180 caracteres.';
  end if;

  insert into public.debt_plans (
    account_id,
    workspace_id,
    original_amount,
    target_date,
    description
  )
  values (
    p_account_id,
    v_workspace_id,
    p_original_amount,
    p_target_date,
    nullif(btrim(p_description), '')
  )
  on conflict (account_id) do update
  set
    original_amount = excluded.original_amount,
    target_date = excluded.target_date,
    description = excluded.description,
    updated_at = now();
end;
$$;

create or replace function public.record_debt_payment(
  p_account_id uuid,
  p_amount numeric,
  p_notes text default null
)
returns table (
  paid_amount numeric,
  new_balance numeric
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_current_balance numeric;
  v_new_balance numeric;
  v_check_in_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select account.*
    into v_account
  from public.accounts as account
  join public.workspaces as workspace
    on workspace.id = account.workspace_id
  where account.id = p_account_id
    and account.account_type::text = 'credit'
    and account.is_active = true
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of account;

  if not found then
    raise exception 'No encontramos la deuda o no tienes permisos para abonarla.';
  end if;

  select snapshot.balance
    into v_current_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = p_account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);

  if p_amount is null or p_amount <= 0 then
    raise exception 'El abono debe ser mayor a cero.';
  end if;

  if p_amount > v_current_balance then
    raise exception 'El abono no puede ser mayor al saldo pendiente.';
  end if;

  if p_notes is not null and char_length(btrim(p_notes)) > 120 then
    raise exception 'La nota del abono no puede exceder 120 caracteres.';
  end if;

  insert into public.debt_plans (
    account_id,
    workspace_id,
    original_amount
  )
  values (
    p_account_id,
    v_account.workspace_id,
    v_current_balance
  )
  on conflict (account_id) do update
  set
    original_amount = greatest(
      public.debt_plans.original_amount,
      excluded.original_amount
    ),
    updated_at = now();

  v_new_balance := v_current_balance - p_amount;

  insert into public.check_ins (
    workspace_id,
    check_in_type,
    check_in_date,
    notes
  )
  values (
    v_account.workspace_id,
    'manual_update',
    current_date,
    'Abono registrado para la deuda ' || v_account.name
  )
  returning id into v_check_in_id;

  insert into public.account_snapshots (
    check_in_id,
    workspace_id,
    account_id,
    balance
  )
  values (
    v_check_in_id,
    v_account.workspace_id,
    p_account_id,
    v_new_balance
  );

  insert into public.debt_payments (
    workspace_id,
    account_id,
    amount,
    balance_before,
    balance_after,
    notes
  )
  values (
    v_account.workspace_id,
    p_account_id,
    p_amount,
    v_current_balance,
    v_new_balance,
    nullif(btrim(p_notes), '')
  );

  paid_amount := p_amount;
  new_balance := v_new_balance;
  return next;
end;
$$;

create or replace function public.sync_debt_plan_from_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account_type text;
  v_is_active boolean;
  v_recorded_payments numeric;
begin
  select account.account_type::text, account.is_active
    into v_account_type, v_is_active
  from public.accounts as account
  where account.id = new.account_id;

  if v_account_type = 'credit' and v_is_active then
    select coalesce(sum(payment.amount), 0)
      into v_recorded_payments
    from public.debt_payments as payment
    where payment.account_id = new.account_id;

    insert into public.debt_plans (
      account_id,
      workspace_id,
      original_amount
    )
    values (
      new.account_id,
      new.workspace_id,
      new.balance + v_recorded_payments
    )
    on conflict (account_id) do update
    set
      original_amount = greatest(
        public.debt_plans.original_amount,
        excluded.original_amount
      ),
      updated_at = now();
  end if;

  return new;
end;
$$;

create or replace function public.sync_debt_plan_from_account()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_latest_balance numeric;
  v_recorded_payments numeric;
begin
  if new.account_type::text = 'credit' and new.is_active then
    select snapshot.balance
      into v_latest_balance
    from public.account_snapshots as snapshot
    where snapshot.account_id = new.id
    order by snapshot.created_at desc, snapshot.id desc
    limit 1;

    if v_latest_balance is not null then
      select coalesce(sum(payment.amount), 0)
        into v_recorded_payments
      from public.debt_payments as payment
      where payment.account_id = new.id;

      insert into public.debt_plans (
        account_id,
        workspace_id,
        original_amount
      )
      values (
        new.id,
        new.workspace_id,
        v_latest_balance + v_recorded_payments
      )
      on conflict (account_id) do update
      set
        original_amount = greatest(
          public.debt_plans.original_amount,
          excluded.original_amount
        ),
        updated_at = now();
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_debt_plan_after_snapshot
  on public.account_snapshots;
create trigger sync_debt_plan_after_snapshot
after insert on public.account_snapshots
for each row execute function public.sync_debt_plan_from_snapshot();

drop trigger if exists sync_debt_plan_after_account_change
  on public.accounts;
create trigger sync_debt_plan_after_account_change
after insert or update of account_type, is_active on public.accounts
for each row execute function public.sync_debt_plan_from_account();

revoke all on function public.update_debt_plan(
  uuid,
  numeric,
  date,
  text
) from public;
grant execute on function public.update_debt_plan(
  uuid,
  numeric,
  date,
  text
) to authenticated;

revoke all on function public.record_debt_payment(
  uuid,
  numeric,
  text
) from public;
grant execute on function public.record_debt_payment(
  uuid,
  numeric,
  text
) to authenticated;

revoke all on function public.sync_debt_plan_from_snapshot() from public;
revoke all on function public.sync_debt_plan_from_account() from public;

commit;
