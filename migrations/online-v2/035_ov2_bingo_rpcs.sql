-- OV2 Bingo: deterministic deck/cards helpers + RPCs. Apply after 034_ov2_bingo_schema.sql.
-- Card/deck ordering uses hashtextextended (server-authoritative; not bitwise-identical to JS preview RNG).

BEGIN;

-- --- Allow creating bingo rooms (aligns with ONLINE_V2_GAME_KINDS.BINGO = ov2_bingo) ---

CREATE OR REPLACE FUNCTION public.ov2_create_room(
  p_product_game_id text,
  p_title text,
  p_stake_per_seat bigint,
  p_host_participant_key text,
  p_display_name text,
  p_is_private boolean DEFAULT false,
  p_passcode text DEFAULT NULL,
  p_max_seats integer DEFAULT 8
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_game text;
  v_stake bigint;
  v_cap int;
  v_host text;
  v_title text;
  v_room public.ov2_rooms%ROWTYPE;
BEGIN
  v_game := trim(COALESCE(p_product_game_id, ''));
  IF v_game NOT IN ('ov2_board_path', 'ov2_mark_grid', 'ov2_ludo', 'ov2_bingo') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_GAME_ID',
      'message', 'Unknown or invalid OV2 game id.'
    );
  END IF;

  v_stake := p_stake_per_seat;
  IF v_stake IS NULL OR v_stake < 100 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKE_BELOW_MINIMUM',
      'message', 'Stake per seat must be at least 100.'
    );
  END IF;

  v_cap := COALESCE(p_max_seats, 8);
  IF v_cap < 2 OR v_cap > 16 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_CAPACITY',
      'message', 'Room capacity must be between 2 and 16 seats.'
    );
  END IF;

  v_host := trim(COALESCE(p_host_participant_key, ''));
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARGUMENT',
      'message', 'Host participant is required.'
    );
  END IF;

  v_title := COALESCE(NULLIF(trim(COALESCE(p_title, '')), ''), 'Table');

  INSERT INTO public.ov2_rooms (
    product_game_id,
    title,
    lifecycle_phase,
    stake_per_seat,
    host_participant_key,
    is_private,
    passcode,
    max_seats
  ) VALUES (
    v_game,
    v_title,
    'lobby',
    v_stake,
    v_host,
    COALESCE(p_is_private, false),
    NULLIF(trim(COALESCE(p_passcode, '')), ''),
    v_cap
  )
  RETURNING * INTO v_room;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    wallet_state,
    is_ready
  ) VALUES (
    v_room.id,
    v_host,
    NULLIF(trim(COALESCE(p_display_name, '')), ''),
    'none',
    false
  );

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(v_room.id)
  );
END;
$$;

COMMENT ON FUNCTION public.ov2_create_room IS
  'OV2: create lobby room + host member; allowlisted ids include ov2_board_path, ov2_mark_grid, ov2_ludo, ov2_bingo.';

-- --- Helpers: rematch flag in member meta.bingo ---

