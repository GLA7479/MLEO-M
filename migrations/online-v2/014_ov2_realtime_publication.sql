-- Online V2: add OV2 tables to Supabase Realtime publication so `postgres_changes` subscriptions receive row events.
-- Depends on 001_ov2_core.sql, 002_ov2_board_path.sql (tables must exist). Idempotent per table (duplicate_object ignored).
-- Does not touch Mark Grid tables.

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_rooms;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_room_members;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_board_path_sessions;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_board_path_seats;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_settlement_lines;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;

  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_economy_events;
  EXCEPTION
    WHEN duplicate_object THEN NULL;
  END;
END $$;
