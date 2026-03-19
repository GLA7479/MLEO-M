-- Reset one BASE device (state + audit)
-- Replace device_id before running.
BEGIN;

DELETE FROM public.base_action_audit
WHERE device_id = '91fde7e4-1368-43e4-9d13-8c22d31d505f';

DELETE FROM public.base_device_state
WHERE device_id = '91fde7e4-1368-43e4-9d13-8c22d31d505f';

COMMIT;
