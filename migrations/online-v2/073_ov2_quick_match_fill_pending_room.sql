-- Quick Match: allow additional same game+stake players to join an existing OPEN pending room
-- during lobby countdown until max_players (fill-before-new-offer). Apply after 072.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_qm_find_fillable_pending_quick_match_room(
  p_product_game_id text,
  p_stake_per_seat bigint,
  p_participant_key text
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_game text := trim(COALESCE(p_product_game_id, ''));
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_meta jsonb;
  v_deadline timestamptz;
  v_cnt int;
  v_max int;
  r public.ov2_rooms%ROWTYPE;
BEGIN
  IF length(v_pk) = 0 OR NOT public.ov2_qm_allowed_product(v_game) THEN
    RETURN NULL;
  END IF;
  IF NOT public.ov2_qm_is_allowed_stake(p_stake_per_seat) THEN
    RETURN NULL;
  END IF;

  FOR r IN
    SELECT *
    FROM public.ov2_rooms x
    WHERE x.shared_schema_version = 1
      AND NOT x.is_hard_closed
      AND COALESCE(upper(trim(x.status)), '') = 'OPEN'
      AND x.product_game_id = v_game
      AND x.stake_per_seat = p_stake_per_seat
      AND x.meta ? 'ov2_quick_match'
    ORDER BY x.created_at ASC
  LOOP
    v_meta := COALESCE(r.meta, '{}'::jsonb);
    IF NOT (v_meta ? 'ov2_quick_match') THEN
      CONTINUE;
    END IF;

    IF COALESCE((v_meta#>>'{ov2_quick_match,auto_start_done}')::boolean, false) THEN
      CONTINUE;
    END IF;

    BEGIN
      v_deadline := (v_meta#>>'{ov2_quick_match,lobby_deadline_at}')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      CONTINUE;
    END;

    IF v_deadline IS NULL OR v_deadline <= now() THEN
      CONTINUE;
    END IF;

    SELECT count(*)::int INTO v_cnt
    FROM public.ov2_room_members m
    WHERE m.room_id = r.id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

    v_max := COALESCE(r.max_players, r.max_seats, 8);
    IF v_cnt >= v_max THEN
      CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.ov2_room_members m
      WHERE m.room_id = r.id
        AND m.participant_key = v_pk
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    ) THEN
      CONTINUE;
    END IF;

    RETURN r.id;
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_find_fillable_pending_quick_match_room(text, bigint, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ov2_qm_append_quick_match_invite_key(
  p_room_id uuid,
  p_participant_key text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_meta jsonb;
  v_keys jsonb;
  v_deadline timestamptz;
  v_cnt int;
  v_max int;
  v_new_keys jsonb;
  k text;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN false;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN false;
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') <> 'OPEN' THEN
    RETURN false;
  END IF;

  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN false;
  END IF;

  IF COALESCE((v_meta#>>'{ov2_quick_match,auto_start_done}')::boolean, false) THEN
    RETURN false;
  END IF;

  BEGIN
    v_deadline := (v_meta#>>'{ov2_quick_match,lobby_deadline_at}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RETURN false;
  END;

  IF v_deadline IS NULL OR v_deadline <= now() THEN
    RETURN false;
  END IF;

  v_keys := v_meta#>'{ov2_quick_match,invite_keys}';
  IF v_keys IS NULL OR jsonb_typeof(v_keys) <> 'array' THEN
    RETURN false;
  END IF;

  FOR k IN SELECT jsonb_array_elements_text(v_keys)
  LOOP
    IF trim(k) = v_pk THEN
      PERFORM public.ov2_shared_touch_room_activity(p_room_id);
      RETURN true;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    PERFORM public.ov2_shared_touch_room_activity(p_room_id);
    RETURN true;
  END IF;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected');

  v_max := COALESCE(v_room.max_players, v_room.max_seats, 8);
  IF v_cnt >= v_max THEN
    RETURN false;
  END IF;

  v_new_keys := v_keys || jsonb_build_array(v_pk);

  UPDATE public.ov2_rooms
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{ov2_quick_match,invite_keys}',
      v_new_keys,
      true
    ),
    updated_at = now()
  WHERE id = p_room_id;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_append_quick_match_invite_key(uuid, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ov2_qm_try_promote_waiting_to_fill_room(p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_q public.ov2_quick_match_queue%ROWTYPE;
  v_fill_room uuid;
  v_lobby text;
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_q
  FROM public.ov2_quick_match_queue
  WHERE participant_key = v_pk AND status = 'waiting' AND expires_at > now()
  ORDER BY updated_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  v_fill_room := public.ov2_qm_find_fillable_pending_quick_match_room(
    v_q.product_game_id,
    v_q.stake_per_seat,
    v_pk
  );

  IF v_fill_room IS NULL OR NOT public.ov2_qm_append_quick_match_invite_key(v_fill_room, v_pk) THEN
    RETURN NULL;
  END IF;

  UPDATE public.ov2_quick_match_queue
  SET status = 'completed', offer_id = NULL, updated_at = now()
  WHERE id = v_q.id;

  SELECT (meta#>>'{ov2_quick_match,lobby_deadline_at}') INTO v_lobby
  FROM public.ov2_rooms
  WHERE id = v_fill_room;

  RETURN jsonb_build_object(
    'ok', true,
    'phase', 'join_room',
    'room_id', v_fill_room,
    'lobby_deadline_at', to_jsonb(v_lobby)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_try_promote_waiting_to_fill_room(text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ov2_quick_match_tick(
  p_participant_key text,
  p_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_q public.ov2_quick_match_queue%ROWTYPE;
  v_o public.ov2_quick_match_offers%ROWTYPE;
  v_peers jsonb;
  v_now timestamptz := now();
  v_promo jsonb;
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key is required.');
  END IF;

  UPDATE public.ov2_quick_match_queue
  SET status = 'expired', updated_at = now()
  WHERE participant_key = v_pk AND status = 'waiting' AND expires_at <= v_now;

  PERFORM public.ov2_qm_finalize_expired_offers();

  v_promo := public.ov2_qm_try_promote_waiting_to_fill_room(v_pk);
  IF v_promo IS NOT NULL THEN
    RETURN v_promo;
  END IF;

  PERFORM public.ov2_qm_try_form_offers();

  IF p_room_id IS NOT NULL THEN
    PERFORM public.ov2_quick_match_auto_start_deadline(p_room_id);
  END IF;

  SELECT * INTO v_o
  FROM public.ov2_quick_match_offers o
  WHERE o.status = 'room_ready'
    AND o.room_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.ov2_quick_match_offer_members m
      WHERE m.offer_id = o.id AND m.participant_key = v_pk AND m.confirmed_at IS NOT NULL
    )
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'join_room',
      'room_id', v_o.room_id,
      'lobby_deadline_at', v_o.lobby_deadline_at
    );
  END IF;

  SELECT * INTO v_o
  FROM public.ov2_quick_match_offers o
  JOIN public.ov2_quick_match_offer_members m ON m.offer_id = o.id
  WHERE m.participant_key = v_pk
    AND o.status = 'confirming'
    AND o.room_id IS NULL
    AND o.confirm_deadline_at > v_now
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'display_name', m.display_name,
          'is_you', m.participant_key = v_pk,
          'confirmed', m.confirmed_at IS NOT NULL
        )
        ORDER BY m.participant_key
      ),
      '[]'::jsonb
    ) INTO v_peers
    FROM public.ov2_quick_match_offer_members m
    WHERE m.offer_id = v_o.id;

    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'confirm',
      'offer_id', v_o.id,
      'confirm_deadline_at', v_o.confirm_deadline_at,
      'product_game_id', v_o.product_game_id,
      'stake_per_seat', v_o.stake_per_seat,
      'peers', v_peers
    );
  END IF;

  SELECT * INTO v_q
  FROM public.ov2_quick_match_queue
  WHERE participant_key = v_pk AND status = 'waiting' AND expires_at > v_now
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'waiting',
      'product_game_id', v_q.product_game_id,
      'stake_per_seat', v_q.stake_per_seat
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'phase', 'idle');
END;
$$;

COMMENT ON FUNCTION public.ov2_qm_find_fillable_pending_quick_match_room(text, bigint, text) IS
  'OV2 Quick Match: oldest OPEN pending QM room with same product+stake, active countdown, capacity, excluding already-seated participant.';

COMMENT ON FUNCTION public.ov2_qm_append_quick_match_invite_key(uuid, text) IS
  'OV2 Quick Match: authorize a filler by appending participant_key to meta.ov2_quick_match.invite_keys under row lock.';

-- ---------------------------------------------------------------------------
-- Enqueue: promote to pending room BEFORE try_form_offers (avoid new offer when fill possible)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_enqueue(
  p_participant_key text,
  p_display_name text,
  p_product_game_id text,
  p_stake_per_seat bigint,
  p_preferred_max_players integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_dn text := COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), 'Player');
  v_game text := trim(COALESCE(p_product_game_id, ''));
  v_stake bigint;
  v_id uuid;
  v_promo jsonb;
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key is required.');
  END IF;
  IF NOT public.ov2_qm_allowed_product(v_game) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_GAME', 'message', 'Quick match is not available for this game.');
  END IF;
  IF p_stake_per_seat IS NULL OR NOT public.ov2_qm_is_allowed_stake(p_stake_per_seat) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STAKE',
      'message', 'Quick match stake must be exactly 100, 1000, 10000, or 100000.'
    );
  END IF;
  v_stake := p_stake_per_seat;

  PERFORM public.ov2_qm_finalize_expired_offers();
  PERFORM public.ov2_qm_try_form_offers();

  IF EXISTS (
    SELECT 1 FROM public.ov2_quick_match_queue
    WHERE participant_key = v_pk AND status = 'matched'
  ) THEN
    PERFORM public.ov2_qm_try_form_offers();
    RETURN public.ov2_quick_match_tick(v_pk, NULL);
  END IF;

  SELECT id INTO v_id
  FROM public.ov2_quick_match_queue
  WHERE participant_key = v_pk AND status = 'waiting'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.ov2_quick_match_queue
    SET
      display_name = v_dn,
      product_game_id = v_game,
      stake_per_seat = v_stake,
      preferred_max_players = p_preferred_max_players,
      expires_at = now() + interval '30 minutes',
      updated_at = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ov2_quick_match_queue (
      participant_key, display_name, product_game_id, stake_per_seat, preferred_max_players,
      status, expires_at
    ) VALUES (
      v_pk, v_dn, v_game, v_stake, p_preferred_max_players,
      'waiting', now() + interval '30 minutes'
    );
  END IF;

  v_promo := public.ov2_qm_try_promote_waiting_to_fill_room(v_pk);
  IF v_promo IS NOT NULL THEN
    PERFORM public.ov2_qm_try_form_offers();
    RETURN v_promo;
  END IF;

  PERFORM public.ov2_qm_try_form_offers();

  RETURN public.ov2_quick_match_tick(v_pk, NULL);
END;
$$;

COMMENT ON FUNCTION public.ov2_qm_try_promote_waiting_to_fill_room(text) IS
  'OV2 Quick Match: if participant is waiting and a fillable pending QM room exists, append invite + complete queue; else NULL.';

COMMIT;
