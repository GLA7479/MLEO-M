-- ============================================================================
-- EXTEND ARCADE SESSION RESOLUTION WITH SERVER-SIDE DICE
-- Run this after arcade_sessions_coinflip_pilot.sql
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
    v_reward := CASE
      WHEN v_won THEN floor(v_session.stake * 1.92)::bigint
      ELSE 0
    END;

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
    v_won := CASE
      WHEN v_dice_is_over THEN v_dice_roll > v_dice_target
      ELSE v_dice_roll < v_dice_target
    END;

    v_dice_multiplier := CASE
      WHEN v_dice_is_over THEN ((100 - 0.04) / (100 - v_dice_target)) * 100
      ELSE ((100 - 0.04) / v_dice_target) * 100
    END;

    v_reward := CASE
      WHEN v_won THEN floor(v_session.stake * (v_dice_multiplier / 100))::bigint
      ELSE 0
    END;

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
  SELECT
    v_session.id,
    v_reward,
    v_balance_after,
    'finished'::text,
    v_server_payload;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_arcade_session(uuid, jsonb) TO service_role;

COMMIT;
