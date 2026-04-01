-- Rummy51: put back the card taken from discard before submitting the turn (same turn only).

CREATE OR REPLACE FUNCTION public.ov2_rummy51_undo_discard_draw(
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
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_hand jsonb;
  v_card jsonb;
  v_hand_rest jsonb;
  v_disc jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Arguments required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Not playing');
  END IF;
  IF v_sess.turn_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_REVISION', 'revision', v_sess.revision);
  END IF;
  IF v_sess.pending_draw_source IS DISTINCT FROM 'discard' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_UNDO', 'message', 'Only discard draws can be returned before submit');
  END IF;

  v_hand := coalesce(v_sess.hands -> v_pk, '[]'::jsonb);
  SELECT pl.elem, pl.rest INTO v_card, v_hand_rest FROM public._ov2_r51_jsonb_pop_last(v_hand) AS pl;
  IF v_card IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'HAND_EMPTY', 'message', 'Hand empty');
  END IF;
  IF v_sess.taken_discard_card_id IS NOT NULL AND (v_card ->> 'id') IS DISTINCT FROM v_sess.taken_discard_card_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DRAW_MISMATCH', 'message', 'Cannot return — hand out of sync; refresh');
  END IF;

  v_disc := public._ov2_r51_jsonb_push(coalesce(v_sess.discard, '[]'::jsonb), v_card);
  UPDATE public.ov2_rummy51_sessions
  SET
    hands = jsonb_set(coalesce(hands, '{}'::jsonb), ARRAY[v_pk], v_hand_rest, true),
    discard = v_disc,
    pending_draw_source = NULL,
    taken_discard_card_id = NULL,
    revision = revision + 1
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_undo_discard_draw(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_undo_discard_draw(uuid, text, integer) TO anon, authenticated, service_role;
