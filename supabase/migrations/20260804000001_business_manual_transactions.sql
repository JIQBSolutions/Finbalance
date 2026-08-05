begin;

alter table public.transactions
  add column if not exists category text,
  add column if not exists counterparty text,
  add column if not exists reference text,
  add column if not exists notes text,
  add column if not exists check_in_id uuid references public.check_ins(id) on delete set null,
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists is_voided boolean not null default false,
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references auth.users(id) on delete set null;

update public.transactions
set category = 'Otros'
where category is null or nullif(btrim(category), '') is null;

alter table public.transactions
  alter column category set default 'Otros',
  alter column category set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_category_length'
  ) then
    alter table public.transactions
      add constraint transactions_category_length
      check (char_length(btrim(category)) between 1 and 50);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_counterparty_length'
  ) then
    alter table public.transactions
      add constraint transactions_counterparty_length
      check (counterparty is null or char_length(counterparty) <= 80);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_reference_length'
  ) then
    alter table public.transactions
      add constraint transactions_reference_length
      check (reference is null or char_length(reference) <= 60);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.transactions'::regclass
      and conname = 'transactions_notes_length'
  ) then
    alter table public.transactions
      add constraint transactions_notes_length
      check (notes is null or char_length(notes) <= 300);
  end if;
end
$$;

create index if not exists transactions_workspace_date_idx
  on public.transactions(workspace_id, transaction_date desc, created_at desc);

create index if not exists transactions_workspace_active_idx
  on public.transactions(workspace_id, is_voided, transaction_type);

alter table public.transactions enable row level security;
grant select on public.transactions to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'transactions'
      and policyname = 'Owners can view workspace transactions'
  ) then
    create policy "Owners can view workspace transactions"
      on public.transactions
      for select
      to authenticated
      using (
        exists (
          select 1
          from public.workspaces as workspace
          where workspace.id = transactions.workspace_id
            and workspace.owner_id = auth.uid()
            and workspace.is_active = true
        )
      );
  end if;
end
$$;

create or replace function public.create_business_manual_transaction(
  p_workspace_id uuid,
  p_account_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_description text,
  p_category text,
  p_transaction_date timestamptz,
  p_counterparty text default null,
  p_reference text default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_current_balance numeric;
  v_new_balance numeric;
  v_check_in_id uuid;
  v_transaction_id uuid;
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
    and account.workspace_id = p_workspace_id
    and account.account_type::text in ('bank', 'cash')
    and account.is_active = true
    and workspace.workspace_type::text = 'business'
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of account;

  if not found then
    raise exception 'Selecciona una cuenta operativa de tu workspace de empresa.';
  end if;

  if p_transaction_type not in ('income', 'expense') then
    raise exception 'El tipo de movimiento no es válido.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if nullif(btrim(p_description), '') is null or char_length(btrim(p_description)) > 100 then
    raise exception 'El concepto debe tener entre 1 y 100 caracteres.';
  end if;

  if nullif(btrim(p_category), '') is null or char_length(btrim(p_category)) > 50 then
    raise exception 'Selecciona una categoría válida.';
  end if;

  if p_transaction_date is null then
    raise exception 'Ingresa la fecha del movimiento.';
  end if;

  if p_transaction_date::date > current_date then
    raise exception 'La fecha del movimiento no puede estar en el futuro.';
  end if;

  if p_counterparty is not null and char_length(btrim(p_counterparty)) > 80 then
    raise exception 'El cliente o proveedor no puede exceder 80 caracteres.';
  end if;

  if p_reference is not null and char_length(btrim(p_reference)) > 60 then
    raise exception 'La referencia no puede exceder 60 caracteres.';
  end if;

  if p_notes is not null and char_length(btrim(p_notes)) > 300 then
    raise exception 'Las notas no pueden exceder 300 caracteres.';
  end if;

  select snapshot.balance
    into v_current_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = p_account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);
  v_new_balance := case
    when p_transaction_type = 'income' then v_current_balance + p_amount
    else v_current_balance - p_amount
  end;

  if v_new_balance < 0 then
    raise exception 'El gasto supera el saldo disponible de la cuenta seleccionada.';
  end if;

  insert into public.check_ins (
    workspace_id,
    check_in_type,
    check_in_date,
    notes
  )
  values (
    p_workspace_id,
    'manual_update',
    current_date,
    case
      when p_transaction_type = 'income' then 'Ingreso manual: '
      else 'Gasto manual: '
    end || btrim(p_description)
  )
  returning id into v_check_in_id;

  insert into public.account_snapshots (
    check_in_id,
    workspace_id,
    account_id,
    balance
  )
  select
    v_check_in_id,
    account.workspace_id,
    account.id,
    case
      when account.id = p_account_id then v_new_balance
      else coalesce(latest.balance, 0)
    end
  from public.accounts as account
  left join lateral (
    select snapshot.balance
    from public.account_snapshots as snapshot
    where snapshot.account_id = account.id
    order by snapshot.created_at desc, snapshot.id desc
    limit 1
  ) as latest on true
  where account.workspace_id = p_workspace_id
    and account.is_active = true;

  insert into public.transactions (
    workspace_id,
    account_id,
    transaction_type,
    amount,
    description,
    category,
    transaction_date,
    counterparty,
    reference,
    notes,
    check_in_id,
    created_by
  )
  values (
    p_workspace_id,
    p_account_id,
    p_transaction_type::public.transaction_type,
    p_amount,
    btrim(p_description),
    btrim(p_category),
    p_transaction_date,
    nullif(btrim(p_counterparty), ''),
    nullif(btrim(p_reference), ''),
    nullif(btrim(p_notes), ''),
    v_check_in_id,
    auth.uid()
  )
  returning id into v_transaction_id;

  return v_transaction_id;
