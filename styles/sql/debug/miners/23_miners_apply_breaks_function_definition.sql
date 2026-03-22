-- MINERS debug: הגדרת miners_apply_breaks המותקנת (קריאה בלבד)
select pg_get_functiondef('public.miners_apply_breaks(text, jsonb, boolean)'::regprocedure);
