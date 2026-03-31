-- Fix Ludo rematch UNIQUE(room_id, match_seq) collision by bumping room.match_seq.
-- Emit ov2_settlement_lines on match finish so clients can claim vault credit (parity with Board Path).
-- New RPC ov2_ludo_claim_settlement — same delivery semantics as ov2_board_path_claim_settlement
-- but for product_game_id = ov2_ludo and no room settlement_status gate.

BEGIN;

-- =============================================================================
-- ov2_ludo_rematch — new session uses room.match_seq + 1; room row updated.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_rematch(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_prev public.ov2_ludo_sessions%ROWTYPE;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_committed int;
  v_active int[];
  v_board jsonb;
  v_next_ms int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can start rematch');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can start rematch');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No Ludo session to rematch');
  END IF;
  SELECT * INTO v_prev FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_prev.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after finished match');
  END IF;

  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_committed < 2 OR v_committed > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT_COUNT', 'message', 'Need 2-4 seated players');
  END IF;

  SELECT array_agg(m.seat_index ORDER BY m.seat_index ASC)
  INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL;
  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;

  v_board := public.ov2_ludo_initial_board_json(v_active);
  INSERT INTO public.ov2_ludo_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, dice_value, last_dice, winner_seat, active_seats,
    current_turn, turn_deadline, parity_state
  ) VALUES (
    p_room_id,
    v_next_ms,
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
  SET active_session_id = v_sess.id, match_seq = v_next_ms, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_rematch(uuid, text) TO anon, authenticated, service_role;

-- =============================================================================
-- After transition to finished: creditable settlement line(s) for winner + zero lines for losers.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_after_finish_emit_settlement()
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
  v_credit bigint;
  v_entry bigint;
  v_mult int;
  v_seat_count int;
  r record;
  v_idem text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
BEGIN
  v_res := COALESCE(NEW.parity_state, '{}'::jsonb) -> '__result__';
  IF v_res IS NULL OR jsonb_typeof(v_res) = 'null' THEN
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
  FROM public.ov2_ludo_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;

  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;

  v_entry := COALESCE((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_mult := COALESCE((NEW.parity_state -> '__double__' ->> 'value')::int, 1);
  IF v_mult IS NULL OR v_mult < 1 THEN
    v_mult := 1;
  END IF;

  v_prize := COALESCE(NULLIF((v_res ->> 'prize'), '')::bigint, 0);
  v_loss := COALESCE(NULLIF((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry * v_mult;
  END IF;

  SELECT count(*)::int INTO v_seat_count FROM public.ov2_ludo_seats WHERE session_id = v_sess_id;
  IF v_prize IS NULL OR v_prize <= 0 THEN
    IF v_seat_count > 0 AND v_loss > 0 THEN
      v_prize := v_loss * v_seat_count;
    ELSE
      v_prize := 0;
    END IF;
  END IF;

  v_credit := v_prize - v_loss;
  IF v_credit < 0 THEN
    v_credit := 0;
  END IF;

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':ludo_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'ludo_win',
    v_credit,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_ludo',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'credit', v_credit
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR r IN
    SELECT trim(participant_key) AS pk, seat_index
    FROM public.ov2_ludo_seats
    WHERE session_id = v_sess_id
      AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':ludo_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'ludo_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_ludo', 'sessionId', v_sess_id, 'seat', r.seat_index)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_ludo_finish_settlement ON public.ov2_ludo_sessions;
CREATE TRIGGER trg_ov2_ludo_finish_settlement
AFTER UPDATE OF phase ON public.ov2_ludo_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_ludo_after_finish_emit_settlement();

-- =============================================================================
-- ov2_ludo_claim_settlement — mark undelivered lines + return amounts (Ludo rooms only).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_claim_settlement(
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

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

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
      AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member of this room');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
  )
  INTO v_has_any;

  SELECT EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND sl.vault_delivered_at IS NULL
  )
  INTO v_has_undelivered;

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
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'amount', u.amount,
          'line_kind', u.line_kind,
          'idempotency_key', u.idempotency_key,
          'match_seq', u.match_seq
        )
        ORDER BY u.match_seq, u.id
      ),
      '[]'::jsonb
    ),
    COALESCE(sum(u.amount), 0)::bigint
  INTO v_lines, v_total
  FROM u;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'room_id', p_room_id,
    'participant_key', v_pk,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'total_amount', COALESCE(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
