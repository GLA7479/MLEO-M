-- Add insurance_bet column to bj_players table
ALTER TABLE bj_players ADD COLUMN insurance_bet INTEGER DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN bj_players.insurance_bet IS 'Insurance bet amount (half of original bet) when dealer shows Ace';
