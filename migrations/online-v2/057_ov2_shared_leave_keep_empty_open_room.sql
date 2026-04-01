-- OV2 shared rooms: do not close OPEN waiting rooms when the last member leaves.
-- Rooms stay listable until ov2_shared_hard_close_inactive_rooms (6h inactivity) or normal lifecycle.
-- When host fields are cleared, ov2_shared_join_room promotes the joiner to host if none is valid.

BEGIN;

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
    IF v_in IS NULL OR extensions.crypt(v_in, v_room.password_hash) IS DISTINCT FROM v_room.password_hash THEN
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

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key IS NOT DISTINCT FROM v_room.host_participant_key
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    UPDATE public.ov2_room_members
    SET role = 'member'
    WHERE room_id = p_room_id
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_room_members
    SET role = 'host'
    WHERE room_id = p_room_id
      AND participant_key = v_pk
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_rooms r
    SET
      host_member_id = (
        SELECT m.id
        FROM public.ov2_room_members m
        WHERE m.room_id = p_room_id
          AND m.participant_key = v_pk
          AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
        LIMIT 1
      ),
      host_participant_key = v_pk,
      updated_at = now()
    WHERE r.id = p_room_id;
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

CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean DEFAULT false
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
  v_in_ludo_match boolean := false;
  v_in_r51_match boolean := false;
  v_ff jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status NOT IN ('OPEN', 'STARTING', 'IN_GAME') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Cannot leave in this room state.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  IF v_room.status = 'IN_GAME' THEN
    v_in_ludo_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_ludo'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_ludo_seats ls
        WHERE ls.session_id = v_room.active_session_id AND ls.participant_key = v_pk
      );
    v_in_r51_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_rummy51'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND coalesce(
        (SELECT (player_state -> v_pk ->> 'isEliminated')::boolean FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id),
        false
      ) IS NOT TRUE;

    IF v_in_ludo_match OR v_in_r51_match THEN
      IF NOT COALESCE(p_forfeit_game, false) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_FORFEIT',
          'message', 'Leave during an active match requires forfeit. Call again with p_forfeit_game := true.'
        );
      END IF;
      IF v_in_ludo_match THEN
        v_ff := public.ov2_ludo_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_r51_match THEN
        v_ff := public.ov2_rummy51_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
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
    -- OPEN waiting room: keep row discoverable; 6h inactivity job may hard-close later.
    IF coalesce(upper(trim(v_room.status)), '') = 'OPEN' THEN
      UPDATE public.ov2_rooms
      SET
        host_member_id = NULL,
        host_participant_key = NULL,
        updated_at = now()
      WHERE id = p_room_id
      RETURNING * INTO v_room;

      PERFORM public.ov2_shared_touch_room_activity(p_room_id);

      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', true,
        'closed', false,
        'room', public.ov2_shared_room_to_public_jsonb(v_room),
        'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
      );
    END IF;

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

COMMENT ON FUNCTION public.ov2_shared_leave_room(uuid, text, boolean) IS
  'OV2 shared: leave room. Last member leaving an OPEN room keeps the room open (host cleared). STARTING/IN_GAME empty still closes. IN_GAME match forfeit unchanged.';

COMMIT;
