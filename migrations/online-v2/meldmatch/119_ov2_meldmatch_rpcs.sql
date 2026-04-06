-- MeldMatch RPCs: filtered snapshots, open, draw, discard, declare finish, layoff resolve.
-- Apply after 118_ov2_meldmatch_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_compute_public_core(
  p_eng public.ov2_meldmatch_engine%ROWTYPE,
  p_turn_seat int,
  p_turn_phase text,
  p_phase text,
  p_extra jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_st int;
  v_dc int;
  v_dt int;
  v_h0 int;
  v_h1 int;
BEGIN
  v_st := public.ov2_mm_jsonb_len(p_eng.stock);
  v_dc := public.ov2_mm_jsonb_len(p_eng.discard);
  v_dt := public.ov2_mm_jsonb_last_int(p_eng.discard);
  v_h0 := public.ov2_mm_jsonb_len(p_eng.hand0);
  v_h1 := public.ov2_mm_jsonb_len(p_eng.hand1);
  RETURN COALESCE(p_extra, '{}'::jsonb)
    || jsonb_build_object(
      'turnSeat', to_jsonb(p_turn_seat),
      'turnPhase', to_jsonb(p_turn_phase),
      'phase', to_jsonb(p_phase),
      'stockCount', to_jsonb(v_st),
      'discardCount', to_jsonb(v_dc),
      'discardTop', CASE WHEN v_dt IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_dt) END,
      'handSizes', jsonb_build_array(v_h0, v_h1)
    );
