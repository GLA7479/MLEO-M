-- Quick Match: at lobby deadline, drop seats held by non-host players who never committed stake,
-- then re-count eligibility. Aligns deadline path with ov2_shared_host_start (all remaining seated must be committed).
-- Prevents HOST_START_FAILED / room cancel when enough committed players exist but extra seated stragglers block start.
-- Apply after 074. Run manually after review.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_quick_match_auto_start_deadline(p_room_id uuid)
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

  v_deadline := NULL;
  BEGIN
    v_deadline := (v_meta#>>'{ov2_quick_match,lobby_deadline_at}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_deadline := NULL;
  END;

  IF v_deadline IS NULL OR now() < v_deadline THEN
    RETURN jsonb_build_object('ok', true, 'code', 'WAIT', 'message', 'Lobby deadline not reached.');
  END IF;

  IF COALESCE((v_meta#>>'{ov2_quick_match,auto_start_done}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'DONE', 'message', 'Already processed.');
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

  v_min := GREATEST(COALESCE(v_room.min_players, 2), 2);

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
        'message', 'Quick match ended — host did not commit stake before the timer finished.'
      );
    END IF;
  END IF;

  IF v_elig < v_min THEN
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
    RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'message', 'Below minimum eligible players at deadline.');
  END IF;

  IF length(v_host) = 0 THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_missing_host');
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Missing host.');
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
        'message', COALESCE(v_intent->>'message', 'Could not enter stake phase.')
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
      'message', COALESCE(v_start->>'message', 'Could not start match.')
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

REVOKE ALL ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid) IS
  'QM V1: at lobby_deadline_at, prune non-host seated players without committed stake, require host committed, then start if eligible (matches ov2_shared_host_start stake rules).';

COMMIT;
