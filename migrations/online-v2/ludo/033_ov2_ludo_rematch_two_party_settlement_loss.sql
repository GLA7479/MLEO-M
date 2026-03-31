-- Ludo: two-party rematch (request → start-next by host) + re-stake flow; settlement lines
-- apply real loss debit (ludo_loss amount = lossPerSeat) with net win for winner (unchanged v_credit).
-- Replaces instant ov2_ludo_rematch session create with lifecycle reset to pending_stakes.

BEGIN;

-- -----------------------------------------------------------------------------
-- Helper: rematch intent in member meta (jsonb)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._ov2_ludo_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    (p_meta->'ludo'->>'rematch_requested') IN ('true', 't', '1')
    OR (p_meta->'ludo'->'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb;
$$;

-- -----------------------------------------------------------------------------
-- Finish settlement: loser lines carry real per-seat loss (Vault debit on claim).
-- Winner line remains net credit (v_prize - v_loss) for N-player pots.
-- -----------------------------------------------------------------------------
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
      v_loss,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_ludo', 'sessionId', v_sess_id, 'seat', r.seat_index, 'lossPerSeat', v_loss)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  UPDATE public.ov2_ludo_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id
    AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

-- -----------------------------------------------------------------------------
-- ov2_ludo_request_rematch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_request_rematch(
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
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after the match is finished');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.seat_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'Take a seat to rematch');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_ludo_seats s WHERE s.session_id = v_sess.id AND s.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat in this session for this member');
  END IF;

  IF public._ov2_ludo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{ludo}',
      COALESCE(meta->'ludo', '{}'::jsonb)
        || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

-- -----------------------------------------------------------------------------
-- ov2_ludo_cancel_rematch
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_cancel_rematch(
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
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Cancel rematch only after a finished match');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF NOT public._ov2_ludo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'ludo' THEN
        jsonb_set(meta, '{ludo}', (meta->'ludo') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

-- -----------------------------------------------------------------------------
-- ov2_ludo_start_next_match — host; all seated committed players must have requested rematch.
-- Resets stakes and clears active session; room returns to pending_stakes for new ov2_stake_commit + open_session.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_start_next_match(
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
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can start the next match');
  END IF;

  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_MATCH_SEQ',
      'message', 'Room match_seq changed; refresh and try again',
      'match_seq', v_room.match_seq
    );
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No Ludo session to continue from');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Previous match must be finished');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room');
  END IF;

  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated committed players');
  END IF;

  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_ludo_member_rematch_requested(m.meta);

  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All seated players must tap rematch before the host can start the next match',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;

  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;

  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'ludo' THEN
        jsonb_set(m.meta, '{ludo}', (m.meta->'ludo') - 'rematch_requested' - 'rematch_at', true)
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
    pot_locked = 0,
    lifecycle_phase = 'pending_stakes',
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'ok', true,
    'match_seq', v_next_ms,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- Drop legacy one-click rematch (replaced by request + start_next_match).
DROP FUNCTION IF EXISTS public.ov2_ludo_rematch(uuid, text);

REVOKE ALL ON FUNCTION public._ov2_ludo_member_rematch_requested(jsonb) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_ludo_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_request_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_cancel_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_start_next_match(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_start_next_match(uuid, text, integer) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_ludo_request_rematch(uuid, text) IS 'Ludo OV2: seated committed member requests rematch after active session finished.';
COMMENT ON FUNCTION public.ov2_ludo_cancel_rematch(uuid, text) IS 'Ludo OV2: withdraw rematch request on finished active session.';
COMMENT ON FUNCTION public.ov2_ludo_start_next_match(uuid, text, integer) IS 'Ludo OV2: host starts next match after all seated committed players requested rematch; resets stakes to pending_stakes.';

COMMIT;
