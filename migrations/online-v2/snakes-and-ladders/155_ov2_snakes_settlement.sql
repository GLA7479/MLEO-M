-- OV2 Snakes & Ladders: settlement trigger + claim_settlement. Apply after 154.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_snakes_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner_seat int;
  v_winner_pk text;
  v_winner_amount bigint;
  v_idem text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NULL;
  END IF;

  v_winner_seat := COALESCE(NEW.winner_seat, (NEW.board -> 'result' ->> 'winnerSeat')::int, NULL);
  IF v_winner_seat IS NULL THEN
    RETURN NULL;
  END IF;

  v_winner_pk := (
    SELECT trim(s.participant_key)
    FROM public.ov2_snakes_seats s
    WHERE s.session_id = v_sess_id
      AND s.seat_index = v_winner_seat
    LIMIT 1
  );

  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = v_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_winner_amount := COALESCE((
    SELECT r.pot_locked
    FROM public.ov2_rooms r
    WHERE r.id = v_room_id
  ), 0);

  v_winner_amount := GREATEST(COALESCE(v_winner_amount, 0), 0);

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_winner_pk || ':ov2_snakes_win:';

  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'ov2_snakes_win',
    v_winner_amount,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_snakes_and_ladders',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_winner_amount,
      'credit', v_winner_amount,
      'settlementMode', 'full_pot'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.ov2_snakes_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id
    AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_snakes_finish_settlement ON public.ov2_snakes_sessions;

CREATE TRIGGER trg_ov2_snakes_finish_settlement
AFTER UPDATE OF phase ON public.ov2_snakes_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_snakes_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public.ov2_snakes_claim_settlement(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text;
  v_room_product_game_id text;
  v_has_any boolean;
  v_has_undelivered boolean;
  v_lines jsonb := '[]'::jsonb;
  v_total bigint := 0;
  v_idempotent boolean;
  v_line record;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF v_room_product_game_id IS DISTINCT FROM 'ov2_snakes_and_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member of this room');
  END IF;

  v_has_any := EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND coalesce(sl.line_kind, '') = 'ov2_snakes_win'
  );

  v_has_undelivered := EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND coalesce(sl.line_kind, '') = 'ov2_snakes_win'
      AND sl.vault_delivered_at IS NULL
  );

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

  FOR v_line IN
    UPDATE public.ov2_settlement_lines sl
    SET vault_delivered_at = now()
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND coalesce(sl.line_kind, '') = 'ov2_snakes_win'
      AND sl.vault_delivered_at IS NULL
    RETURNING sl.id, sl.amount, sl.line_kind, sl.idempotency_key, sl.match_seq
  LOOP
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object(
        'id', v_line.id,
        'amount', v_line.amount,
        'line_kind', v_line.line_kind,
        'idempotency_key', v_line.idempotency_key,
        'match_seq', v_line.match_seq
      )
    );
    v_total := v_total + COALESCE(v_line.amount, 0);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'room_id', p_room_id,
    'participant_key', v_pk,
    'lines', v_lines,
    'total_amount', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_after_finish_emit_settlement() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_snakes_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
