SELECT
  created_at,
  device_id,
  action_type,
  action_detail
FROM public.base_action_audit
WHERE action_type = 'spend'
ORDER BY created_at DESC
LIMIT 10;
