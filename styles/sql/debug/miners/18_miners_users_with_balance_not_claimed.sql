-- MINERS debug: balance > 0 אבל vault המכשיר עדיין 0 (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  vault,
  claimed_total,
  claimed_to_wallet,
  updated_at
from public.miners_device_state
where coalesce(balance, 0) > 0
  and coalesce(vault, 0) = 0
order by balance_now desc, updated_at desc;
