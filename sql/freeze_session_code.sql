-- Obsoleto como trava. Mantido para quem já rodou a versão que impedia mudar session_code.
-- Rode sql/session_lifecycle.sql em seguida: cada visita precisa do próprio código.
-- Vários visitantes podem ter o mesmo profile_id. O código é que distingue a sessão.

drop trigger if exists trg_freeze_session_code on public.dossiers;

create or replace function public.genjutsu_freeze_session_code()
returns trigger
language plpgsql
as $$
begin
  return new;
end;
$$;

comment on function public.genjutsu_freeze_session_code() is
  'Não trava mais session_code. A sessão de cada visita vive em session_summaries.';
