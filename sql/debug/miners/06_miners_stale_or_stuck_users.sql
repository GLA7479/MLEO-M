-- MINERS debug: מכשירים עם עדכון ישן / חשד לתקיעה (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  round(coalesce(score_today, 0), 2) as score_today,
  last_day,
  updated_at,
  now() - updated_at as idle_for
from public.miners_device_state
order by updated_at asc nulls first;
