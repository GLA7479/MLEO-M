-- OV2 shared: max round liability at stake commit (16× stake_per_seat for 1v1 ping-pong double products)
-- and open_session guard. Apply after 007_ov2_stake_commit.sql and before / alongside fourline 107 + 108–111.

BEGIN;

-- Max multiplier for a full double ladder (1 → 2 → 4 → 8 → 16).
CREATE OR REPLACE FUNCTION public.ov2_shared_max_round_liability_mult(p_product_game_id text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(coalesce(p_product_game_id, ''))
    WHEN 'ov2_fourline' THEN 16
    WHEN 'ov2_flipgrid' THEN 16
    WHEN 'ov2_fleet_hunt' THEN 16
    WHEN 'ov2_dominoes' THEN 16
    WHEN 'ov2_meldmatch' THEN 16
    ELSE 1
  END;
$$;

COMMENT ON FUNCTION public.ov2_shared_max_round_liability_mult(text) IS
  'Per-seat max liability multiplier vs stake_per_seat (16 for 1v1 double-enabled OV2 games; 1 otherwise).';

REVOKE ALL ON FUNCTION public.ov2_shared_max_round_liability_mult(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_max_round_liability_mult(text) TO anon, authenticated, service_role;

-- Called from game open_session after seated players are committed.
CREATE OR REPLACE FUNCTION public.ov2_shared_require_max_double_liability_for_open_session(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_mult int;
  v_stake bigint;
  v_need bigint;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_mult := public.ov2_shared_max_round_liability_mult(v_room.product_game_id);
  IF v_mult <= 1 THEN
    RETURN jsonb_build_object('ok', true);
  END IF;

  v_stake := COALESCE(v_room.stake_per_seat, 0);
  IF v_stake IS NULL OR v_stake < 100 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKE_BELOW_MINIMUM',
      'message', 'Room stake is invalid.'
    );
  END IF;

  v_need := v_stake * v_mult;

  IF (
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ) IS DISTINCT FROM 2 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'BAD_SEAT_COUNT',
      'message', 'Exactly two seated players required'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKES_NOT_COMMITTED',
      'message', 'All seated players must commit stakes before starting'
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND COALESCE(m.amount_locked, 0) < v_need
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INSUFFICIENT_MAX_LIABILITY',
      'message', 'Each seated player must lock maximum round liability (16× stake) before starting this game.'
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.ov2_shared_require_max_double_liability_for_open_session(uuid) IS
  '1v1 double-enabled games: require amount_locked >= 16× stake_per_seat for both seated committed members.';

REVOKE ALL ON FUNCTION public.ov2_shared_require_max_double_liability_for_open_session(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_shared_require_max_double_liability_for_open_session(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_stake_commit(
  p_room_id uuid,
  p_participant_key text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_idem text;
  v_stake bigint;
  v_liability_mult int;
  v_lock bigint;
  v_member public.ov2_room_members%ROWTYPE;
  v_total int;
  v_committed int;
  v_new_phase text;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  v_idem := trim(COALESCE(p_idempotency_key, ''));
  IF length(v_idem) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Idempotency key is required.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_economy_events e
    WHERE e.idempotency_key = v_idem
      AND e.room_id = p_room_id
      AND e.event_kind = 'commit'
  ) THEN
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', public.ov2_members_to_public_jsonb(p_room_id),
      'idempotent', true
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase NOT IN ('pending_start', 'pending_stakes') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'Stakes can only be committed while the room is waiting for stakes.'
    );
  END IF;

  v_stake := v_room.stake_per_seat;
  IF v_stake IS NULL OR v_stake < 100 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKE_BELOW_MINIMUM',
      'message', 'Room stake is invalid.'
    );
  END IF;

  v_liability_mult := public.ov2_shared_max_round_liability_mult(v_room.product_game_id);
  v_lock := v_stake * v_liability_mult;

  SELECT * INTO v_member
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'You are not in this room.'
    );
  END IF;

  IF v_member.wallet_state = 'committed' AND COALESCE(v_member.amount_locked, 0) >= v_lock THEN
    IF EXISTS (
      SELECT 1 FROM public.ov2_economy_events e
      WHERE e.room_id = p_room_id
        AND e.participant_key = v_pk
        AND e.match_seq = v_room.match_seq
        AND e.event_kind = 'commit'
    ) THEN
      RETURN jsonb_build_object(
        'ok', true,
        'room', public.ov2_room_to_public_jsonb(v_room),
        'members', public.ov2_members_to_public_jsonb(p_room_id),
        'idempotent', true
      );
    END IF;
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ALREADY_COMMITTED',
      'message', 'Stake is already committed for this match.'
    );
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'none' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'Your seat cannot commit a stake in its current wallet state.'
    );
  END IF;

  BEGIN
    INSERT INTO public.ov2_economy_events (
      room_id,
      participant_key,
      event_kind,
      amount,
      match_seq,
      idempotency_key,
      payload
    ) VALUES (
      p_room_id,
      v_pk,
      'commit',
      v_lock,
      v_room.match_seq,
      v_idem,
      jsonb_build_object(
        'liability_mult', v_liability_mult,
        'stake_per_seat', v_stake
      )
    );
  EXCEPTION
    WHEN unique_violation THEN
      IF EXISTS (
        SELECT 1 FROM public.ov2_economy_events e
        WHERE e.idempotency_key = v_idem AND e.room_id = p_room_id AND e.event_kind = 'commit'
      ) THEN
        SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
        RETURN jsonb_build_object(
          'ok', true,
          'room', public.ov2_room_to_public_jsonb(v_room),
          'members', public.ov2_members_to_public_jsonb(p_room_id),
          'idempotent', true
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'IDEMPOTENCY_COLLISION',
        'message', 'This idempotency key was already used for a different request.'
      );
  END;

  UPDATE public.ov2_room_members
  SET
    wallet_state = 'committed',
    amount_locked = v_lock,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  SELECT count(*)::int INTO v_total FROM public.ov2_room_members WHERE room_id = p_room_id;
  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND wallet_state = 'committed';

  IF v_committed = v_total AND v_total > 0 THEN
    v_new_phase := 'active';
  ELSIF v_room.lifecycle_phase = 'pending_start' THEN
    v_new_phase := 'pending_stakes';
  ELSE
    v_new_phase := v_room.lifecycle_phase;
  END IF;

  UPDATE public.ov2_rooms
  SET
    pot_locked = COALESCE(pot_locked, 0) + v_lock,
    lifecycle_phase = v_new_phase,
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id),
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_stake_commit(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_stake_commit(uuid, text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_stake_commit IS
  'OV2: record seat stake commit + economy row; amount_locked = stake_per_seat × max round liability mult (16 for 1v1 double-enabled products). Client debits vault after RPC ok.';

COMMIT;
