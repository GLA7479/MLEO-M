-- BASE debug: הרצת reconcile לשרת עבור מכשיר אחד — מעדכן מצב; החלף PUT-DEVICE-ID-HERE
select
  device_id,
  round(banked_mleo, 4) as banked_now,
  round(mleo_produced_today, 4) as produced_today,
  resources,
  buildings,
  last_tick_at,
  updated_at
from public.base_reconcile_state('PUT-DEVICE-ID-HERE');
