-- Wire OV2 FlipGrid into shared-room economy, Quick Match allowlist, and leave/forfeit.
-- Apply after 115_ov2_flipgrid_rpcs_actions.sql (and after any migration that last replaced ov2_shared_leave_room).
-- Merges FlipGrid into the same integration surface as 106_ov2_fourline_shared_integration.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy(p_product_game_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_product_game_id, ''))
    WHEN 'ov2_ludo' THEN 'ON_HOST_START'
    WHEN 'ov2_bingo' THEN 'ON_HOST_START'
    WHEN 'ov2_rummy51' THEN 'ON_HOST_START'
    WHEN 'ov2_backgammon' THEN 'ON_HOST_START'
    WHEN 'ov2_checkers' THEN 'ON_HOST_START'
    WHEN 'ov2_chess' THEN 'ON_HOST_START'
    WHEN 'ov2_dominoes' THEN 'ON_HOST_START'
    WHEN 'ov2_fourline' THEN 'ON_HOST_START'
    WHEN 'ov2_flipgrid' THEN 'ON_HOST_START'
    WHEN 'ov2_community_cards' THEN 'NONE'
    ELSE 'NONE'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_allowed_product(p_game text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(COALESCE(p_game, '')) IN (
    'ov2_ludo',
    'ov2_rummy51',
    'ov2_bingo',
    'ov2_backgammon',
    'ov2_checkers',
    'ov2_chess',
    'ov2_dominoes',
    'ov2_fourline',
    'ov2_flipgrid'
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_max_players_for_product(p_game text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_game, ''))
    WHEN 'ov2_bingo' THEN 8
    WHEN 'ov2_backgammon' THEN 2
    WHEN 'ov2_checkers' THEN 2
    WHEN 'ov2_chess' THEN 2
    WHEN 'ov2_dominoes' THEN 2
    WHEN 'ov2_fourline' THEN 2
    WHEN 'ov2_flipgrid' THEN 2
    ELSE 4
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_cnt int;
  v_new_host uuid;
  v_in_ludo_match boolean := false;
  v_in_r51_match boolean := false;
  v_in_bg_match boolean := false;
  v_in_ck_match boolean := false;
  v_in_ch_match boolean := false;
  v_in_dom_match boolean := false;
  v_in_fl_match boolean := false;
  v_in_fg_match boolean := false;
  v_ff jsonb;
  v_refund jsonb;
  v_hint jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.status NOT IN ('OPEN', 'STARTING', 'IN_GAME') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Cannot leave in this room state.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  IF v_room.status = 'IN_GAME' THEN
    v_in_ludo_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_ludo'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_ludo_seats ls
        WHERE ls.session_id = v_room.active_session_id AND ls.participant_key = v_pk
      );
    v_in_r51_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_rummy51'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND coalesce(
        (SELECT (player_state -> v_pk ->> 'isEliminated')::boolean FROM public.ov2_rummy51_sessions WHERE id = v_room.active_session_id),
        false
      ) IS NOT TRUE;
    v_in_bg_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_backgammon'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_backgammon_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_backgammon_seats bs
        WHERE bs.session_id = v_room.active_session_id AND bs.participant_key = v_pk
      );
    v_in_ck_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_checkers'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_checkers_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_checkers_seats cs
        WHERE cs.session_id = v_room.active_session_id AND cs.participant_key = v_pk
      );
    v_in_ch_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_chess'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_chess_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_chess_seats chs
        WHERE chs.session_id = v_room.active_session_id AND chs.participant_key = v_pk
      );
    v_in_dom_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_dominoes'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_dominoes_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_dominoes_seats ds
        WHERE ds.session_id = v_room.active_session_id AND ds.participant_key = v_pk
      );
    v_in_fl_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_fourline'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_fourline_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_fourline_seats fs
        WHERE fs.session_id = v_room.active_session_id AND fs.participant_key = v_pk
      );
    v_in_fg_match := v_room.product_game_id IS NOT DISTINCT FROM 'ov2_flipgrid'
      AND v_room.active_session_id IS NOT NULL
      AND coalesce((SELECT phase FROM public.ov2_flipgrid_sessions WHERE id = v_room.active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1 FROM public.ov2_flipgrid_seats fgs
        WHERE fgs.session_id = v_room.active_session_id AND fgs.participant_key = v_pk
      );

    IF v_in_ludo_match OR v_in_r51_match OR v_in_bg_match OR v_in_ck_match OR v_in_ch_match OR v_in_dom_match OR v_in_fl_match OR v_in_fg_match THEN
      IF NOT COALESCE(p_forfeit_game, false) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_FORFEIT',
          'message', 'Leave during an active match requires forfeit. Call again with p_forfeit_game := true.'
        );
      END IF;
      IF v_in_ludo_match THEN
        v_ff := public.ov2_ludo_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_r51_match THEN
        v_ff := public.ov2_rummy51_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_bg_match THEN
        v_ff := public.ov2_backgammon_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_ck_match THEN
        v_ff := public.ov2_checkers_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_ch_match THEN
        v_ff := public.ov2_chess_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_dom_match THEN
        v_ff := public.ov2_dominoes_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_fl_match THEN
        v_ff := public.ov2_fourline_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      ELSIF v_in_fg_match THEN
        v_ff := public.ov2_flipgrid_voluntary_forfeit(p_room_id, v_pk);
        IF coalesce((v_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
          RETURN v_ff;
        END IF;
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
  END IF;

  v_refund := public.ov2_shared_try_pre_ingame_stake_refund(p_room_id, v_pk, 'leave');
  v_hint := NULL;
  IF v_refund IS NOT NULL AND COALESCE((v_refund ->> 'refunded')::boolean, false) THEN
    v_hint := jsonb_build_object(
      'amount', v_refund -> 'amount',
      'idempotency_key', to_jsonb(v_refund ->> 'idempotency_key'),
      'product_game_id', to_jsonb(v_room.product_game_id)
    );
  END IF;

  UPDATE public.ov2_room_members
  SET
    seat_index = NULL,
    member_state = 'left',
    left_at = now(),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  IF v_cnt <= 0 THEN
    IF coalesce(upper(trim(v_room.status)), '') = 'OPEN' THEN
      UPDATE public.ov2_rooms
      SET
        host_member_id = NULL,
        host_participant_key = NULL,
        updated_at = now()
      WHERE id = p_room_id
      RETURNING * INTO v_room;

      PERFORM public.ov2_shared_touch_room_activity(p_room_id);

      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

      RETURN jsonb_build_object(
        'ok', true,
        'closed', false,
        'stake_refund', v_hint,
        'room', public.ov2_shared_room_to_public_jsonb(v_room),
        'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
      );
    END IF;

    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      ended_at = now(),
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    PERFORM public.ov2_shared_touch_room_activity(p_room_id);

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'stake_refund', v_hint,
      'room', public.ov2_shared_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.id INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key IS DISTINCT FROM v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_room_members
    SET role = 'member'
    WHERE room_id = p_room_id
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_room_members SET role = 'host' WHERE id = v_new_host;

    UPDATE public.ov2_rooms r
    SET
      host_member_id = v_new_host,
      host_participant_key = (SELECT participant_key FROM public.ov2_room_members WHERE id = v_new_host),
      updated_at = now()
    WHERE r.id = p_room_id
    RETURNING * INTO v_room;
  ELSE
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'stake_refund', v_hint,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

COMMIT;
