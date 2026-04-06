-- Color Clash: turn timeout, elimination, voluntary forfeit, settlement, rematch, claim.
-- Apply after 124_ov2_colorclash_rpcs.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_colorclash__append_hand_to_discard(
  p_eng public.ov2_colorclash_engine,
  p_seat int
)
RETURNS public.ov2_colorclash_engine
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_out public.ov2_colorclash_engine;
  v_hand jsonb;
  v_n int;
  v_i int;
BEGIN
  v_out := p_eng;
  v_hand := public.ov2_cc_hand_get(v_out, p_seat);
  v_n := public.ov2_cc_jsonb_len(v_hand);
  FOR v_i IN 0..(v_n - 1) LOOP
    v_out.discard := v_out.discard || (v_hand -> v_i);
  END LOOP;
  v_out := public.ov2_cc_hand_set(v_out, p_seat, '[]'::jsonb);
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash__finish_one_survivor(
  p_sess_id uuid,
  p_eng public.ov2_colorclash_engine,
  p_winner int,
  p_pk text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_entry bigint;
  v_pc int;
  v_prize bigint;
  v_ps jsonb;
  v_pub jsonb;
BEGIN
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = p_sess_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  v_entry := coalesce((v_sess.parity_state ->> '__entry__')::bigint, 0);
  v_pc := v_sess.player_count;
  v_prize := v_entry * v_pc;
  v_ps := jsonb_set(
    coalesce(v_sess.parity_state, '{}'::jsonb),
    '{__result__}',
    jsonb_build_object(
      'winner', p_winner,
      'prize', v_prize,
      'lossPerSeat', v_entry,
      'playerCount', v_pc,
      'lastSurvivor', true,
      'timestamp', (extract(epoch from now()) * 1000)::bigint
    ),
    true
  );
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  v_pub := public.ov2_cc_compute_public_core(p_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine
  SET
    stock = p_eng.stock,
    discard = p_eng.discard,
    hand0 = p_eng.hand0,
    hand1 = p_eng.hand1,
    hand2 = p_eng.hand2,
    hand3 = p_eng.hand3,
    pending_draw = NULL
  WHERE session_id = p_sess_id;
  UPDATE public.ov2_colorclash_sessions
  SET
    phase = 'finished',
    winner_seat = p_winner,
    public_state = v_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = p_sess_id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, p_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_mark_turn_timeout(
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
  v_pub jsonb;
  v_ps jsonb;
  v_now bigint;
  v_deadline bigint;
  v_dl_seat int;
  v_turn int;
  v_miss int;
  v_missed jsonb;
  v_live int[];
  v_live2 int[];
  v_dir int;
  v_next int;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_surv int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_colorclash_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_now := (extract(epoch from now()) * 1000)::bigint;
  IF NOT (v_ps ? 'turn_deadline_at') OR NOT (v_ps ? 'turn_deadline_seat') THEN
    v_ps := public.ov2_cc_parity_bump_timer(v_ps, v_turn, NULL);
    UPDATE public.ov2_colorclash_sessions SET parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now() WHERE id = v_sess.id RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;
  v_deadline := (v_ps ->> 'turn_deadline_at')::bigint;
  v_dl_seat := (v_ps ->> 'turn_deadline_seat')::int;
  IF v_dl_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF v_now < v_deadline THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;

  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_dir := coalesce((v_pub ->> 'direction')::int, 1);
  v_live := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);

  v_missed := coalesce(v_ps -> 'missed_turns', '{}'::jsonb);
  v_miss := coalesce((v_missed ->> v_turn::text)::int, 0) + 1;
  v_missed := jsonb_set(v_missed, ARRAY[v_turn::text], to_jsonb(v_miss), true);
  v_ps := jsonb_set(v_ps, '{missed_turns}', v_missed, true);

  IF v_miss >= 3 THEN
    v_eng := public.ov2_colorclash__append_hand_to_discard(v_eng, v_turn);
    v_pub := public.ov2_cc_set_eliminated(v_pub, v_turn, true);
    v_eng.pending_draw := NULL;
    v_live2 := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
    v_surv := coalesce(cardinality(v_live2), 0);
    IF v_surv <= 1 THEN
      IF v_surv = 1 THEN
        RETURN public.ov2_colorclash__finish_one_survivor(v_sess.id, v_eng, v_live2[1], v_pk);
      END IF;
      v_ps := jsonb_set(
        v_ps,
        '{__result__}',
        jsonb_build_object(
          'draw', true,
          'noSurvivors', true,
          'timestamp', v_now
        ),
        true
      );
      v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
      UPDATE public.ov2_colorclash_engine
      SET stock = v_eng.stock, discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = NULL
      WHERE session_id = v_sess.id;
      UPDATE public.ov2_colorclash_sessions
      SET phase = 'finished', winner_seat = NULL, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
      RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
    END IF;
    v_next := public.ov2_cc_next_in_order(v_live, v_turn, 1, v_dir);
    IF v_next IS NULL OR public.ov2_cc_is_eliminated(v_pub, v_next) THEN
      v_next := v_live2[1];
    END IF;
    v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_turn);
    v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
    v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
    v_ps := public.ov2_cc_parity_bump_timer(v_ps, v_next, NULL);
    v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
    UPDATE public.ov2_colorclash_engine
    SET stock = v_eng.stock, discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = NULL
    WHERE session_id = v_sess.id;
    UPDATE public.ov2_colorclash_sessions
    SET turn_seat = v_next, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_next := public.ov2_cc_next_in_order(v_live, v_turn, 1, v_dir);
  IF v_next IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_NEXT', 'message', 'Turn order error');
  END IF;
  v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_turn);
  v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
  v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
  v_eng.pending_draw := NULL;
  v_ps := public.ov2_cc_parity_bump_timer(v_ps, v_next, NULL);
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine SET pending_draw = NULL WHERE session_id = v_sess.id;
  UPDATE public.ov2_colorclash_sessions
  SET turn_seat = v_next, public_state = v_pub, parity_state = v_ps, revision = v_sess.revision + 1, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_voluntary_forfeit(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_seat int;
  v_pub jsonb;
  v_ps jsonb;
  v_eng public.ov2_colorclash_engine%ROWTYPE;
  v_live int[];
  v_live2 int[];
  v_dir int;
  v_turn int;
  v_next int;
  v_surv int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in play');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_colorclash_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;
  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  IF public.ov2_cc_is_eliminated(v_pub, v_seat) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
  END IF;
  SELECT * INTO v_eng FROM public.ov2_colorclash_engine WHERE session_id = v_sess.id FOR UPDATE;
  v_turn := (v_pub ->> 'turnSeat')::int;
  v_dir := coalesce((v_pub ->> 'direction')::int, 1);
  v_live := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
  v_eng := public.ov2_colorclash__append_hand_to_discard(v_eng, v_seat);
  v_pub := public.ov2_cc_set_eliminated(v_pub, v_seat, true);
  v_eng.pending_draw := NULL;
  v_live2 := public.ov2_cc_active_non_eliminated(v_sess.active_seats, v_pub);
  v_surv := coalesce(cardinality(v_live2), 0);
  IF v_surv = 1 THEN
    RETURN public.ov2_colorclash__finish_one_survivor(v_sess.id, v_eng, v_live2[1], v_pk);
  END IF;
  IF v_turn IS NOT DISTINCT FROM v_seat THEN
    v_next := public.ov2_cc_next_in_order(v_live, v_seat, 1, v_dir);
    IF v_next IS NOT NULL AND NOT public.ov2_cc_is_eliminated(v_pub, v_next) THEN
      NULL;
    ELSE
      v_next := v_live2[1];
    END IF;
    v_pub := public.ov2_cc_pub_clear_wild_lock_on_turn_end(v_pub, v_seat);
    v_pub := jsonb_set(v_pub, '{turnPhase}', '"play"'::jsonb, true);
    v_pub := jsonb_set(v_pub, '{turnSeat}', to_jsonb(v_next), true);
    v_ps := public.ov2_cc_parity_bump_timer(v_sess.parity_state, v_next, NULL);
  ELSE
    v_ps := v_sess.parity_state;
  END IF;
  v_pub := public.ov2_cc_compute_public_core(v_eng, v_pub, v_sess.active_seats);
  UPDATE public.ov2_colorclash_engine
  SET stock = v_eng.stock, discard = v_eng.discard, hand0 = v_eng.hand0, hand1 = v_eng.hand1, hand2 = v_eng.hand2, hand3 = v_eng.hand3, pending_draw = NULL
  WHERE session_id = v_sess.id;
  UPDATE public.ov2_colorclash_sessions
  SET
    public_state = v_pub,
    parity_state = coalesce(v_ps, v_sess.parity_state),
    turn_seat = CASE WHEN v_turn IS NOT DISTINCT FROM v_seat THEN v_next ELSE v_sess.turn_seat END,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_colorclash_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_winner_seat int;
  v_winner_pk text;
  v_prize bigint;
  v_loss bigint;
  v_entry bigint;
  r record;
  v_idem text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
BEGIN
  v_res := coalesce(NEW.parity_state, '{}'::jsonb) -> '__result__';
  IF v_res IS NULL OR jsonb_typeof(v_res) = 'null' THEN
    RETURN NULL;
  END IF;
  IF coalesce((v_res ->> 'draw')::boolean, false) THEN
    v_entry := coalesce((NEW.parity_state ->> '__entry__')::bigint, 0);
    FOR r IN
      SELECT trim(participant_key) AS pk
      FROM public.ov2_colorclash_seats
      WHERE session_id = v_sess_id
    LOOP
      IF r.pk IS NULL OR length(r.pk) = 0 THEN
        CONTINUE;
      END IF;
      v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':cc_draw_refund:';
      INSERT INTO public.ov2_settlement_lines (
        room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
      ) VALUES (
        v_room_id,
        v_match_seq,
        r.pk,
        'cc_draw_refund',
        v_entry,
        v_idem,
        v_sess_id,
        jsonb_build_object('gameId', 'ov2_colorclash', 'sessionId', v_sess_id, 'refundPerSeat', v_entry, 'lossAlreadyCommitted', true)
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
    UPDATE public.ov2_colorclash_sessions SET status = 'closed', updated_at = now() WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';
    RETURN NULL;
  END IF;
  IF NOT (v_res ? 'winner') THEN
    RETURN NULL;
  END IF;
  v_winner_seat := (v_res ->> 'winner')::int;
  IF v_winner_seat IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT trim(participant_key) INTO v_winner_pk
  FROM public.ov2_colorclash_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;
  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;
  v_entry := coalesce((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_prize := coalesce(nullif((v_res ->> 'prize'), '')::bigint, 0);
  v_loss := coalesce(nullif((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry;
  END IF;
  IF v_prize IS NULL OR v_prize <= 0 THEN
    v_prize := v_loss * greatest(2, coalesce((v_res ->> 'playerCount')::int, NEW.player_count, 2));
  END IF;
  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':cc_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'cc_win',
    v_prize,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_colorclash',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'lossAlreadyCommitted', true
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;
  FOR r IN
    SELECT trim(participant_key) AS pk, seat_index
    FROM public.ov2_colorclash_seats
    WHERE session_id = v_sess_id
      AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':cc_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'cc_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_colorclash', 'sessionId', v_sess_id, 'seat', r.seat_index, 'lossPerSeat', v_loss, 'lossAlreadyCommitted', true)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  UPDATE public.ov2_colorclash_sessions SET status = 'closed', updated_at = now() WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_colorclash_finish_settlement ON public.ov2_colorclash_sessions;
CREATE TRIGGER trg_ov2_colorclash_finish_settlement
AFTER UPDATE OF phase ON public.ov2_colorclash_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_colorclash_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public._ov2_cc_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta -> 'cc' ->> 'rematch_requested') IN ('true', 't', '1')
    OR (p_meta -> 'cc' -> 'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_request_rematch(
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
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Stale session');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND OR v_member.seat_index IS NULL OR v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ELIGIBLE', 'message', 'Must be seated and committed');
  END IF;
  IF public._ov2_cc_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      coalesce(meta, '{}'::jsonb),
      '{cc}',
      coalesce(meta -> 'cc', '{}'::jsonb) || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_cancel_rematch(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF NOT public._ov2_cc_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'cc' THEN jsonb_set(meta, '{cc}', (meta -> 'cc') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_start_next_match(
  p_room_id uuid,
  p_participant_key text,
  p_expected_match_seq integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_colorclash_sessions%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only host can start next match');
  END IF;
  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_MATCH_SEQ', 'message', 'match_seq changed', 'match_seq', v_room.match_seq);
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_colorclash_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Previous match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;
  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state = 'committed';
  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated committed players');
  END IF;
  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_cc_member_rematch_requested(m.meta);
  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All players must request rematch first',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;
  v_next_ms := coalesce(v_room.match_seq, 0) + 1;
  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'cc' THEN jsonb_set(m.meta, '{cc}', (m.meta -> 'cc') - 'rematch_requested' - 'rematch_at', true)
      ELSE m.meta
    END,
    wallet_state = CASE WHEN m.seat_index IS NOT NULL THEN 'none' ELSE m.wallet_state END,
    amount_locked = CASE WHEN m.seat_index IS NOT NULL THEN 0 ELSE m.amount_locked END,
    updated_at = now()
  WHERE m.room_id = p_room_id;
  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = NULL,
    active_runtime_id = NULL,
    pot_locked = 0,
    lifecycle_phase = 'pending_stakes',
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;
  RETURN jsonb_build_object(
    'ok', true,
    'match_seq', v_next_ms,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_colorclash_claim_settlement(
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
  v_pk text;
  v_has_any boolean;
  v_has_undelivered boolean;
  v_lines jsonb;
  v_total bigint;
  v_idempotent boolean;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(coalesce(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_colorclash' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Color Clash room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
  ) INTO v_has_any;
  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk AND sl.vault_delivered_at IS NULL
  ) INTO v_has_undelivered;
  IF NOT v_has_undelivered THEN
    v_idempotent := v_has_any;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', v_idempotent,
      'room_id', p_room_id,
      'participant_key', v_pk,
      'lines', '[]'::jsonb,
      'total_amount', 0
    );
  END IF;
  WITH u AS (
    UPDATE public.ov2_settlement_lines sl
    SET vault_delivered_at = now()
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND sl.vault_delivered_at IS NULL
    RETURNING sl.id, sl.amount, sl.line_kind, sl.idempotency_key, sl.match_seq
  )
  SELECT coalesce(jsonb_agg(to_jsonb(u)), '[]'::jsonb), coalesce(sum(u.amount), 0)::bigint INTO v_lines, v_total FROM u;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'room_id', p_room_id,
    'participant_key', v_pk,
    'lines', coalesce(v_lines, '[]'::jsonb),
    'total_amount', coalesce(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_colorclash_mark_turn_timeout(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_mark_turn_timeout(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_request_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_cancel_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_colorclash_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_colorclash_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
