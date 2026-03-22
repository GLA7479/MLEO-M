-- ============================================================================
-- Poker Full Schema - Creates all poker tables in poker schema
-- Run this BEFORE running poker_add_seat_token.sql
-- ============================================================================

BEGIN;

-- Create poker schema if it doesn't exist
CREATE SCHEMA IF NOT EXISTS poker;

-- === Poker Tables ===
CREATE TABLE IF NOT EXISTS poker.poker_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  stake_min bigint NOT NULL DEFAULT 20,
  next_hand_no bigint NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === Poker Seats ===
CREATE TABLE IF NOT EXISTS poker.poker_seats (
  table_id uuid NOT NULL REFERENCES poker.poker_tables(id) ON DELETE CASCADE,
  seat_index int NOT NULL,
  player_name text,
  stack bigint NOT NULL DEFAULT 0,
  stack_live bigint NOT NULL DEFAULT 0,
  sat_out boolean NOT NULL DEFAULT false,
  seat_token text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (table_id, seat_index)
);

-- === Poker Hands ===
CREATE TABLE IF NOT EXISTS poker.poker_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid NOT NULL REFERENCES poker.poker_tables(id) ON DELETE CASCADE,
  hand_no bigint NOT NULL,
  stage text NOT NULL DEFAULT 'preflop', -- preflop|flop|turn|river|hand_end
  dealer_seat int NOT NULL,
  sb_seat int NOT NULL,
  bb_seat int NOT NULL,
  current_turn int,
  turn_deadline timestamptz,
  pot_total bigint NOT NULL DEFAULT 0,
  board jsonb DEFAULT '[]'::jsonb,
  deck_remaining jsonb DEFAULT '[]'::jsonb,
  last_raise_to bigint DEFAULT 0,
  last_raise_size bigint DEFAULT 0,
  started_at timestamptz DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === Poker Hand Players ===
CREATE TABLE IF NOT EXISTS poker.poker_hand_players (
  hand_id uuid NOT NULL REFERENCES poker.poker_hands(id) ON DELETE CASCADE,
  seat_index int NOT NULL,
  bet_street bigint NOT NULL DEFAULT 0,
  folded boolean NOT NULL DEFAULT false,
  all_in boolean NOT NULL DEFAULT false,
  acted_street boolean NOT NULL DEFAULT false,
  hole_cards jsonb DEFAULT '[]'::jsonb,
  win_amount bigint DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (hand_id, seat_index)
);

