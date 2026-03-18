-- base_economy_checks.sql
-- Query templates for economy and abuse monitoring (read-only)

-- ships per day
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS ship_actions,
  sum(coalesce((action_detail->>'shipped')::numeric, 0)) AS total_shipped
FROM public.base_action_audit
WHERE action_type = 'ship'
GROUP BY 1
ORDER BY 1 DESC;

-- spend by type
SELECT
  action_detail->>'spend_type' AS spend_type,
  count(*) AS actions,
  sum(coalesce((action_detail->>'cost')::numeric, 0)) AS total_cost
FROM public.base_action_audit
WHERE action_type = 'spend'
GROUP BY 1
ORDER BY actions DESC;

-- top devices by shipping
SELECT
  device_id,
  count(*) AS ships,
  sum(coalesce((action_detail->>'shipped')::numeric, 0)) AS total_shipped
FROM public.base_action_audit
WHERE action_type = 'ship'
GROUP BY 1
ORDER BY total_shipped DESC
LIMIT 50;

-- suspicious actions
SELECT
  date_trunc('hour', created_at) AS hour_bucket,
  device_id,
  count(*) AS actions_in_hour,
  sum(suspicion_score) AS suspicion_sum
FROM public.base_action_audit
WHERE created_at > now() - interval '48 hours'
GROUP BY 1, 2
HAVING count(*) > 40 OR sum(suspicion_score) > 5
ORDER BY hour_bucket DESC, suspicion_sum DESC, actions_in_hour DESC;

-- mission claims
SELECT
  count(*) AS claims,
  sum(coalesce((action_detail->>'banked_mleo_after')::numeric, 0)) AS summed_banked_after
FROM public.base_action_audit
WHERE action_type = 'mission_claim';

-- build distribution
SELECT
  action_detail->>'building_key' AS building_key,
  count(*) AS upgrades
FROM public.base_action_audit
WHERE action_type = 'build'
GROUP BY 1
ORDER BY upgrades DESC;

-- blueprint progression via spend
SELECT
  (action_detail->>'blueprint_level_after')::int AS blueprint_after,
  count(*) AS times
FROM public.base_action_audit
WHERE action_type = 'spend'
  AND action_detail->>'spend_type' = 'blueprint'
GROUP BY action_detail->>'blueprint_level_after'
ORDER BY 1 NULLS LAST;
