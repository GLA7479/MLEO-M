-- Ludo bridge: allow session open from shared room start path.
-- Scope: only ov2_ludo_open_session(uuid, text, text).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ludo_open_session(
  p_room_id uuid,
  p_participant_key text,
  p_presence_leader_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_existing public.ov2_ludo_sessions%ROWTYPE;
  v_seated_count int;
  v_active int[];
  v_board jsonb;
  v_is_shared boolean;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  -- compatibility-only arg: accepted but not used for authority
  PERFORM COALESCE(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'Only room members can open a Ludo session'
    );
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_HOST',
      'message', 'Only room host can open a Ludo session'
    );
  END IF;

  v_is_shared := COALESCE(v_room.shared_schema_version, 0) = 1;

  IF v_is_shared THEN
    IF COALESCE(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'ROOM_NOT_STARTED',
        'message', 'Room must be started before opening a Ludo session.'
      );
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'ROOM_NOT_ACTIVE',
        'message', 'Room must be active before opening a Ludo session.'
      );
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id
        AND m.seat_index IS NOT NULL
        AND m.wallet_state IS DISTINCT FROM 'committed'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'SEATED_ENTRY_NOT_CONFIRMED',
        'message', 'All seated players must complete room entry requirements before opening the session.'
      );
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.ov2_ludo_sessions
  WHERE id = public.ov2_ludo_primary_session_id(p_room_id)
    AND room_id = p_room_id
    AND status = 'live';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'snapshot', public.ov2_ludo_build_client_snapshot(v_existing, v_pk)
    );
  END IF;

  SELECT count(*)::int INTO v_seated_count
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_seated_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;
  IF v_seated_count > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Ludo supports at most four seated members');
  END IF;

  SELECT array_agg(m.seat_index ORDER BY m.seat_index ASC)
  INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL;

  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  v_board := public.ov2_ludo_initial_board_json(v_active);

  INSERT INTO public.ov2_ludo_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, dice_value, last_dice, winner_seat, active_seats,
    current_turn, turn_deadline, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_board,
    (v_board ->> 'turnSeat')::int,
    NULL,
    NULL,
    NULL,
    v_active,
    (v_board ->> 'turnSeat')::int,
    now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))),
    jsonb_build_object(
      '__entry__', v_room.stake_per_seat,
      '__double__', jsonb_build_object('value', 1, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL),
      '__result__', NULL
    )
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_ludo_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET
    active_session_id = v_sess.id,
    active_runtime_id = v_sess.id,
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_open_session(uuid, text, text) TO anon, authenticated, service_role;

COMMIT;

