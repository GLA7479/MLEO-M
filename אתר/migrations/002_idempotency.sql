-- migrations/002_idempotency.sql
-- Add idempotency support to prevent duplicate actions

-- Add action_id column for idempotency
ALTER TABLE poker.poker_actions
ADD COLUMN IF NOT EXISTS action_id uuid;

-- Create unique index on action_id to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS uq_actions_action_id
ON poker.poker_actions(action_id) 
WHERE action_id IS NOT NULL;

-- Add comment
COMMENT ON COLUMN poker.poker_actions.action_id IS 
'Client-generated UUID for idempotency - prevents duplicate actions on double-click';

-- Add last_raise_to and last_raise_size to poker_hands for min-raise tracking
ALTER TABLE poker.poker_hands
ADD COLUMN IF NOT EXISTS last_raise_to integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_raise_size integer DEFAULT 0;

COMMENT ON COLUMN poker.poker_hands.last_raise_to IS 
'Total bet amount of the last raise in current street';
COMMENT ON COLUMN poker.poker_hands.last_raise_size IS 
'Size of the last raise delta for min-raise calculation';

-- Add contrib_total to poker_hand_players for side-pot calculation
ALTER TABLE poker.poker_hand_players
ADD COLUMN IF NOT EXISTS contrib_total integer DEFAULT 0;

COMMENT ON COLUMN poker.poker_hand_players.contrib_total IS 
'Total contribution to pot across all streets (for side-pot calculation)';

-- Add win_amount to track winnings
ALTER TABLE poker.poker_hand_players
ADD COLUMN IF NOT EXISTS win_amount integer DEFAULT 0;

COMMENT ON COLUMN poker.poker_hand_players.win_amount IS 
'Amount won by this player in this hand (from all pots)';

-- Create poker_pots table for side-pot tracking
CREATE TABLE IF NOT EXISTS poker.poker_pots (
  id bigserial PRIMARY KEY,
  hand_id bigint NOT NULL REFERENCES poker.poker_hands(id) ON DELETE CASCADE,
  side_idx integer NOT NULL,
  amount integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(hand_id, side_idx)
);

COMMENT ON TABLE poker.poker_pots IS 
'Side pots for all-in scenarios - each pot has eligible members';

-- Create poker_pot_members table
CREATE TABLE IF NOT EXISTS poker.poker_pot_members (
  id bigserial PRIMARY KEY,
  pot_id bigint NOT NULL REFERENCES poker.poker_pots(id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  eligible boolean DEFAULT true,
  UNIQUE(pot_id, seat_index)
);

COMMENT ON TABLE poker.poker_pot_members IS 
'Members eligible for each pot - used for side-pot distribution';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_poker_pots_hand_id ON poker.poker_pots(hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_pot_members_pot_id ON poker.poker_pot_members(pot_id);
CREATE INDEX IF NOT EXISTS idx_poker_actions_hand_id ON poker.poker_actions(hand_id);
CREATE INDEX IF NOT EXISTS idx_poker_actions_action_id ON poker.poker_actions(action_id) WHERE action_id IS NOT NULL;

