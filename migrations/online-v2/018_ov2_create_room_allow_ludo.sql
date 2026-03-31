-- Extend ov2_create_room allowlist for Ludo (canonical id ov2_ludo, aligned with client ONLINE_V2_GAME_KINDS + Ludo RPCs).
-- Apply after 006_ov2_room_lifecycle_v2.sql. Idempotent with 006 if both are applied in order.

CREATE OR REPLACE FUNCTION public.ov2_create_room(
  p_product_game_id text,
  p_title text,
  p_stake_per_seat bigint,
  p_host_participant_key text,
  p_display_name text,
  p_is_private boolean DEFAULT false,
  p_passcode text DEFAULT NULL,
  p_max_seats integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game text;
  v_stake bigint;
  v_cap int;
  v_host text;
  v_title text;
  v_room public.ov2_rooms%ROWTYPE;
BEGIN
  v_game := trim(COALESCE(p_product_game_id, ''));
  IF v_game NOT IN ('ov2_board_path', 'ov2_mark_grid', 'ov2_ludo') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_GAME_ID',
      'message', 'Unknown or invalid OV2 game id.'
    );
  END IF;

  v_stake := p_stake_per_seat;
  IF v_stake IS NULL OR v_stake < 100 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKE_BELOW_MINIMUM',
      'message', 'Stake per seat must be at least 100.'
    );
  END IF;

  v_cap := COALESCE(p_max_seats, 8);
  IF v_cap < 2 OR v_cap > 16 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_CAPACITY',
      'message', 'Room capacity must be between 2 and 16 seats.'
    );
  END IF;

  v_host := trim(COALESCE(p_host_participant_key, ''));
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARGUMENT',
      'message', 'Host participant is required.'
    );
  END IF;

  v_title := COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Table');

  INSERT INTO public.ov2_rooms (
    product_game_id,
    title,
    lifecycle_phase,
    stake_per_seat,
    host_participant_key,
    is_private,
    passcode,
    max_seats
  ) VALUES (
    v_game,
    v_title,
    'lobby',
    v_stake,
    v_host,
    COALESCE(p_is_private, false),
    NULLIF(trim(COALESCE(p_passcode, '')), ''),
    v_cap
  )
  RETURNING * INTO v_room;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    wallet_state,
    is_ready
  ) VALUES (
    v_room.id,
    v_host,
    NULLIF(trim(COALESCE(p_display_name, '')), ''),
    'none',
    false
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(v_room.id)
  );
END;
$$;

COMMENT ON FUNCTION public.ov2_create_room IS 'OV2: create lobby room + host member; allowlisted game ids (ov2_board_path, ov2_mark_grid, ov2_ludo); stake >= 100; max_seats 2–16.';
