-- Add missing columns to casino_games table
-- This script adds all the columns needed for the working poker logic

-- Add last_raiser_index column
ALTER TABLE casino_games 
ADD COLUMN IF NOT EXISTS last_raiser_index INTEGER DEFAULT 0;

-- Add last_raise_to column
ALTER TABLE casino_games 
ADD COLUMN IF NOT EXISTS last_raise_to INTEGER DEFAULT 0;

-- Add dealer_index column
ALTER TABLE casino_games 
ADD COLUMN IF NOT EXISTS dealer_index INTEGER DEFAULT 0;

-- Update existing games to have default values
UPDATE casino_games 
SET 
  last_raiser_index = COALESCE(last_raiser_index, 0),
  last_raise_to = COALESCE(last_raise_to, 0),
  dealer_index = COALESCE(dealer_index, 0)
WHERE 
  last_raiser_index IS NULL OR 
  last_raise_to IS NULL OR 
  dealer_index IS NULL;

-- Verify the columns were added
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'casino_games' 
AND column_name IN ('last_raiser_index', 'last_raise_to', 'dealer_index')
ORDER BY column_name;
