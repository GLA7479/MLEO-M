-- ============================================================================
-- Poker Multiplayer SQL Schema
-- Run this in Supabase SQL Editor (MP project)
-- ============================================================================

-- === Poker Sessions Table ===
create table if not exists poker_sessions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references arcade_rooms(id) on delete cascade,
  hand_no int not null default 1,
  stage text not null default 'lobby', -- lobby|preflop|flop|turn|river|showdown
  dealer_seat int not null default 0,
  sb_seat int not null default 1,
  bb_seat int not null default 2,
  min_bet bigint not null default 20,
  ante bigint not null default 0,
  board jsonb default '[]'::jsonb, -- ["As","Kh","Qd","Jc","Th"]
  deck_remaining jsonb default '[]'::jsonb, -- remaining cards in deck
  pot_total bigint not null default 0,
  current_turn int, -- seat index of current player
  turn_deadline timestamptz, -- when current turn expires
  winners jsonb default '[]'::jsonb, -- seat indices of winners
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === Poker Players Table ===
create table if not exists poker_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references poker_sessions(id) on delete cascade,
  player_name text not null,
  seat_index int not null, -- 0-5
  stack_live bigint not null default 2000, -- current chips
  bet_street bigint not null default 0, -- bet this street
  total_bet bigint not null default 0, -- total bet this hand
  hole_cards jsonb default '[]'::jsonb, -- ["As","Kh"]
  folded boolean not null default false,
  all_in boolean not null default false,
  acted boolean not null default false, -- acted this street
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(session_id, seat_index),
  unique(session_id, player_name)
);

-- === Poker Pots Table (for side pots) ===
create table if not exists poker_pots (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references poker_sessions(id) on delete cascade,
  total bigint not null default 0,
  eligible jsonb default '[]'::jsonb, -- seat indices eligible for this pot
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- === Poker Actions Table (for history) ===
create table if not exists poker_actions (
  id bigserial primary key,
  session_id uuid references poker_sessions(id) on delete cascade,
  seat_index int not null,
  action text not null, -- 'fold'|'check'|'call'|'bet'|'raise'|'allin'|'post_sb'|'post_bb'|'ante'
  amount bigint default 0,
  created_at timestamptz default now()
);

-- === Indexes for Performance ===
create index if not exists idx_poker_sessions_room on poker_sessions(room_id);
create index if not exists idx_poker_sessions_turn_deadline on poker_sessions(turn_deadline);
create index if not exists idx_poker_players_session on poker_players(session_id);
create index if not exists idx_poker_players_seat on poker_players(session_id, seat_index);
create index if not exists idx_poker_pots_session on poker_pots(session_id);
create index if not exists idx_poker_actions_session on poker_actions(session_id);

-- === RLS (Row Level Security) ===
alter table poker_sessions enable row level security;
alter table poker_players enable row level security;
alter table poker_pots enable row level security;
alter table poker_actions enable row level security;

-- === RLS Policies (Open for MVP) ===
-- Drop existing policies first to avoid conflicts
drop policy if exists "poker_sessions_read" on poker_sessions;
drop policy if exists "poker_sessions_write" on poker_sessions;
drop policy if exists "poker_sessions_update" on poker_sessions;
drop policy if exists "poker_sessions_delete" on poker_sessions;

drop policy if exists "poker_players_read" on poker_players;
drop policy if exists "poker_players_write" on poker_players;
drop policy if exists "poker_players_update" on poker_players;
drop policy if exists "poker_players_delete" on poker_players;

drop policy if exists "poker_pots_read" on poker_pots;
drop policy if exists "poker_pots_write" on poker_pots;
drop policy if exists "poker_pots_update" on poker_pots;
drop policy if exists "poker_pots_delete" on poker_pots;

drop policy if exists "poker_actions_read" on poker_actions;
drop policy if exists "poker_actions_write" on poker_actions;

-- Create new policies
create policy "poker_sessions_read" on poker_sessions for select using (true);
create policy "poker_sessions_write" on poker_sessions for insert with check (true);
create policy "poker_sessions_update" on poker_sessions for update using (true) with check (true);
create policy "poker_sessions_delete" on poker_sessions for delete using (true);

create policy "poker_players_read" on poker_players for select using (true);
create policy "poker_players_write" on poker_players for insert with check (true);
create policy "poker_players_update" on poker_players for update using (true) with check (true);
create policy "poker_players_delete" on poker_players for delete using (true);

create policy "poker_pots_read" on poker_pots for select using (true);
create policy "poker_pots_write" on poker_pots for insert with check (true);
create policy "poker_pots_update" on poker_pots for update using (true) with check (true);
create policy "poker_pots_delete" on poker_pots for delete using (true);

create policy "poker_actions_read" on poker_actions for select using (true);
create policy "poker_actions_write" on poker_actions for insert with check (true);

-- === Auto-update Triggers ===
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Apply updated_at trigger to all tables
do $$ begin
  create trigger trg_poker_sessions_updated_at
    before update on poker_sessions
    for each row execute procedure set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_poker_players_updated_at
    before update on poker_players
    for each row execute procedure set_updated_at();
exception when duplicate_object then null; end $$;

do $$ begin
  create trigger trg_poker_pots_updated_at
    before update on poker_pots
    for each row execute procedure set_updated_at();
exception when duplicate_object then null; end $$;

-- === Realtime Publications ===
-- Add tables to realtime publication (with error handling)
do $$ begin
  begin
    alter publication supabase_realtime add table poker_sessions;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table poker_players;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table poker_pots;
  exception when duplicate_object then null;
  end;
  
  begin
    alter publication supabase_realtime add table poker_actions;
  exception when duplicate_object then null;
  end;
end $$;

-- === Sample Data (Optional - for testing) ===
-- Uncomment to create a test room and session
/*
insert into arcade_rooms (id, game_id, title, is_locked, passcode) 
values ('00000000-0000-0000-0000-000000000001', 'poker', 'Test Poker Room', false, null);

insert into poker_sessions (id, room_id, hand_no, stage, dealer_seat, sb_seat, bb_seat, min_bet, ante, board, deck_remaining, pot_total, current_turn, turn_deadline, winners)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 1, 'lobby', 0, 1, 2, 20, 0, '[]'::jsonb, '[]'::jsonb, 0, null, null, '[]'::jsonb);
*/
