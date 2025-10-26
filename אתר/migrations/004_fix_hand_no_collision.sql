-- migrations/004_fix_hand_no_collision.sql
-- Fix duplicate hand_no collision by adding atomic counter

-- Add next_hand_no column for atomic hand numbering
ALTER TABLE poker.poker_tables
ADD COLUMN IF NOT EXISTS next_hand_no bigint NOT NULL DEFAULT 1;

COMMENT ON COLUMN poker.poker_tables.next_hand_no IS 
'Atomic counter for hand numbers - prevents duplicate hand_no collisions';

-- Update existing tables to have correct next_hand_no
UPDATE poker.poker_tables
SET next_hand_no = COALESCE(
  (SELECT MAX(hand_no) + 1 FROM poker.poker_hands WHERE table_id = poker_tables.id),
  1
)
WHERE next_hand_no = 1;

