-- BASE debug: מצב מלא למכשיר אחד — החלף PUT-DEVICE-ID-HERE לפני הרצה
select
  device_id,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  coalesce(total_banked, 0) as shipped_to_vault_total,
  round(coalesce(banked_mleo, 0) + coalesce(total_banked, 0)::numeric, 4) as total_accumulated_mleo,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  coalesce(sent_today, 0) as sent_today,
  resources,
  buildings,
  paused_buildings,
  building_power_modes,
  stats,
  last_day,
  last_tick_at,
  updated_at,
  created_at
from public.base_device_state
where device_id = 'PUT-DEVICE-ID-HERE';
