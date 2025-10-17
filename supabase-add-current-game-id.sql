-- Add current_game_id column to casino_tables for CAS locking
-- This prevents race conditions when creating games

ALTER TABLE casino_tables 
ADD COLUMN IF NOT EXISTS current_game_id UUID REFERENCES casino_games(id);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_casino_tables_current_game_id 
ON casino_tables(current_game_id);

-- Verify the column was added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'casino_tables' 
AND column_name = 'current_game_id';
