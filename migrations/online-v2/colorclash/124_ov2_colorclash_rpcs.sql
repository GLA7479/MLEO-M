-- Color Clash: snapshots, open session, draw, pass after draw, play card.
-- Apply after 123_ov2_colorclash_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_build_client_snapshot(
  p_session public.ov2_colorclash_sessions,
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
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_hand jsonb;
  v_td bigint;
  v_phase text;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_colorclash_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine e WHERE e.session_id = p_session.id;
  IF NOT FOUND THEN
    v_eng.stock := '[]'::jsonb;
    v_eng.discard := '[]'::jsonb;
    v_eng.hand0 := '[]'::jsonb;
    v_eng.hand1 := '[]'::jsonb;
    v_eng.hand2 := '[]'::jsonb;
    v_eng.hand3 := '[]'::jsonb;
    v_eng.pending_draw := NULL;
  END IF;
  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);
  v_hand := 'null'::jsonb;
  IF v_my IS NOT NULL AND v_my IN (0, 1, 2, 3) AND p_session.phase = 'playing' THEN
    v_hand := public.ov2_cc_hand_get(v_eng, v_my);
  END IF;
  v_phase := coalesce(v_pub ->> 'turnPhase', 'play');
  v_td := NULL;
  IF v_ps ? 'turn_deadline_at' THEN
    BEGIN
      v_td := (v_ps ->> 'turn_deadline_at')::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_td := NULL;
    END;
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
    'myHand', v_hand,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'pendingDrawForYou',
      CASE
        WHEN v_my IS NULL THEN NULL::jsonb
        WHEN p_session.phase IS DISTINCT FROM 'playing' THEN NULL::jsonb
        WHEN v_phase IS DISTINCT FROM 'post_draw' THEN NULL::jsonb
        WHEN v_eng.pending_draw IS NULL THEN NULL::jsonb
        WHEN p_session.turn_seat IS DISTINCT FROM v_my THEN NULL::jsonb
        ELSE v_eng.pending_draw
      END,
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'missedTurns', coalesce(v_ps -> 'missed_turns', '{}'::jsonb),
    'result', v_ps -> '__result__',
    'surgeUsedBySeat', coalesce(v_ps -> 'surgeUsed', '{}'::jsonb),
    'surgeUsedForYou',
      CASE
        WHEN v_my IS NULL OR v_my NOT IN (0, 1, 2, 3) THEN NULL::jsonb
        ELSE to_jsonb(coalesce((v_ps -> 'surgeUsed' ->> v_my::text)::boolean, false))
      END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_open_session(
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
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_existing public.ov2_colorclash_sessions%ROWTYPE;
  v_seated int;
  v_active int[];
  v_pc int;
  v_entry bigint;
  v_ps jsonb;
  v_pub jsonb := '{}'::jsonb;
  v_deck jsonb;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_i int;
  v_s int;
  v_top jsonb;
  v_turn0 int;
  v_card jsonb;
  v_tt text;
  v_draw record;
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
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Color Clash room');
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
    FROM public.ov2_colorclash_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_colorclash_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated < 2 OR v_seated > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Color Clash needs 2 to 4 seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  SELECT array_agg(m.seat_index::int ORDER BY m.seat_index) INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  v_pc := coalesce(array_length(v_active, 1), 0);

  v_deck := public.ov2_cc_shuffle_jsonb_array(public.ov2_cc_build_deck());
  v_eng.stock := v_deck;
  v_eng.discard := '[]'::jsonb;
  v_eng.hand0 := '[]'::jsonb;
  v_eng.hand1 := '[]'::jsonb;
  v_eng.hand2 := '[]'::jsonb;
  v_eng.hand3 := '[]'::jsonb;
  v_eng.pending_draw := NULL;

  FOR v_i IN 1..7 LOOP
    FOREACH v_s IN ARRAY v_active LOOP
      SELECT * INTO v_draw
      FROM public.ov2_cc_draw_one_from_stock(v_eng);

      v_eng := v_draw.eng;
      v_card := v_draw.card;
      EXIT WHEN v_card IS NULL;
      v_eng := public.ov2_cc_hand_set(
        v_eng,
        v_s,
        public.ov2_cc_hand_get(v_eng, v_s) || v_card
      );
    END LOOP;
  END LOOP;

  LOOP
    EXIT WHEN public.ov2_cc_jsonb_len(v_eng.stock) <= 0;
    v_top := v_eng.stock -> (public.ov2_cc_jsonb_len(v_eng.stock) - 1);
    v_tt := public.ov2_cc_card_type(v_top);
    EXIT WHEN v_tt IS DISTINCT FROM 'w' AND v_tt IS DISTINCT FROM 'f';
    v_eng.discard := v_eng.discard || v_top;
    v_eng.stock := (
      SELECT coalesce(jsonb_agg(v_eng.stock -> g.i ORDER BY g.i), '[]'::jsonb)
      FROM generate_series(0, public.ov2_cc_jsonb_len(v_eng.stock) - 2) AS g(i)
    );
  END LOOP;
  IF public.ov2_cc_jsonb_len(v_eng.discard) = 0 AND public.ov2_cc_jsonb_len(v_eng.stock) > 0 THEN
    v_top := v_eng.stock -> (public.ov2_cc_jsonb_len(v_eng.stock) - 1);
    v_eng.discard := jsonb_build_array(v_top);
    v_eng.stock := (
      SELECT coalesce(jsonb_agg(v_eng.stock -> g.i ORDER BY g.i), '[]'::jsonb)
      FROM generate_series(0, public.ov2_cc_jsonb_len(v_eng.stock) - 2) AS g(i)
    );
  END IF;

  v_turn0 := v_active[1 + (floor(random() * v_pc)::int % v_pc)];
  v_entry := coalesce(v_room.stake_per_seat, 0);
  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'stake_multiplier', 1,
    'missed_turns', jsonb_build_object('0', 0, '1', 0, '2', 0, '3', 0),
    'surgeUsed', jsonb_build_object('0', false, '1', false, '2', false, '3', false)
  );
  v_ps := public.ov2_cc_parity_bump_timer(v_ps, v_turn0, v_turn0);

  v_pub := jsonb_build_object(
    'turnPhase', 'play',
    'currentColor', public.ov2_cc_initial_current_color(public.ov2_cc_top_discard(v_eng.discard)),
    'direction', 1,
    'clashCount', 0,
    'lockedColor', null::jsonb,
    'lockForSeat', null::jsonb,
    'lockExpiresAfterNextTurn', false,
    'eliminated', jsonb_build_object('0', false, '1', false, '2', false, '3', false)
  );
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_active);
  v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_turn0), true);

  INSERT INTO public.ov2_colorclash_sessions (
    room_id, match_seq, status, phase, revision, turn_seat, winner_seat, active_seats, player_count, public_state, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_turn0,
    NULL,
    v_active,
    v_pc,
    v_pub,
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_colorclash_engine (session_id, stock, discard, hand0, hand1, hand2, hand3, pending_draw)
  VALUES (
    v_sess.id,
    v_eng.stock,
    v_eng.discard,
    v_eng.hand0,
    v_eng.hand1,
    v_eng.hand2,
    v_eng.hand3,
    NULL
  );

  INSERT INTO public.ov2_colorclash_seats (session_id, seat_index, participant_key, room_member_id, meta)
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

  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_sess.id;
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_get_snapshot(
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
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_draw_card(
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
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_tp text;
  v_card jsonb;
  v_hand jsonb;
  v_top jsonb;
  v_cc int;
  v_wlock int;
  v_has boolean;
  v_clash int;
  v_n_draw int;
  v_k int;
  v_drawn jsonb;
  v_draw record;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_colorclash_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF (v_pub ->> 'turnSeat')::int IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF coalesce(v_pub ->> 'turnPhase', 'play') IS DISTINCT FROM 'play' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Draw only at start of turn');
  END IF;
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_drawn := '[]'::jsonb;
  v_top := public.ov2_cc_top_discard(v_eng.discard);
  v_cc := coalesce((v_pub ->> 'currentColor')::int, 0);
  v_wlock := public.ov2_cc_wild_lock_color_for_turn(v_pub, v_seat);
  v_hand := public.ov2_cc_hand_get(v_eng, v_seat);
  v_has := public.ov2_cc_has_legal_play(v_hand, v_top, v_cc, v_wlock);
  v_clash := coalesce(nullif((v_pub ->> 'clashCount'), '')::int, 0);
  IF v_clash < 0 THEN
    v_clash := 0;
  END IF;
  IF NOT v_has THEN
    v_n_draw := 1 + v_clash;
    v_pub := jsonb_set(v_pub, '{clashCount}', to_jsonb(0), true);
  ELSE
    v_n_draw := 1;
  END IF;
  FOR v_k IN 1..v_n_draw LOOP
    SELECT * INTO v_draw
    FROM public.ov2_cc_draw_one_from_stock(v_eng);

    v_eng := v_draw.eng;
    v_card := v_draw.card;
    EXIT WHEN v_card IS NULL;
    v_drawn := v_drawn || v_card;
  END LOOP;
  IF public.ov2_cc_jsonb_len(v_drawn) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STOCK_EMPTY', 'message', 'No card to draw');
  END IF;
  v_hand := v_hand || v_drawn;
  v_eng := public.ov2_cc_hand_set(v_eng, v_seat, v_hand);
  v_eng.pending_draw := v_drawn;
  v_pub := jsonb_set(v_pub, '{turnPhase}', '"post_draw"'::jsonb, true);
  v_ps := public.ov2_cc_parity_bump_timer(v_sess.parity_state, v_seat, v_seat);
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine
  SET stock = v_eng.stock, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = v_eng.pending_draw
  WHERE session_id = v_sess.id;
  UPDATE public.ov2_colorclash_sessions
  SET public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_pass_after_draw(
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
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_live int[];
  v_dir int;
  v_next int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_colorclash_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF (v_pub ->> 'turnSeat')::int IS DISTINCT FROM v_seat OR coalesce(v_pub ->> 'turnPhase', '') IS DISTINCT FROM 'post_draw' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Nothing to pass');
  END IF;
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_eng.pending_draw := NULL;
  v_dir := coalesce((v_pub ->> 'direction')::int, 1);
  v_live := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
  v_next := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
  IF v_next IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_NEXT', 'message', 'No next player');
  END IF;
  v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_seat);
  v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
  v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
  v_ps := public.ov2_cc_parity_bump_timer(v_sess.parity_state, v_next, v_seat);
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine SET pending_draw = NULL WHERE session_id = v_sess.id;
  UPDATE public.ov2_colorclash_sessions
  SET turn_seat = v_next, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

DROP FUNCTION IF EXISTS public.ov2_colorclash_play_card(uuid, text, jsonb, int, bigint);
DROP FUNCTION IF EXISTS public.ov2_colorclash_play_card(uuid, text, jsonb, int);

CREATE OR REPLACE FUNCTION public.ov2_colorclash_play_card(
  p_room_id uuid,
  p_participant_key text,
  p_card jsonb,
  p_chosen_color int DEFAULT NULL,
  p_expected_revision bigint DEFAULT NULL,
  p_second_card jsonb DEFAULT NULL,
  p_second_chosen_color int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_seat int;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_pub jsonb;
  v_ps jsonb;
  v_turn_phase text;
  v_top jsonb;
  v_cc int;
  v_cc_before int;
  v_wlock int;
  v_dir int;
  v_live int[];
  v_nlive int;
  v_new_hand jsonb;
  v_pt text;
  v_next int;
  v_victim int;
  v_new_cc int;
  v_entry bigint;
  v_pc int;
  v_prize bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_card IS NULL OR jsonb_typeof(p_card) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  IF p_second_card IS NOT NULL AND jsonb_typeof(p_second_card) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid second card');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Not in play');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_colorclash_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF (v_pub ->> 'turnSeat')::int IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  v_turn_phase := coalesce(v_pub ->> 'turnPhase', 'play');
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id FOR UPDATE;

  IF p_second_card IS NOT NULL THEN
    IF v_turn_phase = 'post_draw' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SURGE_BAD_PHASE', 'message', 'Surge not allowed after draw');
    END IF;
    IF v_turn_phase IS DISTINCT FROM 'play' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SURGE_BAD_PHASE', 'message', 'Surge only in play phase');
    END IF;
    IF public.ov2_cc_surge_used_get(v_sess.parity_state, v_seat) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SURGE_USED', 'message', 'Surge already used');
    END IF;
    v_pt := public.ov2_cc_card_type(p_card);
    IF v_pt IS DISTINCT FROM 'n' OR public.ov2_cc_card_type(p_second_card) IS DISTINCT FROM 'n' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SURGE_NUMBERS_ONLY', 'message', 'Surge requires two number cards');
    END IF;
    v_wlock := public.ov2_cc_wild_lock_color_for_turn(v_pub, v_seat);
    v_top := public.ov2_cc_top_discard(v_eng.discard);
    v_cc := coalesce((v_pub ->> 'currentColor')::int, 0);
    IF NOT public.ov2_cc_is_playable_on(p_card, v_top, v_cc, v_wlock) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_CARD', 'message', 'Card not playable');
    END IF;
    v_new_cc := public.ov2_cc_card_color(p_card);
    v_new_hand := public.ov2_cc_remove_one_card(public.ov2_cc_hand_get(v_eng, v_seat), p_card);
    IF v_new_hand IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CARD_NOT_IN_HAND', 'message', 'Card not in hand');
    END IF;
    v_eng := public.ov2_cc_hand_set(v_eng, v_seat, v_new_hand);
    v_eng.discard := v_eng.discard || p_card;
    v_eng.pending_draw := NULL;
    v_pub := jsonb_set(v_pub, '{clashCount}', to_jsonb(public.ov2_cc_clash_update_after_play(v_pub, p_card, v_cc)), true);
    IF public.ov2_cc_jsonb_len(v_new_hand) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'SURGE_INCOMPLETE', 'message', 'Surge requires two cards');
    END IF;
    v_cc := v_new_cc;
    v_top := public.ov2_cc_top_discard(v_eng.discard);
    IF NOT public.ov2_cc_is_playable_on(p_second_card, v_top, v_cc, v_wlock) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_CARD', 'message', 'Second card not playable');
    END IF;
    v_new_cc := public.ov2_cc_card_color(p_second_card);
    v_new_hand := public.ov2_cc_remove_one_card(public.ov2_cc_hand_get(v_eng, v_seat), p_second_card);
    IF v_new_hand IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'CARD_NOT_IN_HAND', 'message', 'Second card not in hand');
    END IF;
    v_eng := public.ov2_cc_hand_set(v_eng, v_seat, v_new_hand);
    v_eng.discard := v_eng.discard || p_second_card;
    v_pub := jsonb_set(v_pub, '{clashCount}', to_jsonb(public.ov2_cc_clash_update_after_play(v_pub, p_second_card, v_cc)), true);
    v_ps := public.ov2_cc_surge_used_set(v_sess.parity_state, v_seat, true);
    v_dir := coalesce((v_pub ->> 'direction')::int, 1);
    v_live := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
    v_nlive := coalesce(cardinality(v_live), 0);

    IF public.ov2_cc_jsonb_len(v_new_hand) = 0 THEN
      v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
      v_pc := v_sess.player_count;
      v_prize := v_entry * v_pc;
      v_ps := jsonb_set(
        v_ps,
        '{__result__}',
        jsonb_build_object(
          'winner', v_seat,
          'prize', v_prize,
          'lossPerSeat', v_entry,
          'playerCount', v_pc,
          'emptyHand', true,
          'surge', true,
          'timestamp', (extract(epoch from now()) * 1000)::bigint
        ),
        true
      );
      v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
      v_pub := jsonb_set(v_pub, '{currentColor}', to_jsonb(v_new_cc), true);
      v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
      UPDATE public.ov2_colorclash_engine
      SET discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = NULL
      WHERE session_id = v_sess.id;
      UPDATE public.ov2_colorclash_sessions
      SET
        phase = 'finished',
        winner_seat = v_seat,
        public_state = v_pub,
        parity_state = v_ps,
        revision = v_sess.revision + 1,
        updated_at = now()
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
      RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
    END IF;

    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
    IF v_next IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'NO_NEXT', 'message', 'Turn order error');
    END IF;
    v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_seat);
    v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
    v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
    v_pub := jsonb_set(v_pub, '{currentColor}', to_jsonb(v_new_cc), true);
    v_ps := public.ov2_cc_parity_bump_timer(v_ps, v_next, v_seat);
    v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
    UPDATE public.ov2_colorclash_engine
    SET
      stock = v_eng.stock,
      discard = v_eng.discard,
      hand0 = v_eng.hand0,
      hand1 = v_eng.hand1,
      hand2 = v_eng.hand2,
      hand3 = v_eng.hand3,
      pending_draw = NULL
    WHERE session_id = v_sess.id;
    UPDATE public.ov2_colorclash_sessions
    SET turn_seat = v_next, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF v_turn_phase = 'post_draw' THEN
    IF v_eng.pending_draw IS NULL OR NOT public.ov2_cc_pending_draw_contains(v_eng.pending_draw, p_card) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'MUST_PLAY_DRAWN', 'message', 'You may only play a card you drew');
    END IF;
  END IF;
  v_top := public.ov2_cc_top_discard(v_eng.discard);
  v_cc := coalesce((v_pub ->> 'currentColor')::int, 0);
  v_wlock := public.ov2_cc_wild_lock_color_for_turn(v_pub, v_seat);
  IF NOT public.ov2_cc_is_playable_on(p_card, v_top, v_cc, v_wlock) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_CARD', 'message', 'Card not playable');
  END IF;
  v_pt := public.ov2_cc_card_type(p_card);
  IF v_pt IN ('w', 'f') THEN
    IF p_chosen_color IS NULL OR p_chosen_color < 0 OR p_chosen_color > 3 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'COLOR_REQUIRED', 'message', 'Choose a color 0..3');
    END IF;
    v_new_cc := p_chosen_color;
  ELSIF v_pt = 'n' THEN
    v_new_cc := public.ov2_cc_card_color(p_card);
  ELSE
    v_new_cc := public.ov2_cc_card_color(p_card);
  END IF;
  v_cc_before := v_cc;
  v_new_hand := public.ov2_cc_remove_one_card(public.ov2_cc_hand_get(v_eng, v_seat), p_card);
  IF v_new_hand IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CARD_NOT_IN_HAND', 'message', 'Card not in hand');
  END IF;
  v_eng := public.ov2_cc_hand_set(v_eng, v_seat, v_new_hand);
  v_eng.discard := v_eng.discard || p_card;
  v_eng.pending_draw := NULL;
  v_pub := jsonb_set(v_pub, '{clashCount}', to_jsonb(public.ov2_cc_clash_update_after_play(v_pub, p_card, v_cc_before)), true);
  v_dir := coalesce((v_pub ->> 'direction')::int, 1);
  v_live := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
  v_nlive := coalesce(cardinality(v_live), 0);

  IF public.ov2_cc_jsonb_len(v_new_hand) = 0 THEN
    v_entry := coalesce((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_pc := v_sess.player_count;
    v_prize := v_entry * v_pc;
    v_ps := jsonb_set(
      coalesce(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_seat,
        'prize', v_prize,
        'lossPerSeat', v_entry,
        'playerCount', v_pc,
        'emptyHand', true,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
    v_pub := jsonb_set(v_pub, '{currentColor}', to_jsonb(v_new_cc), true);
    v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
    UPDATE public.ov2_colorclash_engine
    SET discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = NULL
    WHERE session_id = v_sess.id;
    UPDATE public.ov2_colorclash_sessions
    SET
      phase = 'finished',
      winner_seat = v_seat,
      public_state = v_pub,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF v_pt = 's' THEN
    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 2, v_dir);
  ELSIF v_pt = 'r' AND v_nlive = 2 THEN
    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 2, v_dir);
  ELSIF v_pt = 'r' AND v_nlive > 2 THEN
    v_dir := -v_dir;
    v_pub := jsonb_set(v_pub, '{direction}', to_jsonb(v_dir), true);
    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
  ELSIF v_pt = 'd' THEN
    v_victim := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
    v_eng := public.ov2_cc_draw_n_to_hand(v_eng, v_victim, 2);
    v_next := public.ov2_cc_next_in_order(v_live, v_victim, 1, v_dir);
  ELSIF v_pt = 'f' THEN
    v_victim := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
    v_eng := public.ov2_cc_draw_n_to_hand(v_eng, v_victim, 4);
    v_next := public.ov2_cc_next_in_order(v_live, v_victim, 1, v_dir);
  ELSE
    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
  END IF;

  IF v_next IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_NEXT', 'message', 'Turn order error');
  END IF;
  v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_seat);
  IF v_pt IN ('w', 'f') THEN
    v_pub := jsonb_set(v_pub, '{lockedColor}', to_jsonb(p_chosen_color), true);
    v_pub := jsonb_set(v_pub, '{lockForSeat}', to_jsonb(v_next), true);
    v_pub := jsonb_set(v_pub, '{lockExpiresAfterNextTurn}', 'true'::jsonb, true);
  END IF;
  v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
  v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
  v_pub := jsonb_set(v_pub, '{currentColor}', to_jsonb(v_new_cc), true);
  v_ps := public.ov2_cc_parity_bump_timer(v_sess.parity_state, v_next, v_seat);
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine
  SET
    stock = v_eng.stock,
    discard = v_eng.discard,
    hand0 = v_eng.hand0,
    hand1 = v_eng.hand1,
    hand2 = v_eng.hand2,
    hand3 = v_eng.hand3,
    pending_draw = NULL
  WHERE session_id = v_sess.id;
  UPDATE public.ov2_colorclash_sessions
  SET turn_seat = v_next, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_colorclash_build_client_snapshot(public.ov2_colorclash_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_build_client_snapshot(public.ov2_colorclash_sessions, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_open_session(uuid, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_get_snapshot(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_draw_card(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_draw_card(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_pass_after_draw(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_pass_after_draw(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_play_card(uuid, text, jsonb, int, bigint, jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_play_card(uuid, text, jsonb, int, bigint, jsonb, int) TO anon, authenticated, service_role;

COMMIT;
