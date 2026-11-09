-- Rotinas anônimas da sessão ativa (sem login). user_id passa a ser opcional.
-- Escrita continua só pela service role. RLS do dono segue valendo quando há user_id.

alter table public.house_routines
  alter column user_id drop not null;

alter table public.house_routines
  drop constraint if exists house_routines_owner_check;

alter table public.house_routines
  add constraint house_routines_owner_check
  check (user_id is not null or (session_id is not null and length(btrim(session_id)) > 0));

create index if not exists house_routines_session_idx
  on public.house_routines (session_id)
  where session_id is not null;

comment on column public.house_routines.session_id is
  'Código da sessão da casa. Obrigatório quando user_id é nulo (visitante / sessão ativa).';
comment on column public.house_routines.user_id is
  'Dono autenticado. Nulo nas rotinas da sessão anônima.';
