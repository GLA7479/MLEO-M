-- ============================================
-- TEXAS HOLD'EM ROOMS - CASINO TABLES SCHEMA
-- ============================================
-- This schema creates permanent poker tables with drop-in/drop-out functionality
-- Completely separate from the existing texas-holdem-supabase tables

-- 1. Casino Tables (Permanent poker rooms)
CREATE TABLE IF NOT EXISTS casino_tables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  min_buyin bigint NOT NULL,
  small_blind bigint NOT NULL,
  big_blind bigint NOT NULL,
  max_players int DEFAULT 6,
  current_players int DEFAULT 0,
  status text DEFAULT 'active',
  created_at timestamptz DEFAULT now()
);

-- 2. Casino Games (Active games at each table)
CREATE TABLE IF NOT EXISTS casino_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES casino_tables(id) ON DELETE CASCADE,
  status text DEFAULT 'waiting',
  pot bigint DEFAULT 0,
  current_bet bigint DEFAULT 0,
  community_cards jsonb DEFAULT '[]'::jsonb,
  deck jsonb DEFAULT '[]'::jsonb,
  round text DEFAULT 'preflop',
  dealer_index int DEFAULT 0,
  current_player_index int,
  hand_number int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Casino Players (Players at each table)
CREATE TABLE IF NOT EXISTS casino_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_id uuid REFERENCES casino_tables(id) ON DELETE CASCADE,
  game_id uuid REFERENCES casino_games(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  player_wallet text NOT NULL,
  chips bigint NOT NULL,
  current_bet bigint DEFAULT 0,
  status text DEFAULT 'active',
  seat_index int NOT NULL,
  hole_cards jsonb DEFAULT '[]'::jsonb,
  is_dealer boolean DEFAULT false,
  joined_at timestamptz DEFAULT now(),
  last_action text,
  last_action_time timestamptz DEFAULT now(),
  revealed boolean DEFAULT false,
  UNIQUE(table_id, seat_index)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS casino_tables_status_idx ON casino_tables(status);
CREATE INDEX IF NOT EXISTS casino_games_table_idx ON casino_games(table_id);
CREATE INDEX IF NOT EXISTS casino_games_status_idx ON casino_games(status);
CREATE INDEX IF NOT EXISTS casino_players_table_idx ON casino_players(table_id);
CREATE INDEX IF NOT EXISTS casino_players_game_idx ON casino_players(game_id);
CREATE INDEX IF NOT EXISTS casino_players_wallet_idx ON casino_players(player_wallet);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_casino_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER casino_games_updated_at
  BEFORE UPDATE ON casino_games
  FOR EACH ROW
  EXECUTE FUNCTION update_casino_updated_at();

-- Insert default poker rooms
INSERT INTO casino_tables (name, min_buyin, small_blind, big_blind, max_players) VALUES
  ('Micro Stakes', 100000, 1000, 2000, 6),
  ('Low Stakes', 500000, 5000, 10000, 6),
  ('Medium Stakes', 1000000, 10000, 20000, 6),
  ('High Stakes', 5000000, 50000, 100000, 6),
  ('VIP Room', 10000000, 100000, 200000, 6)
ON CONFLICT DO NOTHING;

-- Enable Real-time subscriptions
ALTER PUBLICATION supabase_realtime ADD TABLE casino_tables;
ALTER PUBLICATION supabase_realtime ADD TABLE casino_games;
ALTER PUBLICATION supabase_realtime ADD TABLE casino_players;

-- ============================================
-- Run this script in your Supabase SQL Editor
-- ============================================

