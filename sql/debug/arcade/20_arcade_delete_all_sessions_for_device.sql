-- Arcade debug: delete all arcade sessions for one device (destructive)
delete from public.arcade_device_sessions
where device_id = 'PUT-DEVICE-ID-HERE';
