-- OV2 unified shared room foundation (Phase 1 schema).
-- Additive: extends public.ov2_rooms / public.ov2_room_members without dropping legacy columns.
-- New shared RPCs (047) operate only on rows where shared_schema_version = 1.
-- Legacy ov2_* room RPCs and existing clients remain unchanged until game migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Centralized activity touch (single canonical mechanism; called from shared RPCs only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_touch_room_activity(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.ov2_rooms
  SET
    last_activity_at = now(),
    updated_at = now()
  WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_touch_room_activity(uuid) FROM PUBLIC;
-- Intentionally not granted to anon/authenticated: only SECURITY DEFINER shared RPCs call this.

COMMENT ON FUNCTION public.ov2_shared_touch_room_activity(uuid) IS
  'OV2 shared: bump last_activity_at + updated_at. Call only from server-side shared room RPCs; game RPCs will call this in a later phase.';

-- ---------------------------------------------------------------------------
-- Join code generator (collision-safe)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_generate_join_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  i int;
  s text := '';
  cand text;
  tries int := 0;
BEGIN
  LOOP
    s := '';
    FOR i IN 1..8 LOOP
      s := s || substr(chars, (floor(random() * length(chars))::int + 1), 1);
    END LOOP;
    cand := s;
    IF NOT EXISTS (SELECT 1 FROM public.ov2_rooms WHERE join_code = cand) THEN
      RETURN cand;
    END IF;
    tries := tries + 1;
    IF tries > 50 THEN
      cand := upper(replace(gen_random_uuid()::text, '-', ''));
      cand := substring(cand from 1 for 8);
      IF NOT EXISTS (SELECT 1 FROM public.ov2_rooms WHERE join_code = cand) THEN
        RETURN cand;
      END IF;
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_generate_join_code() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- ov2_rooms: unified columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS shared_schema_version integer NOT NULL DEFAULT 0;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS status text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS visibility_mode text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS password_hash text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS join_code text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS min_players integer;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS max_players integer;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS host_member_id uuid;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS created_by_participant_key text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS active_runtime_id uuid;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS room_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS is_hard_closed boolean NOT NULL DEFAULT false;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS hard_closed_at timestamptz;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS hard_close_reason text;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS ended_at timestamptz;


DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ov2_rooms_status_chk'
  ) THEN
    ALTER TABLE public.ov2_rooms
      ADD CONSTRAINT ov2_rooms_status_chk CHECK (
        status IS NULL OR status = ANY (ARRAY['OPEN','STARTING','IN_GAME','CLOSED']::text[])
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ov2_rooms_visibility_mode_chk'
  ) THEN
    ALTER TABLE public.ov2_rooms
      ADD CONSTRAINT ov2_rooms_visibility_mode_chk CHECK (
        visibility_mode IS NULL OR visibility_mode = ANY (ARRAY['public','private','hidden']::text[])
      );
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ov2_rooms_join_code
  ON public.ov2_rooms (join_code)
  WHERE join_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ov2_rooms_shared_list
  ON public.ov2_rooms (product_game_id, shared_schema_version, status, is_hard_closed)
  WHERE shared_schema_version = 1 AND NOT is_hard_closed;

CREATE INDEX IF NOT EXISTS idx_ov2_rooms_last_activity_shared
  ON public.ov2_rooms (last_activity_at)
  WHERE shared_schema_version = 1 AND NOT is_hard_closed;

COMMENT ON COLUMN public.ov2_rooms.shared_schema_version IS '1 = unified shared room row; 0 = legacy-only.';
COMMENT ON COLUMN public.ov2_rooms.status IS 'Unified: OPEN | STARTING (internal) | IN_GAME | CLOSED. Legacy lifecycle_phase still used by old RPCs.';
COMMENT ON COLUMN public.ov2_rooms.password_hash IS 'bcrypt hash; never exposed to clients.';
COMMENT ON COLUMN public.ov2_rooms.join_code IS 'Direct join / hidden room code; unique when set.';

-- FK host_member_id -> ov2_room_members (deferrable not needed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ov2_rooms_host_member_id_fkey'
  ) THEN
    ALTER TABLE public.ov2_rooms
      ADD CONSTRAINT ov2_rooms_host_member_id_fkey
      FOREIGN KEY (host_member_id) REFERENCES public.ov2_room_members (id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ov2_room_members: unified columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS role text;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS member_state text;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS joined_at timestamptz;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS left_at timestamptz;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS ejected_at timestamptz;

ALTER TABLE public.ov2_room_members
  ADD COLUMN IF NOT EXISTS eject_reason text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ov2_room_members_role_chk'
  ) THEN
    ALTER TABLE public.ov2_room_members
      ADD CONSTRAINT ov2_room_members_role_chk CHECK (
        role IS NULL OR role = ANY (ARRAY['host','member']::text[])
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ov2_room_members_member_state_chk'
  ) THEN
    ALTER TABLE public.ov2_room_members
      ADD CONSTRAINT ov2_room_members_member_state_chk CHECK (
        member_state IS NULL OR member_state = ANY (ARRAY['joined','left','ejected','disconnected']::text[])
      );
  END IF;
END $$;

UPDATE public.ov2_room_members SET display_name = COALESCE(NULLIF(trim(display_name), ''), 'Player') WHERE display_name IS NULL;

ALTER TABLE public.ov2_room_members
  ALTER COLUMN display_name SET DEFAULT '';

DO $$
BEGIN
  ALTER TABLE public.ov2_room_members
    ALTER COLUMN display_name SET NOT NULL;
EXCEPTION
  WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_ov2_room_members_room_state
  ON public.ov2_room_members (room_id, member_state)
  WHERE member_state IS NOT NULL;

COMMENT ON COLUMN public.ov2_room_members.joined_at IS 'Unified: host transfer ordering; default now() for new rows.';
COMMENT ON COLUMN public.ov2_room_members.member_state IS 'Unified: joined | left | ejected | disconnected. Legacy rows may have NULL.';

COMMIT;
