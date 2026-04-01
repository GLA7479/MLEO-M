-- Rummy51: winner settlement line = full pooled pot (stake × seatCount), not net-of-own-stake.
-- Applies to all match finishes (normal last-player-standing and voluntary forfeit) — same trigger.
-- Idempotency keys unchanged: already-finished sessions keep existing line amounts until manually adjusted.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_winner text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
  v_entry bigint;
  v_seats int;
  v_prize bigint;
  v_loss bigint;
  v_winner_amount bigint;
  v_idem text;
  r_loss record;
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NULL;
  END IF;
  v_winner := nullif(trim(COALESCE(NEW.winner_participant_key, '')), '');
  IF v_winner IS NULL OR length(v_winner) = 0 THEN
    RETURN NULL;
  END IF;

  v_entry := COALESCE((NEW.match_meta ->> 'stakePerSeat')::bigint, 0);
  v_seats := COALESCE((NEW.match_meta ->> 'seatCount')::int, 0);
  IF v_seats IS NULL OR v_seats < 1 THEN
    v_seats := 1;
  END IF;
  v_loss := v_entry;
  v_prize := v_loss * v_seats;
  v_winner_amount := GREATEST(v_prize, 0);

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner || ':rummy51_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner,
    'rummy51_win',
    v_winner_amount,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_rummy51',
      'sessionId', v_sess_id,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'credit', v_winner_amount,
      'settlementMode', 'full_pot'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR r_loss IN
    SELECT key AS pk FROM jsonb_each(COALESCE(NEW.player_state, '{}'::jsonb))
    WHERE trim(key) IS DISTINCT FROM v_winner
  LOOP
    IF r_loss.pk IS NULL OR length(trim(r_loss.pk)) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r_loss.pk || ':rummy51_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r_loss.pk,
      'rummy51_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_rummy51', 'sessionId', v_sess_id)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  RETURN NULL;
END;
$$;

COMMIT;
