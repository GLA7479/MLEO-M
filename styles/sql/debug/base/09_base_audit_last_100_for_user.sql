-- BASE debug: 100 רשומות אחרונות ב-audit למכשיר — החלף PUT-DEVICE-ID-HERE (קריאה בלבד)
select
  *
from public.base_action_audit
where device_id = 'PUT-DEVICE-ID-HERE'
order by created_at desc
limit 100;
