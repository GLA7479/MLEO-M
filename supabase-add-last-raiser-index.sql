-- Add last_raiser_index column to casino_games table
-- This column tracks the last player to raise, essential for correct turn progression

ALTER TABLE casino_games 
ADD COLUMN IF NOT EXISTS last_raiser_index INTEGER DEFAULT 0;

-- Add last_raise_to column as well for completeness
ALTER TABLE casino_games 
ADD COLUMN IF NOT EXISTS last_raise_to INTEGER DEFAULT 0;

-- Update existing games to have default values
UPDATE casino_games 
SET last_raiser_index = 0, last_raise_to = 0 
WHERE last_raiser_index IS NULL OR last_raise_to IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'casino_games' 
AND column_name IN ('last_raiser_index', 'last_raise_to')
ORDER BY column_name;
