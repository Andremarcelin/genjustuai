-- Preenche profile_id a partir do questionário já gravado em dossier_data.preferencias.
-- Não apaga linhas, não muda OAuth e não troca um profile_id ZCEA que já exista.
-- Rode depois de sql/profile_id.sql.
--
-- Regra (case-sensitive). O visitante não escolhe a casa; o par de respostas fecha o id:
--   tranquilo + frio           → Zen
--   tranquilo + quente | ameno → Acolhedor
--   agitado   + frio | ameno   → Cyber
--   agitado   + quente         → Excentrico
-- archetype legível: Excentrico → Excêntrico. Os outros três repetem o id.

create or replace function public.genjutsu_profile_id(p_ambiente text, p_tempo text)
returns text
language sql
immutable
as $$
  select case
    when p_ambiente = 'tranquilo' and p_tempo = 'frio' then 'Zen'
    when p_ambiente = 'tranquilo' and p_tempo in ('quente', 'ameno') then 'Acolhedor'
    when p_ambiente = 'agitado' and p_tempo in ('frio', 'ameno') then 'Cyber'
    when p_ambiente = 'agitado' and p_tempo = 'quente' then 'Excentrico'
    else null
  end
$$;

comment on function public.genjutsu_profile_id(text, text) is
  'Mapa do questionário para ProfileId do Quest: Zen, Cyber, Excentrico, Acolhedor.';

create or replace function public.genjutsu_profile_archetype(p_profile_id text)
returns text
language sql
immutable
as $$
  select case p_profile_id
    when 'Excentrico' then 'Excêntrico'
    when 'Zen' then 'Zen'
    when 'Cyber' then 'Cyber'
    when 'Acolhedor' then 'Acolhedor'
    else null
  end
$$;

revoke all on function public.genjutsu_profile_id(text, text) from public;
revoke all on function public.genjutsu_profile_archetype(text) from public;

do $$
declare
  rec record;
  mapped text;
  readable text;
  candidate text;
  who text;
  phrase text;
begin
  for rec in
    select
      d.user_id,
      d.session_code,
      d.full_name,
      d.email,
      d.updated_at,
      d.dossier_data->'preferencias'->>'clima_ambiente' as ambiente,
      d.dossier_data->'preferencias'->>'clima_tempo' as tempo,
      d.profile_id
    from public.dossiers d
    where coalesce(d.dossier_data->'preferencias'->>'clima_ambiente', '') <> ''
      and coalesce(d.dossier_data->'preferencias'->>'clima_tempo', '') <> ''
  loop
    mapped := public.genjutsu_profile_id(rec.ambiente, rec.tempo);
    if mapped is null then
      continue;
    end if;
    if rec.profile_id is not null and rec.profile_id is distinct from mapped then
      continue;
    end if;

    readable := public.genjutsu_profile_archetype(mapped);
    who := coalesce(nullif(btrim(rec.full_name), ''), nullif(btrim(rec.email), ''), 'Visitante');
    phrase := case mapped
      when 'Zen' then who || ', o dia abre em água parada. A casa pede silêncio e frescor: respire devagar, que o que é seu chega sem alarde.'
      when 'Cyber' then who || ', um pulso elétrico atravessa o cômodo. Hoje a casa pensa rápido com você — foco frio, gesto preciso, nada de espera.'
      when 'Excentrico' then who || ', o calor sobe e a casa perde a compostura. Hoje vale o gesto ousado: cor demais, riso alto, um caminho que só você inventa.'
      when 'Acolhedor' then who || ', o aconchego já guardou um lugar. Hoje a casa aquece quem fica: ofereça presença, e o calor volta em dobro.'
    end;
    phrase := phrase || ' Este cartão é só o resumo; o dossiê completo fica na conta.';

    if rec.session_code is null or btrim(rec.session_code) = '' then
      loop
        candidate := public.genjutsu_new_code();
        exit when not exists (
          select 1 from public.dossiers where session_code = candidate
        ) and not exists (
          select 1 from public.session_summaries where session_code = candidate
        );
      end loop;
      update public.dossiers
      set session_code = candidate
      where user_id = rec.user_id
        and (session_code is null or btrim(session_code) = '');
      rec.session_code := candidate;
    end if;

    update public.dossiers
    set
      profile_id = mapped,
      dossier_data = jsonb_set(
        dossier_data,
        '{preferencias,profile_id}',
        to_jsonb(mapped),
        true
      )
    where user_id = rec.user_id
      and (profile_id is null or profile_id = mapped);

    insert into public.session_summaries (
      session_code,
      user_id,
      display_name,
      personality_text,
      archetype,
      profile_id,
      updated_at
    )
    values (
      rec.session_code,
      rec.user_id,
      who,
      phrase,
      readable,
      mapped,
      coalesce(rec.updated_at, now())
    )
    on conflict (session_code) do update
    set
      display_name = excluded.display_name,
      personality_text = excluded.personality_text,
      archetype = excluded.archetype,
      profile_id = excluded.profile_id,
      updated_at = excluded.updated_at
    where public.session_summaries.profile_id is null
       or public.session_summaries.profile_id = excluded.profile_id;
  end loop;
end $$;
