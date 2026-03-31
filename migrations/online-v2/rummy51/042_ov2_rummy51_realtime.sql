-- OV2 Rummy51: Supabase Realtime publication for postgres_changes.
-- Apply after 040_ov2_rummy51_schema.sql.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_rummy51_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_rummy51_round_history;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;

ALTER TABLE public.ov2_rummy51_sessions REPLICA IDENTITY FULL;
ALTER TABLE public.ov2_rummy51_round_history REPLICA IDENTITY FULL;
