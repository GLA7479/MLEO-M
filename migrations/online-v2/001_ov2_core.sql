-- OV2 core schema — Online V2 product only. Apply only this folder for OV2 DB.
-- No references to legacy application tables.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  product_game_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  lifecycle_phase text NOT NULL DEFAULT 'lobby',
  stake_per_seat bigint NOT NULL CHECK (stake_per_seat >= 100),
  host_participant_key text,
  is_private boolean NOT NULL DEFAULT false,
  passcode text,
  match_seq integer NOT NULL DEFAULT 0,
  pot_locked bigint NOT NULL DEFAULT 0,
  active_session_id uuid,
  closed_reason text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_rooms_lifecycle_chk CHECK (
    lifecycle_phase = ANY (
      ARRAY['lobby', 'pending_start', 'pending_stakes', 'active', 'settling', 'closed', 'aborted']::text[]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ov2_rooms_product ON public.ov2_rooms (product_game_id);
CREATE INDEX IF NOT EXISTS idx_ov2_rooms_lifecycle ON public.ov2_rooms (lifecycle_phase);

COMMENT ON TABLE public.ov2_rooms IS 'OV2 match room; product_game_id is the OV2 public game id (e.g. ov2_board_path).';

CREATE TABLE IF NOT EXISTS public.ov2_room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  display_name text,
  seat_index integer,
  wallet_state text NOT NULL DEFAULT 'none',
  amount_locked bigint NOT NULL DEFAULT 0,
  join_idempotency text,
  last_seen_at timestamptz,
  is_ready boolean NOT NULL DEFAULT false,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_room_members_wallet_chk CHECK (
    wallet_state = ANY (
      ARRAY['none', 'reserved', 'committed', 'refunded', 'forfeited']::text[]
    )
  ),
  CONSTRAINT ov2_room_members_room_participant UNIQUE (room_id, participant_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ov2_room_members_join_idem ON public.ov2_room_members (join_idempotency)
  WHERE join_idempotency IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ov2_room_members_room ON public.ov2_room_members (room_id);

COMMENT ON TABLE public.ov2_room_members IS 'Participants; wallet_state tracks stake vs room match_seq.';

CREATE TABLE IF NOT EXISTS public.ov2_economy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  participant_key text,
  event_kind text NOT NULL,
  amount bigint NOT NULL,
  match_seq integer NOT NULL DEFAULT 0,
  idempotency_key text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_economy_events_idem UNIQUE (idempotency_key),
  CONSTRAINT ov2_economy_events_kind_chk CHECK (
    event_kind = ANY (
      ARRAY[
        'reserve',
        'commit',
        'release_reserve',
        'refund',
        'forfeit',
        'adjust'
      ]::text[]
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_ov2_economy_events_room ON public.ov2_economy_events (room_id);

COMMENT ON TABLE public.ov2_economy_events IS 'Append-only OV2 economy log; pairs with vault RPCs.';

CREATE TABLE IF NOT EXISTS public.ov2_settlement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL,
  recipient_participant_key text NOT NULL,
  line_kind text NOT NULL,
  amount bigint NOT NULL,
  idempotency_key text NOT NULL,
  game_session_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_settlement_lines_idem UNIQUE (idempotency_key),
  CONSTRAINT ov2_settlement_lines_dedupe UNIQUE (room_id, match_seq, recipient_participant_key, line_kind)
);

CREATE INDEX IF NOT EXISTS idx_ov2_settlement_lines_room_seq ON public.ov2_settlement_lines (room_id, match_seq);

COMMENT ON TABLE public.ov2_settlement_lines IS 'One credit instruction per logical payout; prevents duplicate vault grants.';

COMMIT;
