-- OV2 Board Path (greenfield rules engine). Apply after 001_ov2_core.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_board_path_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  engine_phase text NOT NULL DEFAULT 'pregame',
  board jsonb,
  turn jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_board_path_sessions_room_seq UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_board_path_sessions_room ON public.ov2_board_path_sessions (room_id);

CREATE TABLE IF NOT EXISTS public.ov2_board_path_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_board_path_sessions (id) ON DELETE CASCADE,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_board_path_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_board_path_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_board_path_seats_session ON public.ov2_board_path_seats (session_id);

COMMIT;
