-- Shared Vault debug: search related vault tables
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%vault%'
    or table_name ilike '%balance%'
  )
order by table_name asc;
