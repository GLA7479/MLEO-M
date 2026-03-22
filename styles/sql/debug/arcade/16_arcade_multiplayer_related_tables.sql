-- Arcade debug: list likely multiplayer / room tables (if deployed)
select
  table_schema,
  table_name
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike 'arcade\_%' escape '\'
    or table_name ilike 'poker%'
    or table_name ilike 'roulette%'
    or table_name = 'ck_sessions'
    or table_name = 'ck_players'
    or table_name ilike 'war\_%' escape '\'
    or table_name ilike 'bingo%'
  )
order by table_name asc;
