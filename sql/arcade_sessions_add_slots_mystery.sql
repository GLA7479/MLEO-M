-- ============================================================================
-- EXTEND ARCADE SESSION RESOLUTION WITH SLOTS + MYSTERY
-- Run this after arcade_sessions_add_casino_batch2.sql
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.arcade_draw_cards(p_count integer)
RETURNS text[]
LANGUAGE sql
AS $$
  SELECT coalesce(array_agg(card), ARRAY[]::text[])
  FROM (
    SELECT card
    FROM unnest(ARRAY[
      'AS','2S','3S','4S','5S','6S','7S','8S','9S','10S','JS','QS','KS',
      'AH','2H','3H','4H','5H','6H','7H','8H','9H','10H','JH','QH','KH',
      'AD','2D','3D','4D','5D','6D','7D','8D','9D','10D','JD','QD','KD',
      'AC','2C','3C','4C','5C','6C','7C','8C','9C','10C','JC','QC','KC'
    ]::text[]) AS card
    ORDER BY random()
    LIMIT greatest(coalesce(p_count, 0), 0)
  ) drawn;
$$;

CREATE OR REPLACE FUNCTION public.arcade_shuffle_deck(p_session_id uuid)
RETURNS text[]
LANGUAGE plpgsql
AS $$
DECLARE
  v_deck text[] := ARRAY[
    'AS','2S','3S','4S','5S','6S','7S','8S','9S','10S','JS','QS','KS',
    'AH','2H','3H','4H','5H','6H','7H','8H','9H','10H','JH','QH','KH',
    'AD','2D','3D','4D','5D','6D','7D','8D','9D','10D','JD','QD','KD',
    'AC','2C','3C','4C','5C','6C','7C','8C','9C','10C','JC','QC','KC'
  ]::text[];
  v_seed bigint;
  v_i integer;
  v_j integer;
  v_tmp text;
  v_hex text := substr(replace(coalesce(p_session_id::text, ''), '-', ''), 1, 8);
  v_seed_bytes bytea;
