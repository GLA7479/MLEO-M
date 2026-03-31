-- =============================================================================
-- OV2 STALE ROOM CLEANUP (ADMIN) — migrations/online-v2/024_ov2_room_stale_cleanup.sql
-- =============================================================================
--
-- PURPOSE
-- -------
-- Provide a production-safe, documented way to identify and remove **stale OV2
-- match rooms** (`ov2_rooms`) and **room-local** data only. This migration does
-- not implement gameplay settlement, forfeits, or vault balance changes.
--
-- WHAT A "STALE ROOM" MEANS
-- -------------------------
-- A room row is a **candidate** for purge when its **effective last activity**
-- is older than `p_idle_minutes` (default 10, minimum clamp 1 minute).
--
-- Effective last activity is:
--   GREATEST(
--     ov2_rooms.updated_at,
--     COALESCE(active_session.updated_at from product session table, if resolvable),
--     COALESCE(MAX(ov2_room_members.updated_at) for that room, if any members)
--   )
--
-- Active session activity: if `ov2_rooms.active_session_id` is set, this migration
-- looks up that UUID in known product session tables (`ov2_ludo_sessions`,
-- `ov2_board_path_sessions`) when those tables exist. If the ID does not match
-- (wrong product), that component contributes nothing (NULL).
--
-- WHICH PRODUCTS ARE IN SCOPE
-- ----------------------------
-- All rows where `product_game_id LIKE p_room_prefix || '%'`.
-- Default prefix is `'ov2_'` — i.e. all current and future OV2 online games that
-- use the standard `ov2_*` product id convention.
--
-- WHAT GETS DELETED (ROOM-LOCAL ONLY)
-- -----------------------------------
-- When `ov2_admin_purge_stale_rooms` deletes a room, it removes in order:
--   1) Product session children (seats before sessions where FK requires it)
--   2) Product sessions keyed by `room_id`
--   3) `ov2_settlement_lines` for that `room_id`
--   4) `ov2_economy_events` for that `room_id` (append-only room log; not a vault)
--   5) `ov2_room_members` for that `room_id` (membership rows; not global users)
--   6) `ov2_rooms` row
--
-- Known OV2 product tables handled explicitly (guarded with `to_regclass` so
-- missing tables in partial installs do not break the migration):
--   - Ludo: `ov2_ludo_seats` → `ov2_ludo_sessions`
--   - Board Path: `ov2_board_path_seats` → `ov2_board_path_sessions`
--   - Mark Grid: `ov2_mark_grid_seats` → `ov2_mark_grid_sessions`
--
-- WHAT DOES **NOT** GET DELETED
-- -----------------------------
-- - `auth.users` and any auth schema objects
-- - Global profile / account tables outside OV2 room scope
-- - Vault balances or global wallet rows (this migration never calls vault RPCs)
-- - Rows not tied to the deleted `room_id`
--
-- Players may still be "in" a stale room in the UI; deleting the room removes
-- **room membership rows** (`ov2_room_members`) for that room only. It does
-- **not** delete the person's global identity.
--
-- SETTLEMENT / FORFEIT / VAULT
-- ----------------------------
-- Intentionally **out of scope**. This is housekeeping for abandoned tables.
-- Any economic finalization must be a separate, explicit product feature.
--
-- FUNCTIONS PROVIDED
-- -------------------
-- 1) `public.ov2_admin_list_stale_rooms` — READ ONLY. No locks, no deletes.
-- 2) `public.ov2_admin_purge_stale_rooms` — Deletes stale rooms; returns per-room
--    outcome including error text if a single room fails (others continue).
--
-- SECURITY MODEL
-- --------------
-- Both functions are `SECURITY DEFINER` and run with the migration owner's
-- privileges so cleanup can delete room-local rows consistently.
--
-- **EXECUTE is granted ONLY to `service_role`.**
-- Do NOT grant to `anon` or `authenticated` end-users. Run via Supabase SQL
-- editor, service automation, or a trusted backend using the service role key.
--
-- MANUAL PREVIEW (no deletion)
-- ----------------------------
--   SELECT * FROM public.ov2_admin_list_stale_rooms(10, 'ov2_');
--   SELECT * FROM public.ov2_admin_list_stale_rooms(1, 'ov2_');   -- aggressive test
--
-- MANUAL PURGE
-- ------------
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(10, 'ov2_');
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(1, 'ov2_');   -- aggressive test
--
-- EXTENSION POINT (FUTURE OV2 GAMES)
-- ----------------------------------
-- When a new OV2 product adds tables with `room_id → ov2_rooms(id)` or session
-- tables keyed by `room_id`, add guarded DELETE blocks in **both** functions'
-- documentation and in `ov2_admin_purge_stale_rooms` **before** deleting
-- `ov2_room_members`, ordered from most dependent child → session → room.
-- Prefer `to_regclass('public.new_table')` guards. If the FK is `ON DELETE
-- CASCADE` from `ov2_rooms`, document it and you may rely on CASCADE for that
-- branch — but keep explicit deletes for known non-CASCADE or session→seat trees.
--
-- =============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_admin_list_stale_rooms(
  p_idle_minutes integer DEFAULT 10,
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
  v_idle_minutes integer := GREATEST(1, COALESCE(p_idle_minutes, 10));
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
      SELECT count(*)::bigint INTO v_members
      FROM public.ov2_room_members m WHERE m.room_id = v_room.id;
    ELSE
      v_members := 0;
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

    IF minutes_idle >= v_idle_minutes THEN
      room_id := v_room.id;
      product_game_id := v_room.product_game_id;
      title := v_room.title;
      lifecycle_phase := v_room.lifecycle_phase;
      effective_last_activity_at := v_effective;
      active_session_id := v_room.active_session_id;
      member_count := v_members;
      RETURN NEXT;
    END IF;
  END LOOP;
  RETURN;
END;
$$;

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
      IF to_regclass('public.ov2_ludo_seats') IS NOT NULL AND to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_seats ls
        USING public.ov2_ludo_sessions sess
        WHERE ls.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_ludo_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_ludo_sessions WHERE room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_board_path_seats') IS NOT NULL AND to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_seats bs
        USING public.ov2_board_path_sessions sess
        WHERE bs.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_board_path_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_board_path_sessions WHERE room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_mark_grid_seats') IS NOT NULL AND to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_seats ms
        USING public.ov2_mark_grid_sessions sess
        WHERE ms.session_id = sess.id AND sess.room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_mark_grid_sessions') IS NOT NULL THEN
        DELETE FROM public.ov2_mark_grid_sessions WHERE room_id = v_room.id;
      END IF;

      IF to_regclass('public.ov2_settlement_lines') IS NOT NULL THEN
        DELETE FROM public.ov2_settlement_lines WHERE room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_economy_events') IS NOT NULL THEN
        DELETE FROM public.ov2_economy_events WHERE room_id = v_room.id;
      END IF;
      IF to_regclass('public.ov2_room_members') IS NOT NULL THEN
        DELETE FROM public.ov2_room_members WHERE room_id = v_room.id;
      END IF;

      DELETE FROM public.ov2_rooms WHERE id = v_room.id;
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
  'OV2 admin: list stale ov2_* rooms that would be purged; read-only. EXECUTE: service_role only.';

COMMENT ON FUNCTION public.ov2_admin_purge_stale_rooms(integer, text) IS
  'OV2 admin: delete stale ov2_* rooms and room-local rows only. EXECUTE: service_role only.';

COMMIT;

-- =============================================================================
-- EXAMPLES (run as service_role / SQL editor with sufficient privilege)
-- =============================================================================
-- Preview — idle at least 10 minutes:
--   SELECT * FROM public.ov2_admin_list_stale_rooms(10, 'ov2_');
-- Purge — idle at least 10 minutes:
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(10, 'ov2_');
-- Aggressive test — 1 minute threshold:
--   SELECT * FROM public.ov2_admin_list_stale_rooms(1, 'ov2_');
--   SELECT * FROM public.ov2_admin_purge_stale_rooms(1, 'ov2_');
-- =============================================================================
