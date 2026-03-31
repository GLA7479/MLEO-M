-- OV2 Rummy51: authoritative session + round history.
-- Apply after 038_ov2_unified_room_seat_claim.sql (uses ov2_rooms / ov2_room_members).
-- Room product id: ov2_rummy51. Seats 0..3 via ov2_room_members.seat_index.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_rummy51_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  phase text NOT NULL DEFAULT 'playing',
  revision integer NOT NULL DEFAULT 0,
  turn_index integer NOT NULL DEFAULT 0,
  turn_participant_key text NOT NULL,
  dealer_seat_index integer NOT NULL,
  active_seats jsonb NOT NULL,
  seed text NOT NULL,
  stock jsonb NOT NULL DEFAULT '[]'::jsonb,
  discard jsonb NOT NULL DEFAULT '[]'::jsonb,
  hands jsonb NOT NULL DEFAULT '{}'::jsonb,
  table_melds jsonb NOT NULL DEFAULT '[]'::jsonb,
  player_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  taken_discard_card_id text NULL,
  pending_draw_source text NULL,
  round_number integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz NULL,
  winner_participant_key text NULL,
  winner_name text NULL,
  match_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_rummy51_sessions_phase_chk CHECK (
    phase = ANY (ARRAY['playing', 'finished']::text[])
  ),
  CONSTRAINT ov2_rummy51_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_rummy51_sessions_pending_draw_chk CHECK (
    pending_draw_source IS NULL
    OR pending_draw_source = ANY (ARRAY['stock', 'discard']::text[])
  ),
  CONSTRAINT ov2_rummy51_sessions_dealer_seat_chk CHECK (
    dealer_seat_index >= 0 AND dealer_seat_index <= 3
  ),
  CONSTRAINT ov2_rummy51_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_rummy51_sessions_room ON public.ov2_rummy51_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_rummy51_sessions_room_match ON public.ov2_rummy51_sessions (room_id, match_seq DESC);

COMMENT ON TABLE public.ov2_rummy51_sessions IS
  'Live Rummy51 hand + match progress; same row updated each round until match ends. stock/discard: jsonb arrays, last element = top.';

CREATE TABLE IF NOT EXISTS public.ov2_rummy51_round_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.ov2_rummy51_sessions (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  round_number integer NOT NULL,
  winner_participant_key text NULL,
  penalties jsonb NOT NULL DEFAULT '{}'::jsonb,
  totals_after jsonb NOT NULL DEFAULT '{}'::jsonb,
  eliminated_this_round jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ov2_r51_round_hist_room ON public.ov2_rummy51_round_history (room_id, match_seq);
CREATE INDEX IF NOT EXISTS idx_ov2_r51_round_hist_session ON public.ov2_rummy51_round_history (session_id, round_number DESC);

COMMENT ON TABLE public.ov2_rummy51_round_history IS
  'One row per finished hand inside a match; auditing + reconnect scoreboard.';

CREATE OR REPLACE FUNCTION public._ov2_rummy51_sessions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ov2_rummy51_sessions_updated_at ON public.ov2_rummy51_sessions;
CREATE TRIGGER tr_ov2_rummy51_sessions_updated_at
  BEFORE UPDATE ON public.ov2_rummy51_sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public._ov2_rummy51_sessions_touch_updated_at();

ALTER TABLE public.ov2_rummy51_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_rummy51_round_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_rummy51_sessions_select_public ON public.ov2_rummy51_sessions;
CREATE POLICY ov2_rummy51_sessions_select_public ON public.ov2_rummy51_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_rummy51_sessions_mutate_deny ON public.ov2_rummy51_sessions;
CREATE POLICY ov2_rummy51_sessions_mutate_deny ON public.ov2_rummy51_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_rummy51_sessions_update_deny ON public.ov2_rummy51_sessions;
CREATE POLICY ov2_rummy51_sessions_update_deny ON public.ov2_rummy51_sessions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_rummy51_sessions_delete_deny ON public.ov2_rummy51_sessions;
CREATE POLICY ov2_rummy51_sessions_delete_deny ON public.ov2_rummy51_sessions
  FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_r51_round_hist_select_public ON public.ov2_rummy51_round_history;
CREATE POLICY ov2_r51_round_hist_select_public ON public.ov2_rummy51_round_history
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_r51_round_hist_mutate_deny ON public.ov2_rummy51_round_history;
CREATE POLICY ov2_r51_round_hist_mutate_deny ON public.ov2_rummy51_round_history
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_r51_round_hist_update_deny ON public.ov2_rummy51_round_history;
CREATE POLICY ov2_r51_round_hist_update_deny ON public.ov2_rummy51_round_history
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_r51_round_hist_delete_deny ON public.ov2_rummy51_round_history;
CREATE POLICY ov2_r51_round_hist_delete_deny ON public.ov2_rummy51_round_history
  FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
