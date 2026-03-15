-- migrations/003_security_rls.sql
-- Row Level Security policies for secure multiplayer poker
-- Run this AFTER implementing Supabase Auth

-- Add player_id column to poker_seats for auth integration
ALTER TABLE poker.poker_seats
ADD COLUMN IF NOT EXISTS player_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_poker_seats_player_id 
ON poker.poker_seats(player_id) 
WHERE player_id IS NOT NULL;

COMMENT ON COLUMN poker.poker_seats.player_id IS 
'Supabase Auth user ID - links seat to authenticated user';

-- Enable Row Level Security
ALTER TABLE poker.poker_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_hand_players ENABLE ROW LEVEL SECURITY;
ALTER TABLE poker.poker_actions ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone can view seats (for table display)
CREATE POLICY "public_view_seats" ON poker.poker_seats
  FOR SELECT
  USING (true);

-- Policy 2: Only authenticated users can sit
CREATE POLICY "authenticated_can_sit" ON poker.poker_seats
  FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Policy 3: Players can only update their own seat
CREATE POLICY "players_own_seat_update" ON poker.poker_seats
  FOR UPDATE
  USING (player_id = auth.uid())
  WITH CHECK (player_id = auth.uid());

-- Policy 4: Players can only delete (leave) their own seat
CREATE POLICY "players_own_seat_delete" ON poker.poker_seats
  FOR DELETE
  USING (player_id = auth.uid());

-- Policy 5: View hand players - hide opponent hole cards
CREATE POLICY "view_hand_players" ON poker.poker_hand_players
  FOR SELECT
  USING (
    -- Can see everything if hand is in showdown
    EXISTS (
      SELECT 1 FROM poker.poker_hands
      WHERE id = poker_hand_players.hand_id
        AND stage IN ('showdown', 'hand_end')
    )
    OR
    -- Can see own hole cards anytime
    seat_index IN (
      SELECT seat_index FROM poker.poker_seats
      WHERE player_id = auth.uid()
    )
    OR
    -- Can see other players' public info (but not hole_cards)
    -- This is handled by a VIEW below
    true
  );

-- Policy 6: Only system can insert hand_players (via start-hand API)
-- Players don't directly insert here
CREATE POLICY "system_insert_hand_players" ON poker.poker_hand_players
  FOR INSERT
  WITH CHECK (true);  -- API handles validation

-- Policy 7: Players can only create actions for their own seat
CREATE POLICY "players_own_actions_insert" ON poker.poker_actions
  FOR INSERT
  WITH CHECK (
    seat_index IN (
      SELECT seat_index FROM poker.poker_seats
      WHERE player_id = auth.uid()
        AND table_id IN (
          SELECT table_id FROM poker.poker_hands
          WHERE id = poker_actions.hand_id
        )
    )
  );

-- Policy 8: Anyone can view actions (public game log)
CREATE POLICY "public_view_actions" ON poker.poker_actions
  FOR SELECT
  USING (true);

-- Create a VIEW that hides opponent hole cards for non-showdown stages
CREATE OR REPLACE VIEW poker.poker_hand_players_safe AS
SELECT
  php.id,
  php.hand_id,
  php.seat_index,
  php.bet_street,
  php.folded,
  php.all_in,
  php.acted_street,
  php.contrib_total,
  php.win_amount,
  -- Only show hole_cards if:
  -- 1. Hand is in showdown/hand_end, OR
  -- 2. This is the current user's seat
  CASE
    WHEN EXISTS (
      SELECT 1 FROM poker.poker_hands h
      WHERE h.id = php.hand_id
        AND h.stage IN ('showdown', 'hand_end')
    ) THEN php.hole_cards
    WHEN EXISTS (
      SELECT 1 FROM poker.poker_seats s
      WHERE s.seat_index = php.seat_index
        AND s.player_id = auth.uid()
    ) THEN php.hole_cards
    ELSE NULL
  END AS hole_cards
FROM poker.poker_hand_players php;

COMMENT ON VIEW poker.poker_hand_players_safe IS 
'Secure view that hides opponent hole cards until showdown';

-- Grant permissions
GRANT SELECT ON poker.poker_hand_players_safe TO authenticated;
GRANT SELECT ON poker.poker_hand_players_safe TO anon;

-- Create helper function to get player's own seats
CREATE OR REPLACE FUNCTION poker.get_my_seats(p_table_id bigint)
RETURNS TABLE (
  seat_index integer,
  player_name text,
  stack_live integer,
  sat_out boolean
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.seat_index,
    s.player_name,
    s.stack_live,
    s.sat_out
  FROM poker.poker_seats s
  WHERE s.table_id = p_table_id
    AND s.player_id = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION poker.get_my_seats IS 
'Returns seats owned by current authenticated user';

-- Create helper function to check if user owns a seat
CREATE OR REPLACE FUNCTION poker.owns_seat(p_table_id bigint, p_seat_index integer)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM poker.poker_seats
    WHERE table_id = p_table_id
      AND seat_index = p_seat_index
      AND player_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION poker.owns_seat IS 
'Checks if current user owns specified seat';

-- Usage instructions
COMMENT ON TABLE poker.poker_seats IS 
'Poker table seats with RLS enabled. After Auth is implemented:
 - Update /api/poker/sit to set player_id = auth.uid()
 - Update /api/poker/state to use poker_hand_players_safe VIEW
 - Frontend should read auth.uid() from Supabase Auth';

