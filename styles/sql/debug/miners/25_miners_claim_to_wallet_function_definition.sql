-- MINERS debug: הגדרת miners_claim_to_wallet המותקנת (קריאה בלבד)
select pg_get_functiondef('public.miners_claim_to_wallet(text, bigint)'::regprocedure);
