-- ============================================================
-- BINGO (MLEO) - FULL SETUP
-- Tables:
--   bingo_sessions   - one per room (like ludo_sessions)
--   bingo_players    - seated players
--   bingo_claims     - prize claims per round (row1..row5 + full)
-- Functions:
--   bingo_claim_prize - atomic claim + returns amount
-- Triggers:
--   updated_at
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- sessions ----------
create table if not exists public.bingo_sessions (
  id bigserial primary key,
  room_id text not null,
  stage text not null default 'lobby',          -- lobby | playing | finished
  seat_count int not null default 6,

  -- entry config
  entry_fee int not null default 10000,         -- MLEO units (game currency)
  house_bps int not null default 1000,          -- 10% = 1000 bps
  round_id uuid,                                -- changes every start
  seed text,                                    -- optional, used client-side for card generation

  -- game state
  active_seats int[] not null default '{}',
  pot_total int not null default 0,             -- entry_fee * active_player_count
  deck int[] not null default '{}',             -- shuffled 1..75 set at start
  deck_pos int not null default 0,              -- how many numbers already drawn
  called int[] not null default '{}',           -- drawn numbers (history)
  last_number int,

  winner_client_id text,
  winner_name text,
  started_at timestamptz,
  finished_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique(room_id)
);

-- ---------- players ----------
create table if not exists public.bingo_players (
  id bigserial primary key,
  session_id bigint not null references public.bingo_sessions(id) on delete cascade,
  seat_index int not null,
  player_name text not null,
  client_id text not null,
  joined_at timestamptz not null default now(),
  unique(session_id, seat_index),
  unique(session_id, client_id)
);

-- ---------- claims ----------
-- prize_key: row1,row2,row3,row4,row5,full
create table if not exists public.bingo_claims (
  id bigserial primary key,
  session_id bigint not null references public.bingo_sessions(id) on delete cascade,
  round_id uuid not null,
  prize_key text not null,
  claimed_by_client_id text not null,
  claimed_by_name text not null,
  amount int not null,                          -- MLEO units paid to claimer
  created_at timestamptz not null default now(),
  unique(session_id, round_id, prize_key)
);

create index if not exists bingo_sessions_room_id_idx on public.bingo_sessions(room_id);
create index if not exists bingo_players_session_idx on public.bingo_players(session_id);
create index if not exists bingo_claims_session_round_idx on public.bingo_claims(session_id, round_id);

-- ---------- updated_at trigger ----------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_bingo_sessions_updated_at on public.bingo_sessions;
create trigger trg_bingo_sessions_updated_at
before update on public.bingo_sessions
for each row execute function public.set_updated_at();

-- ---------- RLS (simple open policies like many arcade prototypes) ----------
alter table public.bingo_sessions enable row level security;
alter table public.bingo_players enable row level security;
alter table public.bingo_claims enable row level security;

drop policy if exists "bingo_sessions_read" on public.bingo_sessions;
create policy "bingo_sessions_read" on public.bingo_sessions
for select using (true);

drop policy if exists "bingo_sessions_insert" on public.bingo_sessions;
create policy "bingo_sessions_insert" on public.bingo_sessions
for insert with check (true);

drop policy if exists "bingo_sessions_update" on public.bingo_sessions;
create policy "bingo_sessions_update" on public.bingo_sessions
for update using (true);

drop policy if exists "bingo_players_all" on public.bingo_players;
create policy "bingo_players_all" on public.bingo_players
for all using (true) with check (true);

drop policy if exists "bingo_claims_read" on public.bingo_claims;
create policy "bingo_claims_read" on public.bingo_claims
for select using (true);

drop policy if exists "bingo_claims_insert" on public.bingo_claims;
create policy "bingo_claims_insert" on public.bingo_claims
for insert with check (true);

-- ---------- Claim function (atomic, prevents double-claim per prize) ----------
-- Prize distribution (bps):
--   row1..row5 = 1200 bps each (12%) => 6000 bps
--   full       = 3000 bps (30%)      => 9000 bps total payouts
create or replace function public.bingo_claim_prize(
  p_session_id bigint,
  p_round_id uuid,
  p_prize_key text,
  p_client_id text,
  p_player_name text
)
returns int
language plpgsql
as $$
declare
  s public.bingo_sessions;
  bps int;
  amt int;
begin
  select * into s
  from public.bingo_sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception 'session not found';
  end if;

  if s.stage <> 'playing' then
    raise exception 'game not playing';
  end if;

  if s.round_id is null or s.round_id <> p_round_id then
    raise exception 'round mismatch';
  end if;

  if p_prize_key in ('row1','row2','row3','row4','row5') then
    bps := 1200;
  elsif p_prize_key = 'full' then
    bps := 3000;
  else
    raise exception 'invalid prize_key';
  end if;

  amt := (s.pot_total * bps) / 10000;

  -- insert claim (unique constraint blocks duplicates)
  insert into public.bingo_claims(
    session_id, round_id, prize_key,
    claimed_by_client_id, claimed_by_name,
    amount
  )
  values (
    s.id, s.round_id, p_prize_key,
    p_client_id, p_player_name,
    amt
  );

  -- if FULL claimed -> finish the game
  if p_prize_key = 'full' then
    update public.bingo_sessions
      set stage = 'finished',
          winner_client_id = p_client_id,
          winner_name = p_player_name,
          finished_at = now()
      where id = s.id;
  end if;

  return amt;
exception
  when unique_violation then
    raise exception 'already claimed';
end $$;

-- (Optional) Realtime publication (אם אתה משתמש ב-Realtime)
-- uncomment if needed:
-- alter publication supabase_realtime add table public.bingo_sessions;
-- alter publication supabase_realtime add table public.bingo_players;
-- alter publication supabase_realtime add table public.bingo_claims;

