-- OV2 Bingo: Supabase Realtime publication for postgres_changes on bingo tables.
-- Apply after 034_ov2_bingo_schema.sql. Idempotent (duplicate_object ignored).

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_bingo_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_bingo_claims;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
