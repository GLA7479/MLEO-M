-- Run this in Supabase SQL Editor to fix base_ship_to_vault in the live DB.
-- Fix: v_step is a record from jsonb_array_elements(); use v_step.value->>'upto' and v_step.value->>'factor'.

CREATE OR REPLACE FUNCTION public.base_ship_to_vault(p_device_id text)
RETURNS TABLE(
  shipped bigint,
  consumed bigint,
  new_banked_mleo bigint,
  new_sent_today bigint,
  new_total_banked bigint,
  new_commander_xp bigint,
  vault_balance bigint,
  state jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_state public.base_device_state%ROWTYPE;
  v_banked_mleo bigint;
  v_sent_today bigint;
  v_blueprint_level integer;
  v_ship_cap bigint;
  v_room bigint;
  v_factor numeric;
  v_bank_bonus numeric;
  v_shipped bigint;
  v_consumed bigint;
  v_new_banked_mleo bigint;
  v_new_sent_today bigint;
  v_new_total_banked bigint;
  v_commander_xp bigint;
  v_vault_balance bigint;
  v_stats jsonb;
  v_softcut_steps jsonb := '[
    {"upto": 0.60, "factor": 1.00},
    {"upto": 0.85, "factor": 0.72},
    {"upto": 1.00, "factor": 0.50},
    {"upto": 1.15, "factor": 0.30},
    {"upto": 9.99, "factor": 0.16}
  ]'::jsonb;
  v_step record;
  v_daily_ship_cap bigint := 12000;
  v_vault_delta_result record;
BEGIN
  v_state := public.base_get_or_create_state(p_device_id);

  SELECT *
  INTO v_state
  FROM public.base_device_state
  WHERE device_id = p_device_id
  FOR UPDATE;

  v_banked_mleo := coalesce(v_state.banked_mleo, 0);
  v_sent_today := coalesce(v_state.sent_today, 0);
  v_blueprint_level := coalesce(v_state.blueprint_level, 0);
  v_stats := coalesce(v_state.stats, '{}'::jsonb);

  IF v_banked_mleo <= 0 THEN
    RAISE EXCEPTION 'Nothing ready to ship yet';
  END IF;

  v_ship_cap := v_daily_ship_cap + (v_blueprint_level * 5000);
  v_room := greatest(0, v_ship_cap - v_sent_today);

  IF v_room <= 0 THEN
    RAISE EXCEPTION 'Today''s shipping cap is already full';
  END IF;

  v_factor := 0.16;
  IF v_ship_cap > 0 THEN
    FOR v_step IN SELECT * FROM jsonb_array_elements(v_softcut_steps)
    LOOP
      IF (v_sent_today::numeric / v_ship_cap::numeric) <= (v_step.value->>'upto')::numeric THEN
        v_factor := (v_step.value->>'factor')::numeric;
        EXIT;
      END IF;
    END LOOP;
  END IF;

  v_bank_bonus := 1 + (v_blueprint_level * 0.08);

  v_shipped := least(
    floor(v_banked_mleo::numeric * v_factor * v_bank_bonus)::bigint,
    v_room
  );

  IF v_shipped <= 0 THEN
    RAISE EXCEPTION 'Shipment too small after softcut';
  END IF;

  v_consumed := least(
    v_banked_mleo,
    greatest(1, ceil(v_shipped::numeric / greatest(0.01, v_factor * v_bank_bonus))::bigint)
  );

  SELECT * INTO v_vault_delta_result
  FROM public.sync_vault_delta(
    'mleo-base-ship',
    v_shipped,
    p_device_id,
    NULL,
    md5(random()::text || clock_timestamp()::text)::text
  );

  v_vault_balance := coalesce(v_vault_delta_result.new_balance, 0);

  v_new_banked_mleo := greatest(0, v_banked_mleo - v_consumed);
  v_new_sent_today := v_sent_today + v_shipped;
  v_new_total_banked := coalesce(v_state.total_banked, 0) + v_shipped;
  v_commander_xp := coalesce(v_state.commander_xp, 0) + greatest(10, floor(v_shipped / 50));

  v_stats := jsonb_set(
    v_stats,
    '{shippedToday}',
    to_jsonb(coalesce((v_stats->>'shippedToday')::bigint, 0) + v_shipped)
  );

  UPDATE public.base_device_state
  SET
    banked_mleo = v_new_banked_mleo,
    sent_today = v_new_sent_today,
    total_banked = v_new_total_banked,
    stats = v_stats,
    commander_xp = v_commander_xp,
    updated_at = now()
  WHERE device_id = p_device_id
  RETURNING * INTO v_state;

  RETURN QUERY
  SELECT
    v_shipped,
    v_consumed,
    v_new_banked_mleo,
    v_new_sent_today,
    v_new_total_banked,
    v_commander_xp,
    v_vault_balance,
    to_jsonb(v_state);
END;
$function$;
