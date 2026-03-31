-- Follow-up to 024: fix PL/pgSQL ambiguity in public.ov2_admin_purge_stale_rooms.
-- RETURNS TABLE(...) creates output variables named room_id, etc.; unqualified
-- `WHERE room_id = ...` in DELETE statements resolves to those variables and errors.
-- This migration replaces only the purge function; list + grants unchanged in effect.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_admin_purge_stale_rooms(
  p_idle_minutes integer DEFAULT 10,
  p_room_prefix text DEFAULT 'ov2_'
)
RETURNS TABLE (
  room_id uuid,
  product_game_id text,
  title text,
  lifecycle_phase text,
  minutes_idle integer,
  deleted boolean,
  note text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_idle_minutes integer := GREATEST(1, COALESCE(p_idle_minutes, 10));
  v_prefix text := COALESCE(p_room_prefix, 'ov2_');
  v_effective timestamptz;
  v_sess_u timestamptz;
  v_member_u timestamptz;
  v_row_count integer;
  v_deleted boolean;
  v_note text;
BEGIN
  FOR v_room IN
    SELECT r.*
    FROM public.ov2_rooms r
    WHERE r.product_game_id LIKE (v_prefix || '%')
    ORDER BY r.updated_at ASC, r.id ASC
    FOR UPDATE SKIP LOCKED
  LOOP
    v_sess_u := NULL;
    v_member_u := NULL;
    v_note := NULL;
    v_deleted := false;

    IF v_room.active_session_id IS NOT NULL THEN
      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        SELECT s.updated_at INTO v_sess_u
        FROM public.ov2_ludo_sessions s
        WHERE s.id = v_room.active_session_id AND s.room_id = v_room.id
        LIMIT 1;
      END IF;
      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        SELECT GREATEST(
          COALESCE(v_sess_u, '-infinity'::timestamptz),
          COALESCE((
            SELECT s.updated_at FROM public.ov2_board_path_sessions s
            WHERE s.id = v_room.active_session_id AND s.room_id = v_room.id LIMIT 1
          ), '-infinity'::timestamptz)
        ) INTO v_sess_u;
        IF v_sess_u = '-infinity'::timestamptz THEN
          v_sess_u := NULL;
        END IF;
      END IF;
      IF to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        SELECT GREATEST(
          COALESCE(v_sess_u, '-infinity'::timestamptz),
          COALESCE((
            SELECT s.updated_at FROM public.ov2_mark_grid_sessions s
            WHERE s.id = v_room.active_session_id AND s.room_id = v_room.id LIMIT 1
          ), '-infinity'::timestamptz)
        ) INTO v_sess_u;
        IF v_sess_u = '-infinity'::timestamptz THEN
          v_sess_u := NULL;
        END IF;
      END IF;
    END IF;

    IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
      SELECT max(m.updated_at) INTO v_member_u
      FROM public.ov2_room_members m WHERE m.room_id = v_room.id;
    END IF;

    v_effective := GREATEST(
      COALESCE(v_room.updated_at, '-infinity'::timestamptz),
      COALESCE(v_sess_u, '-infinity'::timestamptz),
      COALESCE(v_member_u, '-infinity'::timestamptz)
    );
    IF v_effective = '-infinity'::timestamptz THEN
      v_effective := v_room.updated_at;
    END IF;

    minutes_idle := floor(extract(epoch FROM (now() - v_effective)) / 60.0)::integer;

    IF minutes_idle < v_idle_minutes THEN
      CONTINUE;
    END IF;

    BEGIN
      -- Deletion order: product children → sessions → room-scoped economy → members → room
      -- All DELETE predicates use table aliases (never bare room_id) to avoid conflict with RETURNS TABLE output vars.
      IF to_regclass('public.ov2_ludo_seats') IS NOT NULL AND to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_seats ls
        USING public.ov2_ludo_sessions sess
        WHERE ls.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_sessions s WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_board_path_seats') IS NOT NULL AND to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_seats bs
        USING public.ov2_board_path_sessions sess
        WHERE bs.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_sessions s WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_mark_grid_seats') IS NOT NULL AND to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_seats ms
        USING public.ov2_mark_grid_sessions sess
        WHERE ms.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_sessions s WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_settlement_lines') IS NOT NULL THEN
        DELETE FROM public.ov2_settlement_lines sl WHERE sl.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_economy_events') IS NOT NULL THEN
        DELETE FROM public.ov2_economy_events ee WHERE ee.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
        DELETE FROM public.ov2_room_members rm WHERE rm.room_id = v_room.id;
      END IF;

      DELETE FROM public.ov2_rooms rr WHERE rr.id = v_room.id;
      GET DIAGNOSTICS v_row_count = ROW_COUNT;
      v_deleted := (v_row_count > 0);
      IF v_deleted THEN
        v_note := 'deleted';
      ELSE
        v_note := 'skipped: room row not deleted (concurrent delete?)';
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_deleted := false;
        v_note := 'error: ' || SQLERRM;
    END;

    room_id := v_room.id;
    product_game_id := v_room.product_game_id;
    title := v_room.title;
    lifecycle_phase := v_room.lifecycle_phase;
    deleted := v_deleted;
    note := v_note;
    RETURN NEXT;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) IS
  'OV2 admin: delete stale ov2_* rooms and room-local rows only. EXECUTE: service_role only. (026: qualified DELETE room_id via table aliases.)';

COMMIT;
