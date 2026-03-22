-- Arcade debug: search public functions related to arcade sessions
select
  p.oid::regprocedure as function_name
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%arcade%'
    or p.proname ilike '%freeplay%'
    or p.proname ilike '%finish_arcade%'
    or p.proname ilike '%start_paid%'
  )
order by 1;
