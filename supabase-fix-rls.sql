-- Fix RLS policies for casino tables
-- This script fixes the 400 errors for DELETE and PATCH operations

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Enable read access for all users" ON casino_tables;
DROP POLICY IF EXISTS "Enable insert for all users" ON casino_tables;
DROP POLICY IF EXISTS "Enable update for all users" ON casino_tables;
DROP POLICY IF EXISTS "Enable delete for all users" ON casino_tables;

DROP POLICY IF EXISTS "Enable read access for all users" ON casino_games;
DROP POLICY IF EXISTS "Enable insert for all users" ON casino_games;
DROP POLICY IF EXISTS "Enable update for all users" ON casino_games;
DROP POLICY IF EXISTS "Enable delete for all users" ON casino_games;

DROP POLICY IF EXISTS "Enable read access for all users" ON casino_players;
DROP POLICY IF EXISTS "Enable insert for all users" ON casino_players;
DROP POLICY IF EXISTS "Enable update for all users" ON casino_players;
DROP POLICY IF EXISTS "Enable delete for all users" ON casino_players;

-- Create new policies with proper permissions
CREATE POLICY "Allow all operations for casino_tables" ON casino_tables
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for casino_games" ON casino_games
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all operations for casino_players" ON casino_players
  FOR ALL USING (true) WITH CHECK (true);

-- Verify policies were created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename LIKE 'casino_%'
ORDER BY tablename, cmd;
