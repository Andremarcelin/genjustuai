-- Migração aditiva do perfil demo ZCEA (Zen, Cyber, Excentrico, Acolhedor).
-- Não cria projeto, não apaga OAuth e não recria as policies de leitura.
-- Rode no SQL Editor depois de sql/sessions.sql ou sql/admin_read.sql.

alter table public.session_summaries
  add column if not exists profile_id text;

alter table public.dossiers
  add column if not exists profile_id text;

alter table public.session_summaries
  drop constraint if exists session_summaries_profile_id_check;

alter table public.session_summaries
  add constraint session_summaries_profile_id_check
  check (
    profile_id is null
    or profile_id in ('Zen', 'Cyber', 'Excentrico', 'Acolhedor')
  );

alter table public.dossiers
  drop constraint if exists dossiers_profile_id_check;

alter table public.dossiers
  add constraint dossiers_profile_id_check
  check (
    profile_id is null
    or profile_id in ('Zen', 'Cyber', 'Excentrico', 'Acolhedor')
  );

comment on column public.session_summaries.profile_id is
  'ProfileId da demo Quest: Zen, Cyber, Excentrico ou Acolhedor. archetype continua o alias legível.';

comment on column public.dossiers.profile_id is
  'Mesmo ProfileId ZCEA do questionário. O par clima_ambiente/clima_tempo segue em dossier_data.preferencias.';

-- A policy "public read summary" (SELECT using true) e o GRANT SELECT
-- para anon/authenticated já cobrem a coluna nova. Não recriar.

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'session_summaries'
      and policyname = 'public read summary'
      and cmd = 'SELECT'
  ) then
    raise exception 'policy "public read summary" ausente; rode sql/sessions.sql ou sql/admin_read.sql antes';
  end if;
end $$;
