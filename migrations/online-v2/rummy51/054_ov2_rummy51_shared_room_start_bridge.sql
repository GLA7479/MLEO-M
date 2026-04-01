-- Rummy51 bridge: allow open_session from OV2 shared room start path.
-- Scope: ov2_rummy51_open_session(uuid, text).
-- NOTE: draft migration only; do not execute without approval.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_rummy51_open_session(
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
  v_pk text := trim(COALESCE(p_host_participant_key, ''));
  v_sess public.ov2_rummy51_sessions%ROWTYPE;
  v_existing public.ov2_rummy51_sessions%ROWTYPE;
  v_seated int;
  v_keys text[];
  v_deck jsonb;
  v_shuf jsonb;
  v_stock jsonb;
  v_disc jsonb;
  v_hands jsonb;
  v_top jsonb;
  v_rest jsonb;
  v_active jsonb := '[]'::jsonb;
  r record;
  v_seed text;
  v_dealer int;
  v_first_pk text;
  v_ps jsonb := '{}'::jsonb;
  v_turn text;
  v_si int;
  v_meta jsonb;
  v_n int;
  v_di int;
  v_is_shared boolean;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host_participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_rummy51' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Rummy51 room');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only host can open session');
  END IF;

  v_is_shared := COALESCE(v_room.shared_schema_version, 0) = 1;
  IF v_is_shared THEN
    IF COALESCE(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'ROOM_NOT_STARTED',
        'message', 'Room must be started before opening a Rummy51 session.'
      );
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEATED_STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_rummy51_sessions s
    WHERE s.id = v_room.active_session_id AND s.room_id = p_room_id;
    IF FOUND AND v_existing.phase = 'playing' AND v_existing.match_seq IS NOT DISTINCT FROM v_room.match_seq THEN
      RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_existing));
    END IF;
    IF FOUND AND v_existing.phase = 'finished' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'SESSION_FINISHED',
        'message', 'Match finished; use rematch flow and start_next_match before opening a new session.'
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_seated < 2 OR v_seated > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT_COUNT', 'message', 'Need 2-4 seated players');
  END IF;

  SELECT array_agg(m.participant_key ORDER BY m.seat_index ASC)
  INTO v_keys
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;

  v_seed := 'ov2r51:' || p_room_id::text || ':' || coalesce(v_room.match_seq, 0)::text || ':' || extract(epoch from now())::bigint::text;
  v_deck := public._ov2_r51_build_deck();
  v_shuf := public._ov2_r51_shuffle_deck(v_seed, v_deck);
  SELECT d.hands, d.stock_out INTO v_hands, v_stock FROM public._ov2_r51_deal_hands(v_shuf, v_keys, 14) AS d;

  SELECT pl.elem, pl.rest INTO v_top, v_rest FROM public._ov2_r51_jsonb_pop_last(v_stock) AS pl;
  v_disc := public._ov2_r51_jsonb_push('[]'::jsonb, v_top);
  v_stock := v_rest;

  FOR r IN SELECT m.participant_key, m.seat_index, m.display_name
           FROM public.ov2_room_members m
           WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
           ORDER BY m.seat_index ASC
  LOOP
    v_active := v_active || jsonb_build_object('seat', r.seat_index, 'participantKey', r.participant_key);
    v_ps := jsonb_set(
      v_ps,
      ARRAY[r.participant_key],
      jsonb_build_object(
        'hasOpenedThisHand', false,
        'hasEverOpened', false,
        'isEliminated', false,
        'scoreTotal', 0,
        'roundPenalty', 0,
        'seatIndex', r.seat_index,
        'displayName', coalesce(nullif(trim(r.display_name), ''), r.participant_key)
      ),
      true
    );
  END LOOP;

  v_n := coalesce(cardinality(v_keys), 0);
  v_di := 1 + (abs(hashtext(v_seed)) % v_n);
  v_dealer := (
    SELECT (v_active -> (v_di - 1) ->> 'seat')::int
  );
  v_first_pk := (
    SELECT v_active -> ((v_di % v_n)) ->> 'participantKey'
  );
  v_turn := coalesce(v_first_pk, v_keys[1]);

  v_meta := jsonb_build_object(
    'stakePerSeat', v_room.stake_per_seat,
    'seatCount', v_seated,
    'participantKeys', to_jsonb(v_keys)
  );

  INSERT INTO public.ov2_rummy51_sessions (
    room_id, match_seq, phase, revision, turn_index, turn_participant_key,
    dealer_seat_index, active_seats, seed, stock, discard, hands, table_melds,
    player_state, taken_discard_card_id, pending_draw_source, round_number, match_meta
  ) VALUES (
    p_room_id,
    coalesce(v_room.match_seq, 0),
    'playing',
    0,
    0,
    v_turn,
    v_dealer,
    v_active,
    v_seed,
    v_stock,
    v_disc,
    v_hands,
    '[]'::jsonb,
    v_ps,
    NULL,
    NULL,
    1,
    v_meta
  )
  RETURNING * INTO v_sess;

  UPDATE public.ov2_rooms
  SET
    active_session_id = v_sess.id,
    active_runtime_id = COALESCE(active_runtime_id, v_sess.id),
    updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', public.ov2_rummy51_build_snapshot(v_room, v_sess));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_rummy51_open_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_rummy51_open_session(uuid, text) TO anon, authenticated, service_role;

COMMIT;

