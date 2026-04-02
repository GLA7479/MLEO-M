-- OV2 21 Challenge — persistent live tables (one fixed room per stake tier).
-- Apply after 058_ov2_shared_hidden_join_by_code.sql (or latest OV2 migration).
-- Seeds five `ov2_rooms` rows (product_game_id = ov2_c21) for economy FK + discovery.
-- Authoritative gameplay state lives in `ov2_c21_live_state.engine` (JSON); mutations via Next.js API (service role).

BEGIN;

-- ---------------------------------------------------------------------------
-- Live state (one row per seeded room)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ov2_c21_live_state (
  room_id uuid PRIMARY KEY REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  revision bigint NOT NULL DEFAULT 0,
  engine jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ov2_c21_live_state_updated ON public.ov2_c21_live_state (updated_at DESC);

COMMENT ON TABLE public.ov2_c21_live_state IS
  'OV2 21 Challenge persistent table state; engine JSON owned by server API + revision locking.';

-- ---------------------------------------------------------------------------
-- Seed rooms (fixed UUIDs — keep in sync with lib/online-v2/c21/ov2C21TableIds.js)
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
    'c21ade01-0000-4000-8000-000000000001'::uuid,
    'ov2_c21',
    '21 Challenge • 100',
    'active',
    100,
    NULL,
    false,
    '{"ov2_c21_stake_units":100}'::jsonb
  ),
  (
    'c21ade02-0000-4000-8000-000000000002'::uuid,
    'ov2_c21',
    '21 Challenge • 1K',
    'active',
    1000,
    NULL,
    false,
    '{"ov2_c21_stake_units":1000}'::jsonb
  ),
  (
    'c21ade03-0000-4000-8000-000000000003'::uuid,
    'ov2_c21',
    '21 Challenge • 10K',
    'active',
    10000,
    NULL,
    false,
    '{"ov2_c21_stake_units":10000}'::jsonb
  ),
  (
    'c21ade04-0000-4000-8000-000000000004'::uuid,
    'ov2_c21',
    '21 Challenge • 100K',
    'active',
    100000,
    NULL,
    false,
    '{"ov2_c21_stake_units":100000}'::jsonb
  ),
  (
    'c21ade05-0000-4000-8000-000000000005'::uuid,
    'ov2_c21',
    '21 Challenge • 1M',
    'active',
    1000000,
    NULL,
    false,
    '{"ov2_c21_stake_units":1000000}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_c21_live_state (room_id, match_seq, revision, engine)
SELECT r.id, 0, 0, '{}'::jsonb
FROM public.ov2_rooms r
WHERE r.product_game_id = 'ov2_c21'
ON CONFLICT (room_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS: world-readable table (spectators); writes only via service role / API
-- ---------------------------------------------------------------------------
ALTER TABLE public.ov2_c21_live_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_c21_live_state_select_all ON public.ov2_c21_live_state;
CREATE POLICY ov2_c21_live_state_select_all ON public.ov2_c21_live_state
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_c21_live_state_insert_deny ON public.ov2_c21_live_state;
CREATE POLICY ov2_c21_live_state_insert_deny ON public.ov2_c21_live_state
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_c21_live_state_update_deny ON public.ov2_c21_live_state;
CREATE POLICY ov2_c21_live_state_update_deny ON public.ov2_c21_live_state
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_c21_live_state_delete_deny ON public.ov2_c21_live_state;
CREATE POLICY ov2_c21_live_state_delete_deny ON public.ov2_c21_live_state
  FOR DELETE TO anon, authenticated
  USING (false);

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_c21_live_state;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;
