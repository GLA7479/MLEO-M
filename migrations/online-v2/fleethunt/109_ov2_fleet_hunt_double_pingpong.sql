-- OV2 Fleet Hunt: ping-pong double offers + per-seat initiation caps (align with FourLine 107).
-- Apply after 130_ov2_fleet_hunt_rpcs_actions.sql (or latest fleet hunt migration).
-- Requires 112_ov2_shared_stake_commit_max_liability.sql (`ov2_shared_require_max_double_liability_for_open_session`).

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
  v_turn int;
  v_playing_battle boolean;
  v_mult int;
  v_dacc int;
  v_can_offer boolean := false;
  v_can_resp boolean := false;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
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

  v_turn := p_session.turn_seat;
  v_playing_battle := p_session.status = 'live' AND p_session.phase = 'battle' AND p_session.winner_seat IS NULL;

  v_mult := public.ov2_fh_parity_stake_mult(v_ps);
  v_dacc := coalesce((v_ps ->> 'doubles_accepted')::int, 0);

  IF v_playing_battle AND v_pd IS NOT NULL AND v_my IS NOT NULL THEN
    BEGIN
      IF (v_pd ->> 'responder_seat')::int IS NOT DISTINCT FROM v_my THEN
        v_can_resp := true;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_can_resp := false;
    END;
  END IF;

  v_ic0 := COALESCE((v_ps ->> 'double_init_0')::int, 0);
  v_ic1 := COALESCE((v_ps ->> 'double_init_1')::int, 0);
  v_last_init := NULL;
  IF v_ps ? 'last_double_initiator_seat' THEN
    BEGIN
      v_last_init := (v_ps ->> 'last_double_initiator_seat')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_last_init := NULL;
    END;
  END IF;

  IF v_playing_battle AND v_pd IS NULL AND v_my IS NOT NULL AND v_turn IN (0, 1) AND v_my IS NOT DISTINCT FROM v_turn THEN
    IF v_mult < 16 AND v_dacc < 4 THEN
      IF (v_my = 0 AND v_ic0 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 0))
         OR (v_my = 1 AND v_ic1 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 1)) THEN
        v_can_offer := true;
      END IF;
    END IF;
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
    'stakeMultiplier', to_jsonb(v_mult),
    'doublesAccepted', v_dacc,
    'pendingDouble', v_pd,
    'canOfferDouble', v_can_offer,
    'mustRespondDouble', v_can_resp,
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
  v_guard jsonb;
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

  SELECT public.ov2_shared_require_max_double_liability_for_open_session(p_room_id) INTO v_guard;
  IF (v_guard->>'ok')::boolean IS NOT TRUE THEN
    RETURN v_guard;
  END IF;

  v_entry := coalesce(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'stake_multiplier', 1,
    'doubles_accepted', 0,
    'double_init_0', 0,
    'double_init_1', 0,
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
  v_ps jsonb;
  v_turn int;
  v_mult int;
  v_dacc int;
  v_prop int;
  v_other int;
  v_deadline bigint;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
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

  v_ic0 := COALESCE((v_ps ->> 'double_init_0')::int, 0);
  v_ic1 := COALESCE((v_ps ->> 'double_init_1')::int, 0);
  IF v_seat = 0 AND v_ic0 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum doubles reached');
  END IF;
  IF v_seat = 1 AND v_ic1 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum doubles reached');
  END IF;

  v_last_init := NULL;
  IF v_ps ? 'last_double_initiator_seat' THEN
    BEGIN
      v_last_init := (v_ps ->> 'last_double_initiator_seat')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_last_init := NULL;
    END;
  END IF;
  IF v_last_init IS NOT NULL AND v_last_init = v_seat THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DOUBLE_NOT_ALTERNATING',
      'message', 'Wait for your opponent to propose a stake increase before you can propose again'
    );
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
  v_ps := jsonb_set(v_ps, '{last_double_initiator_seat}', to_jsonb(v_seat), true);
  IF v_seat = 0 THEN
    v_ps := jsonb_set(v_ps, '{double_init_0}', to_jsonb(v_ic0 + 1), true);
  ELSE
    v_ps := jsonb_set(v_ps, '{double_init_1}', to_jsonb(v_ic1 + 1), true);
  END IF;
  UPDATE public.ov2_fleet_hunt_sessions
  SET parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_fleet_hunt_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_build_client_snapshot(public.ov2_fleet_hunt_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_build_client_snapshot(public.ov2_fleet_hunt_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_fleet_hunt_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_fleet_hunt_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;

COMMIT;
