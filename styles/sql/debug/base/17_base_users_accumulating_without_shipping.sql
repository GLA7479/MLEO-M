-- BASE debug: משתמשים עם banked אבל בלי שום משלוח ל-vault אי פעם — קריאה בלבד
select
  device_id,
  round(coalesce(banked_mleo, 0), 4) as banked_now,
  coalesce(total_banked, 0) as shipped_to_vault_total,
  round(coalesce(mleo_produced_today, 0), 4) as produced_today,
  updated_at
from public.base_device_state
where coalesce(banked_mleo, 0) > 0
  and coalesce(total_banked, 0) = 0
order by banked_now desc, updated_at desc;
