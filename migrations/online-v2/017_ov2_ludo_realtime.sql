-- OV2 Ludo: Realtime publication for postgres_changes on Ludo session rows.
-- Apply after 015_ov2_ludo_schema.sql. Idempotent (duplicate_object ignored).
-- Draft for manual review — do not assume applied in app code.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_ludo_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_ludo_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
