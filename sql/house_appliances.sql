-- Porta, cafeteira e ventilador em house_state.lights.
-- Rode depois de sql/house_ac_routines.sql. Idempotente. Defaults para linhas antigas.

create schema if not exists genjutsu_internal;
grant usage on schema genjutsu_internal to service_role;

create or replace function genjutsu_internal.porta_cell_valid(cell jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(cell) = 'object'
    and jsonb_typeof(cell -> 'aberta') = 'boolean'
    and jsonb_typeof(cell -> 'trancada') = 'boolean'
$$;

create or replace function genjutsu_internal.cafe_cell_valid(cell jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(cell) = 'object'
    and (cell ->> 'estado') in ('desligada', 'preparando', 'pronta')
$$;

create or replace function genjutsu_internal.ventilador_cell_valid(cell jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(cell) = 'object'
    and (cell ->> 'vel')::numeric in (0, 1, 2, 3)
$$;

revoke all on function genjutsu_internal.porta_cell_valid(jsonb) from public, anon, authenticated;
revoke all on function genjutsu_internal.cafe_cell_valid(jsonb) from public, anon, authenticated;
revoke all on function genjutsu_internal.ventilador_cell_valid(jsonb) from public, anon, authenticated;
grant execute on function genjutsu_internal.porta_cell_valid(jsonb) to service_role;
grant execute on function genjutsu_internal.cafe_cell_valid(jsonb) to service_role;
grant execute on function genjutsu_internal.ventilador_cell_valid(jsonb) to service_role;

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
    "ar_condicionado":{"on":false,"temp":22,"mode":"frio","fan":"auto","color":"#7DD3FC","intensity":0.35},
    "porta":{"on":false,"aberta":false,"trancada":true,"color":"#8B5A2B","intensity":0.2},
    "cafe":{"on":false,"estado":"desligada","ready_at":null,"color":"#FF8C00","intensity":0.2},
    "ventilador":{"on":false,"vel":0,"color":"#94A3B8","intensity":0.15}
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
    and (
      not (lights ? 'porta') or genjutsu_internal.porta_cell_valid(lights -> 'porta')
    )
    and (
      not (lights ? 'cafe') or genjutsu_internal.cafe_cell_valid(lights -> 'cafe')
    )
    and (
      not (lights ? 'ventilador') or genjutsu_internal.ventilador_cell_valid(lights -> 'ventilador')
    )
$$;

revoke all on function genjutsu_internal.lights_valid(jsonb) from public, anon, authenticated;
grant execute on function genjutsu_internal.lights_valid(jsonb) to service_role;
grant execute on function genjutsu_internal.device_cell_valid(jsonb) to service_role;
grant execute on function genjutsu_internal.ac_cell_valid(jsonb) to service_role;

alter table public.house_state
  drop constraint if exists house_state_lights_check;

alter table public.house_state
  add constraint house_state_lights_check check (genjutsu_internal.lights_valid(lights));

update public.house_state
set lights = lights
  || jsonb_build_object(
    'porta',
    coalesce(lights -> 'porta', '{"on":false,"aberta":false,"trancada":true,"color":"#8B5A2B","intensity":0.2}'::jsonb)
  )
  || jsonb_build_object(
    'cafe',
    coalesce(lights -> 'cafe', '{"on":false,"estado":"desligada","ready_at":null,"color":"#FF8C00","intensity":0.2}'::jsonb)
  )
  || jsonb_build_object(
    'ventilador',
    coalesce(lights -> 'ventilador', '{"on":false,"vel":0,"color":"#94A3B8","intensity":0.15}'::jsonb)
  ),
updated_at = now()
where lights is not null
  and (
    not (lights ? 'porta')
    or not (lights ? 'cafe')
    or not (lights ? 'ventilador')
  );
