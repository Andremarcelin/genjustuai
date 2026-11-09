-- Dispositivos da Casa (sala_luz, quarto_luz, abajur, fita_led, tv, ambiente).
-- Rode no SQL Editor depois de sql/house_state.sql, no projeto ahzsvjimyfzjcfuhgdgw.
-- Idempotente. Não apaga sessões. Mantém lights.main e lights.lanterns para o Quest.
-- Escrita só pela service role (API). Leitura RLS: dono da sessão (authenticated).
-- O Quest continua lendo por GET /api/house/state e pelo broadcast público.

create schema if not exists genjutsu_internal;

revoke all on schema genjutsu_internal from public;
revoke all on schema genjutsu_internal from anon, authenticated;

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
    "ambiente":{"on":false,"color":"#FF1A1A","intensity":0.3}
  }'::jsonb
$$;

revoke all on function genjutsu_internal.default_lights() from public, anon, authenticated;

create or replace function genjutsu_internal.device_cell_valid(cell jsonb)
returns boolean
language sql
immutable
as $$
  select
    jsonb_typeof(cell) = 'object'
    and jsonb_typeof(cell -> 'on') = 'boolean'
    and (cell ->> 'color') ~ '^#[0-9A-Fa-f]{6}$'
    and (cell ->> 'intensity')::numeric between 0 and 1
$$;

revoke all on function genjutsu_internal.device_cell_valid(jsonb) from public, anon, authenticated;

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
$$;

revoke all on function genjutsu_internal.lights_valid(jsonb) from public, anon, authenticated;

alter table public.house_state
  drop constraint if exists house_state_lights_check;

alter table public.house_state
  add constraint house_state_lights_check check (genjutsu_internal.lights_valid(lights));

update public.house_state
set lights = lights
  || jsonb_build_object(
    'sala_luz', coalesce(
      lights -> 'sala_luz',
      jsonb_build_object(
        'on', coalesce((lights -> 'main' ->> 'intensity')::numeric, 0) > 0.02,
        'color', coalesce(lights -> 'main' ->> 'color', '#FF1A1A'),
        'intensity', coalesce((lights -> 'main' ->> 'intensity')::numeric, 0.35)
      )
    ),
    'quarto_luz', coalesce(
      lights -> 'quarto_luz',
      jsonb_build_object(
        'on', coalesce((lights -> 'lanterns' ->> 'intensity')::numeric, 0) > 0.02,
        'color', coalesce(lights -> 'lanterns' ->> 'color', '#FF1A1A'),
        'intensity', coalesce((lights -> 'lanterns' ->> 'intensity')::numeric, 0.2)
      )
    ),
    'abajur', coalesce(lights -> 'abajur', '{"on":false,"color":"#FFAA00","intensity":0.45}'::jsonb),
    'fita_led', coalesce(lights -> 'fita_led', '{"on":false,"color":"#7C3AED","intensity":0.55}'::jsonb),
    'tv', coalesce(lights -> 'tv', '{"on":false,"color":"#3B82F6","intensity":0.7}'::jsonb),
    'ambiente', coalesce(lights -> 'ambiente', '{"on":false,"color":"#FF1A1A","intensity":0.3}'::jsonb)
  ),
  updated_at = now()
where lights is not null;

drop policy if exists "public read house state" on public.house_state;
drop policy if exists "owner reads house state" on public.house_state;

create policy "owner reads house state"
  on public.house_state
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.session_summaries s
      where s.session_code = house_state.session_id
        and s.user_id = auth.uid()
    )
  );

revoke all on public.house_state from anon;
revoke all on public.house_state from authenticated;
grant select on public.house_state to authenticated;
revoke all on public.house_commands from anon, authenticated, public;

comment on policy "owner reads house state" on public.house_state is
  'Só o dono da sessão lê a linha. Insert/update/delete continuam sem policy: só a service role escreve. O Quest lê GET /api/house/state.';

comment on table public.house_state is
  'Estado visual da casa por sessão. lights.main/lanterns = contrato Quest. Device ids: sala_luz, quarto_luz, abajur, fita_led, tv, ambiente ({ on, color, intensity }).';
