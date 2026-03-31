-- OV2 Mark Grid (greenfield rules engine). Apply after 002_ov2_board_path.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_mark_grid_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  round_key uuid,
  engine_phase text NOT NULL DEFAULT 'pregame',
  stake_basis bigint NOT NULL DEFAULT 0,
  pool_total bigint NOT NULL DEFAULT 0,
  fee_bps integer NOT NULL DEFAULT 0,
  seats_active integer[] NOT NULL DEFAULT '{}',
  draw jsonb NOT NULL DEFAULT '{}'::jsonb,
  board_call jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_mark_grid_sessions_room_seq UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_mark_grid_sessions_room ON public.ov2_mark_grid_sessions (room_id);

CREATE TABLE IF NOT EXISTS public.ov2_mark_grid_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_mark_grid_sessions (id) ON DELETE CASCADE,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  card jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_mark_grid_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_mark_grid_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_mark_grid_seats_session ON public.ov2_mark_grid_seats (session_id);

CREATE TABLE IF NOT EXISTS public.ov2_mark_grid_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_mark_grid_sessions (id) ON DELETE CASCADE,
  round_key uuid NOT NULL,
  claim_code text NOT NULL,
  claimant_participant_key text NOT NULL,
  payout_amount bigint NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_mark_grid_claims_dedupe UNIQUE (session_id, round_key, claim_code)
);

CREATE INDEX IF NOT EXISTS idx_ov2_mark_grid_claims_session ON public.ov2_mark_grid_claims (session_id);

COMMIT;
