-- ============================================================================
-- VAULT Integration - Add Entry Fee Support
-- ============================================================================

-- Add entry_fee field to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS entry_fee INTEGER DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.games.entry_fee IS 'Entry fee in MLEO tokens for each player';
