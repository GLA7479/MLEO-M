-- BASE debug: מכשירים עם טיק ישן / חשד לתקיעה — ממוין מהישן לחדש (קריאה בלבד)
select
  device_id,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  last_tick_at,
  updated_at,
  now() - coalesce(last_tick_at, updated_at) as idle_for
from public.base_device_state
order by coalesce(last_tick_at, updated_at) asc nulls first;
