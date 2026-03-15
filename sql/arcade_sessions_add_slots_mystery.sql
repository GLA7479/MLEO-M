-- ============================================================================
-- EXTEND ARCADE SESSION RESOLUTION WITH SLOTS + MYSTERY
-- Run this after arcade_sessions_add_casino_batch2.sql
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
    v_shooter_score := floor(coalesce((p_payload->>'score')::numeric, -1));
    IF v_shooter_score < 0 OR v_shooter_score > 10 THEN
      RAISE EXCEPTION 'shooter payload must include score between 0 and 10';
    END IF;
    v_shooter_multiplier := v_shooter_score * 0.20;
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
    v_dragon_floor := floor(coalesce((p_payload->>'finalFloor')::numeric, -1));
    v_dragon_survived := coalesce((p_payload->>'survived')::boolean, false);
    IF v_dragon_floor < 0 OR v_dragon_floor > 8 THEN
      RAISE EXCEPTION 'dragon-tower payload must include finalFloor between 0 and 8';
    END IF;
    IF v_dragon_survived AND v_dragon_floor > 0 THEN
      v_dragon_multiplier := v_dragon_multipliers[LEAST(v_dragon_floor, array_length(v_dragon_multipliers, 1))];
      v_reward := floor(v_session.stake * v_dragon_multiplier)::bigint;
    ELSE
      v_dragon_multiplier := CASE WHEN v_dragon_floor > 0 THEN v_dragon_multipliers[LEAST(v_dragon_floor, array_length(v_dragon_multipliers, 1))] ELSE 0 END;
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
    v_chamber_count := floor(coalesce((p_payload->>'chambers')::numeric, -1));
    v_chamber_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_chamber_count < 0 OR v_chamber_count > 5 THEN
      RAISE EXCEPTION 'chamber payload must include chambers between 0 and 5';
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
    v_bomb_level := floor(coalesce((p_payload->>'finalLevel')::numeric, -1));
    v_bomb_survived := coalesce((p_payload->>'survived')::boolean, false);
    IF v_bomb_level < 0 OR v_bomb_level > 5 THEN
      RAISE EXCEPTION 'bomb payload must include finalLevel between 0 and 5';
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
    v_diamonds_gems := floor(coalesce((p_payload->>'gems')::numeric, -1));
    v_diamonds_difficulty := floor(coalesce((p_payload->>'difficulty')::numeric, -1));
    v_diamonds_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_diamonds_gems < 0 OR v_diamonds_gems > 22 THEN
      RAISE EXCEPTION 'diamonds payload must include gems between 0 and 22';
    END IF;
    IF v_diamonds_difficulty < 0 OR v_diamonds_difficulty > 3 THEN
      RAISE EXCEPTION 'diamonds payload must include difficulty between 0 and 3';
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
    v_won := v_reward > v_session.stake;
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
    SELECT array_agg(value::text ORDER BY ordinality)
    INTO v_goldrush_found
    FROM jsonb_array_elements_text(coalesce(p_payload->'foundItems', '[]'::jsonb)) WITH ORDINALITY AS t(value, ordinality);
    v_goldrush_treasures := floor(coalesce((p_payload->>'treasures')::numeric, 0));
    v_goldrush_cashout := coalesce((p_payload->>'cashout')::boolean, false);
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
    v_hilo_streak := floor(coalesce((p_payload->>'streak')::numeric, 0));
    v_hilo_cashout := coalesce((p_payload->>'cashout')::boolean, false);
    IF v_hilo_streak < 0 OR v_hilo_streak > 52 THEN
      RAISE EXCEPTION 'hilo payload must include streak between 0 and 52';
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
      v_plinko_multiplier := 0;
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
    v_crash_hex := substr(replace(v_session.id::text, '-', ''), 1, 12);
    v_crash_value := 0;
    FOR i IN 0..5 LOOP
      v_crash_value := (v_crash_value * 256) + get_byte(decode(v_crash_hex, 'hex'), i);
    END LOOP;
    v_crash_u := v_crash_value / 281474976710656::numeric;
    v_crash_point := round(least(10.0::numeric, greatest(1.01::numeric, (1.01 + ((10.0 - 1.01) * power(v_crash_u, 1.45))))), 2);
    v_crash_cashout := round(coalesce((p_payload->>'cashoutMultiplier')::numeric, 0), 2);
    IF v_crash_cashout < 0 THEN
      RAISE EXCEPTION 'crash cashoutMultiplier cannot be negative';
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
    v_ladder_step := floor(coalesce((p_payload->>'currentStep')::numeric, 0));
    v_ladder_success := coalesce((p_payload->>'success')::boolean, false);
    IF v_ladder_step < 0 OR v_ladder_step > array_length(v_ladder_multipliers, 1) THEN
      RAISE EXCEPTION 'ladder payload must include currentStep between 0 and 10';
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