CREATE OR REPLACE FUNCTION public._ov2_bingo_member_rematch_requested(p_meta jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    COALESCE(
      (p_meta->'bingo'->>'rematch_requested') IN ('true', 't', '1')
      OR (p_meta->'bingo'->'rematch_requested') IS NOT DISTINCT FROM 'true'::jsonb,
      false
    );
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_pick_column_values(p_salt text, p_lo int, p_hi int)
RETURNS int[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  res int[] := ARRAY[]::int[];
  rec record;
BEGIN
  FOR rec IN
    SELECT gs.n
    FROM generate_series(p_lo, p_hi) AS gs(n)
    ORDER BY hashtextextended(p_salt || ':' || gs.n::text, 42::bigint)
    LIMIT 5
  LOOP
    res := array_append(res, rec.n);
  END LOOP;
  RETURN res;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_card_matrix_for_seat(p_seed text, p_round text, p_seat int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c0 int[];
  c1 int[];
  c2 int[];
  c3 int[];
  c4 int[];
  r int;
  row_js jsonb;
  grid jsonb := '[]'::jsonb;
BEGIN
  c0 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:0', 1, 15);
  c1 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:1', 16, 30);
  c2 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:2', 31, 45);
  c3 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:3', 46, 60);
  c4 := public._ov2_bingo_pick_column_values(p_seed || '::' || p_round || '::' || p_seat::text || ':col:4', 61, 75);

  FOR r IN 0..4 LOOP
    row_js := jsonb_build_array(c0[r + 1], c1[r + 1], c2[r + 1], c3[r + 1], c4[r + 1]);
    grid := grid || row_js;
  END LOOP;

  row_js := grid->2;
  row_js := jsonb_set(row_js, '{2}', '0'::jsonb, true);
  grid := jsonb_set(grid, '{2}', row_js, true);
  RETURN grid;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_deck_order_jsonb(p_salt text)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(sub.n ORDER BY sub.ord),
    '[]'::jsonb
  )
  FROM (
    SELECT
      gs.n AS n,
      hashtextextended(p_salt || ':deck:' || gs.n::text, 1337::bigint) AS ord
    FROM generate_series(1, 75) AS gs(n)
  ) sub;
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_called_int_array(p_called jsonb)
RETURNS int[]
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    array_agg((j.elem #>> '{}')::int ORDER BY j.ord),
    ARRAY[]::int[]
  )
  FROM jsonb_array_elements(p_called) WITH ORDINALITY AS j(elem, ord);
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_cell_ok(p_val int, p_called int[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_val = 0 OR p_val = ANY (p_called);
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_row_won(p_card jsonb, p_called int[], p_row int)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  c int;
  v int;
BEGIN
  IF p_row < 0 OR p_row > 4 THEN
    RETURN false;
  END IF;
  FOR c IN 0..4 LOOP
    v := ((p_card->p_row->c) #>> '{}')::int;
    IF NOT public._ov2_bingo_cell_ok(v, p_called) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_full_won(p_card jsonb, p_called int[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r int;
BEGIN
  FOR r IN 0..4 LOOP
    IF NOT public._ov2_bingo_row_won(p_card, p_called, r) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_bingo_claims_paid_sum(p_session_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(sum(c.amount), 0::numeric)
  FROM public.ov2_bingo_claims c
  WHERE c.session_id = p_session_id;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_build_snapshot(p_room public.ov2_rooms, p_sess public.ov2_bingo_sessions)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_claims jsonb;
BEGIN
  IF p_sess IS NULL THEN
    v_claims := '[]'::jsonb;
    RETURN jsonb_build_object(
      'room', public.ov2_room_to_public_jsonb(p_room),
      'members', public.ov2_members_to_public_jsonb(p_room.id),
      'session', NULL,
      'claims', v_claims
    );
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'session_id', c.session_id,
        'room_id', c.room_id,
        'match_seq', c.match_seq,
        'round_id', c.round_id,
        'prize_key', c.prize_key,
        'claimed_by_participant_key', c.claimed_by_participant_key,
        'claimed_by_name', c.claimed_by_name,
        'seat_index', c.seat_index,
        'amount', c.amount,
        'line_kind', c.line_kind
      )
      ORDER BY c.created_at ASC
    ),
    '[]'::jsonb
  )
  INTO v_claims
  FROM public.ov2_bingo_claims c
  WHERE c.session_id = p_sess.id;

  RETURN jsonb_build_object(
    'room', public.ov2_room_to_public_jsonb(p_room),
    'members', public.ov2_members_to_public_jsonb(p_room.id),
    'session', to_jsonb(p_sess) || jsonb_build_object(
      'deck_order_len', jsonb_array_length(COALESCE(p_sess.deck->'order', '[]'::jsonb)),
      'active_seats', p_sess.active_seats,
      'caller_participant_key', p_sess.caller_participant_key,
      'next_call_at', p_sess.next_call_at,
      'revision', p_sess.revision
    ),
    'claims', v_claims
  );
END;
$$;

-- =============================================================================
-- ov2_bingo_open_session
-- =============================================================================

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

  v_row_prize := greatest(0::numeric, v_pot * 0.1);
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

-- =============================================================================
-- ov2_bingo_get_snapshot
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_bingo_get_snapshot(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_bingo_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Bingo room');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot', public.ov2_bingo_build_snapshot(v_room, CAST(NULL AS public.ov2_bingo_sessions))
    );
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot', public.ov2_bingo_build_snapshot(v_room, CAST(NULL AS public.ov2_bingo_sessions))
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess));
END;
$$;

-- =============================================================================
-- ov2_bingo_call_next
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_bingo_call_next(
  p_room_id uuid,
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_order jsonb;
  v_n int;
  v_now timestamptz := now();
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
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
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_PLAYING', 'message', 'Calls only while playing');
  END IF;

  IF v_sess.caller_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CALLER', 'message', 'Only the designated caller can draw');
  END IF;

  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_sess.revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_REVISION',
      'message', 'Revision mismatch',
      'revision', v_sess.revision
    );
  END IF;

  IF v_sess.next_call_at IS NOT NULL AND v_now < v_sess.next_call_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CALL_TOO_SOON', 'message', 'Next call not ready yet', 'next_call_at', v_sess.next_call_at);
  END IF;

  v_order := COALESCE(v_sess.deck->'order', '[]'::jsonb);
  IF jsonb_array_length(v_order) <> 75 OR v_sess.deck_pos >= 75 THEN
    UPDATE public.ov2_bingo_sessions
    SET
      phase = 'finished',
      next_call_at = NULL,
      finished_at = COALESCE(finished_at, v_now),
      revision = revision + 1,
      updated_at = v_now
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;

    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
    RETURN jsonb_build_object(
      'ok', true,
      'snapshot',
      public.ov2_bingo_build_snapshot(v_room, v_sess),
      'deck_exhausted', true
    );
  END IF;

  v_n := (v_order->v_sess.deck_pos #>> '{}')::int;

  UPDATE public.ov2_bingo_sessions
  SET
    called = COALESCE(called, '[]'::jsonb) || jsonb_build_array(v_n),
    deck_pos = deck_pos + 1,
    last_number = v_n,
    revision = revision + 1,
    updated_at = v_now,
    phase = CASE WHEN deck_pos + 1 >= 75 THEN 'finished' ELSE 'playing' END,
    finished_at = CASE WHEN deck_pos + 1 >= 75 THEN COALESCE(finished_at, v_now) ELSE finished_at END,
    next_call_at = CASE WHEN deck_pos + 1 >= 75 THEN NULL ELSE v_now + interval '10 seconds' END
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_bingo_build_snapshot(v_room, v_sess));
END;
$$;

-- =============================================================================
-- ov2_bingo_claim_prize
-- =============================================================================

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
  v_paid numeric;
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
    v_paid := public._ov2_bingo_claims_paid_sum(v_sess.id);
    v_amount := greatest(0::numeric, v_sess.pot_total - v_paid);
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

-- =============================================================================
-- ov2_bingo_request_rematch / cancel / start_next_match
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_bingo_request_rematch(
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Rematch only after the match finishes');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room match cycle');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  IF v_member.seat_index IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_SEATED', 'message', 'Must be seated');
  END IF;

  IF NOT (v_sess.active_seats @> jsonb_build_array(v_member.seat_index)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat in this finished session');
  END IF;

  IF public._ov2_bingo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = jsonb_set(
      COALESCE(meta, '{}'::jsonb),
      '{bingo}',
      COALESCE(meta->'bingo', '{}'::jsonb)
        || jsonb_build_object('rematch_requested', true, 'rematch_at', to_jsonb(now()::text)),
      true
    ),
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_cancel_rematch(
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
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_member public.ov2_room_members%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REMATCH_NOT_ALLOWED', 'message', 'Cancel rematch only after match finished');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session mismatch');
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a room member');
  END IF;

  IF v_member.wallet_state IS DISTINCT FROM 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be committed');
  END IF;

  IF NOT public._ov2_bingo_member_rematch_requested(v_member.meta) THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;

  UPDATE public.ov2_room_members
  SET
    meta = CASE
      WHEN meta ? 'bingo' THEN
        jsonb_set(meta, '{bingo}', (meta->'bingo') - 'rematch_requested' - 'rematch_at', true)
      ELSE meta
    END,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  RETURN jsonb_build_object('ok', true, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_bingo_start_next_match(
  p_room_id uuid,
  p_host_participant_key text,
  p_expected_match_seq integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_sess public.ov2_bingo_sessions%ROWTYPE;
  v_pk text := trim(COALESCE(p_host_participant_key, ''));
  v_next_ms int;
  v_eligible int;
  v_ready int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and host_participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_bingo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can start the next match');
  END IF;

  IF p_expected_match_seq IS NOT NULL AND p_expected_match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STALE_MATCH_SEQ',
      'message', 'match_seq changed',
      'match_seq', v_room.match_seq
    );
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No session to continue from');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_bingo_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  IF v_sess.phase IS DISTINCT FROM 'finished' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FINISHED', 'message', 'Match must be finished first');
  END IF;

  IF v_sess.match_seq IS DISTINCT FROM v_room.match_seq THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STALE_SESSION', 'message', 'Session does not match room');
  END IF;

  SELECT count(*)::int INTO v_eligible
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  IF v_eligible < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated committed players');
  END IF;

  SELECT count(*)::int INTO v_ready
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed'
    AND public._ov2_bingo_member_rematch_requested(m.meta);

  IF v_ready < v_eligible THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_REMATCH_READY',
      'message', 'All seated players must request rematch first',
      'ready', v_ready,
      'eligible', v_eligible
    );
  END IF;

  v_next_ms := COALESCE(v_room.match_seq, 0) + 1;

  UPDATE public.ov2_room_members m
  SET
    meta = CASE
      WHEN m.meta ? 'bingo' THEN
        jsonb_set(m.meta, '{bingo}', (m.meta->'bingo') - 'rematch_requested' - 'rematch_at', true)
      ELSE m.meta
    END,
    wallet_state = CASE WHEN m.seat_index IS NOT NULL THEN 'none' ELSE m.wallet_state END,
    amount_locked = CASE WHEN m.seat_index IS NOT NULL THEN 0 ELSE m.amount_locked END,
    updated_at = now()
  WHERE m.room_id = p_room_id;

  UPDATE public.ov2_rooms
  SET
    match_seq = v_next_ms,
    active_session_id = NULL,
    pot_locked = 0,
    lifecycle_phase = 'pending_stakes',
    updated_at = now()
  WHERE id = p_room_id
  RETURNING * INTO v_room;

  RETURN jsonb_build_object(
    'ok', true,
    'match_seq', v_next_ms,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- Grants ---

REVOKE ALL ON FUNCTION public._ov2_bingo_member_rematch_requested(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_pick_column_values(text, int, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_card_matrix_for_seat(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_deck_order_jsonb(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_called_int_array(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_cell_ok(int, int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_row_won(jsonb, int[], int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_full_won(jsonb, int[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_bingo_claims_paid_sum(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_bingo_build_snapshot(public.ov2_rooms, public.ov2_bingo_sessions) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_bingo_open_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_open_session(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_get_snapshot(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_get_snapshot(uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_call_next(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_call_next(uuid, text, int) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_claim_prize(uuid, text, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_claim_prize(uuid, text, text, int) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_request_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_request_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_cancel_rematch(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_cancel_rematch(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_bingo_start_next_match(uuid, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bingo_start_next_match(uuid, text, int) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_bingo_open_session IS 'OV2 Bingo: host opens match; builds deck+cards; requires active room + committed seated members.';
COMMENT ON FUNCTION public.ov2_bingo_get_snapshot IS 'OV2 Bingo: room + active session + claims JSON.';
COMMENT ON FUNCTION public.ov2_bingo_call_next IS 'OV2 Bingo: caller draws next ball when due; ends session when deck exhausts.';
COMMENT ON FUNCTION public.ov2_bingo_claim_prize IS 'OV2 Bingo: validate board vs called numbers; insert claim + settlement line.';
COMMENT ON FUNCTION public.ov2_bingo_request_rematch IS 'OV2 Bingo: seated committed member requests rematch after finished session.';
COMMENT ON FUNCTION public.ov2_bingo_cancel_rematch IS 'OV2 Bingo: withdraw rematch request.';
COMMENT ON FUNCTION public.ov2_bingo_start_next_match IS 'OV2 Bingo: host bumps match_seq, clears session, resets seated stakes to pending_stakes (fresh commit required).';

COMMIT;
