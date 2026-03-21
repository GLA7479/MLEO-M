-- MINERS debug: כתיבת balance ידנית לבדיקה — משנה נתונים! החלף PUT-DEVICE-ID-HERE
update public.miners_device_state
set balance = 12.34
where device_id = 'PUT-DEVICE-ID-HERE';

select
  device_id,
  balance,
  pg_typeof(balance) as balance_type,
  mined_today,
  updated_at
from public.miners_device_state
where device_id = 'PUT-DEVICE-ID-HERE';
