-- MINERS debug: משתמשים ליד תקרה יומית — לפי miners_economy_config (קריאה בלבד)
with cfg as (
  select daily_cap
  from public.miners_economy_config
  where id = 1
)
select
  s.device_id,
  round(s.mined_today, 2) as mined_today,
  cfg.daily_cap,
  round(greatest(0::numeric, cfg.daily_cap::numeric - s.mined_today), 2) as room_left,
  round(s.balance, 2) as balance_now,
  s.updated_at
from public.miners_device_state s
cross join cfg
order by room_left asc, s.updated_at desc;
