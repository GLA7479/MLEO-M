-- Ludo: align finish settlement with Rummy51 shared-room economics (056).
-- Stakes are already committed + client-vault-debited via ov2_stake_commit (shared lobby).
-- Winner line = full pooled prize (stake-derived pot); loser ludo_loss lines = 0 (no second vault debit on claim).
-- Idempotency keys unchanged (ON CONFLICT DO NOTHING preserves existing rows until manual fix).

BEGIN;

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
  v_winner_amount bigint;
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

  v_winner_amount := GREATEST(v_prize, 0);

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':ludo_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'ludo_win',
    v_winner_amount,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_ludo',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'credit', v_winner_amount,
      'settlementMode', 'full_pot'
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
      jsonb_build_object(
        'gameId', 'ov2_ludo',
        'sessionId', v_sess_id,
        'seat', r.seat_index,
        'lossPerSeat', v_loss,
        'settlementMode', 'full_pot'
      )
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

COMMENT ON FUNCTION public.ov2_ludo_after_finish_emit_settlement() IS
  'Ludo finish: winner credit = full pot (parity with ov2_rummy51 full-pot model); ludo_loss rows amount 0 (stake already debited at commit).';

COMMIT;
