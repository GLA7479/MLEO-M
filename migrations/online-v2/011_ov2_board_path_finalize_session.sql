-- Board Path Phase 5: session settlement finalization (ledger only; no vault I/O).
-- Apply after 010_ov2_board_path_rematch_rpcs.sql.

BEGIN;

-- --- Economy log: allow session_finalize marker for idempotent settlement RPCs ---

ALTER TABLE public.ov2_economy_events
  DROP CONSTRAINT IF EXISTS ov2_economy_events_kind_chk;

ALTER TABLE public.ov2_economy_events
  ADD CONSTRAINT ov2_economy_events_kind_chk CHECK (
    event_kind = ANY (
      ARRAY[
        'reserve',
        'commit',
        'release_reserve',
        'refund',
        'forfeit',
        'adjust',
        'session_finalize'
      ]::text[]
    )
  );

-- --- Session row: DB-authoritative settlement / finalization ---

ALTER TABLE public.ov2_board_path_sessions
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_by_participant_key text,
  ADD COLUMN IF NOT EXISTS settlement_revision bigint NOT NULL DEFAULT 0;

UPDATE public.ov2_board_path_sessions
SET
  settlement_status = 'pending',
  settlement_revision = 0
WHERE settlement_status IS NULL OR trim(settlement_status) = '';

UPDATE public.ov2_board_path_sessions
SET settlement_revision = 0
WHERE settlement_revision IS NULL OR settlement_revision < 0;

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_settlement_status_chk;

ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_settlement_status_chk
  CHECK (settlement_status IN ('pending', 'finalized'));

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_settlement_revision_chk;

ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_settlement_revision_chk
  CHECK (settlement_revision >= 0);

CREATE INDEX IF NOT EXISTS idx_ov2_settlement_lines_game_session
  ON public.ov2_settlement_lines (game_session_id);

-- --- Session JSON: expose settlement fields to clients ---

CREATE OR REPLACE FUNCTION public.ov2_board_path_session_to_jsonb(p_session public.ov2_board_path_sessions)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_session.id,
    'room_id', p_session.room_id,
    'match_seq', p_session.match_seq,
    'status', p_session.status,
    'phase', p_session.phase,
    'engine_phase', p_session.engine_phase,
    'turn_index', p_session.turn_index,
    'active_seat_index', p_session.active_seat_index,
    'winner_seat_index', p_session.winner_seat_index,
    'round_index', p_session.round_index,
    'turn_meta', COALESCE(p_session.turn_meta, '{}'::jsonb),
    'board_state', COALESCE(p_session.board_state, '{}'::jsonb),
    'event_log', COALESCE(p_session.event_log, '[]'::jsonb),
    'revision', p_session.revision,
    'settlement_status', COALESCE(p_session.settlement_status, 'pending'),
    'finalized_at', p_session.finalized_at,
    'finalized_by_participant_key', p_session.finalized_by_participant_key,
    'settlement_revision', COALESCE(p_session.settlement_revision, 0),
    'created_at', p_session.created_at
  );
$$;

