-- Visitante sem conta (Supabase Anonymous sign-ins).
-- Ordem no SQL Editor: dossiers, sessions, app_state, admin_read, este arquivo, profile_id.
-- Também é preciso ligar Anonymous no dashboard (não dá para ligar só com SQL):
-- Authentication → Providers → Anonymous → Enable anonymous sign-ins.
--
-- profile_id entra nas tabelas dossiers e session_summaries. O GRANT da tabela
-- para authenticated já cobre a coluna nova. Não conceda a função ao papel anon.
--
-- Um sign-in anônimo cria usuário em auth.users com is_anonymous = true.
-- O JWT usa o papel `authenticated` e auth.uid() vem preenchido.
-- Esse usuário NÃO é o papel `anon` da chave pública (pedidos sem sessão).
-- As políticas existentes (auth.uid() = user_id) e o grant de
-- genjutsu_ensure_session() para `authenticated` já cobrem o visitante.
-- Este script só reafirma os grants. Não conceda a função ao papel `anon`:
-- sem sessão, auth.uid() é nulo e a função recusa.

grant select, insert, update, delete on public.dossiers to authenticated;
grant select, insert, update, delete on public.interactions to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update on public.session_summaries to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on function public.genjutsu_ensure_session() to authenticated;

comment on function public.genjutsu_ensure_session() is
  'Returns the session code for auth.uid(). Accepts Supabase anonymous users because they are role authenticated. Not granted to the anon key role.';
