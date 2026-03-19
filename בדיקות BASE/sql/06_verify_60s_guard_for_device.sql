-- Verify 60s online guard behavior for a specific device
-- Replace device_id below with your test device
WITH s AS (
  SELECT *
  FROM public.base_device_state
  WHERE device_id = '91fde7e4-1368-43e4-9d13-8c22d31d505f'
)
SELECT
  device_id,
  extract(epoch FROM (now() - last_tick_at)) AS elapsed_seconds,
  CASE
    WHEN extract(epoch FROM (now() - last_tick_at)) <= 60
      THEN extract(epoch FROM (now() - last_tick_at))
    ELSE public.base_effective_offline_seconds(extract(epoch FROM (now() - last_tick_at)))
  END AS expected_effective_seconds
FROM s;