END;
$$;

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
  IF v_playing AND v_pd IS NULL AND v_my IS NOT NULL
     AND (v_pub ->> 'turnSeat')::int IS NOT DISTINCT FROM v_my
     AND COALESCE(v_pub ->> 'turnPhase', '') = 'draw' THEN
    IF v_mult < 16 AND v_dacc < 4 THEN
      v_can_offer := true;
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

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_get_snapshot(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_meldmatch_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a MeldMatch room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_draw(
  p_room_id uuid,
  p_participant_key text,
  p_source text,
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
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_pub jsonb;
  v_turn int;
  v_tp text;
  v_src text;
  v_card int;
  v_ps jsonb;
  v_new_hand jsonb;
  v_st int;
  v_dc int;
  v_mult int;
  v_base_entry bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  v_src := lower(trim(coalesce(p_source, '')));
  IF v_src NOT IN ('stock', 'discard') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SOURCE', 'message', 'source must be stock or discard');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Respond to stake offer first');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_meldmatch_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_tp := COALESCE(v_pub ->> 'turnPhase', '');
  IF v_turn IS DISTINCT FROM v_seat OR v_tp IS DISTINCT FROM 'draw' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_DRAW', 'message', 'Not your draw step');
  END IF;

  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_st := public.ov2_mm_jsonb_len(v_eng.stock);
  v_dc := public.ov2_mm_jsonb_len(v_eng.discard);

  IF v_src = 'stock' THEN
    IF v_st <= 0 THEN
      IF v_dc <= 0 THEN
        -- Stock exhaustion (v1): both empty => draw
        v_ps := COALESCE(v_sess.parity_state, '{}'::jsonb);
        v_mult := public.ov2_mm_parity_stake_mult(v_ps);
        v_base_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
        v_ps := jsonb_set(
          v_ps,
          '{__result__}',
          jsonb_build_object(
            'draw', true,
            'stockExhausted', true,
            'refundPerSeat', v_base_entry * v_mult,
            'stakeMultiplier', v_mult,
            'timestamp', (extract(epoch from now()) * 1000)::bigint
          ),
          true
        );
        SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id;
        v_pub := public.ov2_meldmatch_compute_public_core(
          v_eng,
          v_seat,
          'draw',
          'finished',
          COALESCE(v_sess.public_state, '{}'::jsonb)
        );
        UPDATE public.ov2_meldmatch_sessions
        SET
          phase = 'finished',
          winner_seat = NULL,
          public_state = v_pub,
          parity_state = v_ps,
          revision = v_sess.revision + 1,
          updated_at = now()
        WHERE id = v_sess.id
        RETURNING * INTO v_sess;
        RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
      END IF;
      RETURN jsonb_build_object('ok', false, 'code', 'STOCK_EMPTY', 'message', 'Stock empty — draw from discard if available');
    END IF;
    v_card := public.ov2_mm_jsonb_last_int(v_eng.stock);
    v_eng.stock := public.ov2_mm_jsonb_pop_last(v_eng.stock);
  ELSE
    IF v_dc <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'DISCARD_EMPTY', 'message', 'Discard pile is empty');
    END IF;
    v_card := public.ov2_mm_jsonb_last_int(v_eng.discard);
    v_eng.discard := public.ov2_mm_jsonb_pop_last(v_eng.discard);
  END IF;

  IF v_seat = 0 THEN
    v_new_hand := public.ov2_mm_jsonb_append_int(v_eng.hand0, v_card);
    v_eng.hand0 := v_new_hand;
  ELSE
    v_new_hand := public.ov2_mm_jsonb_append_int(v_eng.hand1, v_card);
    v_eng.hand1 := v_new_hand;
  END IF;

  UPDATE public.ov2_meldmatch_engine
  SET stock = v_eng.stock, discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1
  WHERE session_id = v_sess.id;

  v_ps := public.ov2_mm_parity_bump_timer(v_sess.parity_state, v_seat, v_seat);
  v_pub := public.ov2_meldmatch_compute_public_core(v_eng, v_seat, 'discard', 'playing', v_pub);

  UPDATE public.ov2_meldmatch_sessions
  SET public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_discard(
  p_room_id uuid,
  p_participant_key text,
  p_card int,
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
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_pub jsonb;
  v_turn int;
  v_tp text;
  v_ps jsonb;
  v_hand jsonb;
  v_i int;
  v_n int;
  v_c int;
  v_found boolean := false;
  v_new_hand jsonb := '[]'::jsonb;
  v_other int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_card IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Respond to stake offer first');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_meldmatch_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_tp := COALESCE(v_pub ->> 'turnPhase', '');
  IF v_turn IS DISTINCT FROM v_seat OR v_tp IS DISTINCT FROM 'discard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_DISCARD', 'message', 'Not your discard step');
  END IF;

  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_hand := CASE WHEN v_seat = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;
  v_n := public.ov2_mm_jsonb_len(v_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_c := (v_hand ->> v_i)::int;
    IF v_c IS NOT DISTINCT FROM p_card THEN
      v_found := true;
    ELSE
      v_new_hand := v_new_hand || to_jsonb(v_c);
    END IF;
  END LOOP;
  IF NOT v_found THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CARD_NOT_IN_HAND', 'message', 'Card not in hand');
  END IF;

  IF v_seat = 0 THEN
    v_eng.hand0 := v_new_hand;
  ELSE
    v_eng.hand1 := v_new_hand;
  END IF;
  v_eng.discard := public.ov2_mm_jsonb_append_int(v_eng.discard, p_card);

  UPDATE public.ov2_meldmatch_engine
  SET hand0 = v_eng.hand0, hand1 = v_eng.hand1, discard = v_eng.discard
  WHERE session_id = v_sess.id;

  v_other := 1 - v_seat;
  v_ps := public.ov2_mm_parity_bump_timer(v_sess.parity_state, v_other, v_seat);
  v_pub := public.ov2_meldmatch_compute_public_core(v_eng, v_other, 'draw', 'playing', v_pub);

  UPDATE public.ov2_meldmatch_sessions
  SET
    turn_seat = v_other,
    public_state = v_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_finalize_layoff_scoring(
  p_sess_id uuid,
  p_closer int,
  p_closer_dead int,
  p_pk text
)
RETURNS public.ov2_meldmatch_sessions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess public.ov2_meldmatch_sessions%ROWTYPE;
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_pub jsonb;
  v_opp int := 1 - p_closer;
  v_opp_hand jsonb;
  v_opp_pts int;
  v_w int;
  v_ps jsonb;
  v_entry bigint;
  v_mult bigint;
BEGIN
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = p_sess_id FOR UPDATE;
  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = p_sess_id FOR UPDATE;
  v_opp_hand := CASE WHEN v_opp = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;
  v_opp_pts := public.ov2_mm_deadwood_points_sum(v_opp_hand);
  -- Opponent wins if opp_pts <= closer_dead (ties → opponent)
  IF v_opp_pts > p_closer_dead THEN
    v_w := p_closer;
  ELSE
    v_w := v_opp;
  END IF;
  v_ps := v_sess.parity_state;
  v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
  v_mult := public.ov2_mm_parity_stake_mult(v_ps);
  v_ps := jsonb_set(
    v_ps,
    '{__result__}',
    jsonb_build_object(
      'winner', v_w,
      'prize', v_entry * 2 * v_mult,
      'lossPerSeat', v_entry * v_mult,
      'stakeMultiplier', v_mult,
      'closerDeadwood', p_closer_dead,
      'opponentDeadwoodAfterLayoff', v_opp_pts,
      'knockFinish', true,
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ),
    true
  );
  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = p_sess_id;
  v_pub := public.ov2_meldmatch_compute_public_core(
    v_eng,
    v_w,
    'draw',
    'finished',
    COALESCE(v_sess.public_state, '{}'::jsonb)
  );
  UPDATE public.ov2_meldmatch_sessions
  SET
    phase = 'finished',
    winner_seat = v_w,
    public_state = v_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = p_sess_id
  RETURNING * INTO v_sess;
  RETURN v_sess;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_declare_finish(
  p_room_id uuid,
  p_participant_key text,
  p_kind text,
  p_melds jsonb,
  p_deadwood jsonb,
  p_discard_card int,
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
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_pub jsonb;
  v_turn int;
  v_tp text;
  v_hand jsonb;
  v_ok boolean;
  v_err text;
  v_dw int;
  v_ps jsonb;
  v_other int;
  v_entry bigint;
  v_mult bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  IF COALESCE(v_sess.parity_state, '{}'::jsonb) ? 'pending_double' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DOUBLE_PENDING', 'message', 'Respond to stake offer first');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_meldmatch_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_tp := COALESCE(v_pub ->> 'turnPhase', '');
  IF v_turn IS DISTINCT FROM v_seat OR v_tp IS DISTINCT FROM 'discard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PHASE', 'message', 'Finish only after draw, during discard step with 11 cards');
  END IF;

  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_hand := CASE WHEN v_seat = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;

  SELECT t.ok, t.err, t.closer_deadwood_pts
  INTO v_ok, v_err, v_dw
  FROM public.ov2_mm_validate_finish_declaration(v_hand, p_melds, p_deadwood, p_discard_card, p_kind) AS t;

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_FINISH', 'message', coalesce(v_err, 'Invalid finish'));
  END IF;

  -- clear declarer hand (all 11 cards placed)
  IF v_seat = 0 THEN
    v_eng.hand0 := '[]'::jsonb;
  ELSE
    v_eng.hand1 := '[]'::jsonb;
  END IF;
  v_eng.discard := public.ov2_mm_jsonb_append_int(v_eng.discard, p_discard_card);

  IF lower(trim(p_kind)) = 'gin' THEN
    v_eng.layoff_melds := NULL;
    UPDATE public.ov2_meldmatch_engine
    SET hand0 = v_eng.hand0, hand1 = v_eng.hand1, discard = v_eng.discard, layoff_melds = NULL
    WHERE session_id = v_sess.id;

    SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id;
    v_pub := public.ov2_meldmatch_compute_public_core(v_eng, v_seat, 'draw', 'finished', COALESCE(v_sess.public_state, '{}'::jsonb));

    v_ps := v_sess.parity_state;
    v_entry := COALESCE((v_ps ->> '__entry__')::bigint, 0);
    v_mult := public.ov2_mm_parity_stake_mult(v_ps);
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'winner', v_seat,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'gin', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_meldmatch_sessions
    SET
      phase = 'finished',
      winner_seat = v_seat,
      turn_seat = v_seat,
      public_state = v_pub,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
  END IF;

  -- knock → layoff
  v_eng.layoff_melds := p_melds;
  UPDATE public.ov2_meldmatch_engine
  SET hand0 = v_eng.hand0, hand1 = v_eng.hand1, discard = v_eng.discard, layoff_melds = v_eng.layoff_melds
  WHERE session_id = v_sess.id;

  v_other := 1 - v_seat;
  v_ps := public.ov2_mm_parity_bump_timer(v_sess.parity_state, v_other, v_seat);
  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id;
  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb)
    || jsonb_build_object(
      'layoffCloserSeat', v_seat,
      'layoffCloserDeadwood', v_dw
    );
  v_pub := public.ov2_meldmatch_compute_public_core(v_eng, v_other, 'layoff', 'layoff', v_pub);

  UPDATE public.ov2_meldmatch_sessions
  SET
    phase = 'layoff',
    turn_seat = v_other,
    public_state = v_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_meldmatch_resolve_layoff(
  p_room_id uuid,
  p_participant_key text,
  p_assignments jsonb,
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
  v_eng public.ov2_meldmatch_engine%ROWTYPE;
  v_pub jsonb;
  v_turn int;
  v_closer int;
  v_dw int;
  v_lm jsonb;
  v_n int;
  v_i int;
  v_a jsonb;
  v_mi int;
  v_card int;
  v_meld jsonb;
  v_hand jsonb;
  v_new_hand jsonb;
  v_j int;
  v_nc int;
  v_found boolean;
  v_ps jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_meldmatch' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_meldmatch_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'layoff' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_LAYOFF', 'message', 'Not in layoff phase');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_meldmatch_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_pub := COALESCE(v_sess.public_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_closer := (v_pub ->> 'layoffCloserSeat')::int;
  v_dw := (v_pub ->> 'layoffCloserDeadwood')::int;
  IF v_turn IS DISTINCT FROM v_seat OR v_seat IS NOT DISTINCT FROM v_closer THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_LAYOFF_PLAYER', 'message', 'Only the non-closing player may lay off');
  END IF;

  SELECT * INTO v_eng FROM public.ov2_meldmatch_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_lm := v_eng.layoff_melds;
  IF v_lm IS NULL OR jsonb_typeof(v_lm) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_MELDS', 'message', 'Layoff melds missing');
  END IF;

  v_hand := CASE WHEN v_seat = 0 THEN v_eng.hand0 ELSE v_eng.hand1 END;
  v_lm := v_eng.layoff_melds;

  IF p_assignments IS NOT NULL AND jsonb_typeof(p_assignments) = 'array' THEN
    v_n := jsonb_array_length(p_assignments);
    FOR v_i IN 0..(v_n - 1) LOOP
      v_a := p_assignments -> v_i;
      v_mi := (v_a ->> 'meld_index')::int;
      v_card := (v_a ->> 'card_id')::int;
      IF v_mi < 0 OR v_mi >= jsonb_array_length(v_lm) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'BAD_MELD_INDEX', 'message', 'Invalid meld index');
      END IF;
      v_meld := v_lm -> v_mi;
      IF NOT public.ov2_mm_layoff_attachment_valid(v_meld, v_card) THEN
        RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_LAYOFF', 'message', 'Card cannot attach to that meld');
      END IF;
      v_found := false;
      v_new_hand := '[]'::jsonb;
      v_j := 0;
      v_nc := public.ov2_mm_jsonb_len(v_hand);
      FOR v_j IN 0..(v_nc - 1) LOOP
        IF NOT v_found AND (v_hand ->> v_j)::int IS NOT DISTINCT FROM v_card THEN
          v_found := true;
        ELSE
          v_new_hand := v_new_hand || (v_hand -> v_j);
        END IF;
      END LOOP;
      IF NOT v_found THEN
        RETURN jsonb_build_object('ok', false, 'code', 'CARD_NOT_IN_HAND', 'message', 'Layoff card not in hand');
      END IF;
      v_hand := v_new_hand;
      v_meld := v_meld || to_jsonb(v_card);
      v_lm := jsonb_set(v_lm, ARRAY[v_mi::text], v_meld, true);
    END LOOP;
  END IF;

  v_eng.layoff_melds := v_lm;
  IF v_seat = 0 THEN
    v_eng.hand0 := v_hand;
  ELSE
    v_eng.hand1 := v_hand;
  END IF;

  UPDATE public.ov2_meldmatch_engine
  SET hand0 = v_eng.hand0, hand1 = v_eng.hand1, layoff_melds = v_eng.layoff_melds
  WHERE session_id = v_sess.id;

  v_sess := public.ov2_meldmatch_finalize_layoff_scoring(v_sess.id, v_closer, v_dw, v_pk);

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_meldmatch_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_compute_public_core(public.ov2_meldmatch_engine, integer, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_compute_public_core(public.ov2_meldmatch_engine, integer, text, text, jsonb) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_build_client_snapshot(public.ov2_meldmatch_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_build_client_snapshot(public.ov2_meldmatch_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_get_snapshot(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_draw(uuid, text, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_draw(uuid, text, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_discard(uuid, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_discard(uuid, text, integer, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_declare_finish(uuid, text, text, jsonb, jsonb, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_declare_finish(uuid, text, text, jsonb, jsonb, integer, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_resolve_layoff(uuid, text, jsonb, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_resolve_layoff(uuid, text, jsonb, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_meldmatch_finalize_layoff_scoring(uuid, integer, integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_meldmatch_finalize_layoff_scoring(uuid, integer, integer, text) TO anon, authenticated, service_role;

COMMIT;
