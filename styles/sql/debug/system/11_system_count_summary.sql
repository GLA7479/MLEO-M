-- System debug: counts summary across BASE, MINERS, VAULT
select
  (select count(*) from public.base_device_state) as base_users_count,
  (select count(*) from public.miners_device_state) as miners_users_count,
  (select count(*) from public.vault_balances) as shared_vault_users_count,
  (select coalesce(sum(balance), 0) from public.vault_balances) as shared_vault_total_balance;
