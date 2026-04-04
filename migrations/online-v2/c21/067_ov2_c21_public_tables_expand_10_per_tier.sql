-- OV2 21 Challenge — expand to 6 tiers × 10 public tables (60). Preserves legacy UUIDs as first table per tier (100..1M).
-- Apply after prior C21 migrations. Does NOT run automatically.

BEGIN;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000001'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T1',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000002'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T2',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000003'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T3',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000004'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T4',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000005'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T5',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000006'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T6',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000007'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T7',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000008'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T8',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000009'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T9',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade10-0000-4000-8000-000000000010'::uuid,
  'ov2_c21',
  '21 Challenge • 10 • T10',
  'active',
  10,
  NULL,
  false,
  '{"ov2_c21_stake_units":10}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000001'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T1',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000011'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T2',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000012'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T3',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000013'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T4',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000014'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T5',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000015'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T6',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000016'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T7',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000017'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T8',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000018'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T9',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade01-0000-4000-8000-000000000019'::uuid,
  'ov2_c21',
  '21 Challenge • 100 • T10',
  'active',
  100,
  NULL,
  false,
  '{"ov2_c21_stake_units":100}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000002'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T1',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000011'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T2',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000012'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T3',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000013'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T4',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000014'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T5',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000015'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T6',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000016'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T7',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000017'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T8',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000018'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T9',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade02-0000-4000-8000-000000000019'::uuid,
  'ov2_c21',
  '21 Challenge • 1K • T10',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000003'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T1',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000011'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T2',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000012'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T3',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000013'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T4',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000014'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T5',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000015'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T6',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000016'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T7',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000017'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T8',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000018'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T9',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade03-0000-4000-8000-000000000019'::uuid,
  'ov2_c21',
  '21 Challenge • 10K • T10',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_c21_stake_units":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000004'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T1',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000011'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T2',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000012'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T3',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000013'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T4',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000014'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T5',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000015'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T6',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000016'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T7',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000017'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T8',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000018'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T9',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade04-0000-4000-8000-000000000019'::uuid,
  'ov2_c21',
  '21 Challenge • 100K • T10',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_c21_stake_units":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000005'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T1',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000011'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T2',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000012'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T3',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000013'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T4',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000014'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T5',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000015'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T6',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000016'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T7',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000017'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T8',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000018'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T9',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'c21ade05-0000-4000-8000-000000000019'::uuid,
  'ov2_c21',
  '21 Challenge • 1M • T10',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_c21_stake_units":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
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

COMMIT;
