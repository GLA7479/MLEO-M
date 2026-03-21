-- BASE debug: מחיקת כל שורות state למכשירים ללא פעילות 30+ יום — הרסני! ללא audit
delete from public.base_device_state
where coalesce(last_tick_at, updated_at) < now() - interval '30 days';
