-- MINERS debug: טבלת פרסי gift (קריאה בלבד)
select
  reward_key,
  weight,
  coins_pct,
  dps_multiplier,
  gold_multiplier,
  diamonds,
  mleo_bonus,
  enabled
from public.miners_gift_rewards
order by enabled desc, weight desc, reward_key asc;
