-- OV2 Ludo follow-up:
-- 1) ov2_ludo_claim_settlement / ov2_board_path_claim_settlement — PostgreSQL requires a
--    data-modifying CTE (WITH ... UPDATE ... RETURNING) at the statement top level, not
--    nested under FROM (subselect). Fixes 400 / SQL parse failures on claim RPCs.
-- 2) ov2_ludo_primary_session_id — prefer non-finished live sessions, then newest first
--    (fixes rematch reverting to oldest finished session while another live session exists).
-- 3) On Ludo finish: mark session status = closed so only the current in-progress match is live.
-- 4) ov2_ludo_get_snapshot — allow reading the room pointer session after it is closed (finished).
-- 5) Backfill: finished Ludo sessions that were still status=live become closed.

BEGIN;

-- -----------------------------------------------------------------------------
-- Backfill: historical finished rows should not compete as "live" primaries
-- -----------------------------------------------------------------------------
UPDATE public.ov2_ludo_sessions s
SET status = 'closed', updated_at = now()
WHERE s.phase IS NOT DISTINCT FROM 'finished'
  AND s.status IS NOT DISTINCT FROM 'live';

-- -----------------------------------------------------------------------------
-- Finish settlement trigger: close session row after emitting settlement lines
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
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_ludo', 'sessionId', v_sess_id, 'seat', r.seat_index)
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
-- Primary session: newest active (non-finished) live match wins; else newest live row
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_primary_session_id(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary uuid;
  v_dupes uuid[];
BEGIN
  SELECT s.id
  INTO v_primary
  FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id AND s.status = 'live'
  ORDER BY
    CASE WHEN s.phase IS DISTINCT FROM 'finished' THEN 0 ELSE 1 END,
    s.created_at DESC NULLS LAST,
    s.id DESC
  LIMIT 1;

  IF v_primary IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[])
  INTO v_dupes
  FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
    AND s.id <> v_primary;

  IF cardinality(v_dupes) > 0 THEN
    INSERT INTO public.ov2_ludo_seats (session_id, seat_index, participant_key, room_member_id, meta)
    SELECT
      v_primary,
      ds.seat_index,
      ds.participant_key,
      ds.room_member_id,
      COALESCE(ds.meta, '{}'::jsonb)
    FROM public.ov2_ludo_seats ds
    WHERE ds.session_id = ANY(v_dupes)
    ORDER BY ds.created_at ASC, ds.id ASC
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.ov2_ludo_sessions s
  WHERE s.room_id = p_room_id
    AND s.status = 'live'
    AND s.id <> v_primary;

  UPDATE public.ov2_rooms
  SET active_session_id = v_primary, updated_at = now()
  WHERE id = p_room_id
    AND active_session_id IS DISTINCT FROM v_primary;

  RETURN v_primary;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_primary_session_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_primary_session_id(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Snapshot: room.active_session_id may point at a closed (finished) session — still readable
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_ludo_get_snapshot(
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
  v_sess public.ov2_ludo_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_ludo_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Ludo session not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_get_snapshot(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Ludo claim settlement — top-level WITH (Postgres-compatible)
-- -----------------------------------------------------------------------------
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

-- -----------------------------------------------------------------------------
-- Board Path claim — same top-level WITH fix (parity)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_board_path_claim_settlement(
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

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF v_room.settlement_status IS DISTINCT FROM 'finalized' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_FINALIZED',
      'message', 'Room must be settlement-finalized before claiming'
    );
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

REVOKE ALL ON FUNCTION public.ov2_board_path_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
