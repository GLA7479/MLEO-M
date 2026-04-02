-- OV2 Bingo: when a player leaves and exactly one seated session player remains,
-- finish the match immediately, set winner, emit residual pot as bingo_walkover_win.

BEGIN;

ALTER TABLE public.ov2_bingo_sessions
  ADD COLUMN IF NOT EXISTS walkover_payout_amount bigint NULL;

COMMENT ON COLUMN public.ov2_bingo_sessions.walkover_payout_amount IS
  'When set on finish: net walkover credit (pot_total minus claims paid) for last-player-standing resolution; null otherwise.';

-- -----------------------------------------------------------------------------
-- Called from leave RPCs after membership changes (shared + legacy).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_bingo_try_finish_last_standing(p_room_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_cnt int;
  v_wpk text;
  v_wn text;
  v_paid numeric;
  v_remain numeric;
  v_credit bigint;
  v_idem text;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN;
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN;
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND COALESCE(v_sess.active_seats, '[]'::jsonb) @> to_jsonb(m.seat_index);

  IF v_cnt > 1 THEN
    RETURN;
  END IF;

  IF v_cnt = 1 THEN
    SELECT trim(m.participant_key), COALESCE(NULLIF(trim(m.display_name), ''), trim(m.participant_key))
    INTO v_wpk, v_wn
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
      AND COALESCE(v_sess.active_seats, '[]'::jsonb) @> to_jsonb(m.seat_index)
    LIMIT 1;

    IF v_wpk IS NULL OR length(v_wpk) = 0 THEN
      RETURN;
    END IF;

    v_paid := public._ov2_bingo_claims_paid_sum(v_sess.id);
    v_remain := greatest(0::numeric, coalesce(v_sess.pot_total, 0) - coalesce(v_paid, 0));
    v_credit := trunc(v_remain)::bigint;
    IF v_credit < 0 THEN
      v_credit := 0;
    END IF;

    v_idem := 'ov2:bingo:walkover:' || v_sess.id::text;

    IF v_credit > 0 THEN
      INSERT INTO public.ov2_settlement_lines (
        room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
      ) VALUES (
        p_room_id,
        v_sess.match_seq,
        v_wpk,
        'bingo_walkover_win',
        v_credit,
        v_idem,
        v_sess.id,
        jsonb_build_object('gameId', 'ov2_bingo', 'reason', 'last_player_standing')
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;

    UPDATE public.ov2_bingo_sessions
    SET
      phase = 'finished',
      winner_participant_key = v_wpk,
      winner_name = v_wn,
      finished_at = now(),
      next_call_at = NULL,
      walkover_payout_amount = v_credit,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id;

    RETURN;
  END IF;

  UPDATE public.ov2_bingo_sessions
  SET
    phase = 'finished',
    winner_participant_key = NULL,
    winner_name = NULL,
    finished_at = now(),
    next_call_at = NULL,
    walkover_payout_amount = NULL,
    revision = revision + 1,
    updated_at = now()
  WHERE id = v_sess.id;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bingo_try_finish_last_standing(uuid) FROM PUBLIC;

-- -----------------------------------------------------------------------------
-- Shared leave: after member row marked left, resolve Bingo last-player win.
-- (Body matches 057_ov2_shared_leave_keep_empty_open_room + PERFORM.)
-- -----------------------------------------------------------------------------
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
  v_ff jsonb;
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

    IF v_in_ludo_match OR v_in_r51_match THEN
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
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
  END IF;

  UPDATE public.ov2_room_members
  SET
    seat_index = NULL,
    member_state = 'left',
    left_at = now(),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  PERFORM public.ov2_bingo_try_finish_last_standing(p_room_id);

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
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

COMMENT ON FUNCTION public.ov2_shared_leave_room(uuid, text, boolean) IS
  'OV2 shared: leave room. After leave, Bingo playing sessions may finish immediately if one player remains.';

-- -----------------------------------------------------------------------------
-- Legacy leave: after member deleted, same Bingo resolution.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_leave_room(
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
  v_pk text;
  v_cnt int;
  v_new_host text;
  v_remaining int;
  v_in_ludo_match boolean := false;
  v_in_r51_match boolean := false;
  v_ff jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase NOT IN ('lobby', 'pending_start', 'pending_stakes', 'active') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'You cannot leave in this room phase.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'You are not in this room.'
    );
  END IF;

  IF v_room.lifecycle_phase = 'active' AND v_room.shared_schema_version IS DISTINCT FROM 1 THEN
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

    IF v_in_ludo_match OR v_in_r51_match THEN
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
      END IF;
      SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
    END IF;
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.ov2_room_members WHERE room_id = p_room_id;

  IF v_cnt <= 1 THEN
    DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
    UPDATE public.ov2_rooms
    SET
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.participant_key INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key IS DISTINCT FROM v_pk
    ORDER BY m.created_at ASC NULLS LAST, m.participant_key ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_rooms
    SET host_participant_key = v_new_host, updated_at = now()
    WHERE id = p_room_id;
  END IF;

  DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_remaining = ROW_COUNT;

  PERFORM public.ov2_bingo_try_finish_last_standing(p_room_id);

  IF v_remaining = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

COMMENT ON FUNCTION public.ov2_leave_room(uuid, text, boolean) IS
  'OV2 legacy: leave room. Bingo playing sessions may finish when one seated player remains.';

COMMIT;