BEGIN
  v_seed_bytes := decode(lpad(nullif(v_hex, ''), 8, '0'), 'hex');
  v_seed := (get_byte(v_seed_bytes, 0)::bigint << 24)
    + (get_byte(v_seed_bytes, 1)::bigint << 16)
    + (get_byte(v_seed_bytes, 2)::bigint << 8)
    + get_byte(v_seed_bytes, 3)::bigint;
  IF v_seed = 0 THEN
    v_seed := 1;
  END IF;

  FOR v_i IN REVERSE array_length(v_deck, 1)..2 LOOP
    v_seed := mod((v_seed * 1664525) + 1013904223, 4294967296);
    v_j := mod(v_seed, v_i)::integer + 1;
    v_tmp := v_deck[v_i];
    v_deck[v_i] := v_deck[v_j];
    v_deck[v_j] := v_tmp;
  END LOOP;

  RETURN v_deck;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_card_rank(p_card text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_value text := left(coalesce(p_card, ''), greatest(length(coalesce(p_card, '')) - 1, 0));
BEGIN
  RETURN CASE v_value
    WHEN 'A' THEN 14
    WHEN 'K' THEN 13
    WHEN 'Q' THEN 12
    WHEN 'J' THEN 11
    ELSE coalesce(nullif(v_value, '')::integer, 0)
  END;
EXCEPTION
  WHEN others THEN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_card_suit(p_card text)
RETURNS text
LANGUAGE sql
AS $$
  SELECT right(coalesce(p_card, ''), 1);
$$;

CREATE OR REPLACE FUNCTION public.arcade_card_json(p_card text)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_value text := left(coalesce(p_card, ''), greatest(length(coalesce(p_card, '')) - 1, 0));
  v_suit text := public.arcade_card_suit(p_card);
  v_pretty_suit text := CASE v_suit
    WHEN 'S' THEN '♠️'
    WHEN 'H' THEN '♥️'
    WHEN 'D' THEN '♦️'
    WHEN 'C' THEN '♣️'
    ELSE ''
  END;
BEGIN
  RETURN jsonb_build_object(
    'value', v_value,
    'suit', v_pretty_suit,
    'display', v_value || v_pretty_suit
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_cards_json(p_cards text[])
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT coalesce(
    jsonb_agg(public.arcade_card_json(card) ORDER BY ord),
    '[]'::jsonb
  )
  FROM unnest(coalesce(p_cards, ARRAY[]::text[])) WITH ORDINALITY AS t(card, ord);
$$;

CREATE OR REPLACE FUNCTION public.arcade_compare_rank_arrays(p_left integer[], p_right integer[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  i integer;
  v_len integer := greatest(coalesce(array_length(p_left, 1), 0), coalesce(array_length(p_right, 1), 0));
  v_left integer;
  v_right integer;
BEGIN
  FOR i IN 1..v_len LOOP
    v_left := coalesce(p_left[i], 0);
    v_right := coalesce(p_right[i], 0);
    IF v_left > v_right THEN
      RETURN 1;
    ELSIF v_left < v_right THEN
      RETURN -1;
    END IF;
  END LOOP;
  RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_eval_three_card(p_cards text[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_values integer[];
  v_suits text[];
  v_counts integer[];
  v_is_flush boolean := false;
  v_is_straight boolean := false;
  v_hand text := 'High Card';
  v_rank integer := 1;
  v_high_cards integer[] := ARRAY[]::integer[];
  v_pair_value integer := 0;
  v_trip_value integer := 0;
  v_kickers integer[] := ARRAY[]::integer[];
BEGIN
  SELECT array_agg(public.arcade_card_rank(card) ORDER BY public.arcade_card_rank(card) DESC)
  INTO v_values
  FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card;

  SELECT array_agg(public.arcade_card_suit(card))
  INTO v_suits
  FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card;

  SELECT array_agg(cnt ORDER BY cnt DESC)
  INTO v_counts
  FROM (
    SELECT count(*) AS cnt
    FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card
    GROUP BY public.arcade_card_rank(card)
  ) counted;

  v_is_flush := coalesce(array_length(v_suits, 1), 0) = 3 AND v_suits[1] = v_suits[2] AND v_suits[2] = v_suits[3];
  v_is_straight := coalesce(array_length(v_values, 1), 0) = 3
    AND v_values[1] = v_values[2] + 1
    AND v_values[2] = v_values[3] + 1;

  IF v_is_flush AND v_is_straight THEN
    v_hand := 'Straight Flush';
    v_rank := 6;
    v_high_cards := v_values;
  ELSIF coalesce(v_counts[1], 0) = 3 THEN
    SELECT max(public.arcade_card_rank(card))
    INTO v_trip_value
    FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card
    GROUP BY public.arcade_card_rank(card)
    HAVING count(*) = 3;
    v_hand := 'Three of a Kind';
    v_rank := 5;
    v_high_cards := ARRAY[v_trip_value];
  ELSIF v_is_straight THEN
    v_hand := 'Straight';
    v_rank := 4;
    v_high_cards := v_values;
  ELSIF v_is_flush THEN
    v_hand := 'Flush';
    v_rank := 3;
    v_high_cards := v_values;
  ELSIF coalesce(v_counts[1], 0) = 2 THEN
    SELECT max(public.arcade_card_rank(card))
    INTO v_pair_value
    FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card
    GROUP BY public.arcade_card_rank(card)
    HAVING count(*) = 2;
    SELECT coalesce(array_agg(public.arcade_card_rank(card) ORDER BY public.arcade_card_rank(card) DESC), ARRAY[]::integer[])
    INTO v_kickers
    FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card
    WHERE public.arcade_card_rank(card) <> v_pair_value;
    v_hand := 'Pair';
    v_rank := 2;
    v_high_cards := ARRAY[v_pair_value] || v_kickers;
  ELSE
    v_high_cards := v_values;
  END IF;

  RETURN jsonb_build_object('hand', v_hand, 'rank', v_rank, 'highCards', to_jsonb(v_high_cards));
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_eval_poker5(p_cards text[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_values integer[];
  v_suits text[];
  v_counts integer[];
  v_is_flush boolean := false;
  v_is_straight boolean := false;
  v_hand text := 'High Card';
  v_rank integer := 1;
BEGIN
  SELECT array_agg(public.arcade_card_rank(card) ORDER BY public.arcade_card_rank(card) DESC)
  INTO v_values
  FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card;

  SELECT array_agg(public.arcade_card_suit(card))
  INTO v_suits
  FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card;

  SELECT array_agg(cnt ORDER BY cnt DESC)
  INTO v_counts
  FROM (
    SELECT count(*) AS cnt
    FROM unnest(coalesce(p_cards, ARRAY[]::text[])) AS card
    GROUP BY public.arcade_card_rank(card)
  ) counted;

  v_is_flush := coalesce(array_length(v_suits, 1), 0) = 5
    AND v_suits[1] = v_suits[2]
    AND v_suits[2] = v_suits[3]
    AND v_suits[3] = v_suits[4]
    AND v_suits[4] = v_suits[5];
  v_is_straight := coalesce(array_length(v_values, 1), 0) = 5
    AND v_values[1] = v_values[2] + 1
    AND v_values[2] = v_values[3] + 1
    AND v_values[3] = v_values[4] + 1
    AND v_values[4] = v_values[5] + 1;

  IF v_is_flush AND v_is_straight AND v_values[1] = 14 AND v_values[5] = 10 THEN
    v_hand := 'Royal Flush';
    v_rank := 10;
  ELSIF v_is_flush AND v_is_straight THEN
    v_hand := 'Straight Flush';
    v_rank := 9;
  ELSIF coalesce(v_counts[1], 0) = 4 THEN
    v_hand := 'Four of a Kind';
    v_rank := 8;
  ELSIF coalesce(v_counts[1], 0) = 3 AND coalesce(v_counts[2], 0) = 2 THEN
    v_hand := 'Full Platform';
    v_rank := 7;
  ELSIF v_is_flush THEN
    v_hand := 'Flush';
    v_rank := 6;
  ELSIF v_is_straight THEN
    v_hand := 'Straight';
    v_rank := 5;
  ELSIF coalesce(v_counts[1], 0) = 3 THEN
    v_hand := 'Three of a Kind';
    v_rank := 4;
  ELSIF coalesce(v_counts[1], 0) = 2 AND coalesce(v_counts[2], 0) = 2 THEN
    v_hand := 'Two Pair';
    v_rank := 3;
  ELSIF coalesce(v_counts[1], 0) = 2 THEN
    v_hand := 'One Pair';
    v_rank := 2;
  END IF;

  RETURN jsonb_build_object('hand', v_hand, 'rank', v_rank);
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_eval_best_poker7(p_cards text[])
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_best jsonb := jsonb_build_object('hand', 'High Card', 'rank', 1);
  v_current jsonb;
  i integer;
  j integer;
  k integer;
  l integer;
  m integer;
  v_len integer := coalesce(array_length(p_cards, 1), 0);
BEGIN
  IF v_len < 5 THEN
    RETURN v_best;
  END IF;

  FOR i IN 1..v_len - 4 LOOP
    FOR j IN i + 1..v_len - 3 LOOP
      FOR k IN j + 1..v_len - 2 LOOP
        FOR l IN k + 1..v_len - 1 LOOP
          FOR m IN l + 1..v_len LOOP
            v_current := public.arcade_eval_poker5(ARRAY[p_cards[i], p_cards[j], p_cards[k], p_cards[l], p_cards[m]]);
            IF coalesce((v_current->>'rank')::integer, 0) > coalesce((v_best->>'rank')::integer, 0) THEN
              v_best := v_current;
            END IF;
          END LOOP;
        END LOOP;
      END LOOP;
    END LOOP;
  END LOOP;

  RETURN v_best;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_blackjack_card_value(p_card text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_value text := left(coalesce(p_card, ''), greatest(length(coalesce(p_card, '')) - 1, 0));
BEGIN
  RETURN CASE v_value
    WHEN 'A' THEN 11
    WHEN 'K' THEN 10
    WHEN 'Q' THEN 10
    WHEN 'J' THEN 10
    ELSE coalesce(nullif(v_value, '')::integer, 0)
  END;
EXCEPTION
  WHEN others THEN
    RETURN 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.arcade_blackjack_hand_value(p_cards text[])
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_card text;
  v_total integer := 0;
  v_aces integer := 0;
BEGIN
  FOREACH v_card IN ARRAY coalesce(p_cards, ARRAY[]::text[]) LOOP
    v_total := v_total + public.arcade_blackjack_card_value(v_card);
    IF left(coalesce(v_card, ''), greatest(length(coalesce(v_card, '')) - 1, 0)) = 'A' THEN
      v_aces := v_aces + 1;
    END IF;
  END LOOP;

  WHILE v_total > 21 AND v_aces > 0 LOOP
    v_total := v_total - 10;
    v_aces := v_aces - 1;
  END LOOP;

  RETURN v_total;
END;
$$;

DROP FUNCTION IF EXISTS public.start_paid_session(text, text, bigint);

CREATE OR REPLACE FUNCTION public.start_paid_session(
  p_device_id text,
  p_game_id text,
  p_stake bigint
)
RETURNS TABLE(
  session_id uuid,
  balance_after bigint,
  stake bigint,
  game_id text,
  mode text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_before bigint;
  v_balance_after bigint;
  v_session_id uuid;
  v_reclaimed_stake bigint := 0;
  v_reclaim_timeout interval := interval '5 minutes';
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_game_id), '') = '' THEN
    RAISE EXCEPTION 'game_id is required';
  END IF;

  IF p_stake IS NULL OR p_stake <= 0 THEN
    RAISE EXCEPTION 'stake must be greater than 0';
  END IF;

  INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
  VALUES (p_device_id, 0, now())
  ON CONFLICT (device_id) DO NOTHING;

  SELECT vb.balance
  INTO v_balance_before
  FROM public.vault_balances vb
  WHERE vb.device_id = p_device_id
  FOR UPDATE;

  v_balance_before := coalesce(v_balance_before, 0);

  WITH reclaimed AS (
    UPDATE public.arcade_device_sessions s
    SET status = 'finished',
        approved_reward = s.stake,
        finished_at = now(),
        client_payload = coalesce(s.client_payload, '{}'::jsonb),
        server_payload = coalesce(s.server_payload, '{}'::jsonb) || jsonb_build_object(
          'cancelled', true,
          'cancel_reason', 'expired_started_session',
          'approved_reward', s.stake
        )
    WHERE s.device_id = p_device_id
      AND s.mode = 'paid'
      AND s.status = 'started'
      AND s.started_at <= now() - v_reclaim_timeout
    RETURNING s.stake
  )
  SELECT coalesce(sum(reclaimed.stake), 0)::bigint
  INTO v_reclaimed_stake
  FROM reclaimed;

  IF v_reclaimed_stake > 0 THEN
    v_balance_before := v_balance_before + v_reclaimed_stake;
    UPDATE public.vault_balances vb
    SET balance = v_balance_before,
        last_sync_at = now()
    WHERE vb.device_id = p_device_id;
  END IF;

  IF v_balance_before < p_stake THEN
    RAISE EXCEPTION 'Insufficient vault balance';
  END IF;

  v_balance_after := v_balance_before - p_stake;

  UPDATE public.vault_balances vb
  SET balance = v_balance_after,
      last_sync_at = now()
  WHERE vb.device_id = p_device_id;

  INSERT INTO public.arcade_device_sessions (
    device_id,
    game_id,
    mode,
    status,
    stake,
    approved_reward,
    consumed_token,
    client_payload,
    server_payload
  )
  VALUES (
    p_device_id,
    p_game_id,
    'paid',
    'started',
    p_stake,
    0,
    false,
    '{}'::jsonb,
    jsonb_build_object(
      'balance_before', v_balance_before,
      'balance_after_start', v_balance_after,
      'reclaimed_prior_started_stake', v_reclaimed_stake,
      'reclaim_timeout_seconds', extract(epoch from v_reclaim_timeout)::integer
    )
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY
  SELECT
    v_session_id,
    v_balance_after,
    p_stake,
    p_game_id,
    'paid'::text,
    'started'::text;
END;
$$;

DROP FUNCTION IF EXISTS public.start_freeplay_session(text, text);

CREATE OR REPLACE FUNCTION public.start_freeplay_session(
  p_device_id text,
  p_game_id text
)
RETURNS TABLE(
  session_id uuid,
  tokens_remaining bigint,
  stake bigint,
  game_id text,
  mode text,
  status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_refresh record;
  v_consume record;
  v_session_id uuid;
  v_base_stake bigint;
  v_stake bigint;
BEGIN
  IF coalesce(trim(p_device_id), '') = '' THEN
    RAISE EXCEPTION 'device_id is required';
  END IF;

  IF coalesce(trim(p_game_id), '') = '' THEN
    RAISE EXCEPTION 'game_id is required';
  END IF;

  SELECT *
  INTO v_refresh
  FROM public.freeplay_device_refresh(p_device_id);

  SELECT *
  INTO v_consume
  FROM public.freeplay_device_consume(p_device_id, p_game_id);

  v_base_stake := GREATEST(0, coalesce((v_consume.free_play_amount)::bigint, 0));
  v_stake := CASE
    WHEN coalesce(p_game_id, '') = 'ultimate-poker' THEN v_base_stake * 5
    WHEN coalesce(p_game_id, '') = 'blackjack' THEN floor(v_base_stake * 2.5)::bigint
    ELSE v_base_stake
  END;

  INSERT INTO public.arcade_device_sessions (
    device_id,
    game_id,
    mode,
    status,
    stake,
    approved_reward,
    consumed_token,
    client_payload,
    server_payload
  )
  VALUES (
    p_device_id,
    p_game_id,
    'freeplay',
    'started',
    v_stake,
    0,
    true,
    '{}'::jsonb,
    jsonb_build_object(
      'tokens_before', coalesce((v_refresh.tokens)::bigint, null),
      'tokens_after', coalesce((v_consume.tokens_remaining)::bigint, null),
      'free_play_amount', v_base_stake,
      'reserved_stake', v_stake
    )
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY
  SELECT
    v_session_id,
    GREATEST(0, coalesce((v_consume.tokens_remaining)::bigint, 0)),
    v_stake,
    p_game_id,
    'freeplay'::text,
    'started'::text;
END;
$$;

DROP FUNCTION IF EXISTS public.finish_arcade_session(uuid, jsonb);

CREATE OR REPLACE FUNCTION public.finish_arcade_session(
  p_session_id uuid,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(
  session_id uuid,
  approved_reward bigint,
  balance_after bigint,
  status text,
  server_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session public.arcade_device_sessions%ROWTYPE;
  v_choice text;
  v_coinflip_result text;
  v_dice_target integer;
  v_dice_is_over boolean;
  v_dice_roll numeric(5,2);
  v_dice_multiplier numeric;
  v_baccarat_play text;
  v_baccarat_player_score integer;
  v_baccarat_banker_score integer;
  v_baccarat_multiplier numeric;
  v_mega_segments numeric[] := ARRAY[0.44, 0.51, 0.66, 0.73, 0.88, 1.02, 1.32, 2.12]::numeric[];
  v_mega_colors text[] := ARRAY['Red', 'Blue', 'Green', 'Purple', 'Orange', 'Yellow', 'Gray', 'Pink'];
  v_mega_index integer;
  v_mega_multiplier numeric;
  v_mega_color text;
  v_keno_selected integer[];
  v_keno_drawn integer[];
  v_keno_matches integer;
  v_keno_selected_count integer;
  v_keno_multiplier numeric := 0;
  v_slots_symbols text[] := ARRAY['💎', '⭐', '🍒', '🍋', '🍊', '🍉', '🎰', '7️⃣', '🔔'];
  v_slots_reels text[];
  v_slots_symbol text;
  v_slots_count integer;
  v_slots_multiplier numeric := 0;
  v_mystery_prizes numeric[] := ARRAY[0, 0, 0, 0, 0.44, 0.87, 0.87, 1.31, 2.62, 3.49]::numeric[];
  v_mystery_boxes numeric[];
  v_mystery_choice integer;
  v_mystery_multiplier numeric := 0;
  v_shooter_score integer;
  v_shooter_multiplier numeric := 0;
  v_dragon_floor integer;
  v_dragon_survived boolean;
  v_dragon_multipliers numeric[] := ARRAY[1.65, 2.3, 3.1, 4.5, 6.7, 9.5, 14, 22]::numeric[];
  v_dragon_multiplier numeric := 0;
  v_chamber_count integer;
  v_chamber_cashout boolean;
  v_chamber_multiplier numeric := 0;
  v_bomb_level integer;
  v_bomb_survived boolean;
  v_bomb_multipliers numeric[] := ARRAY[2.5, 3.9, 5.8, 9.2, 17]::numeric[];
  v_bomb_multiplier numeric := 0;
  v_diamonds_gems integer;
  v_diamonds_difficulty integer;
  v_diamonds_cashout boolean;
  v_diamonds_bomb_count integer;
  v_diamonds_safe_cells integer;
  v_diamonds_step integer;
  v_diamonds_multiplier numeric := 0;
  v_diamonds_cumulative numeric := 1;
  v_horse_selected integer;
  v_horse_positions integer[];
  v_horse_my_position integer;
  v_horse_multiplier numeric := 0;
  v_horse_place text := '';
  v_goldrush_found text[];
  v_goldrush_item text;
  v_goldrush_treasures integer;
  v_goldrush_cashout boolean;
  v_goldrush_total numeric := 0;
  v_limbo_target numeric := 0;
  v_limbo_result numeric := 0;
  v_hilo_streak integer := 0;
  v_hilo_cashout boolean := false;
  v_hilo_multiplier numeric := 0;
  v_plinko_bucket integer := 0;
  v_plinko_pick numeric := 0;
  v_plinko_multiplier numeric := 0;
  v_crash_hex text := '';
  v_crash_value numeric := 0;
  v_crash_u numeric := 0;
  v_crash_point numeric := 0;
  v_crash_cashout numeric := 0;
  v_ladder_step integer;
  v_ladder_success boolean;
  v_ladder_multiplier numeric := 0;
  v_ladder_multipliers numeric[] := ARRAY[1.12, 1.25, 1.45, 1.7, 2.05, 2.6, 3.5, 5.0, 7.2, 12]::numeric[];
  v_roulette_play text;
  v_roulette_number integer;
  v_roulette_color text;
  v_roulette_multiplier numeric;
  v_sicbo_play text;
  v_sicbo_dice integer[];
  v_sicbo_sum integer;
  v_sicbo_multiplier numeric;
  v_craps_play text;
  v_craps_dice integer[];
  v_craps_sum integer;
  v_craps_multiplier numeric;
  v_card_draw text[];
  v_shuffled_deck text[];
  v_eval jsonb := '{}'::jsonb;
  v_player_eval jsonb := '{}'::jsonb;
  v_opponent_eval jsonb := '{}'::jsonb;
  v_poker_multiplier numeric := 0;
  v_three_multiplier numeric := 0;
  v_compare_result text := '';
  v_compare integer := 0;
  v_ultimate_decision text := '';
  v_ultimate_play_bet bigint := 0;
  v_ultimate_total_bet bigint := 0;
  v_ultimate_fold boolean := false;
  v_ultimate_dealer_qualifies boolean := false;
  v_blackjack_base_stake bigint := 0;
  v_blackjack_insurance bigint := 0;
  v_blackjack_used_total bigint := 0;
  v_blackjack_reward_total bigint := 0;
  v_blackjack_decision text := '';
  v_blackjack_insurance_taken boolean := false;
  v_blackjack_split boolean := false;
  v_blackjack_player_cards text[];
  v_blackjack_dealer_cards text[];
  v_blackjack_hand_one text[];
  v_blackjack_hand_two text[];
  v_blackjack_actions text[];
  v_blackjack_split_hand_one_actions text[];
  v_blackjack_split_hand_two_actions text[];
  v_blackjack_player_value integer := 0;
  v_blackjack_dealer_value integer := 0;
  v_blackjack_result jsonb := '{}'::jsonb;
  v_blackjack_idx integer := 5;
  v_blackjack_action text := '';
  v_blackjack_wins integer := 0;
  v_blackjack_losses integer := 0;
  v_blackjack_pushes integer := 0;
  v_blackjack_prize bigint := 0;
  v_won boolean;
  v_reward bigint := 0;
  v_balance_after bigint := 0;
  v_server_payload jsonb := '{}'::jsonb;
BEGIN
  IF p_session_id IS NULL THEN
    RAISE EXCEPTION 'session_id is required';
  END IF;

  SELECT *
  INTO v_session
  FROM public.arcade_device_sessions s
  WHERE s.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found';
  END IF;

  IF v_session.status <> 'started' THEN
    RAISE EXCEPTION 'Invalid session status';
  END IF;

  IF v_session.started_at IS NULL THEN
    RAISE EXCEPTION 'Missing started_at';
  END IF;

  IF v_session.status = 'cancelled' THEN
    RAISE EXCEPTION 'Session is cancelled';
  END IF;

  IF v_session.status = 'finished' THEN
    INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
    VALUES (v_session.device_id, 0, now())
    ON CONFLICT (device_id) DO NOTHING;

    SELECT coalesce(vb.balance, 0)
    INTO v_balance_after
    FROM public.vault_balances vb
    WHERE vb.device_id = v_session.device_id;

    RETURN QUERY
    SELECT
      v_session.id,
      v_session.approved_reward,
      v_balance_after,
      v_session.status,
      v_session.server_payload;
    RETURN;
  END IF;

  -- Validate payload is an object
  IF jsonb_typeof(coalesce(p_payload, '{}'::jsonb)) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'payload must be a json object';
  END IF;

  -- Minimum session time check (prevent instant finish) - general check
  -- Individual games may have stricter requirements
  -- Allow fast start→finish (e.g. limbo / wheel / plinko); still blocks instant double-submit abuse
  IF now() < v_session.started_at + interval '100 milliseconds' THEN
    RAISE EXCEPTION 'Session finished too quickly';
  END IF;

  IF coalesce(v_session.game_id, '') = 'coin-flip' THEN
    v_choice := lower(trim(coalesce(p_payload->>'choice', '')));
    IF v_choice NOT IN ('heads', 'tails') THEN
      RAISE EXCEPTION 'coin-flip payload must include choice=heads or choice=tails';
    END IF;

    v_coinflip_result := CASE WHEN random() < 0.5 THEN 'heads' ELSE 'tails' END;
    v_won := (v_coinflip_result = v_choice);
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * 1.92)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'coin-flip',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'choice', v_choice,
      'result', v_coinflip_result,
      'won', v_won,
      'multiplier', 1.92,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') IN ('dice-over-under', 'dice') THEN
    v_dice_target := floor(coalesce((p_payload->>'target')::numeric, 0));
    v_dice_is_over := coalesce((p_payload->>'isOver')::boolean, true);
    IF v_dice_target < 1 OR v_dice_target > 99 THEN
      RAISE EXCEPTION 'dice payload must include target between 1 and 99';
    END IF;
    v_dice_roll := round((random() * 100)::numeric, 2);
    v_won := CASE WHEN v_dice_is_over THEN v_dice_roll > v_dice_target ELSE v_dice_roll < v_dice_target END;
    v_dice_multiplier := CASE
      WHEN v_dice_is_over THEN (96::numeric / (100 - v_dice_target)) * 100
      ELSE (96::numeric / v_dice_target) * 100
    END;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * (v_dice_multiplier / 100))::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'dice-over-under',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'target', v_dice_target,
      'isOver', v_dice_is_over,
      'roll', v_dice_roll,
      'won', v_won,
      'multiplier', round((v_dice_multiplier / 100)::numeric, 4),
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'baccarat' THEN
    -- Minimum time for baccarat (casino game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1200 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_baccarat_play := lower(trim(coalesce(p_payload->>'selectedPlay', '')));
    IF v_baccarat_play NOT IN ('player', 'banker', 'tie') THEN
      RAISE EXCEPTION 'baccarat payload must include selectedPlay=player, banker, or tie';
    END IF;
    v_baccarat_player_score := floor(random() * 10)::integer;
    v_baccarat_banker_score := floor(random() * 10)::integer;
    v_won := CASE
      WHEN v_baccarat_play = 'player' THEN v_baccarat_player_score > v_baccarat_banker_score
      WHEN v_baccarat_play = 'banker' THEN v_baccarat_banker_score > v_baccarat_player_score
      ELSE v_baccarat_player_score = v_baccarat_banker_score
    END;
    v_baccarat_multiplier := CASE
      WHEN v_baccarat_play = 'player' THEN 2.12
      WHEN v_baccarat_play = 'banker' THEN 2.12
      ELSE 9.1
    END;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_baccarat_multiplier)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'baccarat',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'selectedPlay', v_baccarat_play,
      'playerScore', v_baccarat_player_score,
      'bankerScore', v_baccarat_banker_score,
      'won', v_won,
      'tie', v_baccarat_player_score = v_baccarat_banker_score,
      'multiplier', v_baccarat_multiplier,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') IN ('mega-wheel', 'megawheel') THEN
    v_mega_index := floor(random() * array_length(v_mega_segments, 1))::integer + 1;
    v_mega_multiplier := v_mega_segments[v_mega_index];
    v_mega_color := v_mega_colors[v_mega_index];
    v_reward := floor(v_session.stake * v_mega_multiplier)::bigint;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'mega-wheel',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'segmentIndex', v_mega_index - 1,
      'multiplier', v_mega_multiplier,
      'color', v_mega_color,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'keno' THEN
    SELECT array_agg(value::integer ORDER BY ordinality)
    INTO v_keno_selected
    FROM jsonb_array_elements_text(coalesce(p_payload->'selected', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality);
    v_keno_selected_count := coalesce(array_length(v_keno_selected, 1), 0);
    IF v_keno_selected_count < 1 OR v_keno_selected_count > 10 THEN
      RAISE EXCEPTION 'keno payload must include selected array with 1 to 10 numbers';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_keno_selected) AS n WHERE n < 1 OR n > 40) THEN
      RAISE EXCEPTION 'keno selected numbers must be between 1 and 40';
    END IF;
    IF (SELECT count(DISTINCT n) FROM unnest(v_keno_selected) AS n) <> v_keno_selected_count THEN
      RAISE EXCEPTION 'keno selected numbers must be unique';
    END IF;
    SELECT array_agg(n ORDER BY n)
    INTO v_keno_drawn
    FROM (
      SELECT gs AS n FROM generate_series(1, 40) gs ORDER BY random() LIMIT 20
    ) drawn_pool;
    SELECT count(*) INTO v_keno_matches FROM unnest(v_keno_selected) AS n WHERE n = ANY(v_keno_drawn);
    v_keno_multiplier := CASE
      WHEN v_keno_selected_count = 10 AND v_keno_matches = 10 THEN 188
      WHEN v_keno_selected_count = 10 AND v_keno_matches = 9 THEN 38
      WHEN v_keno_selected_count = 10 AND v_keno_matches = 8 THEN 9
      WHEN v_keno_selected_count = 10 AND v_keno_matches = 7 THEN 3
      WHEN v_keno_selected_count = 10 AND v_keno_matches = 6 THEN 1
      WHEN v_keno_selected_count = 5 AND v_keno_matches = 5 THEN 9.5
      WHEN v_keno_selected_count = 5 AND v_keno_matches = 4 THEN 2.8
      WHEN v_keno_selected_count = 5 AND v_keno_matches = 3 THEN 0.95
      WHEN v_keno_selected_count = 1 AND v_keno_matches = 1 THEN 1.91
      ELSE 0
    END;
    v_reward := CASE WHEN v_keno_multiplier > 0 THEN floor(v_session.stake * v_keno_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'keno',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'selected', to_jsonb(v_keno_selected),
      'drawn', to_jsonb(v_keno_drawn),
      'matches', v_keno_matches,
      'selectedCount', v_keno_selected_count,
      'multiplier', v_keno_multiplier,
      'won', v_won,
      'perfect', v_keno_matches = v_keno_selected_count,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'slots-upgraded' THEN
    v_slots_reels := ARRAY[
      v_slots_symbols[floor(random() * array_length(v_slots_symbols, 1))::integer + 1],
      v_slots_symbols[floor(random() * array_length(v_slots_symbols, 1))::integer + 1],
      v_slots_symbols[floor(random() * array_length(v_slots_symbols, 1))::integer + 1],
      v_slots_symbols[floor(random() * array_length(v_slots_symbols, 1))::integer + 1],
      v_slots_symbols[floor(random() * array_length(v_slots_symbols, 1))::integer + 1]
    ];

    FOREACH v_slots_symbol IN ARRAY v_slots_reels LOOP
      v_slots_count := (
        SELECT count(*)::integer
        FROM unnest(v_slots_reels) AS s
        WHERE s = v_slots_symbol
      );

      IF v_slots_count >= 3 THEN
        v_slots_multiplier := CASE
          WHEN v_slots_symbol = '💎' AND v_slots_count = 5 THEN 492.5
          WHEN v_slots_symbol = '💎' AND v_slots_count = 4 THEN 98.5
          WHEN v_slots_symbol = '💎' AND v_slots_count = 3 THEN 19.7
          WHEN v_slots_symbol = '7️⃣' AND v_slots_count = 5 THEN 197
          WHEN v_slots_symbol = '7️⃣' AND v_slots_count = 4 THEN 49.25
          WHEN v_slots_symbol = '7️⃣' AND v_slots_count = 3 THEN 14.775
          WHEN v_slots_symbol = '⭐' AND v_slots_count = 5 THEN 98.5
          WHEN v_slots_symbol = '⭐' AND v_slots_count = 4 THEN 29.55
          WHEN v_slots_symbol = '⭐' AND v_slots_count = 3 THEN 9.85
          WHEN v_slots_symbol = '🔔' AND v_slots_count = 5 THEN 78.8
          WHEN v_slots_symbol = '🔔' AND v_slots_count = 4 THEN 19.7
          WHEN v_slots_symbol = '🔔' AND v_slots_count = 3 THEN 7.88
          WHEN v_slots_symbol = '🎰' AND v_slots_count = 5 THEN 59.1
          WHEN v_slots_symbol = '🎰' AND v_slots_count = 4 THEN 14.775
          WHEN v_slots_symbol = '🎰' AND v_slots_count = 3 THEN 5.91
          WHEN v_slots_symbol = '🍒' AND v_slots_count = 5 THEN 39.4
          WHEN v_slots_symbol = '🍒' AND v_slots_count = 4 THEN 9.85
          WHEN v_slots_symbol = '🍒' AND v_slots_count = 3 THEN 4.925
          WHEN v_slots_symbol = '🍉' AND v_slots_count = 5 THEN 29.55
          WHEN v_slots_symbol = '🍉' AND v_slots_count = 4 THEN 7.88
          WHEN v_slots_symbol = '🍉' AND v_slots_count = 3 THEN 3.94
          WHEN v_slots_symbol = '🍊' AND v_slots_count = 5 THEN 19.7
          WHEN v_slots_symbol = '🍊' AND v_slots_count = 4 THEN 5.91
          WHEN v_slots_symbol = '🍊' AND v_slots_count = 3 THEN 2.955
          WHEN v_slots_symbol = '🍋' AND v_slots_count = 5 THEN 14.775
          WHEN v_slots_symbol = '🍋' AND v_slots_count = 4 THEN 4.925
          WHEN v_slots_symbol = '🍋' AND v_slots_count = 3 THEN 1.97
          ELSE 0
        END;

        IF v_slots_multiplier > 0 THEN
          EXIT;
        END IF;
      END IF;
    END LOOP;

    v_reward := CASE WHEN v_slots_multiplier > 0 THEN floor(v_session.stake * v_slots_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'slots-upgraded',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'reels', to_jsonb(v_slots_reels),
      'symbol', v_slots_symbol,
      'count', coalesce(v_slots_count, 0),
      'multiplier', v_slots_multiplier,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'mystery' THEN
    v_mystery_choice := floor(coalesce((p_payload->>'selectedBox')::numeric, -1));
    IF v_mystery_choice < 0 OR v_mystery_choice >= array_length(v_mystery_prizes, 1) THEN
      RAISE EXCEPTION 'mystery payload must include selectedBox between 0 and 9';
    END IF;

    SELECT array_agg(val ORDER BY random())
    INTO v_mystery_boxes
    FROM unnest(v_mystery_prizes) AS val;

    v_mystery_multiplier := coalesce(v_mystery_boxes[v_mystery_choice + 1], 0);
    v_reward := CASE WHEN v_mystery_multiplier > 0 THEN floor(v_session.stake * v_mystery_multiplier)::bigint ELSE 0 END;
    v_won := v_mystery_multiplier >= 1;
    v_server_payload := jsonb_build_object(
      'game', 'mystery',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'boxes', to_jsonb(v_mystery_boxes),
      'selectedBox', v_mystery_choice,
      'multiplier', v_mystery_multiplier,
      'won', v_won,
      'grandPrize', v_mystery_multiplier = (SELECT max(x) FROM unnest(v_mystery_prizes) AS x),
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'shooter' THEN
    -- Minimum time for shooter (light game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '800 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_shooter_score := floor(coalesce((p_payload->>'score')::numeric, -1));
    IF v_shooter_score < 0 OR v_shooter_score > 200 THEN
      RAISE EXCEPTION 'Invalid shooter score';
    END IF;
    
    -- Use reward buckets instead of linear
    v_shooter_multiplier := CASE
      WHEN v_shooter_score >= 0 AND v_shooter_score <= 19 THEN 0
      WHEN v_shooter_score >= 20 AND v_shooter_score <= 49 THEN 0.8
      WHEN v_shooter_score >= 50 AND v_shooter_score <= 99 THEN 1.15
      WHEN v_shooter_score >= 100 AND v_shooter_score <= 149 THEN 1.6
      ELSE 2.1
    END;
    v_reward := CASE WHEN v_shooter_multiplier > 0 THEN floor(v_session.stake * v_shooter_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > v_session.stake;
    v_server_payload := jsonb_build_object(
      'game', 'shooter',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'score', v_shooter_score,
      'multiplier', v_shooter_multiplier,
      'won', v_won,
      'perfect', v_shooter_score >= 10,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'dragon-tower' THEN
    -- Minimum time for dragon-tower
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_dragon_floor := floor(coalesce((p_payload->>'finalFloor')::numeric, -1));
    v_dragon_survived := coalesce((p_payload->>'survived')::boolean, false);
    IF v_dragon_floor < 0 OR v_dragon_floor > 8 THEN
      RAISE EXCEPTION 'Invalid dragon floor';
    END IF;
    
    -- Force reward=0 if survived=false
    IF NOT v_dragon_survived THEN
      v_reward := 0;
      v_dragon_multiplier := 0;
    ELSIF v_dragon_survived AND v_dragon_floor > 0 THEN
      v_dragon_multiplier := v_dragon_multipliers[LEAST(v_dragon_floor, array_length(v_dragon_multipliers, 1))];
      v_reward := floor(v_session.stake * v_dragon_multiplier)::bigint;
    ELSE
      v_dragon_multiplier := 0;
      v_reward := 0;
    END IF;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'dragon-tower',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'finalFloor', v_dragon_floor,
      'survived', v_dragon_survived,
      'multiplier', v_dragon_multiplier,
      'won', v_won,
      'complete', v_dragon_floor >= 8,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'chamber' THEN
    -- Minimum time for chamber
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_chamber_count := floor(coalesce((p_payload->>'chambers')::numeric, -1));
    v_chamber_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_chamber_count < 0 OR v_chamber_count > 6 THEN
      RAISE EXCEPTION 'Invalid chamber count';
    END IF;
    v_chamber_multiplier := power(1.13::numeric, v_chamber_count);
    v_reward := CASE WHEN v_chamber_cashout THEN floor(v_session.stake * v_chamber_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'chamber',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'chambers', v_chamber_count,
      'cashout', v_chamber_cashout,
      'multiplier', round(v_chamber_multiplier, 6),
      'won', v_won,
      'perfect', v_chamber_count = 5,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'bomb' THEN
    -- Minimum time for bomb
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_bomb_level := floor(coalesce((p_payload->>'finalLevel')::numeric, -1));
    v_bomb_survived := coalesce((p_payload->>'survived')::boolean, false);
    IF v_bomb_level < 0 OR v_bomb_level > 5 THEN
      RAISE EXCEPTION 'Invalid bomb level';
    END IF;
    v_bomb_multiplier := CASE WHEN v_bomb_level > 0 THEN v_bomb_multipliers[LEAST(v_bomb_level, array_length(v_bomb_multipliers, 1))] ELSE 0 END;
    v_reward := CASE WHEN v_bomb_survived AND v_bomb_level > 0 THEN floor(v_session.stake * v_bomb_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'bomb',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'finalLevel', v_bomb_level,
      'survived', v_bomb_survived,
      'multiplier', v_bomb_multiplier,
      'won', v_won,
      'perfect', v_bomb_level >= 5,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'diamonds' THEN
    -- Minimum time for diamonds
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1200 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_diamonds_gems := floor(coalesce((p_payload->>'gems')::numeric, -1));
    v_diamonds_difficulty := floor(coalesce((p_payload->>'difficulty')::numeric, -1));
    v_diamonds_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_diamonds_difficulty < 1 OR v_diamonds_difficulty > 5 THEN
      RAISE EXCEPTION 'Invalid diamonds difficulty';
    END IF;
    IF v_diamonds_gems < 0 OR v_diamonds_gems > 24 THEN
      RAISE EXCEPTION 'Invalid diamonds gem count';
    END IF;
    v_diamonds_bomb_count := CASE v_diamonds_difficulty
      WHEN 0 THEN 3
      WHEN 1 THEN 5
      WHEN 2 THEN 7
      ELSE 10
    END;
    v_diamonds_safe_cells := 25 - v_diamonds_bomb_count;
    v_diamonds_cumulative := 1;
    IF v_diamonds_gems > 0 THEN
      FOR v_diamonds_step IN 0..(v_diamonds_gems - 1) LOOP
        v_diamonds_cumulative := v_diamonds_cumulative
          * ((v_diamonds_safe_cells - v_diamonds_step)::numeric / (25 - v_diamonds_step)::numeric);
      END LOOP;
      v_diamonds_multiplier := (1 / v_diamonds_cumulative) * 0.96;
    ELSE
      v_diamonds_multiplier := 0;
    END IF;
    v_reward := CASE WHEN v_diamonds_cashout AND v_diamonds_gems > 0 THEN floor(v_session.stake * v_diamonds_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'diamonds',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'gems', v_diamonds_gems,
      'difficulty', v_diamonds_difficulty,
      'bombs', v_diamonds_bomb_count,
      'cashout', v_diamonds_cashout,
      'multiplier', round(v_diamonds_multiplier, 6),
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'horse' THEN
    v_horse_selected := floor(coalesce((p_payload->>'selectedHorse')::numeric, -1));
    IF v_horse_selected < 0 OR v_horse_selected > 4 THEN
      RAISE EXCEPTION 'horse payload must include selectedHorse between 0 and 4';
    END IF;
    SELECT array_agg(pos)
    INTO v_horse_positions
    FROM (
      SELECT gs AS pos
      FROM generate_series(0, 4) gs
      ORDER BY random()
    ) shuffled;
    v_horse_my_position := array_position(v_horse_positions, v_horse_selected) - 1;
    IF v_horse_my_position = 0 THEN
      v_horse_multiplier := 3.25;
      v_horse_place := '1st 🥇';
    ELSIF v_horse_my_position = 1 THEN
      v_horse_multiplier := 0.9;
      v_horse_place := '2nd 🥈';
    ELSIF v_horse_my_position = 2 THEN
      v_horse_multiplier := 0.5;
      v_horse_place := '3rd 🥉';
    ELSIF v_horse_my_position = 3 THEN
      v_horse_multiplier := 0.15;
      v_horse_place := '4th';
    ELSE
      v_horse_multiplier := 0;
      v_horse_place := '5th';
    END IF;
    v_reward := floor(v_session.stake * v_horse_multiplier)::bigint;
    -- Any paying place (1st–4th) should count as a "win" for UI; 5th is 0 reward
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'horse',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'selectedHorse', v_horse_selected,
      'positions', to_jsonb(v_horse_positions),
      'place', v_horse_place,
      'multiplier', v_horse_multiplier,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'goldrush' THEN
    -- Minimum time for goldrush
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    SELECT array_agg(value::text ORDER BY ordinality)
    INTO v_goldrush_found
    FROM jsonb_array_elements_text(coalesce(p_payload->'foundItems', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality);
    v_goldrush_treasures := floor(coalesce((p_payload->>'treasures')::numeric, 0));
    v_goldrush_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_goldrush_treasures < 0 OR v_goldrush_treasures > 8 THEN
      RAISE EXCEPTION 'Invalid goldrush treasures';
    END IF;
    IF coalesce(array_length(v_goldrush_found, 1), 0) <> v_goldrush_treasures THEN
      RAISE EXCEPTION 'goldrush payload treasures count does not match foundItems length';
    END IF;
    v_goldrush_total := 0;
    FOREACH v_goldrush_item IN ARRAY coalesce(v_goldrush_found, ARRAY[]::text[]) LOOP
      IF v_goldrush_item NOT IN ('small_gem', 'medium_gem', 'large_treasure', 'grandPrize', 'skull') THEN
        RAISE EXCEPTION 'goldrush invalid found item: %', v_goldrush_item;
      END IF;
      v_goldrush_total := v_goldrush_total + CASE v_goldrush_item
        WHEN 'small_gem' THEN floor(v_session.stake * 0.44)
        WHEN 'medium_gem' THEN floor(v_session.stake * 0.67)
        WHEN 'large_treasure' THEN floor(v_session.stake * 1.0)
        WHEN 'grandPrize' THEN floor(v_session.stake * 1.67)
        ELSE 0
      END;
    END LOOP;
    v_reward := CASE WHEN v_goldrush_cashout THEN floor(v_goldrush_total)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'goldrush',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'cashout', v_goldrush_cashout,
      'treasures', v_goldrush_treasures,
      'foundItems', to_jsonb(coalesce(v_goldrush_found, ARRAY[]::text[])),
      'calculated_total', floor(v_goldrush_total)::bigint,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'limbo' THEN
    v_limbo_target := round(coalesce((p_payload->>'targetMultiplier')::numeric, 0), 2);
    IF v_limbo_target < 1.01 OR v_limbo_target > 1000 THEN
      RAISE EXCEPTION 'limbo payload must include targetMultiplier between 1.01 and 1000';
    END IF;
    v_limbo_result := round(least((0.96 / greatest(random(), 0.000001))::numeric, 1000::numeric), 2);
    v_won := v_limbo_result >= v_limbo_target;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_limbo_target)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'limbo',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'targetMultiplier', v_limbo_target,
      'result', v_limbo_result,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'hilo' THEN
    -- Minimum time for hilo
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_hilo_streak := floor(coalesce((p_payload->>'streak')::numeric, 0));
    v_hilo_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_hilo_streak < 0 OR v_hilo_streak > 12 THEN
      RAISE EXCEPTION 'Invalid hilo streak';
    END IF;
    v_hilo_multiplier := round((1 + (v_hilo_streak * 0.206))::numeric, 3);
    v_reward := CASE WHEN v_hilo_cashout AND v_hilo_streak > 0 THEN floor(v_session.stake * v_hilo_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'hilo',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'cashout', v_hilo_cashout,
      'streak', v_hilo_streak,
      'multiplier', v_hilo_multiplier,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'plinko' THEN
    v_plinko_pick := random() * 1.0396;
    IF v_plinko_pick < 0.0002 THEN
      v_plinko_bucket := 0;
      v_plinko_multiplier := 0;
    ELSIF v_plinko_pick < 0.0003 THEN
      v_plinko_bucket := 1;
      v_plinko_multiplier := 40;
    ELSIF v_plinko_pick < 0.0033 THEN
      v_plinko_bucket := 2;
      v_plinko_multiplier := 18;
    ELSIF v_plinko_pick < 0.0048 THEN
      v_plinko_bucket := 3;
      v_plinko_multiplier := 5;
    ELSIF v_plinko_pick < 0.0198 THEN
      v_plinko_bucket := 4;
      v_plinko_multiplier := 2;
    ELSIF v_plinko_pick < 0.0598 THEN
      v_plinko_bucket := 5;
      v_plinko_multiplier := 1.5;
    ELSIF v_plinko_pick < 0.1498 THEN
      v_plinko_bucket := 6;
      v_plinko_multiplier := 1;
    ELSIF v_plinko_pick < 0.2698 THEN
      v_plinko_bucket := 7;
      v_plinko_multiplier := 0.5;
    ELSIF v_plinko_pick < 0.7698 THEN
      v_plinko_bucket := 8;
      v_plinko_multiplier := 0.7;
    ELSIF v_plinko_pick < 0.8898 THEN
      v_plinko_bucket := 9;
      v_plinko_multiplier := 0.5;
    ELSIF v_plinko_pick < 0.9798 THEN
      v_plinko_bucket := 10;
      v_plinko_multiplier := 1;
    ELSIF v_plinko_pick < 1.0198 THEN
      v_plinko_bucket := 11;
      v_plinko_multiplier := 1.5;
    ELSIF v_plinko_pick < 1.0348 THEN
      v_plinko_bucket := 12;
      v_plinko_multiplier := 2;
    ELSIF v_plinko_pick < 1.0363 THEN
      v_plinko_bucket := 13;
      v_plinko_multiplier := 5;
    ELSIF v_plinko_pick < 1.0393 THEN
      v_plinko_bucket := 14;
      v_plinko_multiplier := 18;
    ELSIF v_plinko_pick < 1.0394 THEN
      v_plinko_bucket := 15;
      v_plinko_multiplier := 40;
    ELSE
      v_plinko_bucket := 16;
      v_plinko_multiplier := 0;
    END IF;
    v_reward := floor(v_session.stake * v_plinko_multiplier)::bigint;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'plinko',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'bucketIndex', v_plinko_bucket,
      'multiplier', v_plinko_multiplier,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'crash' THEN
    -- Minimum time for crash (sensitive game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1500 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_crash_hex := substr(replace(v_session.id::text, '-', ''), 1, 12);
    v_crash_value := 0;
    FOR i IN 0..5 LOOP
      v_crash_value := (v_crash_value * 256) + get_byte(decode(v_crash_hex, 'hex'), i);
    END LOOP;
    v_crash_u := v_crash_value / 281474976710656::numeric;
    v_crash_point := round(least(10.0::numeric, greatest(1.01::numeric, (1.01 + ((10.0 - 1.01) * power(v_crash_u, 1.45))))), 2);
    v_crash_cashout := round(coalesce((p_payload->>'cashoutMultiplier')::numeric, 0), 2);
    IF v_crash_cashout < 0 OR v_crash_cashout > 100 THEN
      RAISE EXCEPTION 'Invalid crash cashout multiplier';
    END IF;
    v_won := coalesce((p_payload->>'cashedOut')::boolean, false) AND v_crash_cashout >= 1.01 AND v_crash_cashout < v_crash_point;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_crash_cashout)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'crash',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'crashPoint', v_crash_point,
      'cashedOut', v_won,
      'cashedOutAt', CASE WHEN v_won THEN v_crash_cashout ELSE null END,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'ladder' THEN
    -- Minimum time for ladder
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1000 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_ladder_step := floor(coalesce((p_payload->>'currentStep')::numeric, 0));
    v_ladder_success := coalesce((p_payload->>'success')::boolean, false);
    IF v_ladder_step < 0 OR v_ladder_step > 10 THEN
      RAISE EXCEPTION 'Invalid ladder step';
    END IF;
    v_ladder_multiplier := CASE WHEN v_ladder_step > 0 THEN v_ladder_multipliers[v_ladder_step] ELSE 0 END;
    v_reward := CASE WHEN v_ladder_success AND v_ladder_step > 0 THEN floor(v_session.stake * v_ladder_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'ladder',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'currentStep', v_ladder_step,
      'success', v_ladder_success,
      'multiplier', v_ladder_multiplier,
      'won', v_won,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'roulette' THEN
    -- Minimum time for roulette (casino game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1200 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_roulette_play := lower(trim(coalesce(p_payload->>'playType', '')));
    IF v_roulette_play NOT IN ('red', 'black', 'even', 'odd', 'low', 'high') THEN
      RAISE EXCEPTION 'roulette payload must include playType';
    END IF;
    v_roulette_number := floor(random() * 37)::integer;
    v_roulette_color := CASE
      WHEN v_roulette_number = 0 THEN 'green'
      WHEN v_roulette_number IN (1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36) THEN 'red'
      ELSE 'black'
    END;
    v_won := CASE
      WHEN v_roulette_play = 'red' THEN v_roulette_color = 'red'
      WHEN v_roulette_play = 'black' THEN v_roulette_color = 'black'
      WHEN v_roulette_play = 'even' THEN v_roulette_number <> 0 AND mod(v_roulette_number, 2) = 0
      WHEN v_roulette_play = 'odd' THEN v_roulette_number <> 0 AND mod(v_roulette_number, 2) = 1
      WHEN v_roulette_play = 'low' THEN v_roulette_number BETWEEN 1 AND 18
      ELSE v_roulette_number BETWEEN 19 AND 36
    END;
    v_roulette_multiplier := 1.97;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_roulette_multiplier)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'roulette',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'playType', v_roulette_play,
      'resultNumber', v_roulette_number,
      'resultColor', v_roulette_color,
      'won', v_won,
      'multiplier', v_roulette_multiplier,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'sicbo' THEN
    v_sicbo_play := lower(trim(coalesce(p_payload->>'selectedPlay', '')));
    IF v_sicbo_play NOT IN ('small', 'big', 'triple', 'specific_triple_6') THEN
      RAISE EXCEPTION 'sicbo payload must include selectedPlay';
    END IF;
    v_sicbo_dice := ARRAY[floor(random() * 6)::integer + 1, floor(random() * 6)::integer + 1, floor(random() * 6)::integer + 1];
    v_sicbo_sum := v_sicbo_dice[1] + v_sicbo_dice[2] + v_sicbo_dice[3];
    v_won := CASE
      WHEN v_sicbo_play = 'small' THEN v_sicbo_sum >= 4 AND v_sicbo_sum <= 10
      WHEN v_sicbo_play = 'big' THEN v_sicbo_sum >= 11 AND v_sicbo_sum <= 17
      WHEN v_sicbo_play = 'triple' THEN v_sicbo_dice[1] = v_sicbo_dice[2] AND v_sicbo_dice[2] = v_sicbo_dice[3]
      ELSE v_sicbo_dice[1] = 6 AND v_sicbo_dice[2] = 6 AND v_sicbo_dice[3] = 6
    END;
    v_sicbo_multiplier := CASE
      WHEN v_sicbo_play IN ('small', 'big') THEN 2
      WHEN v_sicbo_play = 'triple' THEN 30
      ELSE 50
    END;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_sicbo_multiplier)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'sicbo',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'selectedPlay', v_sicbo_play,
      'dice', to_jsonb(v_sicbo_dice),
      'sum', v_sicbo_sum,
      'won', v_won,
      'multiplier', v_sicbo_multiplier,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'craps' THEN
    v_craps_play := lower(trim(coalesce(p_payload->>'selectedPlay', '')));
    IF v_craps_play NOT IN ('pass', 'dont_pass', 'seven', 'craps') THEN
      RAISE EXCEPTION 'craps payload must include selectedPlay';
    END IF;
    v_craps_dice := ARRAY[floor(random() * 6)::integer + 1, floor(random() * 6)::integer + 1];
    v_craps_sum := v_craps_dice[1] + v_craps_dice[2];
    v_won := CASE
      WHEN v_craps_play = 'pass' THEN v_craps_sum IN (7, 11)
      WHEN v_craps_play = 'dont_pass' THEN v_craps_sum IN (2, 3, 12)
      WHEN v_craps_play = 'seven' THEN v_craps_sum = 7
      ELSE v_craps_sum IN (2, 3, 12)
    END;
    v_craps_multiplier := CASE
      WHEN v_craps_play = 'pass' THEN 4.30
      WHEN v_craps_play = 'dont_pass' THEN 8.60
      WHEN v_craps_play = 'seven' THEN 5.6
      ELSE 8.4
    END;
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * v_craps_multiplier)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'craps',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'selectedPlay', v_craps_play,
      'dice', to_jsonb(v_craps_dice),
      'sum', v_craps_sum,
      'won', v_won,
      'multiplier', v_craps_multiplier,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'blackjack' THEN
    -- Minimum time for blackjack (casino game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1500 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_blackjack_base_stake := floor(coalesce((p_payload->>'baseStake')::numeric, 0))::bigint;
    v_blackjack_decision := lower(trim(coalesce(p_payload->>'decision', 'play')));
    v_blackjack_insurance_taken := coalesce((p_payload->>'insuranceTaken')::boolean, false);
    v_blackjack_actions := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'actions', '[]'::jsonb)));
    v_blackjack_split_hand_one_actions := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'splitHandOneActions', '[]'::jsonb)));
    v_blackjack_split_hand_two_actions := ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'splitHandTwoActions', '[]'::jsonb)));

    IF v_blackjack_base_stake <= 0 THEN
      RAISE EXCEPTION 'blackjack payload must include baseStake';
    END IF;
    IF v_session.stake < floor(v_blackjack_base_stake * 2.5) THEN
      RAISE EXCEPTION 'blackjack baseStake exceeds reserved session stake';
    END IF;
    IF v_blackjack_decision NOT IN ('play', 'double', 'split', 'surrender') THEN
      RAISE EXCEPTION 'blackjack payload must include a valid decision';
    END IF;

    v_shuffled_deck := public.arcade_shuffle_deck(v_session.id);
    v_blackjack_player_cards := ARRAY[v_shuffled_deck[1], v_shuffled_deck[3]];
    v_blackjack_dealer_cards := ARRAY[v_shuffled_deck[2], v_shuffled_deck[4]];
    v_blackjack_idx := 5;
    v_blackjack_insurance := floor(v_blackjack_base_stake / 2.0)::bigint;
    v_blackjack_used_total := v_blackjack_base_stake;
    v_blackjack_split := v_blackjack_decision = 'split';
    v_blackjack_player_value := public.arcade_blackjack_hand_value(v_blackjack_player_cards);
    v_blackjack_dealer_value := public.arcade_blackjack_hand_value(v_blackjack_dealer_cards);

    IF v_blackjack_player_value = 21 THEN
      IF v_blackjack_dealer_value = 21 THEN
        v_compare_result := 'push';
        v_blackjack_prize := v_blackjack_base_stake;
      ELSE
        v_compare_result := 'win';
        v_blackjack_prize := floor(v_blackjack_base_stake * 2.5)::bigint;
      END IF;
      v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
      v_won := v_compare_result = 'win';

    ELSE
      IF v_blackjack_insurance_taken THEN
        v_blackjack_used_total := v_blackjack_used_total + v_blackjack_insurance;
      END IF;

      IF v_blackjack_dealer_value = 21 THEN
        IF v_blackjack_insurance_taken THEN
          v_compare_result := 'insurance';
          v_blackjack_prize := v_blackjack_insurance * 3;
          v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
        ELSE
          v_compare_result := 'lose';
          v_blackjack_prize := 0;
          v_reward := greatest(v_session.stake - v_blackjack_used_total, 0);
        END IF;
        v_won := false;

      ELSIF v_blackjack_decision = 'surrender' THEN
        v_compare_result := 'surrender';
        v_blackjack_prize := floor(v_blackjack_base_stake / 2.0)::bigint;
        v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
        v_won := false;

      ELSIF v_blackjack_decision = 'double' THEN
        v_blackjack_used_total := v_blackjack_used_total + v_blackjack_base_stake;
        v_blackjack_player_cards := array_append(v_blackjack_player_cards, v_shuffled_deck[v_blackjack_idx]);
        v_blackjack_idx := v_blackjack_idx + 1;
        v_blackjack_player_value := public.arcade_blackjack_hand_value(v_blackjack_player_cards);

        IF v_blackjack_player_value > 21 THEN
          v_compare_result := 'lose';
          v_blackjack_prize := 0;
        ELSE
          WHILE public.arcade_blackjack_hand_value(v_blackjack_dealer_cards) < 17 LOOP
            v_blackjack_dealer_cards := array_append(v_blackjack_dealer_cards, v_shuffled_deck[v_blackjack_idx]);
            v_blackjack_idx := v_blackjack_idx + 1;
          END LOOP;
          v_blackjack_dealer_value := public.arcade_blackjack_hand_value(v_blackjack_dealer_cards);
          IF v_blackjack_dealer_value > 21 OR v_blackjack_player_value > v_blackjack_dealer_value THEN
            v_compare_result := 'win';
            v_blackjack_prize := v_blackjack_base_stake * 4;
          ELSIF v_blackjack_player_value = v_blackjack_dealer_value THEN
            v_compare_result := 'push';
            v_blackjack_prize := v_blackjack_base_stake * 2;
          ELSE
            v_compare_result := 'lose';
            v_blackjack_prize := 0;
          END IF;
        END IF;
        v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
        v_won := v_compare_result = 'win';

      ELSIF v_blackjack_decision = 'split' THEN
        v_blackjack_used_total := v_blackjack_used_total + v_blackjack_base_stake;
        v_blackjack_hand_one := ARRAY[v_blackjack_player_cards[1], v_shuffled_deck[v_blackjack_idx]];
        v_blackjack_idx := v_blackjack_idx + 1;
        v_blackjack_hand_two := ARRAY[v_blackjack_player_cards[2], v_shuffled_deck[v_blackjack_idx]];
        v_blackjack_idx := v_blackjack_idx + 1;

        IF left(v_blackjack_player_cards[1], greatest(length(v_blackjack_player_cards[1]) - 1, 0)) <> 'A' THEN
          FOREACH v_blackjack_action IN ARRAY coalesce(v_blackjack_split_hand_one_actions, ARRAY[]::text[]) LOOP
            EXIT WHEN public.arcade_blackjack_hand_value(v_blackjack_hand_one) >= 21;
            IF v_blackjack_action = 'hit' THEN
              v_blackjack_hand_one := array_append(v_blackjack_hand_one, v_shuffled_deck[v_blackjack_idx]);
              v_blackjack_idx := v_blackjack_idx + 1;
            ELSIF v_blackjack_action = 'stand' THEN
              EXIT;
            END IF;
          END LOOP;

          FOREACH v_blackjack_action IN ARRAY coalesce(v_blackjack_split_hand_two_actions, ARRAY[]::text[]) LOOP
            EXIT WHEN public.arcade_blackjack_hand_value(v_blackjack_hand_two) >= 21;
            IF v_blackjack_action = 'hit' THEN
              v_blackjack_hand_two := array_append(v_blackjack_hand_two, v_shuffled_deck[v_blackjack_idx]);
              v_blackjack_idx := v_blackjack_idx + 1;
            ELSIF v_blackjack_action = 'stand' THEN
              EXIT;
            END IF;
          END LOOP;
        END IF;

        IF public.arcade_blackjack_hand_value(v_blackjack_hand_one) <= 21
           OR public.arcade_blackjack_hand_value(v_blackjack_hand_two) <= 21 THEN
          WHILE public.arcade_blackjack_hand_value(v_blackjack_dealer_cards) < 17 LOOP
            v_blackjack_dealer_cards := array_append(v_blackjack_dealer_cards, v_shuffled_deck[v_blackjack_idx]);
            v_blackjack_idx := v_blackjack_idx + 1;
          END LOOP;
        END IF;
        v_blackjack_dealer_value := public.arcade_blackjack_hand_value(v_blackjack_dealer_cards);

        v_blackjack_wins := 0;
        v_blackjack_losses := 0;
        v_blackjack_pushes := 0;
        v_blackjack_prize := 0;

        v_blackjack_player_value := public.arcade_blackjack_hand_value(v_blackjack_hand_one);
        IF v_blackjack_player_value > 21 THEN
          v_blackjack_losses := v_blackjack_losses + 1;
        ELSIF v_blackjack_dealer_value > 21 OR v_blackjack_player_value > v_blackjack_dealer_value THEN
          v_blackjack_wins := v_blackjack_wins + 1;
          v_blackjack_prize := v_blackjack_prize + (v_blackjack_base_stake * 2);
        ELSIF v_blackjack_player_value = v_blackjack_dealer_value THEN
          v_blackjack_pushes := v_blackjack_pushes + 1;
          v_blackjack_prize := v_blackjack_prize + v_blackjack_base_stake;
        ELSE
          v_blackjack_losses := v_blackjack_losses + 1;
        END IF;

        v_blackjack_player_value := public.arcade_blackjack_hand_value(v_blackjack_hand_two);
        IF v_blackjack_player_value > 21 THEN
          v_blackjack_losses := v_blackjack_losses + 1;
        ELSIF v_blackjack_dealer_value > 21 OR v_blackjack_player_value > v_blackjack_dealer_value THEN
          v_blackjack_wins := v_blackjack_wins + 1;
          v_blackjack_prize := v_blackjack_prize + (v_blackjack_base_stake * 2);
        ELSIF v_blackjack_player_value = v_blackjack_dealer_value THEN
          v_blackjack_pushes := v_blackjack_pushes + 1;
          v_blackjack_prize := v_blackjack_prize + v_blackjack_base_stake;
        ELSE
          v_blackjack_losses := v_blackjack_losses + 1;
        END IF;

        v_compare_result := CASE
          WHEN v_blackjack_wins > 0 THEN 'split-win'
          WHEN v_blackjack_pushes = 2 THEN 'split-push'
          ELSE 'split-lose'
        END;
        v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
        v_won := v_blackjack_wins > 0;

      ELSE
        FOREACH v_blackjack_action IN ARRAY coalesce(v_blackjack_actions, ARRAY[]::text[]) LOOP
          EXIT WHEN public.arcade_blackjack_hand_value(v_blackjack_player_cards) >= 21;
          IF v_blackjack_action = 'hit' THEN
            v_blackjack_player_cards := array_append(v_blackjack_player_cards, v_shuffled_deck[v_blackjack_idx]);
            v_blackjack_idx := v_blackjack_idx + 1;
          ELSIF v_blackjack_action = 'stand' THEN
            EXIT;
          END IF;
        END LOOP;

        v_blackjack_player_value := public.arcade_blackjack_hand_value(v_blackjack_player_cards);
        IF v_blackjack_player_value > 21 THEN
          v_compare_result := 'lose';
          v_blackjack_prize := 0;
        ELSE
          WHILE public.arcade_blackjack_hand_value(v_blackjack_dealer_cards) < 17 LOOP
            v_blackjack_dealer_cards := array_append(v_blackjack_dealer_cards, v_shuffled_deck[v_blackjack_idx]);
            v_blackjack_idx := v_blackjack_idx + 1;
          END LOOP;
          v_blackjack_dealer_value := public.arcade_blackjack_hand_value(v_blackjack_dealer_cards);
          IF v_blackjack_dealer_value > 21 OR v_blackjack_player_value > v_blackjack_dealer_value THEN
            v_compare_result := 'win';
            v_blackjack_prize := v_blackjack_base_stake * 2;
          ELSIF v_blackjack_player_value = v_blackjack_dealer_value THEN
            v_compare_result := 'push';
            v_blackjack_prize := v_blackjack_base_stake;
          ELSE
            v_compare_result := 'lose';
            v_blackjack_prize := 0;
          END IF;
        END IF;
        v_reward := greatest(v_session.stake - v_blackjack_used_total, 0) + v_blackjack_prize;
        v_won := v_compare_result = 'win';
      END IF;
    END IF;

    v_server_payload := jsonb_build_object(
      'game', 'blackjack',
      'mode', v_session.mode,
      'stake', v_blackjack_base_stake,
      'reservedStake', v_session.stake,
      'decision', v_blackjack_decision,
      'insuranceTaken', v_blackjack_insurance_taken,
      'split', v_blackjack_split,
      'won', v_won,
      'push', v_compare_result IN ('push', 'split-push'),
      'blackjack', v_compare_result = 'win' AND public.arcade_blackjack_hand_value(ARRAY[v_shuffled_deck[1], v_shuffled_deck[3]]) = 21,
      'surrender', v_compare_result = 'surrender',
      'playerCards', public.arcade_cards_json(v_blackjack_player_cards),
      'dealerCards', public.arcade_cards_json(v_blackjack_dealer_cards),
      'splitHandOne', public.arcade_cards_json(coalesce(v_blackjack_hand_one, ARRAY[]::text[])),
      'splitHandTwo', public.arcade_cards_json(coalesce(v_blackjack_hand_two, ARRAY[]::text[])),
      'playerValue', public.arcade_blackjack_hand_value(v_blackjack_player_cards),
      'dealerValue', public.arcade_blackjack_hand_value(v_blackjack_dealer_cards),
      'splitWins', v_blackjack_wins,
      'splitLosses', v_blackjack_losses,
      'splitPushes', v_blackjack_pushes,
      'usedTotal', v_blackjack_used_total,
      'payout', v_blackjack_prize,
      'profit', v_reward - v_session.stake,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'ultimate-poker' THEN
    -- Minimum time for ultimate-poker (casino game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '1800 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_ultimate_decision := lower(trim(coalesce(p_payload->>'decision', '')));
    IF v_ultimate_decision NOT IN (
      'raise4x',
      'raise2x',
      'raise1x-turn',
      'raise1x-river',
      'fold-preflop',
      'fold-flop',
      'fold-turn',
      'fold-river'
    ) THEN
      RAISE EXCEPTION 'ultimate-poker payload must include a valid decision';
    END IF;

    v_shuffled_deck := public.arcade_shuffle_deck(v_session.id);
    v_ultimate_fold := v_ultimate_decision LIKE 'fold-%';
    v_ultimate_play_bet := CASE v_ultimate_decision
      WHEN 'raise4x' THEN floor(v_session.stake / 5) * 4
      WHEN 'raise2x' THEN floor(v_session.stake / 5) * 2
      WHEN 'raise1x-turn' THEN floor(v_session.stake / 5)
      WHEN 'raise1x-river' THEN floor(v_session.stake / 5)
      ELSE 0
    END;
    v_ultimate_total_bet := floor(v_session.stake / 5) + v_ultimate_play_bet;

    v_player_eval := public.arcade_eval_best_poker7(ARRAY[
      v_shuffled_deck[1],
      v_shuffled_deck[3],
      v_shuffled_deck[5],
      v_shuffled_deck[6],
      v_shuffled_deck[7],
      v_shuffled_deck[8],
      v_shuffled_deck[9]
    ]);
    v_opponent_eval := public.arcade_eval_best_poker7(ARRAY[
      v_shuffled_deck[2],
      v_shuffled_deck[4],
      v_shuffled_deck[5],
      v_shuffled_deck[6],
      v_shuffled_deck[7],
      v_shuffled_deck[8],
      v_shuffled_deck[9]
    ]);
    v_ultimate_dealer_qualifies := coalesce((v_opponent_eval->>'rank')::integer, 0) >= 2;
    v_compare := CASE
      WHEN coalesce((v_player_eval->>'rank')::integer, 0) > coalesce((v_opponent_eval->>'rank')::integer, 0) THEN 1
      WHEN coalesce((v_player_eval->>'rank')::integer, 0) < coalesce((v_opponent_eval->>'rank')::integer, 0) THEN -1
      ELSE public.arcade_compare_rank_arrays(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_player_eval->'highCards', '[]'::jsonb))::integer),
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_opponent_eval->'highCards', '[]'::jsonb))::integer)
      )
    END;

    IF v_ultimate_fold THEN
      v_won := false;
      v_compare_result := 'fold';
      v_reward := greatest(v_session.stake - v_ultimate_total_bet, 0);
    ELSE
      IF NOT v_ultimate_dealer_qualifies OR v_compare > 0 THEN
        v_won := true;
        v_compare_result := 'player';
        v_reward := greatest(v_session.stake - v_ultimate_total_bet, 0) + (v_ultimate_total_bet * 2);
      ELSIF v_compare = 0 THEN
        v_won := false;
        v_compare_result := 'tie';
        v_reward := greatest(v_session.stake - v_ultimate_total_bet, 0) + v_ultimate_total_bet;
      ELSE
        v_won := false;
        v_compare_result := 'dealer';
        v_reward := greatest(v_session.stake - v_ultimate_total_bet, 0);
      END IF;
    END IF;

    v_server_payload := jsonb_build_object(
      'game', 'ultimate-poker',
      'mode', v_session.mode,
      'stake', floor(v_session.stake / 5),
      'reservedStake', v_session.stake,
      'decision', v_ultimate_decision,
      'fold', v_ultimate_fold,
      'won', v_won,
      'tie', v_compare_result = 'tie',
      'playBet', v_ultimate_play_bet,
      'totalBetAmount', v_ultimate_total_bet,
      'playerCards', public.arcade_cards_json(ARRAY[v_shuffled_deck[1], v_shuffled_deck[3]]),
      'dealerCards', public.arcade_cards_json(ARRAY[v_shuffled_deck[2], v_shuffled_deck[4]]),
      'communityCards', public.arcade_cards_json(v_shuffled_deck[5:9]),
      'playerHand', coalesce(v_player_eval->>'hand', 'High Card'),
      'dealerHand', coalesce(v_opponent_eval->>'hand', 'High Card'),
      'dealerQualifies', v_ultimate_dealer_qualifies,
      'profit', CASE
        WHEN v_compare_result = 'player' THEN v_ultimate_total_bet
        WHEN v_compare_result = 'tie' THEN 0
        ELSE -v_ultimate_total_bet
      END,
      'message', CASE
        WHEN v_ultimate_fold THEN 'FOLDED'
        WHEN v_compare_result = 'tie' THEN 'TIE - PUSH'
        WHEN v_compare_result = 'player' THEN 'YOU WIN!'
        ELSE 'OPPONENT WINS'
      END,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'poker' THEN
    -- Arcade poker: allow immediate finish after global min window (same as other fast arcade games)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '100 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_card_draw := public.arcade_draw_cards(7);
    v_eval := public.arcade_eval_best_poker7(v_card_draw);
    v_poker_multiplier := CASE v_eval->>'hand'
      WHEN 'Royal Flush' THEN 800
      WHEN 'Straight Flush' THEN 160
      WHEN 'Four of a Kind' THEN 40
      WHEN 'Full Platform' THEN 16
      WHEN 'Flush' THEN 8
      WHEN 'Straight' THEN 6.4
      WHEN 'Three of a Kind' THEN 4
      WHEN 'Two Pair' THEN 2.4
      WHEN 'One Pair' THEN 1.6
      ELSE 0
    END;
    v_reward := CASE WHEN v_poker_multiplier > 0 THEN floor(v_session.stake * v_poker_multiplier)::bigint ELSE 0 END;
    v_won := v_reward > 0;
    v_server_payload := jsonb_build_object(
      'game', 'poker',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'playerCards', public.arcade_cards_json(v_card_draw[1:2]),
      'communityCards', public.arcade_cards_json(v_card_draw[3:7]),
      'hand', coalesce(v_eval->>'hand', 'High Card'),
      'won', v_won,
      'multiplier', v_poker_multiplier,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'three-card-poker' THEN
    -- Per-game finish window: 100ms (same pattern as arcade poker `game_id = 'poker'`; not 1500ms)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '100 milliseconds' THEN
      RAISE EXCEPTION 'Session finished too quickly';
    END IF;
    
    v_card_draw := public.arcade_draw_cards(6);
    v_player_eval := public.arcade_eval_three_card(v_card_draw[1:3]);
    v_opponent_eval := public.arcade_eval_three_card(v_card_draw[4:6]);
    v_compare_result := CASE
      WHEN coalesce((v_player_eval->>'rank')::integer, 0) > coalesce((v_opponent_eval->>'rank')::integer, 0) THEN 'player'
      WHEN coalesce((v_player_eval->>'rank')::integer, 0) < coalesce((v_opponent_eval->>'rank')::integer, 0) THEN 'opponent'
      WHEN public.arcade_compare_rank_arrays(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_player_eval->'highCards', '[]'::jsonb))::integer),
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_opponent_eval->'highCards', '[]'::jsonb))::integer)
      ) > 0 THEN 'player'
      WHEN public.arcade_compare_rank_arrays(
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_player_eval->'highCards', '[]'::jsonb))::integer),
        ARRAY(SELECT jsonb_array_elements_text(coalesce(v_opponent_eval->'highCards', '[]'::jsonb))::integer)
      ) < 0 THEN 'opponent'
      ELSE 'tie'
    END;
    v_won := v_compare_result = 'player';
    v_three_multiplier := CASE v_player_eval->>'hand'
      WHEN 'Straight Flush' THEN 64
      WHEN 'Three of a Kind' THEN 19
      WHEN 'Straight' THEN 3.8
      WHEN 'Flush' THEN 1.9
      WHEN 'Pair' THEN 0.64
      ELSE 0
    END;
    v_reward := CASE
      WHEN v_compare_result = 'tie' THEN v_session.stake
      WHEN v_won THEN floor(v_session.stake + (v_session.stake * v_three_multiplier))::bigint
      ELSE 0
    END;
    v_server_payload := jsonb_build_object(
      'game', 'three-card-poker',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'playerCards', public.arcade_cards_json(v_card_draw[1:3]),
      'opponentCards', public.arcade_cards_json(v_card_draw[4:6]),
      'playerHand', coalesce(v_player_eval->>'hand', 'High Card'),
      'opponentHand', coalesce(v_opponent_eval->>'hand', 'High Card'),
      'won', v_won,
      'tie', v_compare_result = 'tie',
      'multiplier', CASE WHEN v_won THEN v_three_multiplier ELSE 0 END,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'checkers' THEN
    -- Minimum time for checkers (strategic game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '20 seconds' THEN
      RAISE EXCEPTION 'Game finished too quickly';
    END IF;
    
    v_won := coalesce((p_payload->>'playerWon')::boolean, false);
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * 1.92)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'checkers',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'playerWon', v_won,
      'won', v_won,
      'multiplier', 1.92,
      'approved_reward', v_reward
    );

  ELSIF coalesce(v_session.game_id, '') = 'backgammon' THEN
    -- Minimum time for backgammon (strategic game)
    IF v_session.started_at IS NOT NULL AND v_session.started_at > now() - interval '25 seconds' THEN
      RAISE EXCEPTION 'Game finished too quickly';
    END IF;
    
    v_won := coalesce((p_payload->>'playerWon')::boolean, false);
    v_reward := CASE WHEN v_won THEN floor(v_session.stake * 1.92)::bigint ELSE 0 END;
    v_server_payload := jsonb_build_object(
      'game', 'backgammon',
      'mode', v_session.mode,
      'stake', v_session.stake,
      'playerWon', v_won,
      'won', v_won,
      'multiplier', 1.92,
      'approved_reward', v_reward
    );

  ELSE
    RAISE EXCEPTION 'finish_arcade_session is not configured for game_id=%', v_session.game_id;
  END IF;

  INSERT INTO public.vault_balances (device_id, balance, last_sync_at)
  VALUES (v_session.device_id, 0, now())
  ON CONFLICT (device_id) DO NOTHING;

  SELECT coalesce(vb.balance, 0)
  INTO v_balance_after
  FROM public.vault_balances vb
  WHERE vb.device_id = v_session.device_id
  FOR UPDATE;

  IF v_reward > 0 THEN
    v_balance_after := v_balance_after + v_reward;
    UPDATE public.vault_balances vb
    SET balance = v_balance_after,
        last_sync_at = now()
    WHERE vb.device_id = v_session.device_id;
  END IF;

  UPDATE public.arcade_device_sessions s
  SET status = 'finished',
      approved_reward = v_reward,
      finished_at = now(),
      client_payload = coalesce(p_payload, '{}'::jsonb),
      server_payload = v_server_payload
  WHERE s.id = v_session.id;

  RETURN QUERY
  SELECT v_session.id, v_reward, v_balance_after, 'finished'::text, v_server_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) TO service_role;

COMMIT;
