-- BASE debug: מחיקת audit + state למכשיר — הרסני מאוד! החלף PUT-DEVICE-ID-HERE
begin;

delete from public.base_action_audit
where device_id = 'PUT-DEVICE-ID-HERE';

delete from public.base_device_state
where device_id = 'PUT-DEVICE-ID-HERE';

commit;
