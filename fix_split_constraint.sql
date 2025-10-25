-- 1) הסרת הקונסטריינט/אינדקס הישן
ALTER TABLE public.bj_players
  DROP CONSTRAINT IF EXISTS u4_bj_players_session_client;

DROP INDEX IF EXISTS u4_bj_players_session_client;

-- 2) יוניק חדש שמאפשר כמה ידיים לשחקן
CREATE UNIQUE INDEX u_bj_players_session_client_hand
  ON public.bj_players (session_id, client_id, hand_idx);
