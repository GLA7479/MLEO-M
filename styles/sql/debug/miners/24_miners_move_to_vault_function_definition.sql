-- MINERS debug: הגדרת miners_move_balance_to_vault המותקנת (קריאה בלבד)
select pg_get_functiondef('public.miners_move_balance_to_vault(text, bigint)'::regprocedure);
