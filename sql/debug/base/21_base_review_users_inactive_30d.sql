-- BASE debug: סקירת משתמשים ללא פעילות 30+ יום — קריאה בלבד לפני מחיקה
select
  device_id,
  updated_at,
  last_tick_at,
  now() - coalesce(last_tick_at, updated_at) as idle_for
from public.base_device_state
where coalesce(last_tick_at, updated_at) < now() - interval '30 days'
order by coalesce(last_tick_at, updated_at) asc;
