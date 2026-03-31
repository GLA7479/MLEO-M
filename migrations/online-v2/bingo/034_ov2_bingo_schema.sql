-- OV2 Bingo: session + claims tables (no legacy bingo_*; seats live in ov2_room_members.seat_index).
-- Apply after 001_ov2_core.sql. Drops ov2_settlement_lines dedupe that blocked multiple grid_row per recipient.

BEGIN;

-- Allow multiple bingo row payouts per player: same line_kind + recipient, distinct idempotency_key.
ALTER TABLE public.ov2_settlement_lines
  DROP CONSTRAINT IF EXISTS ov2_settlement_lines_dedupe;

COMMENT ON TABLE public.ov2_settlement_lines IS
  'One credit instruction per idempotency_key; bingo may emit multiple grid_row lines per recipient (distinct keys).';

CREATE TABLE IF NOT EXISTS public.ov2_bingo_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  phase text NOT NULL,
  revision integer NOT NULL DEFAULT 0,
  seat_count integer NOT NULL,
  active_seats jsonb NOT NULL,
  caller_participant_key text NOT NULL,
  round_id text NOT NULL,
  seed text NOT NULL,
  deck jsonb NOT NULL,
  deck_pos integer NOT NULL DEFAULT 0,
  called jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_number integer NULL,
  entry_fee numeric NOT NULL DEFAULT 0,
  pot_total numeric NOT NULL DEFAULT 0,
  row_prize_amount numeric NOT NULL DEFAULT 0,
  next_call_at timestamptz NULL,
  started_at timestamptz NULL,
  finished_at timestamptz NULL,
  winner_participant_key text NULL,
  winner_name text NULL,
  CONSTRAINT ov2_bingo_sessions_phase_chk CHECK (
    phase = ANY (ARRAY['pending', 'playing', 'finished']::text[])
  ),
  CONSTRAINT ov2_bingo_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_bingo_sessions_deck_pos_chk CHECK (deck_pos >= 0 AND deck_pos <= 75),
  CONSTRAINT ov2_bingo_sessions_seat_count_chk CHECK (seat_count >= 2 AND seat_count <= 8),
  CONSTRAINT ov2_bingo_sessions_room_match UNIQUE (room_id, match_seq),
  CONSTRAINT ov2_bingo_sessions_active_seats_len_chk CHECK (
    seat_count = jsonb_array_length(active_seats)
  )
);

CREATE INDEX IF NOT EXISTS idx_ov2_bingo_sessions_room_match ON public.ov2_bingo_sessions (room_id, match_seq);

COMMENT ON TABLE public.ov2_bingo_sessions IS
  'OV2 Bingo match; deck jsonb holds { "order": int[75], "cards": { "0": [[5x5]] } } authoritative draw + boards.';

CREATE TABLE IF NOT EXISTS public.ov2_bingo_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_bingo_sessions (id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  round_id text NOT NULL,
  prize_key text NOT NULL,
  claimed_by_participant_key text NOT NULL,
  claimed_by_name text NOT NULL,
  seat_index integer NOT NULL,
  amount numeric NOT NULL,
  line_kind text NOT NULL,
  CONSTRAINT ov2_bingo_claims_session_prize UNIQUE (session_id, prize_key),
  CONSTRAINT ov2_bingo_claims_seat_chk CHECK (seat_index >= 0 AND seat_index <= 7),
  CONSTRAINT ov2_bingo_claims_prize_chk CHECK (
    prize_key = ANY (ARRAY['row1', 'row2', 'row3', 'row4', 'row5', 'full']::text[])
  ),
  CONSTRAINT ov2_bingo_claims_line_kind_chk CHECK (line_kind = ANY (ARRAY['grid_row', 'grid_full']::text[]))
);

CREATE INDEX IF NOT EXISTS idx_ov2_bingo_claims_room_match ON public.ov2_bingo_claims (room_id, match_seq);
CREATE INDEX IF NOT EXISTS idx_ov2_bingo_claims_session_created ON public.ov2_bingo_claims (session_id, created_at);

COMMENT ON TABLE public.ov2_bingo_claims IS 'Authoritative bingo prize claims; pairs with ov2_settlement_lines (grid_row / grid_full).';

CREATE OR REPLACE FUNCTION public._ov2_bingo_sessions_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_ov2_bingo_sessions_updated_at ON public.ov2_bingo_sessions;
CREATE TRIGGER tr_ov2_bingo_sessions_updated_at
  BEFORE UPDATE ON public.ov2_bingo_sessions
  FOR EACH ROW
  EXECUTE PROCEDURE public._ov2_bingo_sessions_touch_updated_at();

ALTER TABLE public.ov2_bingo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_bingo_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_bingo_sessions_select_public ON public.ov2_bingo_sessions;
CREATE POLICY ov2_bingo_sessions_select_public ON public.ov2_bingo_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_bingo_sessions_insert_deny ON public.ov2_bingo_sessions;
CREATE POLICY ov2_bingo_sessions_insert_deny ON public.ov2_bingo_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_bingo_sessions_update_deny ON public.ov2_bingo_sessions;
CREATE POLICY ov2_bingo_sessions_update_deny ON public.ov2_bingo_sessions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_bingo_sessions_delete_deny ON public.ov2_bingo_sessions;
CREATE POLICY ov2_bingo_sessions_delete_deny ON public.ov2_bingo_sessions
  FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_bingo_claims_select_public ON public.ov2_bingo_claims;
CREATE POLICY ov2_bingo_claims_select_public ON public.ov2_bingo_claims
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_bingo_claims_insert_deny ON public.ov2_bingo_claims;
CREATE POLICY ov2_bingo_claims_insert_deny ON public.ov2_bingo_claims
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_bingo_claims_update_deny ON public.ov2_bingo_claims;
CREATE POLICY ov2_bingo_claims_update_deny ON public.ov2_bingo_claims
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_bingo_claims_delete_deny ON public.ov2_bingo_claims;
CREATE POLICY ov2_bingo_claims_delete_deny ON public.ov2_bingo_claims
  FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
