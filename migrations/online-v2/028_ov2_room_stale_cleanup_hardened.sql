-- =============================================================================
-- OV2 STALE ROOM CLEANUP (ADMIN) — HARDENED
-- migrations/online-v2/028_ov2_room_stale_cleanup_hardened.sql
-- =============================================================================
--
-- PURPOSE
-- -------
-- Harden stale room cleanup so long-running OV2 matches are not purged while
-- still active. This migration replaces the list/purge functions with safer
-- defaults and explicit live-room guards.
--
-- KEY CHANGES VS 024/026
-- ----------------------
-- * Default idle threshold is now 30 minutes (instead of 10).
-- * Active/live rooms are never purged.
-- * Rooms with active_session_id are never purged unless they are clearly in a
--   terminal lifecycle phase.
-- * DELETE statements keep the qualified alias style introduced in 026.
--
-- LIVE ROOM GUARD
-- ---------------
-- A room is skipped from purge when:
--   * lifecycle_phase (lowercased) is one of:
--       starting, countdown, matched, live, active, in_progress, playing
--   * OR active_session_id IS NOT NULL and the room is not terminal
--
-- TERMINAL PHASES
-- ---------------
--   finished, settled, cancelled, closed, abandoned, expired
--
-- ROOM-LOCAL SCOPE ONLY
-- ---------------------
-- This migration still deletes room-local data only.
-- No auth users, no global profiles, no vault rows, no settlement/forfeit logic.
--
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_admin_list_stale_rooms(
  p_idle_minutes integer DEFAULT 30,
  p_room_prefix text DEFAULT 'ov2_'
)
RETURNS TABLE (
  room_id uuid,
  product_game_id text,
  title text,
  lifecycle_phase text,
  effective_last_activity_at timestamptz,
  minutes_idle integer,
  active_session_id uuid,
  member_count bigint
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_idle_minutes integer := GREATEST(1, COALESCE(p_idle_minutes, 30));
  v_prefix text := COALESCE(p_room_prefix, 'ov2_');
  v_room public.ov2_rooms%ROWTYPE;
  v_effective timestamptz;
  v_sess_u timestamptz;
  v_member_u timestamptz;
  v_members bigint;
BEGIN
  FOR v_room IN
    SELECT r.*
    FROM public.ov2_rooms r
    WHERE r.product_game_id LIKE (v_prefix || '%')
    ORDER BY r.updated_at ASC, r.id ASC
  LOOP
    v_sess_u := NULL;
    v_member_u := NULL;
    v_members := 0;

    IF v_room.active_session_id IS NOT NULL THEN
      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        SELECT s.updated_at INTO v_sess_u
        FROM public.ov2_ludo_sessions s
        WHERE s.id = v_room.active_session_id
          AND s.room_id = v_room.id
        LIMIT 1;
      END IF;

      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        SELECT GREATEST(
          COALESCE(v_sess_u, '-infinity'::timestamptz),
          COALESCE((
            SELECT s.updated_at
            FROM public.ov2_board_path_sessions s
            WHERE s.id = v_room.active_session_id
              AND s.room_id = v_room.id
            LIMIT 1
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
            SELECT s.updated_at
            FROM public.ov2_mark_grid_sessions s
            WHERE s.id = v_room.active_session_id
              AND s.room_id = v_room.id
            LIMIT 1
          ), '-infinity'::timestamptz)
        ) INTO v_sess_u;

        IF v_sess_u = '-infinity'::timestamptz THEN
          v_sess_u := NULL;
        END IF;
      END IF;
    END IF;

    IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
      SELECT max(m.updated_at), count(*)::bigint
      INTO v_member_u, v_members
      FROM public.ov2_room_members m
      WHERE m.room_id = v_room.id;
    END IF;

    v_effective := GREATEST(
      COALESCE(v_room.updated_at, '-infinity'::timestamptz),
      COALESCE(v_sess_u, '-infinity'::timestamptz),
      COALESCE(v_member_u, '-infinity'::timestamptz)
    );

    IF v_effective = '-infinity'::timestamptz THEN
      v_effective := v_room.updated_at;
    END IF;

    room_id := v_room.id;
    product_game_id := v_room.product_game_id;
    title := v_room.title;
    lifecycle_phase := v_room.lifecycle_phase;
    effective_last_activity_at := v_effective;
    minutes_idle := floor(extract(epoch FROM (now() - v_effective)) / 60.0)::integer;
    active_session_id := v_room.active_session_id;
    member_count := v_members;

    IF minutes_idle >= v_idle_minutes THEN
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_admin_purge_stale_rooms(
  p_idle_minutes integer DEFAULT 30,
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
  v_idle_minutes integer := GREATEST(1, COALESCE(p_idle_minutes, 30));
  v_prefix text := COALESCE(p_room_prefix, 'ov2_');
  v_effective timestamptz;
  v_sess_u timestamptz;
  v_member_u timestamptz;
  v_row_count integer;
  v_deleted boolean;
  v_note text;
  v_phase text;
  v_terminal_phase boolean;
  v_live_guard boolean;
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
    v_phase := lower(COALESCE(v_room.lifecycle_phase, ''));

    v_terminal_phase := v_phase IN (
      'finished',
      'settled',
      'cancelled',
      'closed',
      'abandoned',
      'expired'
    );

    v_live_guard := (
      v_phase IN (
        'starting',
        'countdown',
        'matched',
        'live',
        'active',
        'in_progress',
        'playing'
      )
      OR (v_room.active_session_id IS NOT NULL AND NOT v_terminal_phase)
    );

    IF v_room.active_session_id IS NOT NULL THEN
      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        SELECT s.updated_at INTO v_sess_u
        FROM public.ov2_ludo_sessions s
        WHERE s.id = v_room.active_session_id
          AND s.room_id = v_room.id
        LIMIT 1;
      END IF;

      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        SELECT GREATEST(
          COALESCE(v_sess_u, '-infinity'::timestamptz),
          COALESCE((
            SELECT s.updated_at
            FROM public.ov2_board_path_sessions s
            WHERE s.id = v_room.active_session_id
              AND s.room_id = v_room.id
            LIMIT 1
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
            SELECT s.updated_at
            FROM public.ov2_mark_grid_sessions s
            WHERE s.id = v_room.active_session_id
              AND s.room_id = v_room.id
            LIMIT 1
          ), '-infinity'::timestamptz)
        ) INTO v_sess_u;

        IF v_sess_u = '-infinity'::timestamptz THEN
          v_sess_u := NULL;
        END IF;
      END IF;
    END IF;

    IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
      SELECT max(m.updated_at)
      INTO v_member_u
      FROM public.ov2_room_members m
      WHERE m.room_id = v_room.id;
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

    IF v_live_guard THEN
      CONTINUE;
    END IF;

    IF minutes_idle < v_idle_minutes THEN
      CONTINUE;
    END IF;

    BEGIN
      -- Deletion order: product children -> sessions -> room-scoped economy -> members -> room

      IF to_regclass('public.ov2_ludo_seats') IS NOT NULL
         AND to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_seats ls
        USING public.ov2_ludo_sessions sess
        WHERE ls.session_id = sess.id
          AND sess.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_sessions s
        WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_board_path_seats') IS NOT NULL
         AND to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_seats bs
        USING public.ov2_board_path_sessions sess
        WHERE bs.session_id = sess.id
          AND sess.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_sessions s
        WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_mark_grid_seats') IS NOT NULL
         AND to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_seats ms
        USING public.ov2_mark_grid_sessions sess
        WHERE ms.session_id = sess.id
          AND sess.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_sessions s
        WHERE s.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_settlement_lines') IS NOT NULL THEN
        DELETE FROM public.ov2_settlement_lines sl
        WHERE sl.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_economy_events') IS NOT NULL THEN
        DELETE FROM public.ov2_economy_events ee
        WHERE ee.room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
        DELETE FROM public.ov2_room_members rm
        WHERE rm.room_id = v_room.id;
      END IF;

      DELETE FROM public.ov2_rooms rr
      WHERE rr.id = v_room.id;

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

REVOKE ALL ON FUNCTION public.ov2_admin_list_stale_rooms(integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ov2_admin_list_stale_rooms(integer, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) FROM authenticated;

GRANT EXECUTE ON FUNCTION public.ov2_admin_list_stale_rooms(integer, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) TO service_role;

COMMENT ON FUNCTION public.ov2_admin_list_stale_rooms(integer, text) IS
  'OV2 admin: list stale ov2_* rooms that would be purged; hardened default 30m. Read-only. EXECUTE: service_role only.';

COMMENT ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) IS
  'OV2 admin: hardened stale-room purge. Default 30m. Never purges active/live rooms or rooms with active_session_id unless terminal phase. EXECUTE: service_role only.';

COMMIT;

-- =============================================================================
-- EXAMPLES
-- =============================================================================
-- Preview — idle at least 30 minutes:
--   SELECT * FROM public.ov2_admin_list_stale_rooms(30, 'ov2_');
-- Purge — idle at least 30 minutes:
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(30, 'ov2_');
-- Aggressive test:
--   SELECT * FROM public.ov2_admin_list_stale_rooms(5, 'ov2_');
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(5, 'ov2_');
-- =============================================================================
