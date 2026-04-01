-- OV2 unified shared room RPCs (Phase 2). Uses shared_schema_version = 1 rows only.
-- Centralized activity: every successful path calls public.ov2_shared_touch_room_activity(room_id).
-- Does not replace legacy ov2_create_room / ov2_join_room / etc.

BEGIN;

-- Economy entry policy resolver (server-side mirror of JS registry; extend in one place per product)
CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy(p_product_game_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_product_game_id, ''))
    WHEN 'ov2_ludo' THEN 'ON_HOST_START'
    WHEN 'ov2_bingo' THEN 'ON_HOST_START'
    WHEN 'ov2_rummy51' THEN 'ON_HOST_START'
    ELSE 'NONE'
  END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_resolve_economy_entry_policy(text) FROM PUBLIC;

-- Public JSON for rooms (never returns secret credential fields)
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

CREATE OR REPLACE FUNCTION public.ov2_shared_members_to_public_jsonb(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'updated_at', m.updated_at,
        'room_id', m.room_id,
        'participant_key', m.participant_key,
        'display_name', m.display_name,
        'seat_index', m.seat_index,
        'role', m.role,
        'member_state', m.member_state,
        'joined_at', m.joined_at,
        'left_at', m.left_at,
        'ejected_at', m.ejected_at,
        'eject_reason', m.eject_reason,
        'last_seen_at', m.last_seen_at
      )
      ORDER BY m.joined_at ASC NULLS LAST, m.created_at ASC NULLS LAST, m.participant_key ASC
    ),
    '[]'::jsonb
  )
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');
$$;

-- --- 1) create ---
CREATE OR REPLACE FUNCTION public.ov2_shared_create_room(
  p_product_game_id text,
  p_title text,
  p_min_players integer,
  p_max_players integer,
  p_visibility_mode text,
  p_password_plaintext text,
  p_host_participant_key text,
  p_display_name text
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
BEGIN
  IF length(v_game) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'product_game_id is required.');
  END IF;
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Host participant is required.');
  END IF;
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

-- --- 2) list ---
CREATE OR REPLACE FUNCTION public.ov2_shared_list_rooms(
  p_product_game_id text DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lim int := LEAST(GREATEST(COALESCE(p_limit, 40), 1), 200);
  v_game text := NULLIF(trim(COALESCE(p_product_game_id, '')), '');
  v_rows jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(public.ov2_shared_room_to_public_jsonb(r) ORDER BY r.created_at DESC),
    '[]'::jsonb
  )
  INTO v_rows
  FROM (
    SELECT *
    FROM public.ov2_rooms r
    WHERE r.shared_schema_version = 1
      AND NOT r.is_hard_closed
      AND r.status = 'OPEN'
      AND r.visibility_mode IN ('public', 'private')
      AND (v_game IS NULL OR r.product_game_id = v_game)
    ORDER BY r.created_at DESC
    LIMIT v_lim
  ) r;

  RETURN jsonb_build_object('ok', true, 'rooms', v_rows);
END;
$$;

-- --- 3) snapshot ---
CREATE OR REPLACE FUNCTION public.ov2_shared_get_room_snapshot(
  p_room_id uuid,
  p_viewer_participant_key text DEFAULT NULL,
  p_password_plaintext text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := NULLIF(trim(COALESCE(p_viewer_participant_key, '')), '');
  v_in_pw text := NULLIF(trim(COALESCE(p_password_plaintext, '')), '');
  v_member boolean := false;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_pk IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id AND m.participant_key = v_pk
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ) INTO v_member;
  END IF;

  IF v_room.visibility_mode IN ('private', 'hidden') AND NOT v_member THEN
    IF v_room.password_hash IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
    IF v_in_pw IS NULL OR crypt(v_in_pw, v_room.password_hash) IS DISTINCT FROM v_room.password_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 4) join by id (public + private in directory; hidden rejected) ---
