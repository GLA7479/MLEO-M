-- OV2 FlipGrid: 1v1 disc-flip on 8×8; full board on session row (no secrets).
-- Apply after shared rooms + core OV2. Apply in order 112→116. Do not run automatically.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_flipgrid_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'live',
  phase text NOT NULL DEFAULT 'playing',
  revision bigint NOT NULL DEFAULT 0,
  board jsonb NOT NULL,
  turn_seat integer,
  winner_seat integer,
  active_seats integer[] NOT NULL DEFAULT ARRAY[0, 1]::integer[],
  parity_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_flipgrid_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_flipgrid_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished', 'cancelled']::text[])),
  CONSTRAINT ov2_flipgrid_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_flipgrid_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_flipgrid_sessions_room ON public.ov2_flipgrid_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_flipgrid_sessions_room_live ON public.ov2_flipgrid_sessions (room_id) WHERE status = 'live';

COMMENT ON TABLE public.ov2_flipgrid_sessions IS 'FlipGrid 1v1; board.cells length 64 row-major (row 0 top); values null,0,1; standard center four-disc start.';

CREATE TABLE IF NOT EXISTS public.ov2_flipgrid_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_flipgrid_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_flipgrid_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 1),
  CONSTRAINT ov2_flipgrid_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_flipgrid_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_flipgrid_seats_session ON public.ov2_flipgrid_seats (session_id);

ALTER TABLE public.ov2_flipgrid_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_flipgrid_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_flipgrid_sessions_select_public ON public.ov2_flipgrid_sessions;
CREATE POLICY ov2_flipgrid_sessions_select_public ON public.ov2_flipgrid_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_flipgrid_sessions_mutate_deny ON public.ov2_flipgrid_sessions;
CREATE POLICY ov2_flipgrid_sessions_mutate_deny ON public.ov2_flipgrid_sessions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_flipgrid_seats_select_public ON public.ov2_flipgrid_seats;
CREATE POLICY ov2_flipgrid_seats_select_public ON public.ov2_flipgrid_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_flipgrid_seats_mutate_deny ON public.ov2_flipgrid_seats;
CREATE POLICY ov2_flipgrid_seats_mutate_deny ON public.ov2_flipgrid_seats
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_flipgrid_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_flipgrid_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
