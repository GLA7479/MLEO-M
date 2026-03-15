-- ============================================================================
-- EXTEND ARCADE SESSION RESOLUTION WITH ROULETTE / SICBO / CRAPS
-- Run this after arcade_sessions_add_simple_batch.sql
-- ============================================================================

BEGIN;

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
      WHEN v_dice_is_over THEN ((100 - 0.04) / (100 - v_dice_target)) * 100
      ELSE ((100 - 0.04) / v_dice_target) * 100
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
      WHEN v_baccarat_play = 'player' THEN 2
      WHEN v_baccarat_play = 'banker' THEN 1.95
      ELSE 8
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

  ELSIF coalesce(v_session.game_id, '') = 'roulette' THEN
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
      WHEN v_craps_play IN ('pass', 'dont_pass') THEN 2
      WHEN v_craps_play = 'seven' THEN 5
      ELSE 8
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

GRANT EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) TO anon, authenticated;

COMMIT;
