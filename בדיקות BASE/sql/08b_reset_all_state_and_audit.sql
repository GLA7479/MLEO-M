-- Full BASE reset for all devices (state + audit)
BEGIN;

DELETE FROM public.base_action_audit;
DELETE FROM public.base_device_state;

COMMIT;
