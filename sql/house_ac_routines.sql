-- Ar-condicionado + rotinas + preferências. Projeto ahzsvjimyfzjcfuhgdgw.
-- Rode depois de sql/house_devices.sql. Idempotente. GRANT EXECUTE para service_role.

create schema if not exists genjutsu_internal;
grant usage on schema genjutsu_internal to service_role;

create or replace function genjutsu_internal.ac_cell_valid(cell jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(cell) = 'object'
    and jsonb_typeof(cell -> 'on') = 'boolean'
    and (cell ->> 'temp')::numeric between 16 and 30
    and (cell ->> 'mode') in ('frio', 'ventilar', 'seco')
    and (cell ->> 'fan') in ('auto', '1', '2', '3')
$$;

revoke all on function genjutsu_internal.ac_cell_valid(jsonb) from public, anon, authenticated;
grant execute on function genjutsu_internal.ac_cell_valid(jsonb) to service_role;

create or replace function genjutsu_internal.default_lights()
returns jsonb
language sql
immutable
as $$
  select '{
    "main":{"intensity":0.35,"color":"#FF1A1A"},
    "lanterns":{"intensity":0.2,"color":"#FF1A1A"},
    "sala_luz":{"on":true,"color":"#FF1A1A","intensity":0.35},
    "quarto_luz":{"on":false,"color":"#FF1A1A","intensity":0.2},
    "abajur":{"on":false,"color":"#FFAA00","intensity":0.45},
    "fita_led":{"on":false,"color":"#7C3AED","intensity":0.55},
    "tv":{"on":false,"color":"#3B82F6","intensity":0.7},
    "ambiente":{"on":false,"color":"#FF1A1A","intensity":0.3},
    "ar_condicionado":{"on":false,"temp":22,"mode":"frio","fan":"auto","color":"#7DD3FC","intensity":0.35}
  }'::jsonb
$$;

revoke all on function genjutsu_internal.default_lights() from public, anon, authenticated;
grant execute on function genjutsu_internal.default_lights() to service_role;

create or replace function genjutsu_internal.lights_valid(lights jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(lights) = 'object'
    and lights ? 'main'
    and lights ? 'lanterns'
    and (lights -> 'main' ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
    and (lights -> 'lanterns' ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
    and (lights -> 'main' ->> 'intensity')::numeric between 0 and 1
    and (lights -> 'lanterns' ->> 'intensity')::numeric between 0 and 1
    and (
      not (lights ? 'sala_luz') or genjutsu_internal.device_cell_valid(lights -> 'sala_luz')
    )
    and (
      not (lights ? 'quarto_luz') or genjutsu_internal.device_cell_valid(lights -> 'quarto_luz')
    )
    and (
      not (lights ? 'abajur') or genjutsu_internal.device_cell_valid(lights -> 'abajur')
    )
    and (
      not (lights ? 'fita_led') or genjutsu_internal.device_cell_valid(lights -> 'fita_led')
    )
    and (
      not (lights ? 'tv') or genjutsu_internal.device_cell_valid(lights -> 'tv')
    )
    and (
      not (lights ? 'ambiente') or genjutsu_internal.device_cell_valid(lights -> 'ambiente')
    )
    and (
      not (lights ? 'ar_condicionado') or genjutsu_internal.ac_cell_valid(lights -> 'ar_condicionado')
    )
$$;

revoke all on function genjutsu_internal.lights_valid(jsonb) from public, anon, authenticated;
grant execute on function genjutsu_internal.lights_valid(jsonb) to service_role;
grant execute on function genjutsu_internal.device_cell_valid(jsonb) to service_role;

alter table public.house_state
  drop constraint if exists house_state_lights_check;

alter table public.house_state
  add constraint house_state_lights_check check (genjutsu_internal.lights_valid(lights));

update public.house_state
set lights = lights || jsonb_build_object(
  'ar_condicionado',
  coalesce(
    lights -> 'ar_condicionado',
    '{"on":false,"temp":22,"mode":"frio","fan":"auto","color":"#7DD3FC","intensity":0.35}'::jsonb
  )
),
updated_at = now()
where lights is not null
  and not (lights ? 'ar_condicionado');

create table if not exists public.house_prefs (
  user_id uuid primary key,
  profanity boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.house_prefs enable row level security;

drop policy if exists "owner reads house prefs" on public.house_prefs;
create policy "owner reads house prefs"
  on public.house_prefs
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "owner writes house prefs" on public.house_prefs;
create policy "owner writes house prefs"
  on public.house_prefs
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

revoke all on public.house_prefs from anon;
grant select, insert, update on public.house_prefs to authenticated;

create table if not exists public.house_routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  session_id text,
  name text not null,
  schedule jsonb not null,
  actions jsonb not null,
  enabled boolean not null default true,
  created_by text not null default 'user',
  hint text,
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.house_routines
  drop constraint if exists house_routines_created_by_check;
alter table public.house_routines
  add constraint house_routines_created_by_check
  check (created_by in ('user', 'gen_suggestion'));

create index if not exists house_routines_user_idx on public.house_routines (user_id, enabled);

alter table public.house_routines enable row level security;

drop policy if exists "owner reads house routines" on public.house_routines;
create policy "owner reads house routines"
  on public.house_routines
  for select
  to authenticated
  using (user_id = auth.uid());

revoke all on public.house_routines from anon, authenticated, public;
grant select on public.house_routines to authenticated;

comment on table public.house_routines is
  'Rotinas da casa. Leitura RLS do dono. Escrita só pela service role (API). Horário America/Sao_Paulo.';
comment on table public.house_prefs is
  'Preferência de palavrão da Gen por usuário. GEN_PROFANITY no servidor é o interruptor global.';