CREATE OR REPLACE FUNCTION public.ov2_shared_join_room(
  p_room_id uuid,
  p_participant_key text,
  p_display_name text,
  p_password_plaintext text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_dn text := COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), 'Player');
  v_in text := NULLIF(trim(COALESCE(p_password_plaintext, '')), '');
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_room.visibility_mode = 'hidden' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'This room is not accepting new players.');
  END IF;

  IF v_room.password_hash IS NOT NULL THEN
    IF v_in IS NULL OR crypt(v_in, v_room.password_hash) IS DISTINCT FROM v_room.password_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) AND (
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) >= COALESCE(v_room.max_players, v_room.max_seats) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_FULL', 'message', 'Room capacity reached.');
  END IF;

  INSERT INTO public.ov2_room_members (
    room_id, participant_key, display_name, role, member_state, joined_at
  ) VALUES (
    p_room_id, v_pk, v_dn, 'member', 'joined', now()
  )
  ON CONFLICT ON CONSTRAINT ov2_room_members_room_participant
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    member_state = 'joined',
    left_at = NULL,
    joined_at = now(),
    updated_at = now();

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 5) join by code ---
CREATE OR REPLACE FUNCTION public.ov2_shared_join_room_by_code(
  p_join_code text,
  p_participant_key text,
  p_display_name text,
  p_password_plaintext text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text := upper(trim(COALESCE(p_join_code, '')));
  v_room public.ov2_rooms%ROWTYPE;
BEGIN
  IF length(v_code) < 4 OR length(trim(COALESCE(p_participant_key, ''))) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE join_code = v_code FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_room.password_hash IS NOT NULL THEN
    IF crypt(
      NULLIF(trim(COALESCE(p_password_plaintext, '')), ''),
      v_room.password_hash
    ) IS DISTINCT FROM v_room.password_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
  END IF;

  RETURN public.ov2_shared_join_room(v_room.id, p_participant_key, p_display_name, p_password_plaintext);
END;
$$;

-- --- 6) leave ---
CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_cnt int;
  v_new_host uuid;
  v_room_id uuid := p_room_id;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status NOT IN ('OPEN', 'STARTING') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Cannot leave after room start.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  UPDATE public.ov2_room_members
  SET
    seat_index = NULL,
    member_state = 'left',
    left_at = now(),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  IF v_cnt <= 0 THEN
    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      ended_at = now(),
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    PERFORM public.ov2_shared_touch_room_activity(p_room_id);

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'room', public.ov2_shared_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.id INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key IS DISTINCT FROM v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_room_members
    SET role = 'member'
    WHERE room_id = p_room_id
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_room_members SET role = 'host' WHERE id = v_new_host;

    UPDATE public.ov2_rooms r
    SET
      host_member_id = v_new_host,
      host_participant_key = (SELECT participant_key FROM public.ov2_room_members WHERE id = v_new_host),
      updated_at = now()
    WHERE r.id = p_room_id
    RETURNING * INTO v_room;
  ELSE
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 7) claim seat ---
CREATE OR REPLACE FUNCTION public.ov2_shared_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_max int;
  v_si int := p_seat_index;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Seats cannot be changed now.');
  END IF;

  v_max := COALESCE(v_room.max_players, v_room.max_seats, 8) - 1;

  IF v_si IS NULL OR v_si < 0 OR v_si > v_max THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SEAT',
      'message', format('Seat must be 0..%s', v_max)
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Participant is not in this room.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key <> v_pk AND m.seat_index = v_si
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEAT_TAKEN', 'message', 'Seat is already occupied.');
  END IF;

  UPDATE public.ov2_room_members m
  SET seat_index = v_si, updated_at = now()
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 8) release seat ---
CREATE OR REPLACE FUNCTION public.ov2_shared_release_seat(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_upd int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Seats cannot be changed now.');
  END IF;

  UPDATE public.ov2_room_members m
  SET seat_index = NULL, updated_at = now()
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Participant is not in this room.');
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 9) host start ---
CREATE OR REPLACE FUNCTION public.ov2_shared_host_start(
  p_room_id uuid,
  p_host_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_host text := trim(COALESCE(p_host_participant_key, ''));
  v_seated int;
  v_min int;
  v_rt uuid := gen_random_uuid();
  v_policy text;
  v_handoff jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_host) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host participant are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_host THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can start.');
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Room cannot start in its current state.');
  END IF;

  v_min := COALESCE(v_room.min_players, 1);

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND m.seat_index IS NOT NULL;

  IF v_seated < v_min THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ENOUGH_SEATED',
      'message', format('Need at least %s seated players.', v_min)
    );
  END IF;

  v_policy := public.ov2_shared_resolve_economy_entry_policy(v_room.product_game_id);

  -- Single atomic transition OPEN -> IN_GAME (revision-safe). Internal STARTING is not persisted to avoid stuck rows.
  UPDATE public.ov2_rooms
  SET
    status = 'IN_GAME',
    active_runtime_id = v_rt,
    started_at = COALESCE(started_at, now()),
    lifecycle_phase = 'active',
    room_revision = room_revision + 1,
    updated_at = now()
  WHERE id = p_room_id
    AND status = 'OPEN'
    AND room_revision = v_room.room_revision
  RETURNING * INTO v_room;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not start — room state changed. Try again.');
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  v_handoff := jsonb_build_object(
    'room_id', v_room.id,
    'product_game_id', v_room.product_game_id,
    'room_revision', v_room.room_revision,
    'active_runtime_id', v_room.active_runtime_id,
    'economy_entry_policy', v_policy,
    'economy_policy_applied', false,
    'participants', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id),
    'runtime_handoff', v_handoff
  );
