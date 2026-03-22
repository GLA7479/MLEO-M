-- MINERS debug: הגדרת miners_get_state המותקנת (קריאה בלבד)
select pg_get_functiondef('public.miners_get_state(text)'::regprocedure);
