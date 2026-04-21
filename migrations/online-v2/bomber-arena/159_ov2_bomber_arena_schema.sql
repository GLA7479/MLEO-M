-- OV2 Bomber Arena — Wave 1 schema (product id: ov2_bomber_arena). MVP: 2 seats.
-- Apply after OV2 core + shared rooms + settlement baseline (e.g. after 149).
-- Next: 160 helpers, 161 session RPCs, 162 gameplay, 163 settlement, then 158 shared integration.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_bomber_arena_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  status text NOT NULL DEFAULT 'live',
  phase text NOT NULL DEFAULT 'playing',
  revision bigint NOT NULL DEFAULT 0,
  sim_tick bigint NOT NULL DEFAULT 0,
  player_count integer NOT NULL DEFAULT 2,
  board jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_seat integer,
  is_draw boolean NOT NULL DEFAULT false,
  active_seats integer[] NOT NULL DEFAULT ARRAY[0, 1]::integer[],
  CONSTRAINT ov2_bomber_arena_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_bomber_arena_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished']::text[])),
  CONSTRAINT ov2_bomber_arena_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_bomber_arena_sessions_sim_tick_chk CHECK (sim_tick >= 0),
  CONSTRAINT ov2_bomber_arena_sessions_pc_chk CHECK (player_count = 2),
  CONSTRAINT ov2_bomber_arena_sessions_room_match UNIQUE (room_id, match_seq),
  CONSTRAINT ov2_bomber_arena_sessions_winner_seat_chk CHECK (
    winner_seat IS NULL OR (winner_seat >= 0 AND winner_seat <= 1)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ov2_bomber_arena_sessions_room_live_playing
  ON public.ov2_bomber_arena_sessions (room_id)
  WHERE status = 'live' AND phase = 'playing';

CREATE INDEX IF NOT EXISTS idx_ov2_bomber_arena_sessions_room ON public.ov2_bomber_arena_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_bomber_arena_sessions_room_live
  ON public.ov2_bomber_arena_sessions (room_id)
  WHERE status = 'live';

COMMENT ON TABLE public.ov2_bomber_arena_sessions IS
  'Bomber Arena; authoritative sim in board jsonb; sim_tick; is_draw for simultaneous terminal kill (MVP 2P).';

CREATE TABLE IF NOT EXISTS public.ov2_bomber_arena_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_bomber_arena_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  is_alive boolean NOT NULL DEFAULT true,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_bomber_arena_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 1),
  CONSTRAINT ov2_bomber_arena_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_bomber_arena_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_bomber_arena_seats_session ON public.ov2_bomber_arena_seats (session_id);

CREATE TABLE IF NOT EXISTS public.ov2_bomber_arena_step_idempotency (
  session_id uuid NOT NULL REFERENCES public.ov2_bomber_arena_sessions (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  idempotency_key bigint NOT NULL,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_bomber_arena_step_idempotency_pk PRIMARY KEY (session_id, participant_key, idempotency_key),
  CONSTRAINT ov2_bomber_arena_step_idempotency_key_pos_chk CHECK (idempotency_key > 0)
);

CREATE INDEX IF NOT EXISTS idx_ov2_bomber_arena_step_idem_session ON public.ov2_bomber_arena_step_idempotency (session_id);

ALTER TABLE public.ov2_bomber_arena_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_bomber_arena_seats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_bomber_arena_step_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_bomber_arena_sessions_select_public ON public.ov2_bomber_arena_sessions;
CREATE POLICY ov2_bomber_arena_sessions_select_public ON public.ov2_bomber_arena_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_bomber_arena_sessions_mutate_deny ON public.ov2_bomber_arena_sessions;
CREATE POLICY ov2_bomber_arena_sessions_mutate_deny ON public.ov2_bomber_arena_sessions
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_bomber_arena_seats_select_public ON public.ov2_bomber_arena_seats;
CREATE POLICY ov2_bomber_arena_seats_select_public ON public.ov2_bomber_arena_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_bomber_arena_seats_mutate_deny ON public.ov2_bomber_arena_seats;
CREATE POLICY ov2_bomber_arena_seats_mutate_deny ON public.ov2_bomber_arena_seats
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_bomber_arena_step_idem_deny_all ON public.ov2_bomber_arena_step_idempotency;
CREATE POLICY ov2_bomber_arena_step_idem_deny_all ON public.ov2_bomber_arena_step_idempotency
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_bomber_arena_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_bomber_arena_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
