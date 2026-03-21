-- Shared Vault debug: search related vault functions
select
  p.oid::regprocedure as function_name
from pg_proc p
join pg_namespace n
  on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%vault%'
    or p.proname ilike '%sync_vault%'
  )
order by 1;
