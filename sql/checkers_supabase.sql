-- checkers_supabase.sql
-- Tables for CheckersMP.js (ck_sessions + ck_players)

create table if not exists public.ck_sessions (
  id bigserial primary key,
  room_id text not null unique,
  stage text not null default 'lobby', -- lobby | playing | finished
  board_state jsonb not null default '{}'::jsonb,
  to_move text,
  current_turn int,
  turn_deadline timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ck_players (
  id bigserial primary key,
  session_id bigint not null references public.ck_sessions(id) on delete cascade,
  seat_index int not null, -- 0 = A, 1 = B
  player_name text not null,
  client_id uuid not null,
  wins int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, seat_index),
  unique (session_id, client_id)
);

create index if not exists ck_players_session_idx on public.ck_players(session_id);

-- updated_at trigger helper
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_ck_sessions_touch on public.ck_sessions;
create trigger trg_ck_sessions_touch
before update on public.ck_sessions
for each row execute function public.touch_updated_at();

drop trigger if exists trg_ck_players_touch on public.ck_players;
create trigger trg_ck_players_touch
before update on public.ck_players
for each row execute function public.touch_updated_at();

-- Realtime needs replica identity full for updates (recommended)
alter table public.ck_sessions replica identity full;
alter table public.ck_players replica identity full;

-- RLS (open like many arcade prototypes)
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
