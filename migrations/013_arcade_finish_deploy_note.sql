-- If you see: finish_arcade_session is not configured for game_id=blackjack
-- the database is still using an old stub RPC. Fix by applying the full script:
--   sql/arcade_sessions_add_slots_mystery.sql
-- in Supabase Dashboard → SQL Editor (paste entire file → Run).
-- See sql/DEPLOY_ARCADE.md for order (pilot → this file).
SELECT 1;
