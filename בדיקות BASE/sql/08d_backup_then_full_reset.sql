-- Recommended: backup first, then full reset
BEGIN;

CREATE TABLE IF NOT EXISTS public.base_device_state_backup_20260319 AS
SELECT * FROM public.base_device_state;

CREATE TABLE IF NOT EXISTS public.base_action_audit_backup_20260319 AS
SELECT * FROM public.base_action_audit;

DELETE FROM public.base_action_audit;
DELETE FROM public.base_device_state;

COMMIT;
