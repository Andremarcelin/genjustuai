-- Mídia da Casa (TV / ambiente) para a Gen, o site e o Quest.
-- Rode depois de sql/house_devices.sql no projeto ahzsvjimyfzjcfuhgdgw.
-- Idempotente. Não apaga sessões. lights.main/lanterns continuam iguais.

alter table public.house_state
  add column if not exists media jsonb;

create or replace function genjutsu_internal.media_valid(media jsonb)
returns boolean
language sql
immutable
as $$
  select
    media is null
    or (
      jsonb_typeof(media) = 'object'
      and (media ->> 'type') in ('audio', 'video')
      and (media ->> 'url') ~ '^https://'
      and (media ->> 'device') in ('tv', 'ambiente')
      and jsonb_typeof(media -> 'playing') = 'boolean'
    )
$$;

revoke all on function genjutsu_internal.media_valid(jsonb) from public, anon, authenticated;

grant usage on schema genjutsu_internal to service_role;
grant execute on function genjutsu_internal.media_valid(jsonb) to service_role;

alter table public.house_state
  drop constraint if exists house_state_media_check;

alter table public.house_state
  add constraint house_state_media_check check (genjutsu_internal.media_valid(media));

comment on column public.house_state.media is
  'Faixa/filme livre (Archive/Jamendo). type audio|video, url https, title, artist, license, device tv|ambiente, playing, updated_at. Sem YouTube.';

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
    'media', NEW.media,
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

revoke all on function genjutsu_internal.broadcast_house_state() from public, anon, authenticated;
grant execute on function genjutsu_internal.broadcast_house_state() to service_role;
