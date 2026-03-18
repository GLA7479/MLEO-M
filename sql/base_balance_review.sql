-- base_balance_review.sql
-- Read-only queries for balance and economy review

-- 1) ships per player
SELECT
  device_id,
  count(*) AS ships,
  sum(coalesce((action_detail->>'shipped')::numeric, 0)) AS total_shipped,
  avg(coalesce((action_detail->>'shipped')::numeric, 0)) AS avg_ship_size
FROM public.base_action_audit
WHERE action_type = 'ship'
GROUP BY 1
ORDER BY total_shipped DESC;

-- 2) spend by type
SELECT
  action_detail->>'spend_type' AS spend_type,
  count(*) AS actions,
  sum(coalesce((action_detail->>'cost')::numeric, 0)) AS total_cost,
  avg(coalesce((action_detail->>'cost')::numeric, 0)) AS avg_cost
FROM public.base_action_audit
WHERE action_type = 'spend'
GROUP BY 1
ORDER BY actions DESC;

-- 3) mission claims
SELECT
  action_detail->>'mission_key' AS mission_key,
  count(*) AS claims
FROM public.base_action_audit
WHERE action_type = 'mission_claim'
GROUP BY 1
ORDER BY claims DESC;

-- 4) expeditions summary
SELECT
  count(*) AS expeditions,
  avg(coalesce((action_detail->>'xp_gain')::numeric, 0)) AS avg_xp_gain
FROM public.base_action_audit
WHERE action_type = 'expedition';

-- 5) suspicion summary
SELECT
  device_id,
  count(*) AS total_actions,
  sum(suspicion_score) AS suspicion_sum
FROM public.base_action_audit
GROUP BY 1
ORDER BY suspicion_sum DESC, total_actions DESC;

-- 6) ships per day
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS ship_actions,
  sum(coalesce((action_detail->>'shipped')::numeric, 0)) AS total_shipped
FROM public.base_action_audit
WHERE action_type = 'ship'
GROUP BY 1
ORDER BY 1 DESC;

-- 7) top suspicious windows
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

-- 8) build distribution
SELECT
  action_detail->>'building_key' AS building_key,
  count(*) AS upgrades
FROM public.base_action_audit
WHERE action_type = 'build'
GROUP BY 1
ORDER BY upgrades DESC;

-- 9) average banked before/after ship
SELECT
  count(*) AS ship_events,
  avg(coalesce((action_detail->>'banked_before')::numeric, 0)) AS avg_banked_before,
  avg(coalesce((action_detail->>'banked_after')::numeric, 0)) AS avg_banked_after,
  avg(coalesce((action_detail->>'factor')::numeric, 0)) AS avg_ship_factor
FROM public.base_action_audit
WHERE action_type = 'ship';

-- 10) spend effectiveness snapshot
SELECT
  action_detail->>'spend_type' AS spend_type,
  avg(coalesce((action_detail->>'vault_balance_after')::numeric, 0)) AS avg_vault_after,
  avg(coalesce((action_detail->>'energy_after')::numeric, 0)) AS avg_energy_after,
  avg(coalesce((action_detail->>'data_after')::numeric, 0)) AS avg_data_after
FROM public.base_action_audit
WHERE action_type = 'spend'
GROUP BY 1
ORDER BY 1;
