-- ============================================================================
-- Poker Logic Upgrade - Add Missing Fields
-- ============================================================================

-- Add new fields to games table
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS dealer_index INTEGER DEFAULT 0;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS last_raise_to INTEGER DEFAULT 0;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS last_raiser_index INTEGER DEFAULT 0;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS prev_raise_to INTEGER DEFAULT 0;
ALTER TABLE public.games ADD COLUMN IF NOT EXISTS prev_bet_at_equal INTEGER DEFAULT 0;

-- Add revealed field to players table
ALTER TABLE public.players ADD COLUMN IF NOT EXISTS revealed BOOLEAN DEFAULT FALSE;

-- Add comments for documentation
COMMENT ON COLUMN public.games.dealer_index IS 'Current dealer position (rotates each hand)';
COMMENT ON COLUMN public.games.last_raise_to IS 'Amount of the last raise';
COMMENT ON COLUMN public.games.last_raiser_index IS 'Player index who raised last (gets last action)';
COMMENT ON COLUMN public.players.revealed IS 'Whether player cards are revealed in showdown';

