-- BASE debug: סקירת כל המשתמשים — banked, ייצור יומי, טיק אחרון (שאילתה יומיומית בטוחה לקריאה בלבד)
select
  device_id,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  coalesce(total_banked, 0) as shipped_to_vault_total,
  round(coalesce(banked_mleo, 0) + coalesce(total_banked, 0)::numeric, 4) as total_accumulated_mleo,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  coalesce(sent_today, 0) as sent_today,
  last_day,
  last_tick_at,
  updated_at,
  created_at
from public.base_device_state
order by total_accumulated_mleo desc, updated_at desc;
