-- BASE debug: audit משלוחים למכשיר — החלף PUT-DEVICE-ID-HERE (קריאה בלבד)
select
  created_at,
  action_name,
  details->>'shipped' as shipped,
  details->>'banked_before' as banked_before,
  details->>'banked_after' as banked_after,
  details->>'vault_balance_after' as vault_balance_after
from public.base_action_audit
where device_id = 'PUT-DEVICE-ID-HERE'
  and action_name = 'ship'
order by created_at desc
limit 50;
