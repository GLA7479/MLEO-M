-- Supabase Database Schema for Texas Hold'em Multiplayer
-- Run this SQL in your Supabase SQL Editor

-- Enable Row Level Security
ALTER TABLE auth.users ENABLE ROW LEVEL SECURITY;

-- Games table
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code VARCHAR(10) UNIQUE NOT NULL,
  status VARCHAR(20) DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished')),
  max_players INTEGER DEFAULT 6,
  pot INTEGER DEFAULT 0,
  current_bet INTEGER DEFAULT 0,
  current_player_index INTEGER DEFAULT 0,
  round VARCHAR(20) DEFAULT 'pre-flop' CHECK (round IN ('pre-flop', 'flop', 'turn', 'river', 'showdown')),
  community_cards JSONB DEFAULT '[]',
  community_visible INTEGER DEFAULT 0,
  deck JSONB DEFAULT '[]',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Players table
CREATE TABLE IF NOT EXISTS players (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  name VARCHAR(50) NOT NULL,
  is_host BOOLEAN DEFAULT FALSE,
  chips INTEGER DEFAULT 10000,
  bet INTEGER DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ready' CHECK (status IN ('waiting', 'ready', 'folded', 'all_in')),
  cards JSONB DEFAULT '[]',
  position INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game actions table (for history/logging)
CREATE TABLE IF NOT EXISTS game_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL CHECK (action IN ('fold', 'check', 'call', 'raise', 'allin')),
  amount INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_games_room_code ON games(room_code);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_players_game_id ON players(game_id);
CREATE INDEX IF NOT EXISTS idx_players_position ON players(game_id, position);
CREATE INDEX IF NOT EXISTS idx_game_actions_game_id ON game_actions(game_id);

-- Enable Row Level Security
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_actions ENABLE ROW LEVEL SECURITY;

-- RLS Policies - Allow all operations for now (you can restrict later)
CREATE POLICY "Allow all operations on games" ON games FOR ALL USING (true);
CREATE POLICY "Allow all operations on players" ON players FOR ALL USING (true);
CREATE POLICY "Allow all operations on game_actions" ON game_actions FOR ALL USING (true);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Add triggers for updated_at
CREATE TRIGGER update_games_updated_at BEFORE UPDATE ON games
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_players_updated_at BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert some test data (optional)
-- INSERT INTO games (room_code, status) VALUES ('TEST01', 'waiting');
