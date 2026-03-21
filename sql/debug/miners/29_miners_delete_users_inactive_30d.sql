-- MINERS debug: מחיקת כל שורות state למכשירים לא פעילים 30+ יום — הרסני בכמות!
delete from public.miners_device_state
where updated_at < now() - interval '30 days';
