-- Rode no SQL Editor depois de sql/dossiers.sql
-- Códigos estáveis por usuário + logs privados + resumo público (NFC)

alter table public.dossiers
  add column if not exists session_code text;

create unique index if not exists dossiers_session_code_key
  on public.dossiers (session_code)
  where session_code is not null;

create table if not exists public.interactions (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_code text not null,
  kind text not null,
  payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.conversations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_code text not null,
  role text not null,
  content text not null,
  created_at timestamptz default now()
);

create table if not exists public.session_summaries (
  session_code text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  personality_text text,
  archetype text,
  updated_at timestamptz default now()
);

alter table public.interactions enable row level security;
alter table public.conversations enable row level security;
alter table public.session_summaries enable row level security;

drop policy if exists "own interactions" on public.interactions;
create policy "own interactions" on public.interactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own conversations" on public.conversations;
create policy "own conversations" on public.conversations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "owner writes summary" on public.session_summaries;
create policy "owner writes summary" on public.session_summaries
  for insert with check (auth.uid() = user_id);

drop policy if exists "owner updates summary" on public.session_summaries;
create policy "owner updates summary" on public.session_summaries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public read summary" on public.session_summaries;
create policy "public read summary" on public.session_summaries
  for select using (true);

grant select on public.session_summaries to anon, authenticated;
grant insert, update on public.session_summaries to authenticated;
grant all on public.interactions to authenticated;
grant all on public.conversations to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function public.genjutsu_new_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..6 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create or replace function public.genjutsu_ensure_session()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  existing text;
  candidate text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select session_code into existing
  from public.dossiers
  where user_id = uid;

  if existing is not null and length(existing) > 0 then
    return existing;
  end if;

  insert into public.dossiers (user_id)
  values (uid)
  on conflict (user_id) do nothing;

  loop
    candidate := public.genjutsu_new_code();
    begin
      update public.dossiers
      set session_code = candidate
      where user_id = uid
        and (session_code is null or session_code = '');
      if found then
        return candidate;
      end if;
      select session_code into existing from public.dossiers where user_id = uid;
      return existing;
    exception
      when unique_violation then
        null;
    end;
  end loop;
end;
$$;

revoke all on function public.genjutsu_ensure_session() from public;
grant execute on function public.genjutsu_ensure_session() to authenticated;

create or replace function public.genjutsu_freeze_session_code()
returns trigger
language plpgsql
as $$
begin
  if old.session_code is not null
     and length(trim(old.session_code)) > 0
     and new.session_code is distinct from old.session_code then
    new.session_code := old.session_code;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_freeze_session_code on public.dossiers;
create trigger trg_freeze_session_code
before update on public.dossiers
for each row
execute function public.genjutsu_freeze_session_code();