-- === Poker Actions ===
CREATE TABLE IF NOT EXISTS poker.poker_actions (
  id bigserial PRIMARY KEY,
  hand_id uuid NOT NULL REFERENCES poker.poker_hands(id) ON DELETE CASCADE,
  seat_index int NOT NULL,
  action text NOT NULL, -- fold|check|call|bet|raise|allin
  amount bigint DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- === Poker Pots (for side pots) ===
CREATE TABLE IF NOT EXISTS poker.poker_pots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hand_id uuid NOT NULL REFERENCES poker.poker_hands(id) ON DELETE CASCADE,
  side_idx int NOT NULL DEFAULT 0,
  amount bigint NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- === Poker Pot Members ===
CREATE TABLE IF NOT EXISTS poker.poker_pot_members (
  pot_id uuid NOT NULL REFERENCES poker.poker_pots(id) ON DELETE CASCADE,
  seat_index int NOT NULL,
  eligible boolean NOT NULL DEFAULT true,
  PRIMARY KEY (pot_id, seat_index)
);

-- === Indexes ===
CREATE INDEX IF NOT EXISTS idx_poker_tables_name ON poker.poker_tables(name);
CREATE INDEX IF NOT EXISTS idx_poker_seats_table ON poker.poker_seats(table_id);
CREATE INDEX IF NOT EXISTS idx_poker_seats_seat_token ON poker.poker_seats(seat_token);
CREATE INDEX IF NOT EXISTS idx_poker_hands_table ON poker.poker_hands(table_id);
CREATE INDEX IF NOT EXISTS idx_poker_hands_active ON poker.poker_hands(table_id, ended_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_poker_hand_players_hand ON poker.poker_hand_players(hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_actions_hand ON poker.poker_actions(hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_pots_hand ON poker.poker_pots(hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_pot_members_pot ON poker.poker_pot_members(pot_id);

-- === Functions ===
-- Function to get to_call JSON for a hand
CREATE OR REPLACE FUNCTION poker.poker_to_call_json(p_hand_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_max_bet bigint;
  v_result jsonb := '{}'::jsonb;
BEGIN
  SELECT COALESCE(MAX(bet_street), 0) INTO v_max_bet
  FROM poker.poker_hand_players
  WHERE hand_id = p_hand_id;
  
  SELECT jsonb_object_agg(
    seat_index::text,
    GREATEST(0, v_max_bet - COALESCE(bet_street, 0))
  ) INTO v_result
  FROM poker.poker_hand_players
  WHERE hand_id = p_hand_id AND NOT folded AND NOT all_in;
  
  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- === Triggers for updated_at ===
CREATE OR REPLACE FUNCTION poker.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_poker_tables_updated_at
  BEFORE UPDATE ON poker.poker_tables
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

CREATE TRIGGER trg_poker_seats_updated_at
  BEFORE UPDATE ON poker.poker_seats
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

CREATE TRIGGER trg_poker_hands_updated_at
  BEFORE UPDATE ON poker.poker_hands
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

CREATE TRIGGER trg_poker_hand_players_updated_at
  BEFORE UPDATE ON poker.poker_hand_players
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

CREATE TRIGGER trg_poker_pots_updated_at
  BEFORE UPDATE ON poker.poker_pots
  FOR EACH ROW
  EXECUTE FUNCTION poker.set_updated_at();

-- === RLS (Row Level Security) ===
ALTER TABLE poker.poker_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_hands ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_hand_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_pots ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_pot_members ENABLE ROW LEVEL SECURITY;

-- === RLS Policies (Open for MVP) ===
DROP POLICY IF EXISTS "poker_tables_read" ON poker.poker_tables;
DROP POLICY IF EXISTS "poker_tables_write" ON poker.poker_tables;
DROP POLICY IF EXISTS "poker_seats_read" ON poker.poker_seats;
DROP POLICY IF EXISTS "poker_seats_write" ON poker.poker_seats;
DROP POLICY IF EXISTS "poker_hands_read" ON poker.poker_hands;
DROP POLICY IF EXISTS "poker_hands_write" ON poker.poker_hands;
DROP POLICY IF EXISTS "poker_hand_players_read" ON poker.poker_hand_players;
DROP POLICY IF EXISTS "poker_hand_players_write" ON poker.poker_hand_players;
DROP POLICY IF EXISTS "poker_actions_read" ON poker.poker_actions;
DROP POLICY IF EXISTS "poker_actions_write" ON poker.poker_actions;
DROP POLICY IF EXISTS "poker_pots_read" ON poker.poker_pots;
DROP POLICY IF EXISTS "poker_pots_write" ON poker.poker_pots;
DROP POLICY IF EXISTS "poker_pot_members_read" ON poker.poker_pot_members;
DROP POLICY IF EXISTS "poker_pot_members_write" ON poker.poker_pot_members;

CREATE POLICY "poker_tables_read" ON poker.poker_tables FOR SELECT USING (true);
CREATE POLICY "poker_tables_write" ON poker.poker_tables FOR ALL USING (true);

CREATE POLICY "poker_seats_read" ON poker.poker_seats FOR SELECT USING (true);
CREATE POLICY "poker_seats_write" ON poker.poker_seats FOR ALL USING (true);

CREATE POLICY "poker_hands_read" ON poker.poker_hands FOR SELECT USING (true);
CREATE POLICY "poker_hands_write" ON poker.poker_hands FOR ALL USING (true);

CREATE POLICY "poker_hand_players_read" ON poker.poker_hand_players FOR SELECT USING (true);
CREATE POLICY "poker_hand_players_write" ON poker.poker_hand_players FOR ALL USING (true);

CREATE POLICY "poker_actions_read" ON poker.poker_actions FOR SELECT USING (true);
CREATE POLICY "poker_actions_write" ON poker.poker_actions FOR INSERT WITH CHECK (true);

CREATE POLICY "poker_pots_read" ON poker.poker_pots FOR SELECT USING (true);
CREATE POLICY "poker_pots_write" ON poker.poker_pots FOR ALL USING (true);

CREATE POLICY "poker_pot_members_read" ON poker.poker_pot_members FOR SELECT USING (true);
CREATE POLICY "poker_pot_members_write" ON poker.poker_pot_members FOR ALL USING (true);

-- Grant permissions to service_role
GRANT ALL ON SCHEMA poker TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA poker TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA poker TO service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA poker TO service_role;

COMMIT;
