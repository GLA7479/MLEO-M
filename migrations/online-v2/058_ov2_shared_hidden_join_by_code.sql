-- Hidden rooms stay out of directory but must join via join_code.
-- ov2_shared_join_room_by_code used to delegate to ov2_shared_join_room, which rejected hidden.
-- Add p_allow_hidden (default false): join-by-id stays blocked for hidden; join-by-code passes true.

BEGIN;

DROP FUNCTION IF EXISTS public.ov2_shared_join_room(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.ov2_shared_join_room(
  p_room_id uuid,
  p_participant_key text,
  p_display_name text,
  p_password_plaintext text DEFAULT NULL,
  p_allow_hidden boolean DEFAULT false
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

  IF v_room.visibility_mode = 'hidden' AND NOT COALESCE(p_allow_hidden, false) THEN
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
    IF extensions.crypt(
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

  RETURN public.ov2_shared_join_room(
    v_room.id,
    p_participant_key,
    p_display_name,
    p_password_plaintext,
    true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_join_room(uuid, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_join_room(uuid, text, text, text, boolean) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_shared_join_room(uuid, text, text, text, boolean) IS
  'OV2 shared: join by room id. Hidden rooms rejected unless p_allow_hidden (used by join_room_by_code).';

COMMIT;
