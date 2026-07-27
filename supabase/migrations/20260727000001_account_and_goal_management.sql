begin;

create or replace function public.update_financial_account(
  p_account_id uuid,
  p_name text,
  p_account_type text,
  p_balance numeric,
  p_currency text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_account public.accounts%rowtype;
  v_latest_balance numeric;
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
    and account.is_active = true
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of account;

  if not found then
    raise exception 'No encontramos la cuenta o no tienes permisos para editarla.';
  end if;

  if nullif(btrim(p_name), '') is null or char_length(btrim(p_name)) > 40 then
    raise exception 'El nombre de la cuenta debe tener entre 1 y 40 caracteres.';
  end if;

  if p_account_type not in ('bank', 'cash', 'credit', 'investment') then
    raise exception 'El tipo de cuenta no es válido.';
  end if;

  if p_balance is null or p_balance < 0 then
    raise exception 'El saldo debe ser un número mayor o igual a cero.';
  end if;

  if upper(btrim(p_currency)) !~ '^[A-Z]{3}$' then
    raise exception 'La moneda debe usar un código de tres letras.';
  end if;

  if exists (
    select 1
    from public.accounts as duplicate_account
    where duplicate_account.workspace_id = v_account.workspace_id
      and duplicate_account.id <> p_account_id
      and duplicate_account.is_active = true
      and lower(btrim(duplicate_account.name)) = lower(btrim(p_name))
  ) then
    raise exception 'Ya existe una cuenta activa con ese nombre.';
  end if;

  select snapshot.balance
    into v_latest_balance
  from public.account_snapshots as snapshot
  where snapshot.account_id = p_account_id
  order by snapshot.created_at desc, snapshot.id desc
  limit 1;

  update public.accounts
  set
    name = btrim(p_name),
    account_type = p_account_type,
    currency = upper(btrim(p_currency)),
    include_in_checkin = p_account_type in ('bank', 'cash')
  where id = p_account_id;

  if v_latest_balance is null or v_latest_balance is distinct from p_balance then
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
      'Saldo actualizado desde la edición de cuenta'
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
      p_balance
    );
  end if;
end;
$$;

create or replace function public.archive_financial_account(
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
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
    and account.is_active = true
    and workspace.is_active = true
    and workspace.owner_id = auth.uid()
  for update of account;

  if not found then
    raise exception 'No encontramos la cuenta o no tienes permisos para eliminarla.';
  end if;

  update public.accounts
  set
    is_active = false,
    include_in_checkin = false
  where id = p_account_id;
end;
$$;

revoke all on function public.update_financial_account(
  uuid,
  text,
  text,
  numeric,
  text
) from public;
grant execute on function public.update_financial_account(
  uuid,
  text,
  text,
  numeric,
  text
) to authenticated;

revoke all on function public.archive_financial_account(uuid) from public;
grant execute on function public.archive_financial_account(uuid) to authenticated;

alter table public.financial_goals enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'financial_goals'
      and policyname = 'Owners can delete financial goals'
  ) then
    create policy "Owners can delete financial goals"
      on public.financial_goals
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.workspaces as workspace
          where workspace.id = financial_goals.workspace_id
            and workspace.owner_id = auth.uid()
            and workspace.is_active = true
        )
      );
  end if;
end
$$;

commit;
