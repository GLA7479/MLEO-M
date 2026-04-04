-- OV2 Color Wheel — persistent live tables (one fixed room per stake tier).
-- Apply after community_cards migrations (or latest OV2 migration).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_color_wheel_live_state (
  room_id uuid PRIMARY KEY REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 0,
  engine jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ov2_cw_live_state_updated ON public.ov2_color_wheel_live_state (updated_at DESC);

COMMENT ON TABLE public.ov2_color_wheel_live_state IS
  'OV2 Color Wheel persistent table state; engine JSON owned by server API + revision locking.';

CREATE TABLE IF NOT EXISTS public.ov2_color_wheel_participant_devices (
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  arcade_device_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_cw_participant_devices_pk PRIMARY KEY (room_id, participant_key),
  CONSTRAINT ov2_cw_participant_devices_participant_chk CHECK (char_length(trim(participant_key)) > 0),
  CONSTRAINT ov2_cw_participant_devices_device_chk CHECK (char_length(trim(arcade_device_id)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ov2_cw_pd_room ON public.ov2_color_wheel_participant_devices (room_id);

COMMENT ON TABLE public.ov2_color_wheel_participant_devices IS
  'Maps OV2 participant_key to arcade device for Color Wheel vault debits/credits.';

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
    'c0d3e101-0000-4000-8000-000000000001'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 100',
    'active',
    100,
    NULL,
    false,
    '{"ov2_cw_stake_units":100}'::jsonb
  ),
  (
    'c0d3e102-0000-4000-8000-000000000002'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 1K',
    'active',
    1000,
    NULL,
    false,
    '{"ov2_cw_stake_units":1000}'::jsonb
  ),
  (
    'c0d3e103-0000-4000-8000-000000000003'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 10K',
    'active',
    10000,
    NULL,
    false,
    '{"ov2_cw_stake_units":10000}'::jsonb
  ),
  (
    'c0d3e104-0000-4000-8000-000000000004'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 100K',
    'active',
    100000,
    NULL,
    false,
    '{"ov2_cw_stake_units":100000}'::jsonb
  ),
  (
    'c0d3e105-0000-4000-8000-000000000005'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 1M',
    'active',
    1000000,
    NULL,
    false,
    '{"ov2_cw_stake_units":1000000}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  host_participant_key = EXCLUDED.host_participant_key,
  is_private = EXCLUDED.is_private,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_color_wheel_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.id IN (
  'c0d3e101-0000-4000-8000-000000000001'::uuid,
  'c0d3e102-0000-4000-8000-000000000002'::uuid,
  'c0d3e103-0000-4000-8000-000000000003'::uuid,
  'c0d3e104-0000-4000-8000-000000000004'::uuid,
  'c0d3e105-0000-4000-8000-000000000005'::uuid
)
ON CONFLICT (room_id) DO NOTHING;

ALTER TABLE public.ov2_color_wheel_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_cw_live_state_select_all ON public.ov2_color_wheel_live_state;
CREATE POLICY ov2_cw_live_state_select_all ON public.ov2_color_wheel_live_state
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_cw_live_state_insert_deny ON public.ov2_color_wheel_live_state;
CREATE POLICY ov2_cw_live_state_insert_deny ON public.ov2_color_wheel_live_state
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_cw_live_state_update_deny ON public.ov2_color_wheel_live_state;
CREATE POLICY ov2_cw_live_state_update_deny ON public.ov2_color_wheel_live_state
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_cw_live_state_delete_deny ON public.ov2_color_wheel_live_state;
CREATE POLICY ov2_cw_live_state_delete_deny ON public.ov2_color_wheel_live_state
  FOR DELETE TO anon, authenticated
  USING (false);

ALTER TABLE public.ov2_color_wheel_participant_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_cw_pd_deny_all ON public.ov2_color_wheel_participant_devices;
CREATE POLICY ov2_cw_pd_deny_all ON public.ov2_color_wheel_participant_devices
  FOR ALL TO anon, authenticated
  USING (false)
  WITH CHECK (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_color_wheel_live_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