END;
$$;

-- --- 10) reconnect ---
CREATE OR REPLACE FUNCTION public.ov2_shared_reconnect_member(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_n int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  UPDATE public.ov2_room_members m
  SET
    member_state = 'joined',
    last_seen_at = now(),
    updated_at = now()
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- 11) hard close inactive (service role / cron) ---
CREATE OR REPLACE FUNCTION public.ov2_shared_hard_close_inactive_rooms()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.ov2_rooms
    WHERE shared_schema_version = 1
      AND NOT is_hard_closed
      AND last_activity_at IS NOT NULL
      AND last_activity_at < now() - interval '6 hours'
  LOOP
    UPDATE public.ov2_room_members m
    SET
      member_state = 'ejected',
      eject_reason = 'ROOM_HARD_CLOSED_INACTIVE',
      ejected_at = now(),
      updated_at = now()
    WHERE m.room_id = r.id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      is_hard_closed = true,
      hard_closed_at = now(),
      hard_close_reason = 'INACTIVE_TIMEOUT',
      ended_at = COALESCE(ended_at, now()),
      lifecycle_phase = 'closed',
      closed_reason = 'inactive_timeout',
      active_runtime_id = NULL,
      updated_at = now()
    WHERE id = r.id;

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'closed_count', v_closed);
END;
$$;

-- Permissions
REVOKE ALL ON FUNCTION public.ov2_shared_room_to_public_jsonb(public.ov2_rooms) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_shared_members_to_public_jsonb(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_shared_create_room(text, text, integer, integer, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_create_room(text, text, integer, integer, text, text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_list_rooms(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_list_rooms(text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_get_room_snapshot(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_get_room_snapshot(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_join_room(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_join_room(uuid, text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_join_room_by_code(text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_join_room_by_code(text, text, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_leave_room(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_leave_room(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_claim_seat(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_claim_seat(uuid, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_release_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_release_seat(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_host_start(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_host_start(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_reconnect_member(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_reconnect_member(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_shared_hard_close_inactive_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_hard_close_inactive_rooms() TO service_role;

COMMENT ON FUNCTION public.ov2_shared_host_start(uuid, text) IS 'OV2 shared: room start authority OPEN -> IN_GAME; sets active_runtime_id; returns runtime_handoff; economy entry remains policy-driven.';

COMMIT;
