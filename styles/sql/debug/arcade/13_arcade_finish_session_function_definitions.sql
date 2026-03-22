-- Arcade debug: finish_arcade_session function definitions
select
  p.oid::regprocedure as function_name,
  pg_get_functiondef(p.oid) as function_def
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'finish_arcade_session'
order by 1;
