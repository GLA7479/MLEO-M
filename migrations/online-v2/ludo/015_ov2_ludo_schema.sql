-- OV2 Ludo: authoritative session + seat tables. Apply after 001_ov2_core.sql.
-- Draft for manual review — do not assume applied in app code (client handles missing tables).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_ludo_sessions (
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
  dice_value integer,
  last_dice integer,
  winner_seat integer,
  active_seats integer[] NOT NULL DEFAULT ARRAY[0, 1, 2, 3]::integer[],
  CONSTRAINT ov2_ludo_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_ludo_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished', 'cancelled']::text[])),
  CONSTRAINT ov2_ludo_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_ludo_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_ludo_sessions_room ON public.ov2_ludo_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_ludo_sessions_room_live ON public.ov2_ludo_sessions (room_id) WHERE status = 'live';

COMMENT ON TABLE public.ov2_ludo_sessions IS 'Authoritative Ludo match state; board json mirrors ov2LudoEngine board shape.';

CREATE TABLE IF NOT EXISTS public.ov2_ludo_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_ludo_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_ludo_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 3),
  CONSTRAINT ov2_ludo_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_ludo_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_ludo_seats_session ON public.ov2_ludo_seats (session_id);

COMMENT ON TABLE public.ov2_ludo_seats IS 'Maps participant_key to ring seat_index for a Ludo session.';

ALTER TABLE public.ov2_ludo_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_ludo_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_ludo_sessions_select_public ON public.ov2_ludo_sessions;
CREATE POLICY ov2_ludo_sessions_select_public ON public.ov2_ludo_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_ludo_sessions_insert_deny ON public.ov2_ludo_sessions;
CREATE POLICY ov2_ludo_sessions_insert_deny ON public.ov2_ludo_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_ludo_sessions_update_deny ON public.ov2_ludo_sessions;
CREATE POLICY ov2_ludo_sessions_update_deny ON public.ov2_ludo_sessions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_ludo_sessions_delete_deny ON public.ov2_ludo_sessions;
CREATE POLICY ov2_ludo_sessions_delete_deny ON public.ov2_ludo_sessions
  FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_ludo_seats_select_public ON public.ov2_ludo_seats;
CREATE POLICY ov2_ludo_seats_select_public ON public.ov2_ludo_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_ludo_seats_insert_deny ON public.ov2_ludo_seats;
CREATE POLICY ov2_ludo_seats_insert_deny ON public.ov2_ludo_seats
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_ludo_seats_update_deny ON public.ov2_ludo_seats;
CREATE POLICY ov2_ludo_seats_update_deny ON public.ov2_ludo_seats
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_ludo_seats_delete_deny ON public.ov2_ludo_seats;
CREATE POLICY ov2_ludo_seats_delete_deny ON public.ov2_ludo_seats
  FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
