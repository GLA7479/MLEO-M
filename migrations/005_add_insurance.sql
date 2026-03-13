-- Add insurance_play column to bj_players table
ALTER TABLE bj_players ADD COLUMN insurance_play INTEGER DEFAULT 0;

-- Add comment for clarity
COMMENT ON COLUMN bj_players.insurance_play IS 'Insurance play amount (half of original play) when dealer shows Ace';
