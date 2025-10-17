-- ============================================================================
-- Winner Payout System - Add Missing Fields
-- ============================================================================

-- Add new fields to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS winner_player_id UUID;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS winning_hand TEXT;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS payout_done BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN public.games.winner_player_id IS 'ID of the winning player';
COMMENT ON COLUMN public.games.winning_hand IS 'Name of the winning hand (e.g., Full House, Flush)';
COMMENT ON COLUMN public.games.payout_done IS 'Whether the winner has been paid out to VAULT';

