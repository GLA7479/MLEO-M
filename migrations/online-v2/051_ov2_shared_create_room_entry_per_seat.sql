-- Shared room create: explicit room entry per seat (ov2_rooms.stake_per_seat), minimum 100.
-- Replaces 8-arg ov2_shared_create_room with 9-arg version including p_stake_per_seat.
-- Apply after 050. Does not modify 049/050 files.

BEGIN;

-- Public room JSON: include stake_per_seat for snapshots/lists (column already exists on ov2_rooms).
CREATE OR REPLACE FUNCTION public.ov2_shared_room_to_public_jsonb(r public.ov2_rooms)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'product_game_id', r.product_game_id,
    'title', r.title,
    'status', r.status,
    'visibility_mode', r.visibility_mode,
    'join_code', r.join_code,
    'requires_password', (r.visibility_mode = 'private' AND r.password_hash IS NOT NULL),
    'min_players', r.min_players,
    'max_players', r.max_players,
    'stake_per_seat', r.stake_per_seat,
    'host_member_id', r.host_member_id,
    'created_by_participant_key', r.created_by_participant_key,
    'active_runtime_id', r.active_runtime_id,
    'room_revision', r.room_revision,
    'last_activity_at', r.last_activity_at,
    'is_hard_closed', r.is_hard_closed,
    'hard_closed_at', r.hard_closed_at,
    'hard_close_reason', r.hard_close_reason,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'shared_schema_version', r.shared_schema_version
  );
$$;

DROP FUNCTION IF EXISTS public.ov2_shared_create_room(text, text, integer, integer, text, text, text, text);

CREATE OR REPLACE FUNCTION public.ov2_shared_create_room(
  p_product_game_id text,
  p_title text,
  p_min_players integer,
  p_max_players integer,
  p_visibility_mode text,
  p_password_plaintext text,
  p_host_participant_key text,
  p_display_name text,
  p_stake_per_seat bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game text := trim(COALESCE(p_product_game_id, ''));
  v_title text := COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Room');
  v_min int := COALESCE(p_min_players, 1);
  v_max int := COALESCE(p_max_players, 8);
  v_vis text := lower(trim(COALESCE(p_visibility_mode, 'public')));
  v_host text := trim(COALESCE(p_host_participant_key, ''));
  v_dn text := COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), 'Player');
  v_pw text := NULLIF(trim(COALESCE(p_password_plaintext, '')), '');
  v_hash text := NULL;
  v_code text;
  v_room_id uuid;
  v_member_id uuid;
  v_room public.ov2_rooms%ROWTYPE;
  v_stake bigint;
BEGIN
  IF length(v_game) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'product_game_id is required.');
  END IF;
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Host participant is required.');
  END IF;
  IF p_stake_per_seat IS NULL OR p_stake_per_seat < 100 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Room entry per seat must be at least 100.');
  END IF;
  v_stake := p_stake_per_seat;

  IF v_min < 1 OR v_max < 1 OR v_max > 64 OR v_min > v_max THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_CAPACITY', 'message', 'Invalid room capacity configuration.');
  END IF;
  IF v_vis NOT IN ('public', 'private', 'hidden') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'visibility_mode must be public, private, or hidden.');
  END IF;
  IF v_vis = 'private' AND (v_pw IS NULL OR length(v_pw) < 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Password is required for private rooms.');
  END IF;
  IF v_pw IS NOT NULL THEN
    v_hash := crypt(v_pw, gen_salt('bf'));
  END IF;

  v_code := public.ov2_shared_generate_join_code();

  INSERT INTO public.ov2_rooms (
    product_game_id,
    title,
    lifecycle_phase,
    stake_per_seat,
    host_participant_key,
    is_private,
    max_seats,
    shared_schema_version,
    status,
    visibility_mode,
    password_hash,
    join_code,
    min_players,
    max_players,
    created_by_participant_key,
    room_revision,
    last_activity_at,
    is_hard_closed
  ) VALUES (
    v_game,
    v_title,
    'lobby',
    v_stake,
    v_host,
    v_vis = 'private',
    v_max,
    1,
    'OPEN',
    v_vis,
    v_hash,
    v_code,
    v_min,
    v_max,
    v_host,
    0,
    now(),
    false
  )
  RETURNING id INTO v_room_id;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    role,
    member_state,
    joined_at
  ) VALUES (
    v_room_id,
    v_host,
    v_dn,
    'host',
    'joined',
    now()
  )
  RETURNING id INTO v_member_id;

  UPDATE public.ov2_rooms
  SET host_member_id = v_member_id
  WHERE id = v_room_id
  RETURNING * INTO v_room;

  PERFORM public.ov2_shared_touch_room_activity(v_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = v_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(v_room_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_create_room(text, text, integer, integer, text, text, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_create_room(text, text, integer, integer, text, text, text, text, bigint) TO anon, authenticated, service_role;

COMMIT;
