-- Ciclo da sessão do Quest: várias sessões por profile_id, uma ativa, encerrar.
-- Rode no SQL Editor depois de sql/profile_id.sql (e do backfill, se usar).
-- Idempotente. Não apaga linhas, não mexe em OAuth e não recria policies de leitura.
--
-- profile_id (Zen, Cyber, Excentrico, Acolhedor) NÃO é único.
-- Cada visita insere a própria linha em session_summaries, com session_code próprio.
-- O dossier guarda só o código mais recente daquela conta. O admin lista os resumos.

alter table public.session_summaries
  add column if not exists status text;

alter table public.session_summaries
  add column if not exists ended_at timestamptz;

update public.session_summaries
set status = 'ready'
where status is null
   or status not in ('ready', 'active', 'ended');

-- No máximo uma ativa. O ponteiro de app_state ganha, se a linha existir.
update public.session_summaries
set status = 'ready'
where status = 'active';

update public.session_summaries
set status = 'active',
    ended_at = null
where session_code is not null
  and session_code = (
    select current_session_code from public.app_state where id = 1
  );

alter table public.session_summaries
  alter column status set default 'ready';

update public.session_summaries
set status = 'ready'
where status is null;

alter table public.session_summaries
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'session_summaries_status_check'
      and conrelid = 'public.session_summaries'::regclass
  ) then
    alter table public.session_summaries
      add constraint session_summaries_status_check
      check (status in ('ready', 'active', 'ended'));
  end if;
end $$;

comment on column public.session_summaries.status is
  'ready: gravada e fora do Quest. active: a sessão que GET /api/session entrega. ended: encerrada; o Quest volta à sala branca.';

comment on column public.session_summaries.ended_at is
  'Preenchido quando o admin finaliza a sessão. Permanece nulo em ready e active.';

-- Remove unicidade por profile_id, se algum índice único tiver sido criado à mão.
-- Não mexe no primary key (session_code) nem no índice único de dossiers.session_code.
do $$
declare
  idx record;
begin
  for idx in
    select n.nspname as schema_name,
           ic.relname as index_name,
           pg_get_indexdef(i.indexrelid) as index_def
    from pg_index i
    join pg_class ic on ic.oid = i.indexrelid
    join pg_class tc on tc.oid = i.indrelid
    join pg_namespace n on n.oid = tc.relnamespace
    where n.nspname = 'public'
      and tc.relname in ('session_summaries', 'dossiers')
      and i.indisunique
      and pg_get_indexdef(i.indexrelid) ~* 'profile_id'
  loop
    if idx.index_def ~* 'session_code' or idx.index_def ~* '\(user_id\)' then
      continue;
    end if;
    execute format('drop index if exists %I.%I', idx.schema_name, idx.index_name);
  end loop;
end $$;

drop index if exists public.session_summaries_profile_id_key;
drop index if exists public.session_summaries_profile_id_uidx;
drop index if exists public.dossiers_profile_id_key;
drop index if exists public.dossiers_profile_id_uidx;

drop index if exists public.session_summaries_one_active_idx;
create unique index session_summaries_one_active_idx
  on public.session_summaries (status)
  where status = 'active';

create index if not exists session_summaries_updated_at_idx
  on public.session_summaries (updated_at desc);

-- O trigger antigo devolvia o código antigo e a visita seguinte sobrescrevia a mesma sessão.
drop trigger if exists trg_freeze_session_code on public.dossiers;

create or replace function public.genjutsu_freeze_session_code()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

comment on function public.genjutsu_freeze_session_code() is
  'Não trava mais session_code. Cada visita pode gravar um código novo; os resumos antigos ficam em session_summaries.';

create or replace function public.genjutsu_allocate_session_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  i int;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  for i in 1..32 loop
    candidate := public.genjutsu_new_code();
    if not exists (
      select 1 from public.session_summaries where session_code = candidate
    ) and not exists (
      select 1 from public.dossiers where session_code = candidate
    ) then
      return candidate;
    end if;
  end loop;

  raise exception 'session_code_exhausted';
end;
$$;

comment on function public.genjutsu_allocate_session_code() is
  'Novo código de 6 caracteres por visita. Não reutiliza o código do dossier nem colapsa por profile_id.';

revoke all on function public.genjutsu_allocate_session_code() from public;
grant execute on function public.genjutsu_allocate_session_code() to authenticated;

create or replace function public.genjutsu_set_current_session(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := upper(trim(p_code));
begin
  if code is null or code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'invalid_code';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'session_summaries'
      and column_name = 'status'
  ) then
    update public.session_summaries
    set status = 'ready',
        updated_at = now()
    where status = 'active'
      and session_code is distinct from code;

    update public.session_summaries
    set status = 'active',
        ended_at = null,
        updated_at = now()
    where session_code = code;
  end if;

  insert into public.app_state (id, current_session_code, updated_at)
  values (1, code, now())
  on conflict (id) do update
    set current_session_code = excluded.current_session_code,
        updated_at = now();

  return code;
end;
$$;

revoke all on function public.genjutsu_set_current_session(text) from public;
grant execute on function public.genjutsu_set_current_session(text) to anon, authenticated;

create or replace function public.genjutsu_end_session(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  code text := nullif(upper(trim(coalesce(p_code, ''))), '');
  current text;
begin
  select upper(current_session_code) into current
  from public.app_state
  where id = 1;

  if code is null then
    code := current;
  end if;

  if code is null or code = '' then
    return null;
  end if;

  if code !~ '^[A-HJ-NP-Z2-9]{6}$' then
    raise exception 'invalid_code';
  end if;

  update public.session_summaries
  set status = 'ended',
      ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where session_code = code
    and status is distinct from 'ended';

  update public.session_summaries
  set ended_at = coalesce(ended_at, now()),
      updated_at = now()
  where session_code = code
    and status = 'ended'
    and ended_at is null;

  update public.app_state
  set current_session_code = null,
      updated_at = now()
  where id = 1
    and upper(coalesce(current_session_code, '')) = code;

  return code;
end;
$$;

comment on function public.genjutsu_end_session(text) is
  'Marca a sessão como ended, grava ended_at e tira o código de app_state quando ele é o ativo. GET /api/session sem query passa a responder session null.';

revoke all on function public.genjutsu_end_session(text) from public;
grant execute on function public.genjutsu_end_session(text) to anon, authenticated;
