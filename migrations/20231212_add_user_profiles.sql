create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  created_at timestamptz not null default now()
);

alter table public.user_profiles enable row level security;

create policy if not exists user_profiles_select_self
on public.user_profiles
for select
using (auth.uid() = user_id);

create policy if not exists user_profiles_insert_self
on public.user_profiles
for insert
with check (auth.uid() = user_id);

