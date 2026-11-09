-- Memória curta da sessão (últimas 10 falas + fatos, ex. próximo jogo).
-- Escrita só pela service role. Sem login.

create table if not exists public.house_session_memory (
  session_id text primary key,
  turns jsonb not null default '[]'::jsonb,
  facts jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.house_session_memory enable row level security;

revoke all on public.house_session_memory from anon, authenticated, public;

comment on table public.house_session_memory is
  'Últimas falas e fatos da sessão da Gen. Service role only.';
