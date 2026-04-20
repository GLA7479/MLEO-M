-- OV2 Snakes & Ladders: forfeit committed stake + leave_game (mid-match elimination). Apply after 153.

BEGIN;

CREATE OR REPLACE FUNCTION public._ov2_snakes_forfeit_seat_stake(
  p_room_id uuid,
  p_participant_key text,
  p_session_id uuid,
  p_match_seq integer,
  p_entry bigint,
  p_idempotency_suffix text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_amt bigint;
  v_take bigint;
  v_cur_lock bigint;
  v_idem text;
  v_ins uuid;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_session_id IS NULL THEN
    RETURN;
  END IF;

  v_amt := GREATEST(COALESCE(p_entry, 0), 0);
  IF v_amt <= 0 THEN
    RETURN;
  END IF;

  PERFORM 1
  FROM public.ov2_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_cur_lock := (
    SELECT COALESCE(m.amount_locked, 0)
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key = v_pk
    FOR UPDATE
  );

  IF v_cur_lock IS NULL THEN
    RETURN;
  END IF;

  v_take := LEAST(GREATEST(v_cur_lock, 0), v_amt);

  v_idem := 'ov2_snakes_forfeit:' || p_session_id::text || ':' || v_pk || ':' || trim(COALESCE(p_idempotency_suffix, ''));

  INSERT INTO public.ov2_economy_events (
    room_id,
    participant_key,
    event_kind,
    amount,
    match_seq,
    idempotency_key,
    payload
  ) VALUES (
    p_room_id,
    v_pk,
    'forfeit',
    v_take,
    p_match_seq,
    v_idem,
    jsonb_build_object(
      'kind', 'ov2_snakes_leave',
      'session_id', p_session_id,
      'committedLiabilityExpected', v_amt,
      'note', 'Snakes V1: multiplier 1; forfeit on leave mid-match.'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING
  RETURNING id INTO v_ins;

  IF v_ins IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.ov2_room_members m
  SET
    amount_locked = GREATEST(0, COALESCE(m.amount_locked, 0) - v_take),
    updated_at = now()
  WHERE m.room_id = p_room_id
    AND m.participant_key = v_pk;

  UPDATE public.ov2_rooms
  SET
    pot_locked = GREATEST(0, COALESCE(pot_locked, 0) - v_take),
    updated_at = now()
  WHERE id = p_room_id;
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_snakes_forfeit_seat_stake(uuid, text, uuid, integer, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ov2_snakes_forfeit_seat_stake(uuid, text, uuid, integer, bigint, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_leave_game(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_room_product_game_id text;
  v_active_session_id uuid;
  v_room_match_seq integer;
  v_room_stake_per_seat bigint;

  v_session_phase text;
  v_session_revision bigint;
  v_session_board jsonb;
  v_session_active int[];

  v_seat int;
  v_active int[];
  v_board jsonb;
  v_winner_seat int;
  v_entry bigint;
  v_turn int;
  v_next_turn int;
  v_snapshot jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  PERFORM 1
  FROM public.ov2_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session not found');
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  v_active_session_id := (
    SELECT r.active_session_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  v_room_match_seq := (
    SELECT r.match_seq
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  v_room_stake_per_seat := (
    SELECT COALESCE(r.stake_per_seat, 0)
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders'
     OR v_active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session not found');
  END IF;

  PERFORM 1
  FROM public.ov2_snakes_sessions s
  WHERE s.id = v_active_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;

  v_session_phase := (
    SELECT s.phase
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  IF v_session_phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;

  v_session_revision := (
    SELECT s.revision
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_board := (
    SELECT COALESCE(s.board, '{}'::jsonb)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_session_active := (
    SELECT COALESCE(s.active_seats, ARRAY[]::int[])
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
  );

  v_seat := (
    SELECT s.seat_index
    FROM public.ov2_snakes_seats s
    WHERE s.session_id = v_active_session_id
      AND s.participant_key = v_pk
    LIMIT 1
  );

  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;

  v_entry := COALESCE(v_room_stake_per_seat, 0);

  PERFORM public._ov2_snakes_forfeit_seat_stake(
    p_room_id,
    v_pk,
    v_active_session_id,
    v_room_match_seq,
    v_entry,
    'leave:' || COALESCE(v_session_revision, 0)::text || ':seat:' || v_seat::text
  );

  DELETE FROM public.ov2_snakes_seats
  WHERE session_id = v_active_session_id
    AND seat_index = v_seat
    AND participant_key = v_pk;

  v_active := array_remove(COALESCE(v_session_active, ARRAY[]::int[]), v_seat);
  v_board := COALESCE(v_session_board, '{}'::jsonb);
  v_board := jsonb_set(v_board, '{activeSeats}', to_jsonb(v_active), true);
  v_board := jsonb_set(v_board, '{positions}', COALESCE(v_board -> 'positions', '{}'::jsonb) - v_seat::text, true);
  v_turn := (v_board ->> 'turnSeat')::int;

  IF cardinality(v_active) <= 1 THEN
    IF cardinality(v_active) = 1 THEN
      v_winner_seat := v_active[1];
      v_board := jsonb_set(
        v_board,
        '{result}',
        jsonb_build_object(
          'winnerSeat', v_winner_seat,
          'forfeitBy', v_pk,
          'kind', 'win',
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      );

      UPDATE public.ov2_snakes_sessions
      SET
        board = v_board,
        active_seats = v_active,
        winner_seat = v_winner_seat,
        phase = 'finished',
        current_turn = v_winner_seat,
        last_roll = NULL,
        revision = COALESCE(v_session_revision, 0) + 1,
        updated_at = now()
      WHERE id = v_active_session_id;
    ELSE
      UPDATE public.ov2_snakes_sessions
      SET
        board = v_board,
        active_seats = v_active,
        phase = 'finished',
        winner_seat = NULL,
        revision = COALESCE(v_session_revision, 0) + 1,
        updated_at = now()
      WHERE id = v_active_session_id;
    END IF;

    v_snapshot := (
      SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
      FROM public.ov2_snakes_sessions s
      WHERE s.id = v_active_session_id
      LIMIT 1
    );

    RETURN jsonb_build_object('ok', true, 'finished', true, 'snapshot', v_snapshot);
  END IF;

  IF v_turn IS NOT DISTINCT FROM v_seat THEN
    v_next_turn := public._ov2_snakes_next_turn_seat(v_active, v_seat);
    IF v_next_turn IS NULL THEN
      v_next_turn := v_active[1];
    END IF;
  ELSE
    v_next_turn := v_turn;
    IF NOT (v_next_turn = ANY(v_active)) THEN
      v_next_turn := v_active[1];
    END IF;
  END IF;

  v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_next_turn), true);

  UPDATE public.ov2_snakes_sessions
  SET
    board = v_board,
    active_seats = v_active,
    current_turn = v_next_turn,
    revision = COALESCE(v_session_revision, 0) + 1,
    updated_at = now()
  WHERE id = v_active_session_id;

  v_snapshot := (
    SELECT public.ov2_snakes_build_client_snapshot(s, v_pk)
    FROM public.ov2_snakes_sessions s
    WHERE s.id = v_active_session_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'finished', false, 'snapshot', v_snapshot);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_leave_game(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_leave_game(uuid, text) TO anon, authenticated, service_role;

COMMIT;
