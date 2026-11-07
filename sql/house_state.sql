-- Estado da casa para a Gen e para o Quest.
-- Rode no SQL Editor depois de sql/session_lifecycle.sql.
-- Idempotente. Não apaga sessões. Não mexe em profile_id.
-- Escrita só pelo service role (a API) e pelos triggers abaixo.
-- A landing e o Unity leem por GET /api/house/state ou pelo broadcast público.

create schema if not exists genjutsu_internal;

revoke all on schema genjutsu_internal from public;
revoke all on schema genjutsu_internal from anon, authenticated;

create table if not exists public.house_state (
  session_id text primary key
    references public.session_summaries (session_code) on delete cascade,
  version integer not null default 0,
  mode text not null default 'hub',
  dojo text,
  lights jsonb not null,
  ambience jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.house_commands (
  id bigint generated always as identity primary key,
  session_id text not null
    references public.session_summaries (session_code) on delete cascade,
  version integer,
  tool text not null,
  args jsonb not null default '{}'::jsonb,
  status text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists house_commands_session_created_idx
  on public.house_commands (session_id, created_at desc);

comment on table public.house_state is
  'Estado visual da casa por sessão. Sem nome e sem resposta de questionário.';

comment on table public.house_commands is
  'Log das ferramentas da Gen. Escrita só no servidor, com a service role.';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'house_state_version_check'
      and conrelid = 'public.house_state'::regclass
  ) then
    alter table public.house_state
      add constraint house_state_version_check check (version >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'house_state_mode_check'
      and conrelid = 'public.house_state'::regclass
  ) then
    alter table public.house_state
      add constraint house_state_mode_check check (
        (mode = 'hub' and dojo is null)
        or (mode = 'dojo' and dojo in ('Zen', 'Cyber', 'Excentrico', 'Acolhedor'))
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'house_state_lights_check'
      and conrelid = 'public.house_state'::regclass
  ) then
    alter table public.house_state
      add constraint house_state_lights_check check (
        jsonb_typeof(lights) = 'object'
        and lights ? 'main'
        and lights ? 'lanterns'
        and (lights -> 'main' ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
        and (lights -> 'lanterns' ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
        and (lights -> 'main' ->> 'intensity')::numeric between 0 and 1
        and (lights -> 'lanterns' ->> 'intensity')::numeric between 0 and 1
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'house_state_ambience_check'
      and conrelid = 'public.house_state'::regclass
  ) then
    alter table public.house_state
      add constraint house_state_ambience_check check (
        jsonb_typeof(ambience) = 'object'
        and (ambience ->> 'preset') in ('quiet', 'rain', 'bamboo', 'night')
        and (ambience ->> 'volume')::numeric between 0 and 0.5
      );
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'house_commands_status_check'
      and conrelid = 'public.house_commands'::regclass
  ) then
    alter table public.house_commands
      add constraint house_commands_status_check
      check (status in ('accepted', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'house_commands_args_check'
      and conrelid = 'public.house_commands'::regclass
  ) then
    alter table public.house_commands
      add constraint house_commands_args_check
      check (jsonb_typeof(args) = 'object');
  end if;
end $$;

create or replace function genjutsu_internal.default_lights()
returns jsonb
language sql
immutable
as $$
  select '{"main":{"intensity":0.35,"color":"#FF1A1A"},"lanterns":{"intensity":0.2,"color":"#FF1A1A"}}'::jsonb
$$;

create or replace function genjutsu_internal.default_ambience()
returns jsonb
language sql
immutable
as $$
  select '{"preset":"quiet","volume":0.15}'::jsonb
$$;

revoke all on function genjutsu_internal.default_lights() from public, anon, authenticated;
revoke all on function genjutsu_internal.default_ambience() from public, anon, authenticated;

create or replace function genjutsu_internal.reset_house_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if NEW.status is distinct from 'ended' or OLD.status is not distinct from 'ended' then
    return null;
  end if;

  begin
    insert into public.house_state (
      session_id, version, mode, dojo, lights, ambience, updated_at
    ) values (
      NEW.session_code,
      1,
      'hub',
      null,
      genjutsu_internal.default_lights(),
      genjutsu_internal.default_ambience(),
      now()
    )
    on conflict (session_id) do update
      set version = public.house_state.version + 1,
          mode = 'hub',
          dojo = null,
          lights = excluded.lights,
          ambience = excluded.ambience,
          updated_at = now();
  exception when others then
    raise warning 'house reset failed: %', sqlerrm;
  end;

  return null;
end;
$$;

create or replace function genjutsu_internal.broadcast_house_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  payload jsonb;
begin
  payload := jsonb_build_object(
    'session_id', NEW.session_id,
    'version', NEW.version,
    'mode', NEW.mode,
    'dojo', NEW.dojo,
    'lights', NEW.lights,
    'ambience', NEW.ambience,
    'updated_at', NEW.updated_at
  );

  begin
    perform realtime.send(
      payload => payload,
      event => 'house_state_changed',
      topic => 'house:' || NEW.session_id,
      private => false
    );
  exception when others then
    raise warning 'house_state broadcast failed: %', sqlerrm;
  end;

  return null;
end;
$$;

comment on function genjutsu_internal.broadcast_house_state() is
  'Broadcast público em house:<session_id>, evento house_state_changed. O payload não tem nome nem questionário.';

comment on function genjutsu_internal.reset_house_on_session_end() is
  'Quando a sessão passa a ended, devolve a casa ao hub. Não mexe no profile_id.';

revoke all on function genjutsu_internal.reset_house_on_session_end() from public, anon, authenticated;
revoke all on function genjutsu_internal.broadcast_house_state() from public, anon, authenticated;

drop trigger if exists trg_reset_house_on_session_end on public.session_summaries;
create trigger trg_reset_house_on_session_end
after update of status on public.session_summaries
for each row
when (NEW.status = 'ended' and OLD.status is distinct from 'ended')
execute function genjutsu_internal.reset_house_on_session_end();

drop trigger if exists trg_broadcast_house_state on public.house_state;
create trigger trg_broadcast_house_state
after insert or update on public.house_state
for each row
execute function genjutsu_internal.broadcast_house_state();

alter table public.house_state enable row level security;
alter table public.house_commands enable row level security;

drop policy if exists "public read house state" on public.house_state;
create policy "public read house state"
  on public.house_state
  for select
  to anon, authenticated
  using (true);

revoke all on public.house_state from anon, authenticated;
grant select on public.house_state to anon, authenticated;

revoke all on public.house_commands from anon, authenticated, public;

comment on policy "public read house state" on public.house_state is
  'Leitura do estado visual. A linha não guarda nome nem quiz. Insert, update e delete ficam sem policy: só a service role escreve.';
