-- MINERS debug: סקירת כל המשתמשים — balance, mined_today, vault, gift (קריאה בלבד)
select
  device_id,
  round(coalesce(balance, 0), 2) as balance_now,
  round(coalesce(mined_today, 0), 2) as mined_today,
  round(coalesce(score_today, 0), 2) as score_today,
  vault,
  claimed_total,
  claimed_to_wallet,
  last_day,
  last_gift_claim_at,
  gift_next_claim_at,
  gift_claim_count,
  updated_at,
  created_at
from public.miners_device_state
order by mined_today desc, updated_at desc;
