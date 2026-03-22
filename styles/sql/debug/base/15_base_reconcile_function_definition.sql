-- BASE debug: הגדרת הפונקציה base_reconcile_state המותקנת ב-DB (קריאה בלבד)
select pg_get_functiondef('public.base_reconcile_state(text)'::regprocedure);
