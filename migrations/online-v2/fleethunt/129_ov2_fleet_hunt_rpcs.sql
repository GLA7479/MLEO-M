-- Fleet Hunt: snapshots, open session, placement, battle shots, doubles.
-- Apply after 128_ov2_fleet_hunt_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_build_client_snapshot(
  p_session public.ov2_fleet_hunt_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_my int;
  v_eng public.ov2_fleet_hunt_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_ships jsonb;
  v_td bigint;
  v_pd jsonb;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_fleet_hunt_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  SELECT * INTO v_eng FROM public.ov2_fleet_hunt_engine e WHERE e.session_id = p_session.id;
  IF NOT FOUND THEN
    v_eng.ships0 := '[]'::jsonb;
    v_eng.ships1 := '[]'::jsonb;
  END IF;
  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);
  v_ships := '[]'::jsonb;
  IF v_my = 0 THEN
    v_ships := v_eng.ships0;
  ELSIF v_my = 1 THEN
    v_ships := v_eng.ships1;
  END IF;
  v_td := NULL;
  IF v_ps ? 'turn_deadline_at' THEN
    BEGIN
      v_td := (v_ps ->> 'turn_deadline_at')::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_td := NULL;
    END;
  END IF;
  v_pd := NULL;
  IF v_ps ? 'pending_double' THEN
    v_pd := v_ps -> 'pending_double';
  END IF;
  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'playerCount', p_session.player_count,
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'public', v_pub,
    'myShips', v_ships,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'turnSeat', CASE WHEN p_session.turn_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.turn_seat) END,
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'stakeMultiplier', to_jsonb(public.ov2_fh_parity_stake_mult(v_ps)),
    'doublesAccepted', coalesce((v_ps ->> 'doubles_accepted')::int, 0),
    'pendingDouble', v_pd,
    'missedTurns', coalesce(v_ps -> 'missed_turns', '{}'::jsonb),
    'placementMissed', coalesce(v_ps -> 'placement_missed', '{}'::jsonb),
    'placementDl', coalesce(v_ps -> 'placement_dl', '{}'::jsonb),
    'result', v_ps -> '__result__'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_open_session(
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
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_existing public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seated int;
  v_entry bigint;
  v_ps jsonb;
  v_pub jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(coalesce(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM coalesce(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Fleet Hunt room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;
  IF coalesce(v_room.shared_schema_version, 0) = 1 THEN
    IF coalesce(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_fleet_hunt_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase IN ('placement', 'battle') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Fleet Hunt needs exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  v_entry := coalesce(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'stake_multiplier', 1,
    'doubles_accepted', 0,
    'missed_turns', jsonb_build_object('0', 0, '1', 0)
  );
  v_ps := public.ov2_fh_init_placement_deadlines(v_ps);

  v_pub := jsonb_build_object(
    'lock0', false,
    'lock1', false,
    'shots0', '[]'::jsonb,
    'shots1', '[]'::jsonb
  );

  INSERT INTO public.ov2_fleet_hunt_sessions (
    room_id, match_seq, status, phase, revision, turn_seat, winner_seat, active_seats, player_count, public_state, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'placement',
    0,
    NULL,
    NULL,
    ARRAY[0, 1]::integer[],
    2,
    v_pub,
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_fleet_hunt_engine (session_id, ships0, ships1)
  VALUES (v_sess.id, '[]'::jsonb, '[]'::jsonb);

  INSERT INTO public.ov2_fleet_hunt_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index::int,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, active_runtime_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_get_snapshot(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_submit_placement(
  p_room_id uuid,
  p_participant_key text,
  p_ships jsonb,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_fleet_hunt_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_val jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_ships IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'placement' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Not in placement');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF v_seat = 0 AND coalesce((v_pub ->> 'lock0')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOCKED', 'message', 'Placement already locked');
  END IF;
  IF v_seat = 1 AND coalesce((v_pub ->> 'lock1')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LOCKED', 'message', 'Placement already locked');
  END IF;
  v_val := public.ov2_fh_validate_fleet(p_ships);
  IF coalesce((v_val ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', coalesce(v_val ->> 'code', 'INVALID'), 'message', coalesce(v_val ->> 'message', 'Invalid fleet'));
  END IF;
  SELECT * INTO v_eng FROM public.ov2_fleet_hunt_engine WHERE session_id = v_sess.id FOR UPDATE;
  IF v_seat = 0 THEN
    UPDATE public.ov2_fleet_hunt_engine SET ships0 = p_ships WHERE session_id = v_sess.id;
  ELSE
    UPDATE public.ov2_fleet_hunt_engine SET ships1 = p_ships WHERE session_id = v_sess.id;
  END IF;
  v_ps := public.ov2_fh_bump_placement_for_seat(v_sess.parity_state, v_seat);
  UPDATE public.ov2_fleet_hunt_sessions
  SET parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_random_placement(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_f jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'placement' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Not in placement');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_f := public.ov2_fh_random_fleet();
  IF public.ov2_fh_jsonb_len(v_f) <> 5 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RANDOM_FAIL', 'message', 'Could not generate layout; try again');
  END IF;
  IF v_seat = 0 THEN
    UPDATE public.ov2_fleet_hunt_engine SET ships0 = v_f WHERE session_id = v_sess.id;
  ELSE
    UPDATE public.ov2_fleet_hunt_engine SET ships1 = v_f WHERE session_id = v_sess.id;
  END IF;
  UPDATE public.ov2_fleet_hunt_sessions
  SET
    parity_state = public.ov2_fh_bump_placement_for_seat(v_sess.parity_state, v_seat),
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_lock_placement(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_fleet_hunt_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_ships jsonb;
  v_val jsonb;
  v_first int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'placement' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Not in placement');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF v_seat = 0 AND coalesce((v_pub ->> 'lock0')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF v_seat = 1 AND coalesce((v_pub ->> 'lock1')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
  END IF;
  SELECT * INTO v_eng FROM public.ov2_fleet_hunt_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_ships := CASE WHEN v_seat = 0 THEN v_eng.ships0 ELSE v_eng.ships1 END;
  v_val := public.ov2_fh_validate_fleet(v_ships);
  IF coalesce((v_val ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'code', coalesce(v_val ->> 'code', 'INVALID'), 'message', coalesce(v_val ->> 'message', 'Complete your fleet first'));
  END IF;
  IF v_seat = 0 THEN
    v_pub := jsonb_set(v_pub, '{lock0}', 'true'::jsonb, true);
  ELSE
    v_pub := jsonb_set(v_pub, '{lock1}', 'true'::jsonb, true);
  END IF;
  v_ps := public.ov2_fh_bump_placement_for_seat(v_sess.parity_state, v_seat);
  IF coalesce((v_pub ->> 'lock0')::boolean, false) AND coalesce((v_pub ->> 'lock1')::boolean, false) THEN
    v_first := (floor(random() * 2))::int;
    UPDATE public.ov2_fleet_hunt_sessions
    SET
      public_state = v_pub,
      parity_state = public.ov2_fh_bump_battle_timer(v_ps, v_first, NULL),
      phase = 'battle',
      turn_seat = v_first,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  ELSE
    UPDATE public.ov2_fleet_hunt_sessions
    SET
      public_state = v_pub,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_offer_double(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_pub jsonb;
  v_ps jsonb;
  v_turn int;
  v_mult int;
  v_dacc int;
  v_prop int;
  v_other int;
  v_deadline bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'battle' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_BATTLE', 'message', 'Doubles only after battle starts');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  IF v_ps ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A double is already pending');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_turn := v_sess.turn_seat;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Only the active player may offer a double');
  END IF;
  v_mult := public.ov2_fh_parity_stake_mult(v_ps);
  v_dacc := coalesce((v_ps ->> 'doubles_accepted')::int, 0);
  IF v_dacc >= 4 OR v_mult >= 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum doubles reached');
  END IF;
  v_prop := v_mult * 2;
  IF v_prop > 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum multiplier is 16');
  END IF;
  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_deadline := (extract(epoch from now()) * 1000)::bigint + 30000;
  v_ps := jsonb_set(
    v_ps,
    '{pending_double}',
    jsonb_build_object(
      'from_seat', v_seat,
      'responder_seat', v_other,
      'proposed_mult', v_prop,
      'deadline_ms', v_deadline
    ),
    true
  );
  v_ps := jsonb_set(v_ps, '{turn_deadline_at}', to_jsonb(v_deadline), true);
  v_ps := jsonb_set(v_ps, '{turn_deadline_seat}', to_jsonb(v_other), true);
  UPDATE public.ov2_fleet_hunt_sessions
  SET parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_respond_double(
  p_room_id uuid,
  p_participant_key text,
  p_accept boolean,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_ps jsonb;
  v_pd jsonb;
  v_from int;
  v_resp int;
  v_prop int;
  v_mult int;
  v_entry bigint;
  v_dacc int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'battle' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_BATTLE', 'message', 'Not in battle');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  IF NOT (v_ps ? 'pending_double') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_PENDING_DOUBLE', 'message', 'Nothing to respond to');
  END IF;
  v_pd := v_ps -> 'pending_double';
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_resp := (v_pd ->> 'responder_seat')::int;
  v_from := (v_pd ->> 'from_seat')::int;
  v_prop := (v_pd ->> 'proposed_mult')::int;
  IF v_seat IS DISTINCT FROM v_resp THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_RESPONDER', 'message', 'Only the challenged player can respond');
  END IF;
  IF coalesce(p_accept, false) THEN
    v_dacc := coalesce((v_ps ->> 'doubles_accepted')::int, 0) + 1;
    v_ps := v_ps - 'pending_double';
    v_ps := jsonb_set(v_ps, '{stake_multiplier}', to_jsonb(v_prop), true);
    v_ps := jsonb_set(v_ps, '{doubles_accepted}', to_jsonb(v_dacc), true);
    v_ps := public.ov2_fh_bump_battle_timer(v_ps, v_from, v_from);
    UPDATE public.ov2_fleet_hunt_sessions
    SET parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
  END IF;
  v_mult := public.ov2_fh_parity_stake_mult(v_ps);
  v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
  v_ps := v_ps - 'pending_double';
  v_ps := jsonb_set(
    v_ps,
    '{__result__}',
    jsonb_build_object(
      'winner', v_from,
      'prize', v_entry * 2 * v_mult,
      'lossPerSeat', v_entry * v_mult,
      'stakeMultiplier', v_mult,
      'double_declined', true,
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ),
    true
  );
  UPDATE public.ov2_fleet_hunt_sessions
  SET
    phase = 'finished',
    winner_seat = v_from,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_fleet_hunt_fire_shot(
  p_room_id uuid,
  p_participant_key text,
  p_r int,
  p_c int,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_fleet_hunt_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_fleet_hunt_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_turn int;
  v_opp int;
  v_opp_ships jsonb;
  v_my_shots jsonb;
  v_res jsonb;
  v_shot jsonb;
  v_won boolean;
  v_other int;
  v_mult bigint;
  v_entry bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_fleet_hunt' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_fleet_hunt_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'battle' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_BATTLE', 'message', 'Not in battle');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  IF v_ps ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Respond to the double first');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_fleet_hunt_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_turn := v_sess.turn_seat;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to fire');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  SELECT * INTO v_eng FROM public.ov2_fleet_hunt_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_opp := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_opp_ships := CASE WHEN v_opp = 0 THEN v_eng.ships0 ELSE v_eng.ships1 END;
  IF v_seat = 0 THEN
    v_my_shots := coalesce(v_pub -> 'shots0', '[]'::jsonb);
  ELSE
    v_my_shots := coalesce(v_pub -> 'shots1', '[]'::jsonb);
  END IF;
  v_res := public.ov2_fh_apply_shot(v_opp_ships, v_my_shots, p_r, p_c);
  IF coalesce((v_res ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', coalesce(v_res ->> 'code', 'BAD_SHOT'),
      'message', coalesce(v_res ->> 'message', 'Shot rejected')
    );
  END IF;
  v_shot := v_res -> 'shot';
  v_won := coalesce((v_res ->> 'all_opponent_sunk')::boolean, false);
  IF v_seat = 0 THEN
    v_pub := jsonb_set(v_pub, '{shots0}', coalesce(v_pub -> 'shots0', '[]'::jsonb) || jsonb_build_array(v_shot), true);
  ELSE
    v_pub := jsonb_set(v_pub, '{shots1}', coalesce(v_pub -> 'shots1', '[]'::jsonb) || jsonb_build_array(v_shot), true);
  END IF;
  IF v_won THEN
    v_mult := public.ov2_fh_parity_stake_mult(v_ps);
    v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'winner', v_seat,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'sinkout', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_fleet_hunt_sessions
    SET
      public_state = v_pub,
      phase = 'finished',
      winner_seat = v_seat,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
  END IF;
  v_other := v_opp;
  v_ps := public.ov2_fh_bump_battle_timer(v_ps, v_other, v_seat);
  UPDATE public.ov2_fleet_hunt_sessions
  SET
    public_state = v_pub,
    turn_seat = v_other,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_build_client_snapshot(public.ov2_fleet_hunt_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_build_client_snapshot(public.ov2_fleet_hunt_sessions, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_open_session(uuid, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_get_snapshot(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_submit_placement(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_submit_placement(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_random_placement(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_random_placement(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_lock_placement(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_lock_placement(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_respond_double(uuid, text, boolean, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_respond_double(uuid, text, boolean, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_fire_shot(uuid, text, int, int, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_fire_shot(uuid, text, int, int, bigint) TO anon, authenticated, service_role;

COMMIT;
