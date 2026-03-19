WITH
audit_stats AS (
  SELECT
    count(*)::bigint AS total_actions,
    count(*) FILTER (WHERE action_type = 'ship')::bigint AS ship_actions,
    count(*) FILTER (WHERE action_type = 'spend')::bigint AS spend_actions,
    count(*) FILTER (WHERE action_type = 'expedition')::bigint AS expedition_actions,
    count(*) FILTER (WHERE action_type = 'build')::bigint AS build_actions,
    coalesce(sum(suspicion_score), 0)::numeric AS suspicion_total,
    coalesce(max(suspicion_score), 0)::numeric AS suspicion_max
  FROM public.base_action_audit
),
audit_last_48h AS (
  SELECT
    count(*)::bigint AS actions_48h,
    count(*) FILTER (WHERE action_type = 'ship')::bigint AS ships_48h,
    count(*) FILTER (WHERE action_type = 'spend')::bigint AS spends_48h,
    coalesce(sum(suspicion_score), 0)::numeric AS suspicion_48h
  FROM public.base_action_audit
  WHERE created_at > now() - interval '48 hours'
),
top_suspicious_devices AS (
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) AS data
  FROM (
    SELECT
      device_id,
      count(*)::bigint AS total_actions,
      coalesce(sum(suspicion_score), 0)::numeric AS suspicion_sum
    FROM public.base_action_audit
    GROUP BY device_id
    ORDER BY suspicion_sum DESC, total_actions DESC
    LIMIT 10
  ) t
),
ship_quality AS (
  SELECT
    count(*)::bigint AS ship_events,
    coalesce(avg((action_detail->>'factor')::numeric), 0)::numeric(12,4) AS avg_ship_factor,
    coalesce(min((action_detail->>'factor')::numeric), 0)::numeric(12,4) AS min_ship_factor,
    coalesce(max((action_detail->>'factor')::numeric), 0)::numeric(12,4) AS max_ship_factor,
    coalesce(avg((action_detail->>'shipped')::numeric), 0)::numeric(18,2) AS avg_shipped
  FROM public.base_action_audit
  WHERE action_type = 'ship'
),
suspicious_windows_48h AS (
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) AS data
  FROM (
    SELECT
      date_trunc('hour', created_at) AS hour_bucket,
      device_id,
      count(*)::bigint AS actions_in_hour,
      coalesce(sum(suspicion_score), 0)::numeric AS suspicion_sum
    FROM public.base_action_audit
    WHERE created_at > now() - interval '48 hours'
    GROUP BY 1, 2
    HAVING count(*) > 40 OR sum(suspicion_score) > 5
    ORDER BY hour_bucket DESC, suspicion_sum DESC, actions_in_hour DESC
    LIMIT 30
  ) t
),
state_stats AS (
  SELECT
    count(*)::bigint AS devices_total,
    count(*) FILTER (WHERE stability < 50 OR stability > 100)::bigint AS stability_out_of_range,
    count(*) FILTER (WHERE banked_mleo < 0)::bigint AS negative_banked,
    count(*) FILTER (WHERE sent_today < 0)::bigint AS negative_sent_today,
    count(*) FILTER (WHERE commander_level < 1)::bigint AS invalid_commander_level,
    count(*) FILTER (WHERE last_tick_at IS NULL)::bigint AS null_last_tick,
    count(*) FILTER (WHERE updated_at IS NULL)::bigint AS null_updated_at,
    count(*) FILTER (WHERE resources IS NULL OR jsonb_typeof(resources) <> 'object')::bigint AS bad_resources_shape,
    count(*) FILTER (WHERE buildings IS NULL OR jsonb_typeof(buildings) <> 'object')::bigint AS bad_buildings_shape,
    count(*) FILTER (WHERE stats IS NULL OR jsonb_typeof(stats) <> 'object')::bigint AS bad_stats_shape
  FROM public.base_device_state
),
recent_states AS (
  SELECT coalesce(jsonb_agg(t), '[]'::jsonb) AS data
  FROM (
    SELECT
      device_id,
      banked_mleo,
      sent_today,
      total_banked,
      total_shared_spent,
      commander_xp,
      commander_level,
      stability,
      last_tick_at,
      updated_at
    FROM public.base_device_state
    ORDER BY updated_at DESC
    LIMIT 10
  ) t
),
offline_smoke AS (
  SELECT jsonb_build_object(
    'factor_30s', public.base_offline_factor_for_seconds(30),
    'factor_2h', public.base_offline_factor_for_seconds(7200),
    'factor_6h', public.base_offline_factor_for_seconds(21600),
    'factor_12h', public.base_offline_factor_for_seconds(43200),
    'effective_30s', public.base_effective_offline_seconds(30),
    'effective_2h', public.base_effective_offline_seconds(7200),
    'effective_6h', public.base_effective_offline_seconds(21600),
    'effective_12h', public.base_effective_offline_seconds(43200)
  ) AS data
),
fn_defs AS (
  SELECT
    p.proname,
    pg_get_functiondef(p.oid) AS def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'base_reconcile_state',
      'base_ship_to_vault',
      'base_spend_from_vault',
      'base_offline_factor_for_seconds',
      'base_effective_offline_seconds'
    )
),
reconcile_checks AS (
  SELECT jsonb_build_object(
    'exists', exists (SELECT 1 FROM fn_defs WHERE proname = 'base_reconcile_state'),
    'has_60s_guard', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_reconcile_state'
        AND def ILIKE '%IF v_elapsed_seconds <= 60 THEN%'
    ),
    'uses_effective_seconds', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_reconcile_state'
        AND def ILIKE '%v_effective_seconds := public.base_effective_offline_seconds(v_elapsed_seconds)%'
    ),
    'caps_elapsed_12h', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_reconcile_state'
        AND def ILIKE '%least(greatest(v_elapsed_seconds, 0), 43200)%'
    ),
    'energy_coefficients_updated', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_reconcile_state'
        AND def ILIKE '%(v_quarry * v_quarry_mode) * 0.60%'
        AND def ILIKE '%(v_trade * v_trade_mode) * 0.62%'
        AND def ILIKE '%(v_salvage * v_salvage_mode) * 0.62%'
        AND def ILIKE '%(v_refinery * v_refinery_mode) * 0.90%'
        AND def ILIKE '%(v_miner * v_miner_mode) * 0.16%'
        AND def ILIKE '%(v_arcade * v_arcade_mode) * 0.18%'
        AND def ILIKE '%(v_logistics * v_logistics_mode) * 0.16%'
        AND def ILIKE '%(v_research_lab * v_research_lab_mode) * 0.20%'
        AND def ILIKE '%(v_repair * v_repair_mode) * 0.18%'
    )
  ) AS data
),
ship_spend_checks AS (
  SELECT jsonb_build_object(
    'ship_fn_exists', exists (SELECT 1 FROM fn_defs WHERE proname = 'base_ship_to_vault'),
    'spend_fn_exists', exists (SELECT 1 FROM fn_defs WHERE proname = 'base_spend_from_vault'),
    'ship_uses_sync_vault_delta', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_ship_to_vault'
        AND def ILIKE '%sync_vault_delta%'
    ),
    'spend_uses_sync_vault_delta', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_spend_from_vault'
        AND def ILIKE '%sync_vault_delta%'
    ),
    'ship_logs_audit', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_ship_to_vault'
        AND def ILIKE '%base_write_audit%'
    ),
    'spend_logs_audit', exists (
      SELECT 1 FROM fn_defs
      WHERE proname = 'base_spend_from_vault'
        AND def ILIKE '%base_write_audit%'
    )
  ) AS data
),
offline_fn_exists AS (
  SELECT jsonb_build_object(
    'offline_factor_fn_exists', exists (SELECT 1 FROM fn_defs WHERE proname = 'base_offline_factor_for_seconds'),
    'effective_offline_fn_exists', exists (SELECT 1 FROM fn_defs WHERE proname = 'base_effective_offline_seconds')
  ) AS data
)
SELECT jsonb_pretty(
  jsonb_build_object(
    'generated_at', now(),
    'audit_stats', (SELECT to_jsonb(audit_stats) FROM audit_stats),
    'audit_last_48h', (SELECT to_jsonb(audit_last_48h) FROM audit_last_48h),
    'top_suspicious_devices', (SELECT data FROM top_suspicious_devices),
    'ship_quality', (SELECT to_jsonb(ship_quality) FROM ship_quality),
    'suspicious_windows_48h', (SELECT data FROM suspicious_windows_48h),
    'state_stats', (SELECT to_jsonb(state_stats) FROM state_stats),
    'recent_states', (SELECT data FROM recent_states),
    'offline_smoke', (SELECT data FROM offline_smoke),
    'reconcile_checks', (SELECT data FROM reconcile_checks),
    'ship_spend_checks', (SELECT data FROM ship_spend_checks),
    'offline_function_checks', (SELECT data FROM offline_fn_exists)
  )
) AS base_server_full_health_report;
