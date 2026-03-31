-- Replace bingo-specific seat RPCs with product-aware room seat helpers.
-- Ludo RPC names remain as wrappers for compatibility.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_room_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_upd int;
  v_hi int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' AND v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'This room does not use manual seat claims');
  END IF;

  v_hi := CASE WHEN v_room.product_game_id = 'ov2_ludo' THEN 3 ELSE 7 END;

  IF p_seat_index IS NULL OR p_seat_index < 0 OR p_seat_index > v_hi THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_SEAT',
      'message', format('Seat must be 0..%s', v_hi)
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key <> v_pk
      AND m.seat_index = p_seat_index
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEAT_TAKEN', 'message', 'Seat taken');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = p_seat_index, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_room_leave_seat(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_upd int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' AND v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'This room does not use manual seat claims');
  END IF;

  UPDATE public.ov2_room_members
  SET seat_index = NULL, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_claim_seat(
  p_room_id uuid,
  p_participant_key text,
  p_seat_index integer
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ov2_room_claim_seat(p_room_id, p_participant_key, p_seat_index);
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_leave_seat(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.ov2_room_leave_seat(p_room_id, p_participant_key);
$$;

DROP FUNCTION IF EXISTS public.ov2_bingo_claim_seat(uuid, text, integer);
DROP FUNCTION IF EXISTS public.ov2_bingo_leave_seat(uuid, text);

REVOKE ALL ON FUNCTION public.ov2_room_claim_seat(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_room_claim_seat(uuid, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_room_leave_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_room_leave_seat(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_claim_seat(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_claim_seat(uuid, text, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_leave_seat(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_leave_seat(uuid, text) TO anon, authenticated, service_role;

COMMIT;
