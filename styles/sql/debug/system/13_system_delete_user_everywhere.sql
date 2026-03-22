-- System debug: delete one device everywhere (destructive)
begin;

delete from public.base_action_audit
where device_id = 'PUT-DEVICE-ID-HERE';

delete from public.base_device_state
where device_id = 'PUT-DEVICE-ID-HERE';

delete from public.miners_device_state
where device_id = 'PUT-DEVICE-ID-HERE';

delete from public.vault_balances
where device_id = 'PUT-DEVICE-ID-HERE';

commit;
