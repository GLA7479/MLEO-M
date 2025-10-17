-- Add has_acted column to casino_players for stable betting round logic
-- This prevents the betting round from getting stuck in preflop

-- 1. Add has_acted column
ALTER TABLE public.casino_players
  ADD COLUMN IF NOT EXISTS has_acted BOOLEAN DEFAULT false;

-- 2. Update existing players to have default value
UPDATE public.casino_players 
SET has_acted = false 
WHERE has_acted IS NULL;

-- 3. Create index for better performance
CREATE INDEX IF NOT EXISTS idx_casino_players_has_acted
  ON public.casino_players(has_acted);

-- 4. Verify the column was added
SELECT 
  column_name, 
  data_type, 
  is_nullable, 
  column_default
FROM information_schema.columns 
WHERE table_name = 'casino_players' 
  AND column_name = 'has_acted';
