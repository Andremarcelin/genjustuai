-- Uma linha: sessão que o Quest deve carregar agora.
-- Leitura pública. Escrita só via API admin (service role).

create table if not exists public.app_state (
  id int primary key default 1 check (id = 1),
  current_session_code text,
  updated_at timestamptz default now()
);

insert into public.app_state (id) values (1) on conflict (id) do nothing;

alter table public.app_state enable row level security;

drop policy if exists "public read app state" on public.app_state;
create policy "public read app state" on public.app_state
  for select using (true);

grant select on public.app_state to anon, authenticated;
