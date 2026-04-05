-- Pre-game stake refund (authoritative ov2_economy_events.refund + ledger reset + pot_locked).
-- QM auto-start when table full and all seated committed (no lobby_deadline wait).
-- Hard-close inactive shared rooms: only OPEN/non-live, schedule in 078.
-- Apply after 075. Run manually after review.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Core refund: only when room.status is not IN_GAME (live match).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_try_pre_ingame_stake_refund(
  p_room_id uuid,
  p_participant_key text,
  p_source text DEFAULT 'leave'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_mem public.ov2_room_members%ROWTYPE;
  v_idem text;
  v_allow_left boolean;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'not_shared');
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') = 'IN_GAME' THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'in_game');
  END IF;

  v_allow_left := COALESCE(p_source, '') IN ('qm_cancel', 'hard_close');

  SELECT * INTO v_mem
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'no_member_row');
  END IF;

  IF COALESCE(v_mem.member_state, 'joined') = 'left' AND NOT v_allow_left THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'left_member');
  END IF;

  IF COALESCE(v_mem.member_state, 'joined') NOT IN ('joined', 'disconnected', 'left') THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'bad_member_state');
  END IF;

  IF COALESCE(v_mem.wallet_state, '') IS DISTINCT FROM 'committed'
     OR COALESCE(v_mem.amount_locked, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'reason', 'not_committed');
  END IF;

  v_idem := 'ov2:pre_game_refund:' || p_room_id::text || ':' || v_room.match_seq::text || ':' || v_pk;

  IF EXISTS (SELECT 1 FROM public.ov2_economy_events e WHERE e.idempotency_key = v_idem) THEN
    UPDATE public.ov2_room_members
    SET wallet_state = 'none', amount_locked = 0, updated_at = now()
    WHERE room_id = p_room_id AND participant_key = v_pk;
    RETURN jsonb_build_object('ok', true, 'refunded', false, 'already_recorded', true);
  END IF;

  INSERT INTO public.ov2_economy_events (
    room_id, participant_key, event_kind, amount, match_seq, idempotency_key, payload
  ) VALUES (
    p_room_id,
    v_pk,
    'refund',
    v_mem.amount_locked,
    v_room.match_seq,
    v_idem,
    jsonb_build_object('source', COALESCE(p_source, ''), 'kind', 'pre_ingame')
  );

  UPDATE public.ov2_room_members
  SET wallet_state = 'none', amount_locked = 0, updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  UPDATE public.ov2_rooms
  SET
    pot_locked = GREATEST(0, COALESCE(pot_locked, 0) - v_mem.amount_locked),
    updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'refunded', true,
    'amount', v_mem.amount_locked,
    'idempotency_key', v_idem
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_shared_refund_all_committed_pre_ingame(p_room_id uuid, p_source text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT participant_key
    FROM public.ov2_room_members
    WHERE room_id = p_room_id
      AND wallet_state = 'committed'
      AND COALESCE(amount_locked, 0) > 0
  LOOP
    PERFORM public.ov2_shared_try_pre_ingame_stake_refund(p_room_id, r.participant_key, p_source);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_try_pre_ingame_stake_refund(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_shared_refund_all_committed_pre_ingame(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_try_pre_ingame_stake_refund(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.ov2_shared_refund_all_committed_pre_ingame(uuid, text) TO service_role;

COMMENT ON FUNCTION public.ov2_shared_try_pre_ingame_stake_refund(uuid, text, text) IS
  'Shared OV2: record refund economy row + clear member stake + reduce pot_locked when room not IN_GAME; idempotent per match_seq+pk.';

-- ---------------------------------------------------------------------------
-- 2) Quick Match cancel: refund before closing OPEN room.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_qm_cancel_room_internal(p_room_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_meta jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN;
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') = 'OPEN' THEN
    PERFORM public.ov2_shared_refund_all_committed_pre_ingame(p_room_id, 'qm_cancel');
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  END IF;

  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  v_meta := jsonb_set(
    v_meta,
    '{ov2_quick_match}',
    COALESCE(v_room.meta->'ov2_quick_match', '{}'::jsonb) || jsonb_build_object(
      'cancelled_at', to_jsonb(now()),
      'cancel_reason', to_jsonb(COALESCE(NULLIF(trim(p_reason), ''), 'cancelled'))
    ),
    true
  );
  UPDATE public.ov2_rooms
  SET
    status = 'CLOSED',
    is_hard_closed = true,
    hard_closed_at = COALESCE(hard_closed_at, now()),
    hard_close_reason = COALESCE(NULLIF(trim(p_reason), ''), 'quick_match_cancelled'),
    lifecycle_phase = CASE
      WHEN lifecycle_phase = 'active' THEN lifecycle_phase
      ELSE 'aborted'
    END,
    meta = v_meta,
    ended_at = COALESCE(ended_at, now()),
    updated_at = now()
  WHERE id = p_room_id
    AND COALESCE(upper(trim(status)), '') = 'OPEN';
END;
$$;

-- ---------------------------------------------------------------------------
-- 3) Hard close: do not touch IN_GAME / active_session; refund pre-game stakes.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_hard_close_inactive_rooms()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_closed int := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id
    FROM public.ov2_rooms
    WHERE shared_schema_version = 1
      AND NOT is_hard_closed
      AND last_activity_at IS NOT NULL
      AND last_activity_at < now() - interval '6 hours'
      AND COALESCE(upper(trim(status)), '') IS DISTINCT FROM 'IN_GAME'
      AND active_session_id IS NULL
  LOOP
    PERFORM public.ov2_shared_refund_all_committed_pre_ingame(r.id, 'hard_close');

    UPDATE public.ov2_room_members m
    SET
      member_state = 'ejected',
      eject_reason = 'ROOM_HARD_CLOSED_INACTIVE',
      ejected_at = now(),
      updated_at = now()
    WHERE m.room_id = r.id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      is_hard_closed = true,
      hard_closed_at = now(),
      hard_close_reason = 'INACTIVE_TIMEOUT',
      ended_at = COALESCE(ended_at, now()),
      lifecycle_phase = 'closed',
      closed_reason = 'inactive_timeout',
      active_runtime_id = NULL,
      updated_at = now()
    WHERE id = r.id;

    v_closed := v_closed + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'closed_count', v_closed);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4) Leave room: refund before marking left; echo stake_refund for client vault.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 5) Release seat: refund committed stake while still OPEN / not IN_GAME.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_release_seat(
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

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Seats cannot be changed now.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Participant is not in this room.');
  END IF;

  v_refund := public.ov2_shared_try_pre_ingame_stake_refund(p_room_id, v_pk, 'release_seat');
  v_hint := NULL;
  IF v_refund IS NOT NULL AND COALESCE((v_refund ->> 'refunded')::boolean, false) THEN
    v_hint := jsonb_build_object(
      'amount', v_refund -> 'amount',
      'idempotency_key', to_jsonb(v_refund ->> 'idempotency_key'),
      'product_game_id', to_jsonb(v_room.product_game_id)
    );
  END IF;

  UPDATE public.ov2_room_members m
  SET seat_index = NULL, updated_at = now()
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Participant is not in this room.');
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'stake_refund', v_hint,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5b) Latest pre-game refund row as client vault hint (after QM cancel / failures).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_pre_game_refund_hint_for_viewer(
  p_room_id uuid,
  p_viewer_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amt bigint;
  v_idem text;
  v_gid text;
BEGIN
  IF p_room_id IS NULL OR length(trim(COALESCE(p_viewer_participant_key, ''))) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT r.product_game_id INTO v_gid FROM public.ov2_rooms r WHERE r.id = p_room_id;
  IF v_gid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT e.amount, e.idempotency_key
  INTO v_amt, v_idem
  FROM public.ov2_economy_events e
  WHERE e.room_id = p_room_id
    AND e.participant_key = trim(COALESCE(p_viewer_participant_key, ''))
    AND e.event_kind = 'refund'
    AND e.payload->>'kind' = 'pre_ingame'
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 1;

  IF v_idem IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'amount', v_amt,
    'idempotency_key', to_jsonb(v_idem),
    'product_game_id', to_jsonb(v_gid)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_pre_game_refund_hint_for_viewer(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- 6) QM deadline / early start (replace 075 body + early branch).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.ov2_quick_match_auto_start_deadline(uuid);

CREATE OR REPLACE FUNCTION public.ov2_quick_match_auto_start_deadline(
  p_room_id uuid,
  p_viewer_participant_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_meta jsonb;
  v_deadline timestamptz;
  v_min int;
  v_elig int;
  v_host text;
  v_intent jsonb;
  v_start jsonb;
  v_offer_id uuid;
  v_cap int;
  v_seated_any int;
  v_seated_committed int;
  v_force_early boolean := false;
  v_pk_hint text := NULLIF(trim(COALESCE(p_viewer_participant_key, '')), '');
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'SKIP', 'message', 'Room not OPEN.');
  END IF;

  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_QUICK_MATCH', 'message', 'Not a quick match room.');
  END IF;

  IF COALESCE((v_meta#>>'{ov2_quick_match,auto_start_done}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'DONE', 'message', 'Already processed.');
  END IF;

  v_deadline := NULL;
  BEGIN
    v_deadline := (v_meta#>>'{ov2_quick_match,lobby_deadline_at}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_deadline := NULL;
  END;

  v_min := GREATEST(COALESCE(v_room.min_players, 2), 2);
  v_cap := COALESCE(v_room.max_players, v_room.max_seats);

  SELECT count(*)::int INTO v_seated_committed
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  SELECT count(*)::int INTO v_seated_any
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND m.seat_index IS NOT NULL;

  v_force_early := (
    v_cap IS NOT NULL
    AND v_cap >= v_min
    AND v_seated_any = v_cap
    AND v_seated_committed = v_cap
    AND v_seated_committed >= v_min
  );

  IF NOT v_force_early THEN
    IF v_deadline IS NULL OR now() < v_deadline THEN
      RETURN jsonb_build_object('ok', true, 'code', 'WAIT', 'message', 'Lobby deadline not reached.');
    END IF;
  END IF;

  v_host := trim(COALESCE(v_room.host_participant_key, ''));

  IF length(v_host) > 0 THEN
    UPDATE public.ov2_room_members m
    SET seat_index = NULL, updated_at = now()
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND COALESCE(m.wallet_state, '') IS DISTINCT FROM 'committed'
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
      AND trim(m.participant_key) IS DISTINCT FROM v_host;
  END IF;

  SELECT count(*)::int INTO v_elig
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  IF length(v_host) > 0 THEN
    IF EXISTS (
      SELECT 1
      FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
        AND m.seat_index IS NOT NULL
        AND COALESCE(m.wallet_state, '') IS DISTINCT FROM 'committed'
        AND trim(m.participant_key) = v_host
    ) THEN
      PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_host_uncommitted_at_deadline');
      BEGIN
        v_offer_id := (v_meta#>>'{ov2_quick_match,offer_id}')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_offer_id := NULL;
      END;
      IF v_offer_id IS NOT NULL THEN
        UPDATE public.ov2_quick_match_offers
        SET status = 'cancelled', updated_at = now()
        WHERE id = v_offer_id AND status = 'room_ready';
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'code', 'CANCELLED',
        'message', 'Quick match ended — host did not commit stake before the timer finished.',
        'stake_refund', public.ov2_shared_pre_game_refund_hint_for_viewer(p_room_id, COALESCE(v_pk_hint, ''))
      );
    END IF;
  END IF;

  IF v_elig < v_min THEN
    IF v_force_early THEN
      RETURN jsonb_build_object('ok', true, 'code', 'WAIT', 'message', 'Table not yet eligible for auto-start.');
    END IF;
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_below_min_at_deadline');
    BEGIN
      v_offer_id := (v_meta#>>'{ov2_quick_match,offer_id}')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_offer_id := NULL;
    END;
    IF v_offer_id IS NOT NULL THEN
      UPDATE public.ov2_quick_match_offers
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_offer_id AND status = 'room_ready';
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'code', 'CANCELLED',
      'message', 'Below minimum eligible players at deadline.',
      'stake_refund', public.ov2_shared_pre_game_refund_hint_for_viewer(p_room_id, COALESCE(v_pk_hint, ''))
    );
  END IF;

  IF length(v_host) = 0 THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_missing_host');
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'Missing host.',
      'stake_refund', public.ov2_shared_pre_game_refund_hint_for_viewer(p_room_id, COALESCE(v_pk_hint, ''))
    );
  END IF;

  UPDATE public.ov2_room_members
  SET is_ready = true, updated_at = now()
  WHERE room_id = p_room_id
    AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

  IF v_room.lifecycle_phase = 'lobby' THEN
    v_intent := public.ov2_start_room_intent(p_room_id, v_host);
    IF COALESCE((v_intent->>'ok')::boolean, false) IS NOT TRUE THEN
      UPDATE public.ov2_room_members
      SET is_ready = true, updated_at = now()
      WHERE room_id = p_room_id;
      v_intent := public.ov2_start_room_intent(p_room_id, v_host);
    END IF;
    IF COALESCE((v_intent->>'ok')::boolean, false) IS NOT TRUE THEN
      PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_start_intent_failed');
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'START_INTENT_FAILED',
        'message', COALESCE(v_intent->>'message', 'Could not enter stake phase.'),
        'stake_refund', public.ov2_shared_pre_game_refund_hint_for_viewer(p_room_id, COALESCE(v_pk_hint, ''))
      );
    END IF;
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  END IF;

  v_start := public.ov2_shared_host_start(p_room_id, v_host);
  IF COALESCE((v_start->>'ok')::boolean, false) IS NOT TRUE THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_host_start_failed');
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'HOST_START_FAILED',
      'message', COALESCE(v_start->>'message', 'Could not start match.'),
      'stake_refund', public.ov2_shared_pre_game_refund_hint_for_viewer(p_room_id, COALESCE(v_pk_hint, ''))
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  v_meta := jsonb_set(
    v_meta,
    '{ov2_quick_match}',
    COALESCE(v_room.meta->'ov2_quick_match', '{}'::jsonb) || jsonb_build_object(
      'auto_start_done', true,
      'auto_started_at', to_jsonb(now())
    ),
    true
  );

  UPDATE public.ov2_rooms
  SET meta = v_meta, updated_at = now()
  WHERE id = p_room_id;

  BEGIN
    v_offer_id := (v_meta#>>'{ov2_quick_match,offer_id}')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_offer_id := NULL;
  END;
  IF v_offer_id IS NOT NULL THEN
    UPDATE public.ov2_quick_match_offers
    SET status = 'completed', updated_at = now()
    WHERE id = v_offer_id AND status = 'room_ready';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'STARTED', 'runtime_handoff', v_start->'runtime_handoff');
END;
$$;

COMMENT ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid, text) IS
  'QM: at deadline OR when table full+all seated committed, prune stragglers, then intent+host_start (075 parity). Optional viewer key returns stake_refund hint after cancel.';

REVOKE ALL ON FUNCTION public.ov2_qm_cancel_room_internal(uuid, text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid, text) TO anon, authenticated, service_role;

COMMIT;
