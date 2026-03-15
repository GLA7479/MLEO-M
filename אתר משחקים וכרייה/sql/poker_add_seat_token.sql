-- ============================================================================
-- Add seat_token to poker_seats for secure seat ownership
-- ============================================================================

BEGIN;

ALTER TABLE poker.poker_seats
ADD COLUMN IF NOT EXISTS seat_token text;

CREATE INDEX IF NOT EXISTS idx_poker_seats_seat_token
ON poker.poker_seats(seat_token);

COMMENT ON COLUMN poker.poker_seats.seat_token IS 
'Secret token for seat ownership verification - generated on sit, required for all seat operations';

COMMIT;
