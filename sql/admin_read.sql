-- Rode no SQL Editor (depois de sessions.sql e app_state.sql).
-- Admin e Quest passam a usar a chave de leitura (anon / publishable), sem service_role.

create or replace function public.genjutsu_recent_signups()
returns table (
  session_code text,
  display_name text,
  email text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
stable
as $$
  select
    d.session_code,
    coalesce(nullif(trim(d.full_name), ''), nullif(trim(d.email), ''), 'Sem nome') as display_name,
    coalesce(d.email, '') as email,
    d.updated_at
  from public.dossiers d
  where d.session_code is not null
    and length(trim(d.session_code)) > 0
  order by d.updated_at desc
  limit 30;
$$;

revoke all on function public.genjutsu_recent_signups() from public;
grant execute on function public.genjutsu_recent_signups() to anon, authenticated;

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
