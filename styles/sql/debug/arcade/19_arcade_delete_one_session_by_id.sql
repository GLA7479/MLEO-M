-- Arcade debug: delete one arcade session by id (destructive)
delete from public.arcade_device_sessions
where id = 'PUT-SESSION-ID-HERE'::uuid;
