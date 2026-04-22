-- Hotfix: PL/pgSQL variable `r record` shadowed the table alias `r` in
-- `FROM public.ov2_rooms r WHERE r.id = ...`, so `r.id` referred to the
-- uninitialized RECORD → "record \"r\" is not assigned yet" at session finish.
-- Safe to apply after tanks/152 (replaces only the trigger function body).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_tanks_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
  v_winner_seat int;
  v_pot bigint;
  v_winner_pk text;
  v_idem text;
  v_loser record; -- not "r": PL/pgSQL resolves r.id to this RECORD before the FOR loop assigns it (shadows FROM ov2_rooms r).
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NULL;
  END IF;

  v_winner_seat := NEW.winner_seat;
  IF v_winner_seat IS NULL OR v_winner_seat NOT IN (0, 1) THEN
    RETURN NULL;
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = v_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_pot := coalesce((
    SELECT r.pot_locked
    FROM public.ov2_rooms r
    WHERE r.id = v_room_id
  ), 0);
  v_pot := greatest(v_pot, 0);

  SELECT trim(s.participant_key) INTO v_winner_pk
  FROM public.ov2_tanks_seats s
  WHERE s.session_id = v_sess_id
    AND s.seat_index = v_winner_seat
  LIMIT 1;

  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_winner_pk || ':ov2_tanks_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'ov2_tanks_win',
    v_pot,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_tanks',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_pot,
      'credit', v_pot,
      'settlementMode', 'full_pot'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR v_loser IN
    SELECT trim(s.participant_key) AS pk, s.seat_index
    FROM public.ov2_tanks_seats s
    WHERE s.session_id = v_sess_id
      AND s.seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF v_loser.pk IS NULL OR length(v_loser.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_loser.pk || ':ov2_tanks_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      v_loser.pk,
      'ov2_tanks_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object('gameId', 'ov2_tanks', 'sessionId', v_sess_id, 'seat', v_loser.seat_index, 'lossAlreadyCommitted', true)
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  UPDATE public.ov2_tanks_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id
    AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

COMMIT;
