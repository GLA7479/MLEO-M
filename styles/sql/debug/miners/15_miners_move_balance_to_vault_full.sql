-- MINERS debug: העברת כל ה-balance השלם ל-vault (sync_vault) — משנה state
select *
from public.miners_move_balance_to_vault('PUT-DEVICE-ID-HERE', null);
