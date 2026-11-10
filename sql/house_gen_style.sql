-- Tom da Gen (comum | ironica | zen) na sessão da casa e nas prefs autenticadas.
-- Idempotente. Não aplicar daqui; rode no SQL Editor do projeto ahzsvjimyfzjcfuhgdgw.

alter table public.house_state
  add column if not exists gen_style text not null default 'comum';

alter table public.house_state
  add column if not exists voice_reload_at timestamptz;

alter table public.house_state
  drop constraint if exists house_state_gen_style_check;

alter table public.house_state
  add constraint house_state_gen_style_check
  check (gen_style in ('comum', 'ironica', 'zen'));

comment on column public.house_state.gen_style is
  'Tom da Gen nesta sessão: comum, ironica ou zen. Independente do perfil ZCEA da visita.';
comment on column public.house_state.voice_reload_at is
  'Quando o tom muda, a sessão Gemini Live precisa reconectar. Unity pode ler este timestamp.';

alter table public.house_prefs
  add column if not exists gen_style text not null default 'comum';

alter table public.house_prefs
  drop constraint if exists house_prefs_gen_style_check;

alter table public.house_prefs
  add constraint house_prefs_gen_style_check
  check (gen_style in ('comum', 'ironica', 'zen'));

comment on column public.house_prefs.gen_style is
  'Tom preferido da Gen para o usuário autenticado. A sessão ativa também grava em house_state.';
