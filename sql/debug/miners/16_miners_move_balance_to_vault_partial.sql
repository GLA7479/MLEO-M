-- MINERS debug: העברה חלקית ל-vault — החלף 10 בכמות הרצויה; משנה state
select *
from public.miners_move_balance_to_vault('PUT-DEVICE-ID-HERE', 10);
