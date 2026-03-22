-- BASE debug: audit משלחות למכשיר — החלף PUT-DEVICE-ID-HERE (קריאה בלבד)
select
  created_at,
  action_name,
  details->'loot' as loot,
  details->>'xp_gain' as xp_gain,
  details->>'energy_after' as energy_after,
  details->>'data_after' as data_after
from public.base_action_audit
where device_id = 'PUT-DEVICE-ID-HERE'
  and action_name = 'expedition'
order by created_at desc
limit 50;
