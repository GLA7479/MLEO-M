-- Tighten direct PostgREST reads for shared_schema_version = 1 private/hidden rooms;
-- add SECURITY DEFINER canonical ledger read (same auth as ov2_shared_get_room_snapshot);
-- align ov2_shared_host_start stake eligibility with Quick Match (ON_HOST_START products).
-- Apply after 073. Run manually after review.

BEGIN;

-- ---------------------------------------------------------------------------
-- RLS: replace permissive SELECT (005) with legacy + public shared rows only
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS ov2_rooms_select_public ON public.ov2_rooms;

CREATE POLICY ov2_rooms_select_legacy_or_public_shared ON public.ov2_rooms
  FOR SELECT TO anon, authenticated
  USING (
    COALESCE(shared_schema_version, 0) IS DISTINCT FROM 1
    OR LOWER(COALESCE(visibility_mode, 'public')) = 'public'
  );

DROP POLICY IF EXISTS ov2_room_members_select_public ON public.ov2_room_members;

CREATE POLICY ov2_room_members_select_when_room_readable ON public.ov2_room_members
  FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ov2_rooms r
      WHERE r.id = ov2_room_members.room_id
        AND (
          COALESCE(r.shared_schema_version, 0) IS DISTINCT FROM 1
          OR LOWER(COALESCE(r.visibility_mode, 'public')) = 'public'
        )
    )
  );

-- ---------------------------------------------------------------------------
-- Canonical room + member ledger (wallet_state) for authorized viewers only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_get_room_canonical_ledger(
  p_room_id uuid,
  p_viewer_participant_key text DEFAULT NULL,
  p_password_plaintext text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := NULLIF(trim(COALESCE(p_viewer_participant_key, '')), '');
  v_in_pw text := NULLIF(trim(COALESCE(p_password_plaintext, '')), '');
  v_member boolean := false;
  v_members jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF v_pk IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id AND m.participant_key = v_pk
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ) INTO v_member;
  END IF;

  IF v_room.visibility_mode IN ('private', 'hidden') AND NOT v_member THEN
    IF v_room.password_hash IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
    IF v_in_pw IS NULL OR extensions.crypt(v_in_pw, v_room.password_hash) IS DISTINCT FROM v_room.password_hash THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'room_not_found_or_invalid_credentials',
        'message', 'Room not found or invalid credentials.'
      );
    END IF;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'room_id', s.room_id,
        'participant_key', s.participant_key,
        'display_name', s.display_name,
        'seat_index', s.seat_index,
        'wallet_state', s.wallet_state,
        'amount_locked', s.amount_locked,
        'is_ready', s.is_ready,
        'created_at', s.created_at,
        'updated_at', s.updated_at,
        'meta', s.meta
      )
      ORDER BY s.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_members
  FROM public.ov2_room_members s
  WHERE s.room_id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object(
      'id', v_room.id,
      'created_at', v_room.created_at,
      'updated_at', v_room.updated_at,
      'product_game_id', v_room.product_game_id,
      'title', v_room.title,
      'lifecycle_phase', v_room.lifecycle_phase,
      'stake_per_seat', v_room.stake_per_seat,
      'host_participant_key', v_room.host_participant_key,
      'is_private', v_room.is_private,
      'max_seats', v_room.max_seats,
      'match_seq', v_room.match_seq,
      'pot_locked', v_room.pot_locked,
      'active_session_id', v_room.active_session_id,
      'closed_reason', v_room.closed_reason,
      'settlement_status', v_room.settlement_status,
      'settlement_revision', v_room.settlement_revision,
      'finalized_at', v_room.finalized_at,
      'finalized_match_seq', v_room.finalized_match_seq,
      'meta', v_room.meta,
      'shared_schema_version', v_room.shared_schema_version,
      'status', v_room.status
    ),
    'members', v_members
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_shared_get_room_canonical_ledger(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_get_room_canonical_ledger(uuid, text, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Host start: same min floor as Quick Match; enforce seated stake commit for ON_HOST_START
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_host_start(
  p_room_id uuid,
  p_host_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_host text := trim(COALESCE(p_host_participant_key, ''));
  v_seated int;
  v_committed_seated int;
  v_min int;
  v_rt uuid := gen_random_uuid();
  v_policy text;
  v_handoff jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_host) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host participant are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_host THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can start.');
  END IF;

  IF v_room.status IS DISTINCT FROM 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Room cannot start in its current state.');
  END IF;

  v_min := GREATEST(COALESCE(v_room.min_players, 2), 2);
  v_policy := public.ov2_shared_resolve_economy_entry_policy(v_room.product_game_id);

  IF v_policy = 'ON_HOST_START' THEN
    SELECT count(*)::int INTO v_committed_seated
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
      AND m.seat_index IS NOT NULL
      AND m.wallet_state = 'committed';

    IF v_committed_seated < v_min THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'NOT_ENOUGH_SEATED',
        'message', format('Need at least %s seated players with committed stakes.', v_min)
      );
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
        AND m.seat_index IS NOT NULL
        AND m.wallet_state IS DISTINCT FROM 'committed'
    ) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'STAKES_INCOMPLETE',
        'message', 'All seated players must commit stake before starting.'
      );
    END IF;
  ELSE
    SELECT count(*)::int INTO v_seated
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
      AND m.seat_index IS NOT NULL;

    IF v_seated < v_min THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'NOT_ENOUGH_SEATED',
        'message', format('Need at least %s seated players.', v_min)
      );
    END IF;
  END IF;

  UPDATE public.ov2_rooms
  SET
    status = 'IN_GAME',
    active_runtime_id = v_rt,
    started_at = COALESCE(started_at, now()),
    lifecycle_phase = 'active',
    room_revision = room_revision + 1,
    updated_at = now()
  WHERE id = p_room_id
    AND status = 'OPEN'
    AND room_revision = v_room.room_revision
  RETURNING * INTO v_room;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not start — room state changed. Try again.');
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  v_handoff := jsonb_build_object(
    'room_id', v_room.id,
    'product_game_id', v_room.product_game_id,
    'room_revision', v_room.room_revision,
    'active_runtime_id', v_room.active_runtime_id,
    'economy_entry_policy', v_policy,
    'economy_policy_applied', false,
    'participants', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id),
    'runtime_handoff', v_handoff
  );
END;
$$;

COMMENT ON FUNCTION public.ov2_shared_get_room_canonical_ledger(uuid, text, text) IS
  'OV2 shared: canonical ov2_rooms + economy member fields for viewers authorized like ov2_shared_get_room_snapshot (member or password for private/hidden).';

COMMIT;
