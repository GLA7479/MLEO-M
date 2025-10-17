-- ============================================================================
-- ChatGPT Winner Payout System - Complete Fix
-- ============================================================================

-- add winner + payout flags to games
ALTER TABLE games
  ADD COLUMN IF NOT EXISTS winner_player_id uuid,
  ADD COLUMN IF NOT EXISTS winning_hand text,
  ADD COLUMN IF NOT EXISTS payout_done boolean DEFAULT false;

-- (אופציונלי) אינדקס קטן לעדכונים/סאבים
CREATE INDEX IF NOT EXISTS games_winner_idx ON games (winner_player_id);
