-- MINERS debug: סקירת משתמשים ללא עדכון 30+ יום — קריאה בלבד לפני מחיקה
select
  device_id,
  updated_at,
  now() - updated_at as idle_for,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  vault
from public.miners_device_state
where updated_at < now() - interval '30 days'
order by updated_at asc;