end;
$$;

create or replace function public.update_business_manual_transaction(
  p_transaction_id uuid,
  p_account_id uuid,
  p_transaction_type text,
  p_amount numeric,
  p_description text,
  p_category text,
  p_transaction_date timestamptz,
  p_counterparty text default null,
  p_reference text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions%rowtype;
  v_old_current_balance numeric;
  v_new_current_balance numeric;
  v_old_adjusted_balance numeric;
  v_new_adjusted_balance numeric;
  v_check_in_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select movement.*
    into v_transaction
  from public.transactions as movement
  join public.workspaces as workspace
    on workspace.id = movement.workspace_id
  where movement.id = p_transaction_id
    and movement.is_voided = false
    and movement.transaction_type::text in ('income', 'expense')
    and workspace.workspace_type::text = 'business'
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of transaction;

  if not found then
    raise exception 'No encontramos el movimiento o ya fue cancelado.';
  end if;

  perform 1
  from public.accounts as account
  where account.id in (v_transaction.account_id, p_account_id)
  order by account.id
  for update;

  if not exists (
    select 1
    from public.accounts as account
    where account.id = v_transaction.account_id
      and account.workspace_id = v_transaction.workspace_id
      and account.account_type::text in ('bank', 'cash')
      and account.is_active = true
  ) then
    raise exception 'La cuenta original ya no está activa; reactívala antes de corregir el movimiento.';
  end if;

  if not exists (
    select 1
    from public.accounts as account
    where account.id = p_account_id
      and account.workspace_id = v_transaction.workspace_id
      and account.account_type::text in ('bank', 'cash')
      and account.is_active = true
  ) then
    raise exception 'Selecciona una cuenta operativa activa del mismo workspace.';
  end if;

  if p_transaction_type not in ('income', 'expense') then
    raise exception 'El tipo de movimiento no es válido.';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'El monto debe ser mayor a cero.';
  end if;

  if nullif(btrim(p_description), '') is null or char_length(btrim(p_description)) > 100 then
    raise exception 'El concepto debe tener entre 1 y 100 caracteres.';
  end if;

  if nullif(btrim(p_category), '') is null or char_length(btrim(p_category)) > 50 then
    raise exception 'Selecciona una categoría válida.';
  end if;

  if p_transaction_date is null or p_transaction_date::date > current_date then
    raise exception 'Ingresa una fecha válida que no esté en el futuro.';
  end if;

  if p_counterparty is not null and char_length(btrim(p_counterparty)) > 80 then
    raise exception 'El cliente o proveedor no puede exceder 80 caracteres.';
  end if;

  if p_reference is not null and char_length(btrim(p_reference)) > 60 then
    raise exception 'La referencia no puede exceder 60 caracteres.';
  end if;

  if p_notes is not null and char_length(btrim(p_notes)) > 300 then
    raise exception 'Las notas no pueden exceder 300 caracteres.';
  end if;

  select snapshot.balance
    into v_old_current_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = v_transaction.account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  v_old_current_balance := coalesce(v_old_current_balance, 0);
  v_old_adjusted_balance := v_old_current_balance + case
    when v_transaction.transaction_type::text = 'income' then -v_transaction.amount
    else v_transaction.amount
  end;

  if p_account_id = v_transaction.account_id then
    v_new_adjusted_balance := v_old_adjusted_balance + case
      when p_transaction_type = 'income' then p_amount
      else -p_amount
    end;
    v_old_adjusted_balance := v_new_adjusted_balance;
  else
    select snapshot.balance
      into v_new_current_balance
    from public.account_snapshots as snapshot
    where snapshot.account_id = p_account_id
    order by snapshot.created_at desc, snapshot.id desc
    limit 1;

    v_new_current_balance := coalesce(v_new_current_balance, 0);
    v_new_adjusted_balance := v_new_current_balance + case
      when p_transaction_type = 'income' then p_amount
      else -p_amount
    end;
  end if;

  if v_old_adjusted_balance < 0 or v_new_adjusted_balance < 0 then
    raise exception 'La corrección dejaría una cuenta con saldo negativo.';
  end if;

  insert into public.check_ins (
    workspace_id,
    check_in_type,
    check_in_date,
    notes
  )
  values (
    v_transaction.workspace_id,
    'manual_update',
    current_date,
    'Corrección de movimiento: ' || btrim(p_description)
  )
  returning id into v_check_in_id;

  insert into public.account_snapshots (
    check_in_id,
    workspace_id,
    account_id,
    balance
  )
  select
    v_check_in_id,
    account.workspace_id,
    account.id,
    case
      when account.id = v_transaction.account_id then v_old_adjusted_balance
      when account.id = p_account_id then v_new_adjusted_balance
      else coalesce(latest.balance, 0)
    end
  from public.accounts as account
  left join lateral (
    select snapshot.balance
    from public.account_snapshots as snapshot
    where snapshot.account_id = account.id
    order by snapshot.created_at desc, snapshot.id desc
    limit 1
  ) as latest on true
  where account.workspace_id = v_transaction.workspace_id
    and account.is_active = true;

  update public.transactions
  set
    account_id = p_account_id,
    transaction_type = p_transaction_type::public.transaction_type,
    amount = p_amount,
    description = btrim(p_description),
    category = btrim(p_category),
    transaction_date = p_transaction_date,
    counterparty = nullif(btrim(p_counterparty), ''),
    reference = nullif(btrim(p_reference), ''),
    notes = nullif(btrim(p_notes), ''),
    check_in_id = v_check_in_id,
    updated_at = now()
  where id = p_transaction_id;
end;
$$;

create or replace function public.void_business_manual_transaction(
  p_transaction_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_transaction public.transactions%rowtype;
  v_current_balance numeric;
  v_new_balance numeric;
  v_check_in_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Debes iniciar sesión.';
  end if;

  select movement.*
    into v_transaction
  from public.transactions as movement
  join public.workspaces as workspace
    on workspace.id = movement.workspace_id
  where movement.id = p_transaction_id
    and movement.is_voided = false
    and movement.transaction_type::text in ('income', 'expense')
    and workspace.workspace_type::text = 'business'
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of transaction;

  if not found then
    raise exception 'No encontramos el movimiento o ya fue cancelado.';
  end if;

  perform 1
  from public.accounts as account
  where account.id = v_transaction.account_id
  for update;

  if not exists (
    select 1
    from public.accounts as account
    where account.id = v_transaction.account_id
      and account.workspace_id = v_transaction.workspace_id
      and account.account_type::text in ('bank', 'cash')
      and account.is_active = true
  ) then
    raise exception 'La cuenta original ya no está activa; reactívala antes de cancelar el movimiento.';
  end if;

  select snapshot.balance
    into v_current_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = v_transaction.account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  v_current_balance := coalesce(v_current_balance, 0);
  v_new_balance := v_current_balance + case
    when v_transaction.transaction_type::text = 'income' then -v_transaction.amount
    else v_transaction.amount
  end;

  if v_new_balance < 0 then
    raise exception 'No puedes cancelar este ingreso porque la cuenta ya no tiene saldo suficiente.';
  end if;

  insert into public.check_ins (
    workspace_id,
    check_in_type,
    check_in_date,
    notes
  )
  values (
    v_transaction.workspace_id,
    'manual_update',
    current_date,
    'Cancelación de movimiento: ' || v_transaction.description
  )
  returning id into v_check_in_id;

  insert into public.account_snapshots (
    check_in_id,
    workspace_id,
    account_id,
    balance
  )
  select
    v_check_in_id,
    account.workspace_id,
    account.id,
    case
      when account.id = v_transaction.account_id then v_new_balance
      else coalesce(latest.balance, 0)
    end
  from public.accounts as account
  left join lateral (
    select snapshot.balance
    from public.account_snapshots as snapshot
    where snapshot.account_id = account.id
    order by snapshot.created_at desc, snapshot.id desc
    limit 1
  ) as latest on true
  where account.workspace_id = v_transaction.workspace_id
    and account.is_active = true;

  update public.transactions
  set
    is_voided = true,
    voided_at = now(),
    voided_by = auth.uid(),
    updated_at = now()
  where id = p_transaction_id;
end;
$$;

revoke all on function public.create_business_manual_transaction(
  uuid, uuid, text, numeric, text, text, timestamptz, text, text, text
) from public;
grant execute on function public.create_business_manual_transaction(
  uuid, uuid, text, numeric, text, text, timestamptz, text, text, text
) to authenticated;

revoke all on function public.update_business_manual_transaction(
  uuid, uuid, text, numeric, text, text, timestamptz, text, text, text
) from public;
grant execute on function public.update_business_manual_transaction(
  uuid, uuid, text, numeric, text, text, timestamptz, text, text, text
) to authenticated;

revoke all on function public.void_business_manual_transaction(uuid) from public;
grant execute on function public.void_business_manual_transaction(uuid) to authenticated;

commit;
