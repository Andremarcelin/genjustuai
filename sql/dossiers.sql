create table if not exists public.dossiers (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  dossier_data jsonb default '{}'::jsonb,
  updated_at timestamptz default now()
);
alter table public.dossiers enable row level security;
create policy "own dossier" on public.dossiers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
