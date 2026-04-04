-- OV2 Color Wheel — add two live tables: min stake 1 and min stake 10 (six seats unchanged).
-- Apply after 065_ov2_color_wheel_persistent_live_tables.sql (do not edit 065).
--
-- Core schema (001) enforced stake_per_seat >= 100; micro-stake CW rooms need a lower floor.
-- Shared-room create RPCs still require >= 100 when opening new rooms; only persisted rows can use 1+.

BEGIN;

ALTER TABLE public.ov2_rooms DROP CONSTRAINT IF EXISTS ov2_rooms_stake_per_seat_check;

ALTER TABLE public.ov2_rooms
  ADD CONSTRAINT ov2_rooms_stake_per_seat_check CHECK (stake_per_seat >= 1);

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
    'c0d3e106-0000-4000-8000-000000000006'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 1',
    'active',
    1,
    NULL,
    false,
    '{"ov2_cw_stake_units":1}'::jsonb
  ),
  (
    'c0d3e107-0000-4000-8000-000000000007'::uuid,
    'ov2_color_wheel',
    'Color Wheel • 10',
    'active',
    10,
    NULL,
    false,
    '{"ov2_cw_stake_units":10}'::jsonb
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
  'c0d3e106-0000-4000-8000-000000000006'::uuid,
  'c0d3e107-0000-4000-8000-000000000007'::uuid
)
ON CONFLICT (room_id) DO NOTHING;

COMMIT;
