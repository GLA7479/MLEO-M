-- ============================================================================
-- Roulette Multiplayer SQL Schema
-- Run this in Supabase SQL Editor (MP project)
-- ============================================================================

-- === Roulette Sessions Table ===
create table if not exists roulette_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references arcade_rooms(id) on delete cascade,
  spin_number int not null default 0,
  stage text not null default 'lobby', -- lobby|betting|spinning|results|finished
  betting_deadline timestamptz, -- when betting closes
  spin_result int, -- 0-36 (null if not spun yet)
  spin_color text, -- 'red'|'black'|'green' (for 0)
  total_bets bigint not null default 0,
  total_payouts bigint not null default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === Roulette Players Table ===
create table if not exists roulette_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references roulette_sessions(id) on delete cascade,
  player_name text not null,
  client_id uuid not null,
  balance bigint not null default 0, -- current balance in this session
  total_bet bigint not null default 0, -- total bet this round
  total_won bigint not null default 0, -- total won this round
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(session_id, client_id),
  unique(session_id, player_name)
);

-- === Roulette Bets Table ===
create table if not exists roulette_bets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references roulette_sessions(id) on delete cascade,
  player_id uuid references roulette_players(id) on delete cascade,
  bet_type text not null, -- 'number'|'red'|'black'|'even'|'odd'|'low'|'high'|'dozen'|'column'
  bet_value text not null, -- e.g., '17' for number, '1' for first dozen, etc.
  amount bigint not null default 0,
  payout_multiplier numeric(5,2) not null default 1.0, -- e.g., 35 for single number, 2 for red/black
  is_winner boolean, -- null = not resolved, true = won, false = lost
  payout_amount bigint, -- calculated payout
  created_at timestamptz default now()
);

-- === Roulette Spins History Table ===
create table if not exists roulette_spins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references roulette_sessions(id) on delete cascade,
  spin_number int not null,
  result int not null, -- 0-36
  color text not null, -- 'red'|'black'|'green'
  total_bets bigint not null default 0,
  total_payouts bigint not null default 0,
  created_at timestamptz default now()
);

-- === Indexes for Performance ===
create index if not exists idx_roulette_sessions_room on roulette_sessions(room_id);
create index if not exists idx_roulette_sessions_stage on roulette_sessions(stage);
create index if not exists idx_roulette_sessions_betting_deadline on roulette_sessions(betting_deadline);
create index if not exists idx_roulette_players_session on roulette_players(session_id);
create index if not exists idx_roulette_players_client on roulette_players(client_id);
create index if not exists idx_roulette_bets_session on roulette_bets(session_id);
create index if not exists idx_roulette_bets_player on roulette_bets(player_id);
create index if not exists idx_roulette_bets_resolved on roulette_bets(is_winner);
create index if not exists idx_roulette_spins_session on roulette_spins(session_id);

-- === RLS (Row Level Security) ===
alter table roulette_sessions enable row level security;
alter table roulette_players enable row level security;
alter table roulette_bets enable row level security;
alter table roulette_spins enable row level security;

-- === RLS Policies (Open for MVP) ===
-- Drop existing policies first
drop policy if exists "roulette_sessions_read" on roulette_sessions;
drop policy if exists "roulette_sessions_write" on roulette_sessions;
drop policy if exists "roulette_sessions_update" on roulette_sessions;
drop policy if exists "roulette_sessions_delete" on roulette_sessions;

drop policy if exists "roulette_players_read" on roulette_players;
drop policy if exists "roulette_players_write" on roulette_players;
drop policy if exists "roulette_players_update" on roulette_players;
drop policy if exists "roulette_players_delete" on roulette_players;

drop policy if exists "roulette_bets_read" on roulette_bets;
drop policy if exists "roulette_bets_write" on roulette_bets;
drop policy if exists "roulette_bets_update" on roulette_bets;
drop policy if exists "roulette_bets_delete" on roulette_bets;

drop policy if exists "roulette_spins_read" on roulette_spins;
drop policy if exists "roulette_spins_write" on roulette_spins;

-- Create new policies
create policy "roulette_sessions_read" on roulette_sessions for select using (true);
create policy "roulette_sessions_write" on roulette_sessions for insert with check (true);
create policy "roulette_sessions_update" on roulette_sessions for update using (true) with check (true);
create policy "roulette_sessions_delete" on roulette_sessions for delete using (true);

create policy "roulette_players_read" on roulette_players for select using (true);
create policy "roulette_players_write" on roulette_players for insert with check (true);
create policy "roulette_players_update" on roulette_players for update using (true) with check (true);
create policy "roulette_players_delete" on roulette_players for delete using (true);

create policy "roulette_bets_read" on roulette_bets for select using (true);
create policy "roulette_bets_write" on roulette_bets for insert with check (true);
create policy "roulette_bets_update" on roulette_bets for update using (true) with check (true);
create policy "roulette_bets_delete" on roulette_bets for delete using (true);

create policy "roulette_spins_read" on roulette_spins for select using (true);
create policy "roulette_spins_write" on roulette_spins for insert with check (true);

-- === Auto-update Triggers ===
-- Use existing set_updated_at function (from poker schema)
-- create or replace function set_updated_at()
-- returns trigger language plpgsql as $$
-- begin
--   new.updated_at := now();
--   return new;
-- end $$;

-- Apply updated_at trigger
do $$ begin
  create trigger trg_roulette_sessions_updated_at
    before update on roulette_sessions
    for each row execute procedure set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_roulette_players_updated_at
    before update on roulette_players
    for each row execute procedure set_updated_at();
exception when duplicate_object then null; end $$;

-- === Realtime Publications ===
do $$ begin
  begin
    alter publication supabase_realtime add table roulette_sessions;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table roulette_players;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table roulette_bets;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table roulette_spins;
  exception when duplicate_object then null;
  end;
end $$;

