-- OV2 Bomber Arena — clear ov2_rooms session pointers when a match finishes (rematch / host re-open readiness).
-- Apply after 163. Replaces only the finish trigger function body.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
  v_pot bigint;
  v_pk0 text;
  v_pk1 text;
  v_amt0 bigint;
  v_amt1 bigint;
  v_idem0 text;
  v_idem1 text;
  v_idemw text;
  v_wseat int;
  v_wpk text;
BEGIN
  IF NEW.phase IS DISTINCT FROM 'finished' THEN
    RETURN NULL;
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = v_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_pot := coalesce((
    SELECT r.pot_locked FROM public.ov2_rooms r WHERE r.id = v_room_id
  ), 0);
  v_pot := greatest(v_pot, 0);

  v_pk0 := trim(coalesce((
    SELECT s.participant_key FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sess_id AND s.seat_index = 0 LIMIT 1
  ), ''));
  v_pk1 := trim(coalesce((
    SELECT s.participant_key FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sess_id AND s.seat_index = 1 LIMIT 1
  ), ''));

  IF coalesce(NEW.is_draw, false) THEN
    IF length(v_pk0) = 0 OR length(v_pk1) = 0 THEN
      RETURN NULL;
    END IF;
    v_amt0 := (v_pot + 1) / 2;
    v_amt1 := v_pot / 2;
    v_idem0 := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_pk0 || ':ov2_bomber_arena_draw:0';
    v_idem1 := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_pk1 || ':ov2_bomber_arena_draw:1';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id, v_match_seq, v_pk0, 'ov2_bomber_arena_draw', v_amt0, v_idem0, v_sess_id,
      jsonb_build_object('gameId', 'ov2_bomber_arena', 'sessionId', v_sess_id, 'settlementMode', 'draw_split', 'seat', 0)
    ) ON CONFLICT (idempotency_key) DO NOTHING;
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id, v_match_seq, v_pk1, 'ov2_bomber_arena_draw', v_amt1, v_idem1, v_sess_id,
      jsonb_build_object('gameId', 'ov2_bomber_arena', 'sessionId', v_sess_id, 'settlementMode', 'draw_split', 'seat', 1)
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  ELSE
    v_wseat := NEW.winner_seat;
    IF v_wseat IS NULL OR v_wseat NOT IN (0, 1) THEN
      RETURN NULL;
    END IF;
    v_wpk := CASE WHEN v_wseat = 0 THEN v_pk0 ELSE v_pk1 END;
    IF length(v_wpk) = 0 THEN
      RETURN NULL;
    END IF;
    v_idemw := 'ov2:settle:' || v_room_id::text || ':' || v_match_seq::text || ':' || v_wpk || ':ov2_bomber_arena_win:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      v_wpk,
      'ov2_bomber_arena_win',
      v_pot,
      v_idemw,
      v_sess_id,
      jsonb_build_object(
        'gameId', 'ov2_bomber_arena',
        'sessionId', v_sess_id,
        'winnerSeat', v_wseat,
        'prize', v_pot,
        'credit', v_pot,
        'settlementMode', 'full_pot'
      )
    ) ON CONFLICT (idempotency_key) DO NOTHING;
  END IF;

  UPDATE public.ov2_bomber_arena_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id
    AND status IS DISTINCT FROM 'closed';

  UPDATE public.ov2_rooms
  SET
    active_session_id = NULL,
    active_runtime_id = NULL,
    updated_at = now()
  WHERE id = v_room_id
    AND active_session_id IS NOT DISTINCT FROM v_sess_id;

  RETURN NULL;
END;
$$;

COMMIT;