-- =============================================================================
-- ov2_board_path_finalize_session(room_id, session_id, host participant_key)
-- Idempotent; targets explicit session row (safe after active_session_id moves).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_finalize_session(
  p_room_id uuid,
  p_session_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_pk text;
  v_host text;
  v_idem_event text;
  v_seat_n int;
  v_stake bigint;
  v_pot bigint;
  v_widx int;
  v_winner_pk text;
  v_loser_pk text;
  v_lines jsonb := '[]'::jsonb;
  v_summary jsonb;
  v_amount_event bigint;
  v_idem_line text;
  v_meta jsonb;
  v_was_final boolean;
  v_updated int;
  r record;
BEGIN
  IF p_room_id IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and session_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  v_host := trim(COALESCE(v_room.host_participant_key, ''));
  IF length(v_host) = 0 OR v_pk IS DISTINCT FROM v_host THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the room host may finalize settlement');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE id = p_session_id AND room_id = p_room_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found for room');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'ended' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENDED', 'message', 'Session must be in ended phase');
  END IF;

  v_was_final := v_sess.settlement_status IS NOT DISTINCT FROM 'finalized';

  IF v_was_final THEN
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'recipient_participant_key', sl.recipient_participant_key,
        'line_kind', sl.line_kind,
        'amount', sl.amount,
        'result_type', COALESCE(sl.meta->>'resultType', sl.meta->>'result_type')
      )
      ORDER BY sl.recipient_participant_key, sl.line_kind
    ), '[]'::jsonb)
    INTO v_lines
    FROM public.ov2_settlement_lines sl
    WHERE sl.game_session_id = v_sess.id;

    v_summary := jsonb_build_object(
      'outcome', CASE
        WHEN v_sess.winner_seat_index IS NULL THEN 'draw'
        ELSE 'win_loss'
      END,
      'winner_seat_index', v_sess.winner_seat_index,
      'settled_amount', COALESCE((
        SELECT sum(sl.amount)::bigint FROM public.ov2_settlement_lines sl
        WHERE sl.game_session_id = v_sess.id AND sl.line_kind = 'board_path_win'
      ), 0),
      'participant_count', (SELECT count(*)::int FROM public.ov2_board_path_seats WHERE session_id = v_sess.id)
    );

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'room_id', v_room.id,
      'session_id', v_sess.id,
      'match_seq', v_sess.match_seq,
      'finalized', true,
      'finalized_at', v_sess.finalized_at,
      'settlement_status', v_sess.settlement_status,
      'settlement_revision', v_sess.settlement_revision,
      'settlement_summary', v_summary,
      'settlement_lines', v_lines
    );
  END IF;

  SELECT count(*)::int INTO v_seat_n FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;
  IF v_seat_n < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEATS', 'message', 'Session has no seats');
  END IF;

  v_stake := COALESCE(v_room.stake_per_seat, 0);
  IF COALESCE(v_room.pot_locked, 0) > 0 THEN
    v_pot := v_room.pot_locked;
  ELSE
    v_pot := (v_seat_n::bigint * v_stake);
  END IF;
  IF v_pot < 0 THEN
    v_pot := 0;
  END IF;

  v_widx := v_sess.winner_seat_index;
  v_winner_pk := NULL;
  v_loser_pk := NULL;

  IF v_widx IS NOT NULL THEN
    SELECT trim(participant_key) INTO v_winner_pk
    FROM public.ov2_board_path_seats
    WHERE session_id = v_sess.id AND seat_index = v_widx
    LIMIT 1;
    SELECT trim(participant_key) INTO v_loser_pk
    FROM public.ov2_board_path_seats
    WHERE session_id = v_sess.id AND participant_key IS DISTINCT FROM v_winner_pk
    LIMIT 1;
  END IF;

  v_idem_event := 'ov2:bp:finalize:' || v_sess.id::text;

  IF v_winner_pk IS NOT NULL AND v_loser_pk IS NOT NULL THEN
    v_amount_event := v_pot;

    v_idem_line := 'ov2:settle:' || v_room.id::text || ':' || v_sess.match_seq::text || ':' || v_winner_pk || ':board_path_win:';
    v_meta := jsonb_build_object(
      'roomId', v_room.id,
      'sessionId', v_sess.id,
      'gameId', 'ov2_board_path',
      'matchSeq', v_sess.match_seq,
      'phase', v_sess.phase,
      'winnerSeatIndex', v_sess.winner_seat_index,
      'winnerParticipantKey', v_winner_pk,
      'resultType', 'win',
      'netAmount', v_pot,
      'grossAmount', v_pot
    );
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room.id, v_sess.match_seq, v_winner_pk, 'board_path_win', v_pot, v_idem_line, v_sess.id, v_meta
    ) ON CONFLICT (idempotency_key) DO NOTHING;

    v_idem_line := 'ov2:settle:' || v_room.id::text || ':' || v_sess.match_seq::text || ':' || v_loser_pk || ':board_path_loss:';
    v_meta := jsonb_build_object(
      'roomId', v_room.id,
      'sessionId', v_sess.id,
      'gameId', 'ov2_board_path',
      'matchSeq', v_sess.match_seq,
      'phase', v_sess.phase,
      'winnerSeatIndex', v_sess.winner_seat_index,
      'winnerParticipantKey', v_winner_pk,
      'resultType', 'loss',
      'netAmount', 0,
      'grossAmount', 0
    );
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room.id, v_sess.match_seq, v_loser_pk, 'board_path_loss', 0, v_idem_line, v_sess.id, v_meta
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    v_amount_event := 0;
    FOR r IN
      SELECT trim(COALESCE(participant_key, '')) AS pk
      FROM public.ov2_board_path_seats
      WHERE session_id = v_sess.id
        AND trim(COALESCE(participant_key, '')) <> ''
      ORDER BY seat_index
    LOOP
      v_idem_line := 'ov2:settle:' || v_room.id::text || ':' || v_sess.match_seq::text || ':' || r.pk || ':board_path_draw:';
      v_meta := jsonb_build_object(
        'roomId', v_room.id,
        'sessionId', v_sess.id,
        'gameId', 'ov2_board_path',
        'matchSeq', v_sess.match_seq,
        'phase', v_sess.phase,
        'winnerSeatIndex', v_sess.winner_seat_index,
        'winnerParticipantKey', NULL,
        'resultType', 'draw',
        'netAmount', 0,
        'grossAmount', 0
      );
      INSERT INTO public.ov2_settlement_lines (
        room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
      ) VALUES (
        v_room.id, v_sess.match_seq, r.pk, 'board_path_draw', 0, v_idem_line, v_sess.id, v_meta
      ) ON CONFLICT (idempotency_key) DO NOTHING;
    END LOOP;
  END IF;

  INSERT INTO public.ov2_economy_events (
    room_id,
    participant_key,
    event_kind,
    amount,
    match_seq,
    idempotency_key,
    payload
  ) VALUES (
    v_room.id,
    v_winner_pk,
    'session_finalize',
    v_amount_event,
    v_sess.match_seq,
    v_idem_event,
    jsonb_build_object(
      'game_id', 'ov2_board_path',
      'session_id', v_sess.id,
      'match_seq', v_sess.match_seq,
      'outcome', CASE WHEN v_winner_pk IS NOT NULL THEN 'win_loss' ELSE 'draw' END,
      'pot', v_pot
    )
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  -- Single authority for first-time finalization: only rows still `pending` are updated; `settlement_revision`
  -- increments in lockstep with that transition (not on all-ON-CONFLICT-no-op retries or concurrent losers).
  UPDATE public.ov2_board_path_sessions
  SET
    settlement_status = 'finalized',
    finalized_at = COALESCE(finalized_at, now()),
    finalized_by_participant_key = COALESCE(finalized_by_participant_key, v_pk),
    settlement_revision = settlement_revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
    AND settlement_status IS NOT DISTINCT FROM 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE id = p_session_id AND room_id = p_room_id;

  IF v_updated = 0 THEN
    IF v_sess.settlement_status IS DISTINCT FROM 'finalized' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'FINALIZE_STATE',
        'message', 'Session could not be marked finalized'
      );
    END IF;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'recipient_participant_key', sl.recipient_participant_key,
      'line_kind', sl.line_kind,
      'amount', sl.amount,
      'result_type', COALESCE(sl.meta->>'resultType', sl.meta->>'result_type')
    )
    ORDER BY sl.recipient_participant_key, sl.line_kind
  ), '[]'::jsonb)
  INTO v_lines
  FROM public.ov2_settlement_lines sl
  WHERE sl.game_session_id = v_sess.id;

  v_summary := jsonb_build_object(
    'outcome', CASE WHEN v_winner_pk IS NOT NULL THEN 'win_loss' ELSE 'draw' END,
    'winner_seat_index', v_sess.winner_seat_index,
    'winner_participant_key', v_winner_pk,
    'settled_amount', COALESCE((
      SELECT sum(sl.amount)::bigint FROM public.ov2_settlement_lines sl
      WHERE sl.game_session_id = v_sess.id AND sl.line_kind = 'board_path_win'
    ), 0),
    'participant_count', v_seat_n
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', (v_updated = 0),
    'room_id', v_room.id,
    'session_id', v_sess.id,
    'match_seq', v_sess.match_seq,
    'finalized', true,
    'finalized_at', v_sess.finalized_at,
    'settlement_status', v_sess.settlement_status,
    'settlement_revision', v_sess.settlement_revision,
    'settlement_summary', v_summary,
    'settlement_lines', v_lines
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_board_path_finalize_session(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_finalize_session(uuid, uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_board_path_finalize_session(uuid, uuid, text) IS
  'Board Path: host finalizes ended session — settlement_lines + session_finalize economy row; idempotent.';

COMMIT;
