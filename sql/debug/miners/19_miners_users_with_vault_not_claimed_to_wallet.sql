-- MINERS debug: יש יתרה ב-vault המכשיר (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  vault,
  claimed_total,
  claimed_to_wallet,
  updated_at
from public.miners_device_state
where coalesce(vault, 0) > 0
order by vault desc, updated_at desc;
