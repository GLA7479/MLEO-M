SELECT
  device_id,
  banked_mleo,
  sent_today,
  total_banked,
  total_shared_spent,
  commander_xp,
  last_tick_at,
  updated_at,
  resources,
  buildings,
  stats
FROM public.base_device_state
ORDER BY updated_at DESC
LIMIT 20;
