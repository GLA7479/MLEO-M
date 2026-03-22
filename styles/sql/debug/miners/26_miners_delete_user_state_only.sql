-- MINERS debug: מחיקת שורת state למכשיר — הרסני! החלף PUT-DEVICE-ID-HERE
delete from public.miners_device_state
where device_id = 'PUT-DEVICE-ID-HERE';
