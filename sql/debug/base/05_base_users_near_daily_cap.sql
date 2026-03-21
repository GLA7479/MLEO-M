-- BASE debug: משתמשים ליד תקרת יומית — לפי base_economy_config (קריאה בלבד)
with cfg as (
  select daily_mleo_cap
  from public.base_economy_config
  where id = 1
)
select
  s.device_id,
  round(s.mleo_produced_today, 4) as produced_today,
  cfg.daily_mleo_cap,
  round(greatest(0::numeric, cfg.daily_mleo_cap::numeric - s.mleo_produced_today), 4) as room_left,
  round(s.banked_mleo, 4) as banked_now,
  s.updated_at
from public.base_device_state s
cross join cfg
order by room_left asc, s.updated_at desc;
