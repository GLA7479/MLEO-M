-- BASE debug: מחיקת שורת מצב למכשיר — הרסני! רק state, לא audit. החלף PUT-DEVICE-ID-HERE
delete from public.base_device_state
where device_id = 'PUT-DEVICE-ID-HERE';
