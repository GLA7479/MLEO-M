-- Arcade debug: start_freeplay_session / start_paid_session definitions
select
  p.oid::regprocedure as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('start_freeplay_session', 'start_paid_session')
order by 1;
