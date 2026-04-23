-- OV2 Orbit Trap: authoritative session storage + Realtime (Phase 4).
-- Neutral placement: migrations/online-v2/orbit-trap/ (same pattern as snakes-and-ladders/, tanks1/).
-- Apply after OV2 shared core / room tables exist.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_orbit_trap_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  status text NOT NULL DEFAULT 'live',
  phase text NOT NULL DEFAULT 'playing',
  revision bigint NOT NULL DEFAULT 0,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_seat integer,
  active_seats integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  CONSTRAINT ov2_orbit_trap_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_orbit_trap_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished']::text[])),
  CONSTRAINT ov2_orbit_trap_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_orbit_trap_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ov2_orbit_trap_sessions_room_live_playing
  ON public.ov2_orbit_trap_sessions (room_id)
  WHERE status = 'live' AND phase = 'playing';

CREATE INDEX IF NOT EXISTS idx_ov2_orbit_trap_sessions_room ON public.ov2_orbit_trap_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_orbit_trap_sessions_room_live ON public.ov2_orbit_trap_sessions (room_id) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS public.ov2_orbit_trap_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_orbit_trap_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_orbit_trap_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 3),
  CONSTRAINT ov2_orbit_trap_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_orbit_trap_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_orbit_trap_seats_session ON public.ov2_orbit_trap_seats (session_id);

ALTER TABLE public.ov2_orbit_trap_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_orbit_trap_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_orbit_trap_sessions_select_public ON public.ov2_orbit_trap_sessions;
CREATE POLICY ov2_orbit_trap_sessions_select_public ON public.ov2_orbit_trap_sessions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ov2_orbit_trap_sessions_mutate_deny ON public.ov2_orbit_trap_sessions;
CREATE POLICY ov2_orbit_trap_sessions_mutate_deny ON public.ov2_orbit_trap_sessions
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS ov2_orbit_trap_seats_select_public ON public.ov2_orbit_trap_seats;
CREATE POLICY ov2_orbit_trap_seats_select_public ON public.ov2_orbit_trap_seats
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ov2_orbit_trap_seats_mutate_deny ON public.ov2_orbit_trap_seats;
CREATE POLICY ov2_orbit_trap_seats_mutate_deny ON public.ov2_orbit_trap_seats
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_orbit_trap_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_orbit_trap_seats;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
