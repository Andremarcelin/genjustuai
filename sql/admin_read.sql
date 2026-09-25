-- Cole este arquivo inteiro no SQL Editor do Supabase e clique Run.
-- Só dossiers existia; o admin não via ninguém por causa do RLS.

alter table public.dossiers
  add column if not exists session_code text;

create unique index if not exists dossiers_session_code_key
  on public.dossiers (session_code)
  where session_code is not null;

create table if not exists public.app_state (
  id int primary key default 1 check (id = 1),
  current_session_code text,
  updated_at timestamptz default now()
);

insert into public.app_state (id) values (1) on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists "public read app state" on public.app_state;
create policy "public read app state" on public.app_state
  for select using (true);

grant select on public.app_state to anon, authenticated;

create table if not exists public.session_summaries (
  session_code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  personality_text text,
  archetype text,
  updated_at timestamptz default now()
);

alter table public.session_summaries enable row level security;

drop policy if exists "public read summary" on public.session_summaries;
create policy "public read summary" on public.session_summaries
  for select using (true);

drop policy if exists "owner writes summary" on public.session_summaries;
create policy "owner writes summary" on public.session_summaries
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner updates summary" on public.session_summaries;
create policy "owner updates summary" on public.session_summaries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.session_summaries to anon, authenticated;
grant insert, update on public.session_summaries to authenticated;

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
