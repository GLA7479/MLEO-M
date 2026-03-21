-- BASE debug: 20 המובילים לפי MLEO מצטבר (banked + סה״כ שנשלח ל-vault) — קריאה בלבד
select
  device_id,
  round(coalesce(banked_mleo, 0) + coalesce(total_banked, 0)::numeric, 4) as total_accumulated_mleo,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  coalesce(total_banked, 0) as shipped_to_vault_total,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  updated_at
from public.base_device_state
order by total_accumulated_mleo desc
limit 20;
