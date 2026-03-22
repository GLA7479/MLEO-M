-- MINERS debug: משתמשים עם עדכון ב-24 השעות האחרונות (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  round(coalesce(score_today, 0), 2) as score_today,
  updated_at
from public.miners_device_state
where updated_at >= now() - interval '24 hours'
order by updated_at desc;
