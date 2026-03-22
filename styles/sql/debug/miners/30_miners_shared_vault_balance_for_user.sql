-- MINERS debug: יתרת vault משותפת מ-vault_balances למכשיר — החלף PUT-DEVICE-ID-HERE (קריאה בלבד)
select
  device_id,
  balance as shared_vault_balance,
  updated_at
from public.vault_balances
where device_id = 'PUT-DEVICE-ID-HERE';
