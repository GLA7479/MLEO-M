-- OV2 Bomber Arena — wire finishReason=forfeit on leave/forfeit path (board.meta).
-- Replaces public.ov2_bomber_arena_leave_or_forfeit from 162; apply after 162 (and after 171 if snapshot reads meta.finishReason).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_leave_or_forfeit(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_product text;
  v_sid uuid;
  v_my_seat int;
  v_other_seat int;
  v_alive_other boolean;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  IF NOT coalesce(p_forfeit_game, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'FORFEIT_REQUIRED', 'message', 'forfeit flag required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bomber Arena room');
  END IF;

  v_sid := (SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1);
  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  PERFORM 1 FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF (SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1) IS DISTINCT FROM 'playing' THEN
    v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sid, v_pk);
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snap);
  END IF;

  v_my_seat := (
    SELECT s.seat_index
    FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sid AND trim(s.participant_key) = v_pk
    LIMIT 1
  );
  IF v_my_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Not in this session');
  END IF;

  UPDATE public.ov2_bomber_arena_seats
  SET is_alive = false
  WHERE session_id = v_sid
    AND seat_index = v_my_seat;

  v_other_seat := CASE WHEN v_my_seat = 0 THEN 1 ELSE 0 END;

  v_alive_other := coalesce((
    SELECT s.is_alive
    FROM public.ov2_bomber_arena_seats s
    WHERE s.session_id = v_sid AND s.seat_index = v_other_seat
    LIMIT 1
  ), false);

  IF v_alive_other THEN
    UPDATE public.ov2_bomber_arena_sessions s
    SET
      phase = 'finished',
      winner_seat = v_other_seat,
      is_draw = false,
      board = jsonb_set(
        coalesce(s.board, '{}'::jsonb),
        '{meta}',
        coalesce(s.board -> 'meta', '{}'::jsonb) || jsonb_build_object('finishReason', 'forfeit'),
        true
      ),
      revision = s.revision + 1,
      updated_at = now()
    WHERE s.id = v_sid;
  ELSE
    UPDATE public.ov2_bomber_arena_sessions s
    SET
      phase = 'finished',
      winner_seat = NULL,
      is_draw = true,
      board = jsonb_set(
        coalesce(s.board, '{}'::jsonb),
        '{meta}',
        coalesce(s.board -> 'meta', '{}'::jsonb) || jsonb_build_object('finishReason', 'forfeit'),
        true
      ),
      revision = s.revision + 1,
      updated_at = now()
    WHERE s.id = v_sid;
  END IF;

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_sid, v_pk);
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_leave_or_forfeit(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_leave_or_forfeit(uuid, text, boolean) TO anon, authenticated, service_role;

COMMIT;
