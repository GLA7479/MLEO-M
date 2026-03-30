-- OV2 stake commit: pending_start -> pending_stakes -> active; append-only ov2_economy_events; RLS on economy log.
-- Apply after 006_ov2_room_lifecycle_v2.sql.

BEGIN;

-- --- RLS: economy log is server-written only ---

ALTER TABLE public.ov2_economy_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_economy_events_insert_deny ON public.ov2_economy_events;
CREATE POLICY ov2_economy_events_insert_deny ON public.ov2_economy_events
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_economy_events_update_deny ON public.ov2_economy_events;
CREATE POLICY ov2_economy_events_update_deny ON public.ov2_economy_events
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_economy_events_delete_deny ON public.ov2_economy_events;
CREATE POLICY ov2_economy_events_delete_deny ON public.ov2_economy_events
  FOR DELETE TO anon, authenticated
  USING (false);

-- --- ov2_stake_commit ---

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

  IF v_member.wallet_state = 'committed' AND COALESCE(v_member.amount_locked, 0) >= v_stake THEN
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
      v_stake,
      v_room.match_seq,
      v_idem,
      '{}'::jsonb
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
    amount_locked = v_stake,
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
    pot_locked = COALESCE(pot_locked, 0) + v_stake,
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

COMMENT ON FUNCTION public.ov2_stake_commit IS 'OV2: record seat stake commit + economy row; pending_start->pending_stakes->active; client debits vault after RPC ok.';

COMMIT;
