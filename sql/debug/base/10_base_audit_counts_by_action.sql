-- BASE debug: ספירת פעולות לפי סוג ב-audit (קריאה בלבד)
select
  action_name,
  count(*) as actions_count,
  min(created_at) as first_seen,
  max(created_at) as last_seen
from public.base_action_audit
group by action_name
order by actions_count desc, action_name asc;
