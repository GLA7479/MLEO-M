-- MINERS debug: 20 המובילים לפי mined_today (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  round(coalesce(score_today, 0), 2) as score_today,
  vault,
  updated_at
from public.miners_device_state
order by mined_today desc, updated_at desc
limit 20;
