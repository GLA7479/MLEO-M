-- BASE quick server health check

-- 1) כמה פעולות יש בכלל
SELECT
  count(*) AS total_actions,
  count(*) FILTER (WHERE action_type = 'ship') AS ship_actions,
  count(*) FILTER (WHERE action_type = 'spend') AS spend_actions,
  count(*) FILTER (WHERE action_type = 'expedition') AS expedition_actions,
  count(*) FILTER (WHERE action_type = 'build') AS build_actions
FROM public.base_action_audit;

-- 2) סיכום חשד לפי שחקן
SELECT
  device_id,
  count(*) AS total_actions,
  sum(suspicion_score) AS suspicion_sum
FROM public.base_action_audit
GROUP BY 1
ORDER BY suspicion_sum DESC, total_actions DESC
LIMIT 20;

-- 3) ship יומי
SELECT
  date_trunc('day', created_at) AS day,
  count(*) AS ship_actions,
  sum(coalesce((action_detail->>'shipped')::numeric, 0)) AS total_shipped
FROM public.base_action_audit
WHERE action_type = 'ship'
GROUP BY 1
ORDER BY 1 DESC;

-- 4) ממוצעי ship
SELECT
  count(*) AS ship_events,
  avg(coalesce((action_detail->>'banked_before')::numeric, 0)) AS avg_banked_before,
  avg(coalesce((action_detail->>'banked_after')::numeric, 0)) AS avg_banked_after,
  avg(coalesce((action_detail->>'factor')::numeric, 0)) AS avg_ship_factor
FROM public.base_action_audit
WHERE action_type = 'ship';

-- 5) חלונות חשודים
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
