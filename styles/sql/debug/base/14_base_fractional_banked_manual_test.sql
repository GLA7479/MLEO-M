-- BASE debug: בדיקה ידנית ל-banked עשרוני — משנה נתונים! החלף PUT-DEVICE-ID-HERE
update public.base_device_state
set banked_mleo = 1.2345
where device_id = 'PUT-DEVICE-ID-HERE';

select
  device_id,
  banked_mleo,
  pg_typeof(banked_mleo) as banked_type,
  mleo_produced_today,
  last_tick_at,
  updated_at
from public.base_device_state
where device_id = 'PUT-DEVICE-ID-HERE';
