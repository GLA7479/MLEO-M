-- OV2 Bomber Arena — get_snapshot must work after active_session_id is cleared on finish.
-- Otherwise the surviving client never receives phase=finished (fetch returns NO_SESSION) and keeps playing.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_get_snapshot(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_product text;
  v_active uuid;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ov2_rooms r WHERE r.id = p_room_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_product := (
    SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1
  );
  IF v_product IS DISTINCT FROM 'ov2_bomber_arena' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bomber Arena room');
  END IF;

  v_active := (
    SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1
  );

  -- After finish, ov2_bomber_arena_after_finish_emit_settlement clears active_session_id while the session row
  -- remains (finished/closed). Resolve the latest session for this room so clients can render the result modal.
  IF v_active IS NULL THEN
    v_active := (
      SELECT s.id
      FROM public.ov2_bomber_arena_sessions s
      WHERE s.room_id = p_room_id
      ORDER BY s.match_seq DESC NULLS LAST, s.updated_at DESC NULLS LAST, s.created_at DESC NULLS LAST
      LIMIT 1
    );
  END IF;

  IF v_active IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  v_snap := public.ov2_bomber_arena_build_client_snapshot(v_active, v_pk);
  IF v_snap ? 'error' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_get_snapshot(uuid, text) TO anon, authenticated, service_role;

COMMIT;
