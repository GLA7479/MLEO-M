-- checkers_fix_rls_realtime.sql
-- Fix RLS and Realtime for CheckersMP if tables already exist
-- Run this if you're getting "auth required" errors

-- 1) Enable RLS and set open policies (for anonymous access)
alter table public.ck_sessions enable row level security;
alter table public.ck_players enable row level security;

drop policy if exists "ck_sessions_select" on public.ck_sessions;
drop policy if exists "ck_sessions_write" on public.ck_sessions;
create policy "ck_sessions_select" on public.ck_sessions for select using (true);
create policy "ck_sessions_write" on public.ck_sessions for all using (true) with check (true);

drop policy if exists "ck_players_select" on public.ck_players;
drop policy if exists "ck_players_write" on public.ck_players;
create policy "ck_players_select" on public.ck_players for select using (true);
create policy "ck_players_write" on public.ck_players for all using (true) with check (true);

-- 2) Enable Realtime (required for postgres_changes events)
alter table public.ck_sessions replica identity full;
alter table public.ck_players replica identity full;

-- Add to Realtime publication (if not already added)
alter publication supabase_realtime add table public.ck_sessions;
alter publication supabase_realtime add table public.ck_players;
