-- OV2 Community Cards — 10 categories × 10 tables (100). Preserves legacy UUIDs as table 1 per category.
BEGIN;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000001'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T1',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T2',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T3',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T4',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T5',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T6',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T7',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T8',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T9',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da001-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 5-max • T10',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000002'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T1',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T2',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T3',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T4',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T5',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T6',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T7',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T8',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T9',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da002-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 100 • 9-max • T10',
  'active',
  100,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1,"ov2_cc_big_blind":2,"ov2_cc_max_buyin":1000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000003'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T1',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T2',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T3',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T4',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T5',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T6',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T7',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T8',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T9',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da003-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 5-max • T10',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000004'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T1',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T2',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T3',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T4',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T5',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T6',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T7',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T8',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T9',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da004-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 1K • 9-max • T10',
  'active',
  1000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10,"ov2_cc_big_blind":20,"ov2_cc_max_buyin":10000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000005'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T1',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T2',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T3',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T4',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T5',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T6',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T7',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T8',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T9',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da005-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 5-max • T10',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000006'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T1',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T2',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T3',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T4',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T5',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T6',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T7',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T8',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T9',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da006-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 10K • 9-max • T10',
  'active',
  10000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":100,"ov2_cc_big_blind":200,"ov2_cc_max_buyin":100000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000007'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T1',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T2',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T3',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T4',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T5',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T6',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T7',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T8',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T9',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da007-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 5-max • T10',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000008'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T1',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T2',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T3',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T4',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T5',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T6',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T7',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T8',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T9',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da008-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 100K • 9-max • T10',
  'active',
  100000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":1000,"ov2_cc_big_blind":2000,"ov2_cc_max_buyin":1000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000009'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T1',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T2',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T3',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T4',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T5',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T6',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T7',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T8',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T9',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da009-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 5-max • T10',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":5,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-00000000000a'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T1',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000011'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T2',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000012'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T3',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000013'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T4',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000014'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T5',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000015'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T6',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000016'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T7',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000017'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T8',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000018'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T9',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  product_game_id = EXCLUDED.product_game_id,
  title = EXCLUDED.title,
  lifecycle_phase = EXCLUDED.lifecycle_phase,
  stake_per_seat = EXCLUDED.stake_per_seat,
  meta = EXCLUDED.meta;

INSERT INTO public.ov2_rooms (
  id, product_game_id, title, lifecycle_phase, stake_per_seat, host_participant_key, is_private, meta
) VALUES (
  'cc0da00a-0000-4000-8000-000000000019'::uuid,
  'ov2_community_cards',
  'Community Cards • 1M • 9-max • T10',
  'active',
  1000000,
  NULL,
  false,
  '{"ov2_cc_max_seats":9,"ov2_cc_small_blind":10000,"ov2_cc_big_blind":20000,"ov2_cc_max_buyin":10000000}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
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

COMMIT;
