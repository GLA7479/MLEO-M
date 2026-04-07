-- OV2 MeldMatch: ping-pong double offers + per-seat initiation caps (align with FourLine 107).
-- canOfferDouble remains gated to turnPhase = 'draw' (product rule) with ping-pong layered on top.
-- Apply after 120_ov2_meldmatch_rpcs_actions.sql (or latest meldmatch migration).
-- Requires 112_ov2_shared_stake_commit_max_liability.sql (`ov2_shared_require_max_double_liability_for_open_session`).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_build_client_snapshot(
  p_session public.ov2_meldmatch_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_my int;
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_ps jsonb;
  v_pub jsonb;
  v_phase text;
  v_mult int;
  v_pd jsonb;
  v_can_offer boolean := false;
  v_can_resp boolean := false;
  v_dacc int;
  v_td bigint;
  v_playing boolean;
  v_opp int;
  v_my_hand jsonb;
  v_opp_hand jsonb;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_meldmatch_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine e WHERE e.session_id = p_session.id;
  IF NOT FOUND THEN
    v_eng.stock := '[]'::jsonb;
    v_eng.discard := '[]'::jsonb;
    v_eng.hand0 := '[]'::jsonb;
    v_eng.hand1 := '[]'::jsonb;
  END IF;
  v_phase := p_session.phase;
  v_pub := COALESCE(p_session.public_state, '{}'::jsonb);
  v_ps := COALESCE(p_session.parity_state, '{}'::jsonb);
  v_mult := public.ov2_mm_parity_stake_mult(v_ps);
  v_pd := v_ps -> 'pending_double';
  IF v_pd IS NULL OR jsonb_typeof(v_pd) <> 'object' THEN
    v_pd := NULL;
  END IF;
  v_playing := p_session.status = 'live' AND v_phase = 'playing';
  IF v_playing AND v_pd IS NOT NULL AND v_my IS NOT NULL THEN
    BEGIN
      IF (v_pd ->> 'responder_seat')::int IS NOT DISTINCT FROM v_my THEN
        v_can_resp := true;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_can_resp := false;
    END;
  END IF;
  v_dacc := COALESCE((v_ps ->> 'doubles_accepted')::int, 0);
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

  IF v_playing AND v_pd IS NULL AND v_my IS NOT NULL
     AND (v_pub ->> 'turnSeat')::int IS NOT DISTINCT FROM v_my
     AND COALESCE(v_pub ->> 'turnPhase', '') = 'draw' THEN
    IF v_mult < 16 AND v_dacc < 4 THEN
      IF (v_my = 0 AND v_ic0 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 0))
         OR (v_my = 1 AND v_ic1 < 2 AND (v_last_init IS NULL OR v_last_init IS DISTINCT FROM 1)) THEN
        v_can_offer := true;
      END IF;
    END IF;
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
  v_my_hand := 'null'::jsonb;
  v_opp_hand := 'null'::jsonb;
  IF v_my IS NOT NULL THEN
    IF v_phase = 'layoff' OR v_phase = 'finished' THEN
      v_my_hand := CASE WHEN v_my = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;
      v_opp_hand := CASE WHEN v_my = 0 THEN v_eng.hand1 ELSE v_eng.hand0 END;
    ELSE
      v_my_hand := CASE WHEN v_my = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;
    END IF;
  END IF;
  v_opp := CASE WHEN v_my = 0 THEN 1 WHEN v_my = 1 THEN 0 ELSE NULL END;
  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', v_phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'public', v_pub,
    'myHand', v_my_hand,
    'opponentHandRevealed', CASE WHEN v_phase IN ('layoff', 'finished') THEN v_opp_hand ELSE NULL::jsonb END,
    'layoffMelds', CASE WHEN v_eng.layoff_melds IS NOT NULL THEN v_eng.layoff_melds ELSE 'null'::jsonb END,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'stakeMultiplier', to_jsonb(v_mult),
    'doublesAccepted', to_jsonb(v_dacc),
    'pendingDouble', COALESCE(to_jsonb(v_pd), 'null'::jsonb),
    'canOfferDouble', v_can_offer,
    'mustRespondDouble', v_can_resp,
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'missedTurns', COALESCE(v_ps -> 'missed_turns', jsonb_build_object('0', 0, '1', 0)),
    'result', v_ps -> '__result__',
    'opponentHandCount',
      CASE
        WHEN v_opp IS NULL THEN NULL::jsonb
        WHEN v_phase IN ('layoff', 'finished') THEN NULL::jsonb
        ELSE to_jsonb(public.ov2_mm_jsonb_len(CASE WHEN v_opp = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END))
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_offer_double(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_meldmatch_sessions%ROWTYPE;
  v_seat int;
  v_pub jsonb;
  v_turn int;
  v_tp text;
  v_ps jsonb;
  v_mult int;
  v_prop int;
  v_other int;
  v_dacc int;
  v_deadline bigint;
  v_ic0 int;
  v_ic1 int;
  v_last_init int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not playing');
  END IF;
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'A stake increase is already pending');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_meldmatch_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_tp := COALESCE(v_pub ->> 'turnPhase', '');
  IF v_turn IS DISTINCT FROM v_seat OR v_tp IS DISTINCT FROM 'draw' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Stake offers only at the start of your turn');
  END IF;

  v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
  v_mult := public.ov2_mm_parity_stake_mult(v_ps);
  v_dacc := COALESCE((v_ps ->> 'doubles_accepted')::int, 0);
  IF v_dacc >= 4 OR v_mult >= 16 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
  END IF;

  v_ic0 := COALESCE((v_ps ->> 'double_init_0')::int, 0);
  v_ic1 := COALESCE((v_ps ->> 'double_init_1')::int, 0);
  IF v_seat = 0 AND v_ic0 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
  END IF;
  IF v_seat = 1 AND v_ic1 >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake increases reached');
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
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MORE_DOUBLES', 'message', 'Maximum stake multiplier is 16');
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

  UPDATE public.ov2_meldmatch_sessions
  SET
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_open_session(
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
  v_sess public.ov2_meldmatch_sessions%ROWTYPE;
  v_existing public.ov2_meldmatch_sessions%ROWTYPE;
  v_seated_count int;
  v_entry bigint;
  v_ps jsonb;
  v_pub jsonb;
  v_first int;
  v_deck jsonb;
  v_i int;
  v_h0 jsonb := '[]'::jsonb;
  v_h1 jsonb := '[]'::jsonb;
  v_disc jsonb := '[]'::jsonb;
  v_stock jsonb := '[]'::jsonb;
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_turn_phase text := 'draw';
  v_guard jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM COALESCE(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a MeldMatch room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a MeldMatch session');
  END IF;
  IF COALESCE(v_room.shared_schema_version, 0) = 1 THEN
    IF COALESCE(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_meldmatch_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase IN ('playing', 'layoff') THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_meldmatch_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated_count
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated_count IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'MeldMatch requires exactly two seated players');
  END IF;
  IF (
    SELECT array_agg(m.seat_index ORDER BY m.seat_index)
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ) IS DISTINCT FROM ARRAY[0, 1]::integer[] THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_ASSIGNMENT', 'message', 'Seats must be 0 and 1');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'Both players must commit stakes');
  END IF;

  SELECT public.ov2_shared_require_max_double_liability_for_open_session(p_room_id) INTO v_guard;
  IF (v_guard->>'ok')::boolean IS NOT TRUE THEN
    RETURN v_guard;
  END IF;

  SELECT jsonb_agg(j ORDER BY r) INTO v_deck
  FROM (SELECT to_jsonb(c) AS j, random() AS r FROM generate_series(0, 51) AS g(c)) s;

  FOR v_i IN 0..9 LOOP
    v_h0 := v_h0 || (v_deck -> v_i);
  END LOOP;
  FOR v_i IN 10..19 LOOP
    v_h1 := v_h1 || (v_deck -> v_i);
  END LOOP;
  v_disc := v_disc || (v_deck -> 20);
  FOR v_i IN 21..51 LOOP
    v_stock := v_stock || (v_deck -> v_i);
  END LOOP;

  v_first := CASE WHEN random() < 0.5 THEN 0 ELSE 1 END;
  v_entry := COALESCE(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'stake_multiplier', 1,
    'doubles_accepted', 0,
    'double_init_0', 0,
    'double_init_1', 0,
    'turn_deadline_at', (extract(epoch from now()) * 1000)::bigint + 30000,
    'turn_deadline_seat', to_jsonb(v_first),
    'missed_turns', jsonb_build_object('0', 0, '1', 0)
  );

  v_eng.stock := v_stock;
  v_eng.discard := v_disc;
  v_eng.hand0 := v_h0;
  v_eng.hand1 := v_h1;
  v_eng.layoff_melds := NULL;
  v_pub := public.ov2_meldmatch_compute_public_core(v_eng, v_first, v_turn_phase, 'playing', '{}'::jsonb);

  INSERT INTO public.ov2_meldmatch_sessions (
    room_id, match_seq, status, phase, revision, turn_seat, winner_seat, active_seats, public_state, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_first,
    NULL,
    ARRAY[0, 1]::integer[],
    v_pub,
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_meldmatch_engine (session_id, stock, discard, hand0, hand1, layoff_melds)
  VALUES (v_sess.id, v_stock, v_disc, v_h0, v_h1, NULL);

  INSERT INTO public.ov2_meldmatch_seats (session_id, seat_index, participant_key, room_member_id, meta)
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

  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_build_client_snapshot(public.ov2_meldmatch_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_build_client_snapshot(public.ov2_meldmatch_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_offer_double(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_offer_double(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_open_session(uuid, text, text) TO anon, authenticated, service_role;

COMMIT;
