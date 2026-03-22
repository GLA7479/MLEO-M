-- BASE debug: משתמשים עם פעילות ב-24 השעות האחרונות (קריאה בלבד)
select
  device_id,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  last_tick_at,
  updated_at
from public.base_device_state
where updated_at >= now() - interval '24 hours'
order by updated_at desc;
