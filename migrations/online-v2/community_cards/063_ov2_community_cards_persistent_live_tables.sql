-- OV2 Community Cards — persistent live tables (10 fixed rooms: 5 stakes × 5-max / 9-max).
-- Apply after c21/061 (or latest OV2 migration). Does NOT run automatically.
-- Public gameplay summary in `ov2_community_cards_live_state.engine`; hole cards + deck in `ov2_community_cards_private.payload` (no anon SELECT).

BEGIN;

-- ---------------------------------------------------------------------------
-- Live state (one row per seeded room) — world-readable; no secret cards here
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ov2_community_cards_live_state (
  room_id uuid PRIMARY KEY REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 0,
  engine jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ov2_cc_live_state_updated ON public.ov2_community_cards_live_state (updated_at DESC);

COMMENT ON TABLE public.ov2_community_cards_live_state IS
  'OV2 Community Cards persistent table public state; secrets in ov2_community_cards_private.';

-- ---------------------------------------------------------------------------
-- Private slice (hole cards, deck) — service role / API only
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ov2_community_cards_private (
  room_id uuid PRIMARY KEY REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ov2_cc_private_updated ON public.ov2_community_cards_private (updated_at DESC);

COMMENT ON TABLE public.ov2_community_cards_private IS
  'OV2 Community Cards server-only secrets (hole cards, deck). Clients must not read.';

-- ---------------------------------------------------------------------------
-- Participant → device binding (multi-recipient vault apply)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ov2_community_cards_participant_devices (
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  arcade_device_id uuid NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_cc_participant_devices_pk PRIMARY KEY (room_id, participant_key),
  CONSTRAINT ov2_cc_participant_devices_device_chk CHECK (char_length(trim(participant_key)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ov2_cc_pd_room ON public.ov2_community_cards_participant_devices (room_id);

COMMENT ON TABLE public.ov2_community_cards_participant_devices IS
  'Maps OV2 participant_key to arcade_device_id per Community Cards room for authoritative vault apply.';

-- ---------------------------------------------------------------------------
-- Seed rooms (fixed UUIDs — keep in sync with lib/online-v2/community_cards/ov2CcTableIds.js)
-- ---------------------------------------------------------------------------
INSERT INTO public.ov2_rooms (
  id,
  product_game_id,
  title,
  lifecycle_phase,
  stake_per_seat,
  host_participant_key,
  is_private,
  meta
)
VALUES
  (
    'cc0da001-0000-4000-8000-000000000001'::uuid,
    'ov2_community_cards',
    'Community Cards • 100 • 5-max',
    'active',
    100,
    NULL,
    false,
    '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
  ),
  (
    'cc0da002-0000-4000-8000-000000000002'::uuid,
    'ov2_community_cards',
    'Community Cards • 100 • 9-max',
    'active',
    100,
    NULL,
    false,
    '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
  ),
  (
    'cc0da003-0000-4000-8000-000000000003'::uuid,
    'ov2_community_cards',
    'Community Cards • 1K • 5-max',
    'active',
    1000,
    NULL,
    false,
    '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
  ),
  (
    'cc0da004-0000-4000-8000-000000000004'::uuid,
    'ov2_community_cards',
    'Community Cards • 1K • 9-max',
    'active',
    1000,
    NULL,
    false,
    '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
  ),
  (
    'cc0da005-0000-4000-8000-000000000005'::uuid,
    'ov2_community_cards',
    'Community Cards • 10K • 5-max',
    'active',
    10000,
    NULL,
    false,
    '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
  ),
  (
    'cc0da006-0000-4000-8000-000000000006'::uuid,
    'ov2_community_cards',
    'Community Cards • 10K • 9-max',
    'active',
    10000,
    NULL,
    false,
    '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
  ),
  (
    'cc0da007-0000-4000-8000-000000000007'::uuid,
    'ov2_community_cards',
    'Community Cards • 100K • 5-max',
    'active',
    100000,
    NULL,
    false,
    '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
  ),
  (
    'cc0da008-0000-4000-8000-000000000008'::uuid,
    'ov2_community_cards',
    'Community Cards • 100K • 9-max',
    'active',
    100000,
    NULL,
    false,
    '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
  ),
  (
    'cc0da009-0000-4000-8000-000000000009'::uuid,
    'ov2_community_cards',
    'Community Cards • 1M • 5-max',
    'active',
    1000000,
    NULL,
    false,
    '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
  ),
  (
    'cc0da00a-0000-4000-8000-00000000000a'::uuid,
    'ov2_community_cards',
    'Community Cards • 1M • 9-max',
    'active',
    1000000,
    NULL,
    false,
    '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_community_cards_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_community_cards'
ON CONFLICT (room_id) DO NOTHING;

INSERT INTO public.ov2_community_cards_private (room_id, revision, payload)
SELECT r.id, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_community_cards'
ON CONFLICT (room_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: public live state readable; private + participant_devices denied to clients
-- ---------------------------------------------------------------------------
ALTER TABLE public.ov2_community_cards_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_cc_live_state_select_all ON public.ov2_community_cards_live_state;
CREATE POLICY ov2_cc_live_state_select_all ON public.ov2_community_cards_live_state
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_cc_live_state_insert_deny ON public.ov2_community_cards_live_state;
CREATE POLICY ov2_cc_live_state_insert_deny ON public.ov2_community_cards_live_state
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_cc_live_state_update_deny ON public.ov2_community_cards_live_state;
CREATE POLICY ov2_cc_live_state_update_deny ON public.ov2_community_cards_live_state
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_cc_live_state_delete_deny ON public.ov2_community_cards_live_state;
CREATE POLICY ov2_cc_live_state_delete_deny ON public.ov2_community_cards_live_state
  FOR DELETE TO anon, authenticated
  USING (false);

ALTER TABLE public.ov2_community_cards_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_cc_private_deny_all ON public.ov2_community_cards_private;
CREATE POLICY ov2_cc_private_deny_all ON public.ov2_community_cards_private
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

ALTER TABLE public.ov2_community_cards_participant_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_cc_pd_deny_all ON public.ov2_community_cards_participant_devices;
CREATE POLICY ov2_cc_pd_deny_all ON public.ov2_community_cards_participant_devices
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Realtime (public state only)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_community_cards_live_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
