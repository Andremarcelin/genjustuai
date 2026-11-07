-- Histórico da Gen por visitante. Rode depois de sql/sessions.sql.
-- A pessoa autenticada (incluindo o sign-in anônimo) só lê as próprias linhas.
-- Insert fica sem policy: quem grava é a API, com a service role.
-- Não coloque a service role no navegador.

create table if not exists public.gen_history (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  session_code text not null,
  source text not null,
  role text not null,
  kind text not null,
  body text not null default '',
  tool text,
  args jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint gen_history_source_check check (source in ('chat', 'voice', 'quest', 'house')),
  constraint gen_history_role_check check (role in ('visitor', 'gen', 'house')),
  constraint gen_history_kind_check check (kind in ('transcript', 'reply', 'action')),
  constraint gen_history_body_len check (char_length(body) <= 2000)
);

create index if not exists gen_history_user_created_idx
  on public.gen_history (user_id, created_at);

create index if not exists gen_history_session_created_idx
  on public.gen_history (session_code, created_at);

alter table public.gen_history enable row level security;

drop policy if exists "read own gen history" on public.gen_history;
create policy "read own gen history"
  on public.gen_history
  for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.gen_history from anon, public;
grant select on public.gen_history to authenticated;

alter table public.gen_history replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'gen_history'
     ) then
    alter publication supabase_realtime add table public.gen_history;
  end if;
end $$;

comment on table public.gen_history is
  'Falas, respostas da Gen e gestos da casa. A pessoa só lê as linhas do próprio auth.uid().';
