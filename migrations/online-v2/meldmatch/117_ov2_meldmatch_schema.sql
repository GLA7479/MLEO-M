-- OV2 MeldMatch: 1v1 hidden-hand meld duel. Stock + hands live in ov2_meldmatch_engine (NOT in supabase_realtime).
-- Session row carries only public_state (counts, discard top, safe metadata). Apply after shared rooms + core OV2.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_meldmatch_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'live',
  phase text NOT NULL DEFAULT 'playing',
  revision bigint NOT NULL DEFAULT 0,
  turn_seat integer,
  winner_seat integer,
  active_seats integer[] NOT NULL DEFAULT ARRAY[0, 1]::integer[],
  public_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  parity_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_meldmatch_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_meldmatch_sessions_phase_chk CHECK (
    phase = ANY (ARRAY['playing', 'layoff', 'finished', 'cancelled']::text[])
  ),
  CONSTRAINT ov2_meldmatch_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_meldmatch_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_meldmatch_sessions_room ON public.ov2_meldmatch_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_meldmatch_sessions_room_live ON public.ov2_meldmatch_sessions (room_id) WHERE status = 'live';

COMMENT ON TABLE public.ov2_meldmatch_sessions IS 'MeldMatch 1v1; secrets only in ov2_meldmatch_engine; public_state safe for realtime.';

CREATE TABLE IF NOT EXISTS public.ov2_meldmatch_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_meldmatch_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_meldmatch_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 1),
  CONSTRAINT ov2_meldmatch_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_meldmatch_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_meldmatch_seats_session ON public.ov2_meldmatch_seats (session_id);

-- Authoritative hidden stock, discard stack (index 0 = bottom, last = top), and both hands. Never published to realtime.
CREATE TABLE IF NOT EXISTS public.ov2_meldmatch_engine (
  session_id uuid PRIMARY KEY REFERENCES public.ov2_meldmatch_sessions (id) ON DELETE CASCADE,
  stock jsonb NOT NULL DEFAULT '[]'::jsonb,
  discard jsonb NOT NULL DEFAULT '[]'::jsonb,
  hand0 jsonb NOT NULL DEFAULT '[]'::jsonb,
  hand1 jsonb NOT NULL DEFAULT '[]'::jsonb,
  layoff_melds jsonb
);

ALTER TABLE public.ov2_meldmatch_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_meldmatch_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_meldmatch_engine ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_meldmatch_sessions_select_public ON public.ov2_meldmatch_sessions;
CREATE POLICY ov2_meldmatch_sessions_select_public ON public.ov2_meldmatch_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_meldmatch_sessions_mutate_deny ON public.ov2_meldmatch_sessions;
CREATE POLICY ov2_meldmatch_sessions_mutate_deny ON public.ov2_meldmatch_sessions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_meldmatch_seats_select_public ON public.ov2_meldmatch_seats;
CREATE POLICY ov2_meldmatch_seats_select_public ON public.ov2_meldmatch_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_meldmatch_seats_mutate_deny ON public.ov2_meldmatch_seats;
CREATE POLICY ov2_meldmatch_seats_mutate_deny ON public.ov2_meldmatch_seats
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_meldmatch_engine_deny_all ON public.ov2_meldmatch_engine;
CREATE POLICY ov2_meldmatch_engine_deny_all ON public.ov2_meldmatch_engine
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_meldmatch_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_meldmatch_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
