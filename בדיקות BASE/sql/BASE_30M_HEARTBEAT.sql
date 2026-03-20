select
  now() as checked_at,
  now() - interval '30 minutes' as since_at,
  (select count(*) from public.base_action_audit where created_at >= now() - interval '30 minutes') as base_actions_30m,
  (select count(distinct device_id) from public.base_action_audit where created_at >= now() - interval '30 minutes') as base_action_devices_30m,
  (select count(*) from public.base_device_state where updated_at >= now() - interval '30 minutes') as base_state_updates_30m,
  (select count(distinct device_id) from public.base_device_state where updated_at >= now() - interval '30 minutes') as base_active_devices_30m,
  (select count(*) from public.vault_balances where coalesce(updated_at, last_sync_at, created_at) >= now() - interval '30 minutes') as vault_updates_30m,
  (select count(*) from public.miners_device_state where updated_at >= now() - interval '30 minutes') as miners_updates_30m,
  (select count(*) from public.arcade_device_sessions where coalesce(updated_at, finished_at, started_at, created_at) >= now() - interval '30 minutes') as arcade_updates_30m,
  (select count(*) from public.base_action_audit where created_at >= now() - interval '30 minutes' and (suspicion_score > 0 or coalesce(jsonb_array_length(suspicion_flags), 0) > 0)) as suspicious_base_events_30m;

