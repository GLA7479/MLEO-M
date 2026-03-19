-- Template: full BASE reset + vault cleanup
-- IMPORTANT: replace vault table name after inspection (see 08e file).
BEGIN;

DELETE FROM public.base_action_audit;
DELETE FROM public.base_device_state;

-- Example only:
-- DELETE FROM public.arcade_shared_vault;

COMMIT;
