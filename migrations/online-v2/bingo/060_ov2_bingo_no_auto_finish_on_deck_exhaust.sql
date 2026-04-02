-- Bingo: match does not auto-finish when the call deck is exhausted or time passes.
-- Finish only on successful full-card claim (existing) or last-player walkover (059).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bingo_call_next(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_order jsonb;
  v_n int;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active bingo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Calls only while playing');
  END IF;

  IF v_sess.caller_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CALLER', 'message', 'Only the designated caller can draw');
  END IF;

  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_REVISION',
      'message', 'Revision mismatch',
      'revision', v_sess.revision
    );
  END IF;

  IF v_sess.next_call_at IS NOT NULL AND v_now < v_sess.next_call_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALL_TOO_SOON', 'message', 'Next call not ready yet', 'next_call_at', v_sess.next_call_at);
  END IF;

  v_order := COALESCE(v_sess.deck->'order', '[]'::jsonb);

  IF jsonb_array_length(v_order) <> 75 OR v_sess.deck_pos >= 75 THEN
    IF v_sess.next_call_at IS NOT NULL OR v_sess.deck_pos < 75 THEN
      UPDATE public.ov2_bingo_sessions
      SET
        next_call_at = NULL,
        revision = revision + 1,
        updated_at = v_now
      WHERE id = v_sess.id
      RETURNING * INTO v_sess;
    END IF;

    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess),
      'deck_exhausted', true
    );
  END IF;

  v_n := (v_order->v_sess.deck_pos #>> '{}')::int;

  UPDATE public.ov2_bingo_sessions
  SET
    called = COALESCE(called, '[]'::jsonb) || jsonb_build_array(v_n),
    deck_pos = deck_pos + 1,
    last_number = v_n,
    revision = revision + 1,
    updated_at = v_now,
    phase = 'playing',
    next_call_at = CASE WHEN v_sess.deck_pos + 1 >= 75 THEN NULL ELSE v_now + interval '10 seconds' END
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess));
END;
$$;

COMMENT ON FUNCTION public.ov2_bingo_call_next(uuid, text, int) IS
  'OV2 Bingo: caller draws next ball when due. Deck exhaustion does not finish the match; finish on full claim or walkover only.';

COMMIT;
