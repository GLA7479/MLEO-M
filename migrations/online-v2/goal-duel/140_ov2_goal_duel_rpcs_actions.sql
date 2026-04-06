-- Goal Duel: match timer end, inactivity forfeit, voluntary forfeit, settlement (incl. draw), rematch, claim.
-- Apply after 139_ov2_goal_duel_rpcs.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_mark_match_events(
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
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_seat int;
  v_ps jsonb;
  v_now bigint;
  v_mend bigint;
  v_l0 bigint;
  v_l1 bigint;
  v_ia bigint := public.ov2_gd_inactivity_forfeit_ms();
  v_s0 int;
  v_s1 int;
  v_w int;
  v_is_draw boolean := false;
  v_entry bigint;
  v_mult int := 1;
  v_reason text;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_goal_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF v_sess.phase = 'finished' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;
  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_mend := (v_ps ->> 'match_end_ms')::bigint;
  v_l0 := coalesce((v_ps ->> 'last_action_ms_0')::bigint, v_now);
  v_l1 := coalesce((v_ps ->> 'last_action_ms_1')::bigint, v_now);
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);

  v_w := NULL;
  v_reason := NULL;

  IF v_now >= v_mend THEN
    v_reason := 'match_timer';
    IF v_s0 > v_s1 THEN
      v_w := 0;
      v_is_draw := false;
    ELSIF v_s1 > v_s0 THEN
      v_w := 1;
      v_is_draw := false;
    ELSE
      v_is_draw := true;
      v_w := NULL;
    END IF;
  ELSIF (v_now - v_l0) > v_ia AND (v_now - v_l1) <= v_ia THEN
    v_w := 1;
    v_reason := 'inactivity_forfeit';
    v_is_draw := false;
  ELSIF (v_now - v_l1) > v_ia AND (v_now - v_l0) <= v_ia THEN
    v_w := 0;
    v_reason := 'inactivity_forfeit';
    v_is_draw := false;
  ELSE
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
  IF v_is_draw THEN
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'isDraw', true,
        'score0', v_s0,
        'score1', v_s1,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'finishReason', v_reason,
        'timestamp', v_now
      ),
      true
    );
    UPDATE public.ov2_goal_duel_sessions
    SET
      phase = 'finished',
      winner_seat = NULL,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  ELSE
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'winner', v_w,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'finishReason', coalesce(v_reason, 'match_end'),
        'score0', v_s0,
        'score1', v_s1,
        'timestamp', v_now
      ),
      true
    );
    UPDATE public.ov2_goal_duel_sessions
    SET
      phase = 'finished',
      winner_seat = v_w,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_voluntary_forfeit(
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
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_seat int;
  v_other int;
  v_ps jsonb;
  v_entry bigint;
  v_mult int := 1;
  v_now bigint;
  v_s0 int;
  v_s1 int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'No active match to forfeit');
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_goal_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_other := CASE WHEN v_seat = 0 THEN 1 ELSE 0 END;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ps := jsonb_set(
    v_ps,
    '{__result__}',
    jsonb_build_object(
      'winner', v_other,
      'prize', v_entry * 2 * v_mult,
      'lossPerSeat', v_entry * v_mult,
      'stakeMultiplier', v_mult,
      'forfeit', true,
      'forfeitSeat', v_seat,
      'score0', v_s0,
      'score1', v_s1,
      'timestamp', v_now
    ),
    true
  );
  UPDATE public.ov2_goal_duel_sessions
  SET
    phase = 'finished',
    winner_seat = v_other,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_goal_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_is_draw boolean;
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

  v_is_draw := coalesce((v_res ->> 'isDraw')::boolean, false);
  v_entry := coalesce((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_loss := coalesce(nullif((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry;
  END IF;

  IF v_is_draw THEN
    FOR r IN
      SELECT trim(participant_key) AS pk, seat_index
      FROM public.ov2_goal_duel_seats
      WHERE session_id = v_sess_id
    LOOP
      IF r.pk IS NULL OR length(r.pk) = 0 THEN
        CONTINUE;
      END IF;
      v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':gd_draw:';
      INSERT INTO public.ov2_settlement_lines (
        room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
      ) VALUES (
        v_room_id,
        v_match_seq,
        r.pk,
        'gd_draw',
        v_loss,
        v_idem,
        v_sess_id,
        jsonb_build_object(
          'gameId', 'ov2_goal_duel',
          'sessionId', v_sess_id,
          'isDraw', true,
          'seat', r.seat_index,
          'refundPerSeat', v_loss,
          'lossAlreadyCommitted', true
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
    UPDATE public.ov2_goal_duel_sessions SET status = 'closed', updated_at = now() WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';
    RETURN NULL;
  END IF;

  IF NOT (v_res ? 'winner') THEN
    RETURN NULL;
  END IF;
  v_winner_seat := (v_res ->> 'winner')::int;
  IF v_winner_seat IS NULL OR v_winner_seat NOT IN (0, 1) THEN
    RETURN NULL;
  END IF;
  SELECT trim(participant_key) INTO v_winner_pk
  FROM public.ov2_goal_duel_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;
  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;
  v_prize := coalesce(nullif((v_res ->> 'prize'), '')::bigint, 0);
  IF v_prize IS NULL OR v_prize <= 0 THEN
    v_prize := v_loss * 2;
  END IF;
  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':gd_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'gd_win',
    v_prize,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_goal_duel',
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
    FROM public.ov2_goal_duel_seats
    WHERE session_id = v_sess_id
      AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':gd_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'gd_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_goal_duel', 'sessionId', v_sess_id, 'seat', r.seat_index, 'lossPerSeat', v_loss, 'lossAlreadyCommitted', true)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;
  UPDATE public.ov2_goal_duel_sessions SET status = 'closed', updated_at = now() WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_goal_duel_finish_settlement ON public.ov2_goal_duel_sessions;
CREATE TRIGGER trg_ov2_goal_duel_finish_settlement
AFTER UPDATE OF phase ON public.ov2_goal_duel_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_goal_duel_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public._ov2_gd_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta -> 'gd' ->> 'rematch_requested') IN ('true', 't', '1')
    OR (p_meta -> 'gd' -> 'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_request_rematch(
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
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id;
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
  IF public._ov2_gd_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      coalesce(meta, '{}'::jsonb),
      '{gd}',
      coalesce(meta -> 'gd', '{}'::jsonb) || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_cancel_rematch(
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
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member');
  END IF;
  IF NOT public._ov2_gd_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'gd' THEN jsonb_set(meta, '{gd}', (meta -> 'gd') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;
  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_start_next_match(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_goal_duel_sessions%ROWTYPE;
  v_ready int;
  v_next_ms int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
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
  SELECT * INTO v_sess FROM public.ov2_goal_duel_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Previous match must be finished');
  END IF;
  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;
  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_gd_member_rematch_requested(m.meta);
  IF v_ready < 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'Both players must request rematch first',
      'ready', v_ready
    );
  END IF;
  v_next_ms := coalesce(v_room.match_seq, 0) + 1;
  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'gd' THEN jsonb_set(m.meta, '{gd}', (m.meta -> 'gd') - 'rematch_requested' - 'rematch_at', true)
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

CREATE OR REPLACE FUNCTION public.ov2_goal_duel_claim_settlement(
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
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_goal_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Goal Duel room');
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
      AND coalesce(sl.line_kind, '') IN ('gd_win', 'gd_loss', 'gd_draw')
  ) INTO v_has_any;
  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
      AND coalesce(sl.line_kind, '') IN ('gd_win', 'gd_loss', 'gd_draw')
      AND sl.vault_delivered_at IS NULL
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
      AND coalesce(sl.line_kind, '') IN ('gd_win', 'gd_loss', 'gd_draw')
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

REVOKE ALL ON FUNCTION public.ov2_goal_duel_mark_match_events(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_mark_match_events(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_after_finish_emit_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_request_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_cancel_rematch(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_goal_duel_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_goal_duel_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
