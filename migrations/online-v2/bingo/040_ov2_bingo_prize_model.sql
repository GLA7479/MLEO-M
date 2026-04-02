BEGIN;

-- OV2 Bingo locked prize model: each row 15% of original session pot; full card 25% of same pot (not remainder).

CREATE OR REPLACE FUNCTION public.ov2_bingo_open_session(
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_existing public.ov2_bingo_sessions%ROWTYPE;
  v_seated int;
  v_active int[];
  v_active_json jsonb;
  v_caller text;
  v_round text;
  v_seed text;
  v_deck jsonb;
  v_cards jsonb := '{}'::jsonb;
  v_pot numeric;
  v_row_prize numeric;
  v_si int;
  v_stake bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host_participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bingo room');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can open a Bingo session');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Host must be a room member');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active (stakes committed)');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEATED_STAKES_NOT_COMMITTED', 'message', 'All seated members must commit stakes');
  END IF;

  SELECT * INTO v_existing
  FROM public.ov2_bingo_sessions
  WHERE room_id = p_room_id AND match_seq = v_room.match_seq
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.phase = 'finished' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'MATCH_FINISHED', 'message', 'Match finished; use rematch flow then open again');
    END IF;
    IF v_existing.phase = 'playing' THEN
      IF v_room.active_session_id IS DISTINCT FROM v_existing.id THEN
        UPDATE public.ov2_rooms
        SET active_session_id = v_existing.id, updated_at = now()
        WHERE id = p_room_id;
        SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_bingo_build_snapshot(v_room, v_existing)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;

  IF v_seated < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'At least two seated members required');
  END IF;

  SELECT array_agg(m.seat_index ORDER BY m.seat_index ASC)
  INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;

  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Active seats invalid');
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_active) s WHERE s < 0 OR s > 7) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_SEAT', 'message', 'Bingo seats must be in 0..7');
  END IF;

  SELECT trim(m.participant_key)
  INTO v_caller
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index = v_active[1]
  LIMIT 1;

  IF v_caller IS NULL OR length(v_caller) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALLER_RESOLVE_FAILED', 'message', 'Could not resolve caller participant');
  END IF;

  v_round := gen_random_uuid()::text;
  v_seed := v_room.id::text || '::' || v_room.match_seq::text || '::' || v_round;
  v_deck := public._ov2_bingo_deck_order_jsonb(v_seed);

  v_active_json := to_jsonb(v_active);
  FOREACH v_si IN ARRAY v_active LOOP
    v_cards := v_cards || jsonb_build_object(
      v_si::text,
      public._ov2_bingo_card_matrix_for_seat(v_seed, v_round, v_si)
    );
  END LOOP;

  v_deck := jsonb_build_object('order', v_deck, 'cards', v_cards);

  SELECT COALESCE(sum(m.amount_locked), 0)::numeric
  INTO v_pot
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state = 'committed';

  v_row_prize := greatest(0::numeric, v_pot * 0.15);
  v_stake := v_room.stake_per_seat;

  INSERT INTO public.ov2_bingo_sessions (
    room_id,
    match_seq,
    phase,
    revision,
    seat_count,
    active_seats,
    caller_participant_key,
    round_id,
    seed,
    deck,
    deck_pos,
    called,
    last_number,
    entry_fee,
    pot_total,
    row_prize_amount,
    next_call_at,
    started_at
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'playing',
    0,
    cardinality(v_active),
    v_active_json,
    v_caller,
    v_round,
    v_seed,
    v_deck,
    0,
    '[]'::jsonb,
    NULL,
    COALESCE(v_stake, 0)::numeric,
    v_pot,
    v_row_prize,
    now() + interval '10 seconds',
    now()
  )
  RETURNING * INTO v_sess;

  UPDATE public.ov2_rooms
  SET
    active_session_id = v_sess.id,
    pot_locked = trunc(v_pot)::bigint,
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_claim_prize(
  p_room_id uuid,
  p_prize_key text,
  p_participant_key text,
  p_expected_revision integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_key text := trim(COALESCE(p_prize_key, ''));
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_member public.ov2_room_members%ROWTYPE;
  v_card jsonb;
  v_called int[];
  v_line_kind text;
  v_amount numeric;
  v_claim_id uuid;
  v_name text;
  v_row int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR length(v_key) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id, prize_key, participant_key required');
  END IF;

  IF v_key NOT IN ('row1', 'row2', 'row3', 'row4', 'row5', 'full') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PRIZE', 'message', 'Invalid prize_key');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active bingo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Claims only while playing');
  END IF;

  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_REVISION',
      'message', 'Revision mismatch',
      'revision', v_sess.revision
    );
  END IF;

  SELECT * INTO v_member
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.seat_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Must be seated to claim');
  END IF;

  IF NOT (v_sess.active_seats @> jsonb_build_array(v_member.seat_index)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SEAT_NOT_ACTIVE', 'message', 'Seat not in this match');
  END IF;

  v_card := COALESCE(v_sess.deck->'cards'->(v_member.seat_index::text), 'null'::jsonb);
  IF v_card IS NULL OR jsonb_typeof(v_card) IS DISTINCT FROM 'array' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CARD_MISSING', 'message', 'No card for seat');
  END IF;

  v_called := public._ov2_bingo_called_int_array(COALESCE(v_sess.called, '[]'::jsonb));

  IF v_key = 'full' THEN
    IF NOT public._ov2_bingo_full_won(v_card, v_called) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRIZE_NOT_EARNED', 'message', 'Full card not complete');
    END IF;
    v_line_kind := 'grid_full';
    v_amount := greatest(0::numeric, trunc(v_sess.pot_total * 0.25));
  ELSE
    IF v_key !~ '^row[1-5]$' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PRIZE', 'message', 'Bad row prize');
    END IF;
    v_row := (substring(v_key FROM 4)::int) - 1;
    IF v_row < 0 OR v_row > 4 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_PRIZE', 'message', 'Bad row prize');
    END IF;
    IF NOT public._ov2_bingo_row_won(v_card, v_called, v_row) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'PRIZE_NOT_EARNED', 'message', 'Row not complete on called numbers');
    END IF;
    v_line_kind := 'grid_row';
    v_amount := greatest(0::numeric, v_sess.row_prize_amount);
  END IF;

  IF EXISTS (SELECT 1 FROM public.ov2_bingo_claims c WHERE c.session_id = v_sess.id AND c.prize_key = v_key) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRIZE_CLAIMED', 'message', 'Prize already claimed');
  END IF;

  v_name := COALESCE(NULLIF(trim(COALESCE(v_member.display_name, '')), ''), v_pk);

  INSERT INTO public.ov2_bingo_claims (
    session_id,
    room_id,
    match_seq,
    round_id,
    prize_key,
    claimed_by_participant_key,
    claimed_by_name,
    seat_index,
    amount,
    line_kind
  ) VALUES (
    v_sess.id,
    p_room_id,
    v_sess.match_seq,
    v_sess.round_id,
    v_key,
    v_pk,
    v_name,
    v_member.seat_index,
    v_amount,
    v_line_kind
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.ov2_settlement_lines (
    room_id,
    match_seq,
    recipient_participant_key,
    line_kind,
    amount,
    idempotency_key,
    game_session_id,
    meta
  ) VALUES (
    p_room_id,
    v_sess.match_seq,
    v_pk,
    v_line_kind,
    trunc(v_amount)::bigint,
    'ov2:bingo:settle:' || v_claim_id::text,
    v_sess.id,
    jsonb_build_object('bingo_claim_id', v_claim_id, 'prize_key', v_key, 'round_id', v_sess.round_id)
  );

  IF v_key = 'full' THEN
    UPDATE public.ov2_bingo_sessions
    SET
      phase = 'finished',
      winner_participant_key = v_pk,
      winner_name = v_name,
      finished_at = now(),
      next_call_at = NULL,
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  ELSE
    UPDATE public.ov2_bingo_sessions
    SET
      revision = revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess));
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'code', 'PRIZE_CLAIMED', 'message', 'Prize already claimed');
END;
$$;

COMMIT;
