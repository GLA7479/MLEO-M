-- Soft reset (keep audit history)

-- One device:
DELETE FROM public.base_device_state
WHERE device_id = '91fde7e4-1368-43e4-9d13-8c22d31d505f';

-- All devices:
-- DELETE FROM public.base_device_state;
