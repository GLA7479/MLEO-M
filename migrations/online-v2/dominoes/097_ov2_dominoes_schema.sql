-- OV2 Dominoes (Draw, double-six): session + seats + private tile store (hands + boneyard).
-- Public `board` JSON: { turnSeat, line:[{lo,hi},...] }; no hidden tiles in session row.
-- Apply after shared rooms + core OV2.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_dominoes_sessions (
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
  CONSTRAINT ov2_dominoes_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_dominoes_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished', 'cancelled']::text[])),
  CONSTRAINT ov2_dominoes_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_dominoes_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_dominoes_sessions_room ON public.ov2_dominoes_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_dominoes_sessions_room_live ON public.ov2_dominoes_sessions (room_id) WHERE status = 'live';

COMMENT ON TABLE public.ov2_dominoes_sessions IS 'Draw Dominoes 1v1; line tiles {lo,hi} left-to-right; secrets in ov2_dominoes_secrets.';

CREATE TABLE IF NOT EXISTS public.ov2_dominoes_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_dominoes_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_dominoes_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 1),
  CONSTRAINT ov2_dominoes_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_dominoes_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_dominoes_seats_session ON public.ov2_dominoes_seats (session_id);

-- Private hands + boneyard; never SELECT-granted to clients (RLS default deny).
CREATE TABLE IF NOT EXISTS public.ov2_dominoes_secrets (
  session_id uuid PRIMARY KEY REFERENCES public.ov2_dominoes_sessions (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL
);

COMMENT ON TABLE public.ov2_dominoes_secrets IS 'Server-only dominoes hidden state: hands per seat + boneyard order.';

ALTER TABLE public.ov2_dominoes_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_dominoes_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_dominoes_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_dominoes_sessions_select_public ON public.ov2_dominoes_sessions;
CREATE POLICY ov2_dominoes_sessions_select_public ON public.ov2_dominoes_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_dominoes_sessions_mutate_deny ON public.ov2_dominoes_sessions;
CREATE POLICY ov2_dominoes_sessions_mutate_deny ON public.ov2_dominoes_sessions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_dominoes_seats_select_public ON public.ov2_dominoes_seats;
CREATE POLICY ov2_dominoes_seats_select_public ON public.ov2_dominoes_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_dominoes_seats_mutate_deny ON public.ov2_dominoes_seats;
CREATE POLICY ov2_dominoes_seats_mutate_deny ON public.ov2_dominoes_seats
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- Intentionally no SELECT/ALL policies on secrets for anon/authenticated.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_dominoes_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_dominoes_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
