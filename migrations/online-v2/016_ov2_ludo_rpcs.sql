-- OV2 Ludo: open session + authoritative roll/move. Apply after 015_ov2_ludo_schema.sql.
-- Logic mirrors lib/online-v2/ludo/ov2LudoEngine.js (LUDO_TRACK_LEN=52, LUDO_HOME_LEN=6, LUDO_PIECES_PER_PLAYER=4).
-- Draft for manual review.

BEGIN;

-- --- Internal: geometry (must match ov2LudoEngine LUDO_START_OFFSETS) ---

CREATE OR REPLACE FUNCTION public.ov2_ludo_start_offset(p_seat integer)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_seat
    WHEN 0 THEN 0
    WHEN 1 THEN 13
    WHEN 2 THEN 26
    WHEN 3 THEN 39
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_to_global_idx(p_seat integer, p_pos integer)
RETURNS integer
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_track int := 52;
BEGIN
  IF p_pos < 0 OR p_pos >= v_track THEN
    RETURN NULL;
  END IF;
  RETURN (public.ov2_ludo_start_offset(p_seat) + p_pos) % v_track;
END;
$$;

-- Occupancy: returns global index -> jsonb array of {seat, piece}
CREATE OR REPLACE FUNCTION public.ov2_ludo_build_occupancy(p_board jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_occ jsonb := '{}'::jsonb;
  v_seat int;
  v_key text;
  v_arr jsonb;
  v_len int;
  v_i int;
  v_pos int;
  v_gi int;
  v_track int := 52;
  v_pair jsonb;
  v_cell jsonb;
BEGIN
  FOR v_seat IN 0..3 LOOP
    v_key := v_seat::text;
    v_arr := p_board #> ARRAY['pieces', v_key];
    IF v_arr IS NULL OR jsonb_typeof(v_arr) <> 'array' THEN
      CONTINUE;
    END IF;
    v_len := jsonb_array_length(v_arr);
    FOR v_i IN 0..(v_len - 1) LOOP
      v_pos := (v_arr -> v_i)::text::integer;
      IF v_pos >= 0 AND v_pos < v_track THEN
        v_gi := public.ov2_ludo_to_global_idx(v_seat, v_pos);
        IF v_gi IS NOT NULL THEN
          v_pair := jsonb_build_object('seat', v_seat, 'piece', v_i);
          v_cell := COALESCE(v_occ -> v_gi::text, '[]'::jsonb);
          IF jsonb_typeof(v_cell) <> 'array' THEN
            v_cell := '[]'::jsonb;
          END IF;
          v_cell := v_cell || jsonb_build_array(v_pair);
          v_occ := jsonb_set(COALESCE(v_occ, '{}'::jsonb), ARRAY[v_gi::text], v_cell, true);
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN COALESCE(v_occ, '{}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_can_move_piece(p_board jsonb, p_seat int, p_piece int, p_dice int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_track int := 52;
  v_home int := 6;
  v_total int := 58;
  v_key text := p_seat::text;
  v_arr jsonb;
  v_pos int;
  v_target int;
  v_occ jsonb;
  v_cell jsonb;
  v_elem jsonb;
  v_allies int;
  v_enemies int;
  v_k text;
  v_ps jsonb;
  v_j int;
  v_other_pos int;
  v_gi int;
  v_entry_gi int;
  v_i int;
BEGIN
  IF p_dice IS NULL OR p_dice <= 0 THEN
    RETURN false;
  END IF;
  v_arr := p_board #> ARRAY['pieces', v_key];
  IF v_arr IS NULL OR jsonb_typeof(v_arr) <> 'array' OR p_piece < 0 OR p_piece >= jsonb_array_length(v_arr) THEN
    RETURN false;
  END IF;
  v_pos := (v_arr -> p_piece)::text::integer;
  IF v_pos IS NULL OR v_pos >= v_total THEN
    RETURN false;
  END IF;

  IF v_pos < 0 THEN
    IF p_dice <> 6 THEN
      RETURN false;
    END IF;
    v_occ := public.ov2_ludo_build_occupancy(p_board);
    v_entry_gi := public.ov2_ludo_to_global_idx(p_seat, 0);
    v_cell := v_occ -> v_entry_gi::text;
    IF v_cell IS NULL OR jsonb_typeof(v_cell) <> 'array' OR jsonb_array_length(v_cell) = 0 THEN
      RETURN true;
    END IF;
    v_enemies := 0;
    FOR v_i IN 0..(jsonb_array_length(v_cell) - 1) LOOP
      v_elem := v_cell -> v_i;
      IF (v_elem ->> 'seat')::int IS DISTINCT FROM p_seat THEN
        v_enemies := v_enemies + 1;
      END IF;
    END LOOP;
    RETURN v_enemies < 2;
  END IF;

  v_target := v_pos + p_dice;

  IF v_target = v_total THEN
    RETURN true;
  END IF;
  IF v_target > v_total THEN
    RETURN false;
  END IF;

  IF v_target >= v_track THEN
    v_ps := p_board #> ARRAY['pieces', v_key];
    FOR v_j IN 0..(jsonb_array_length(v_ps) - 1) LOOP
      IF v_j = p_piece THEN
        CONTINUE;
      END IF;
      v_other_pos := (v_ps -> v_j)::text::integer;
      IF v_other_pos = v_target THEN
        RETURN false;
      END IF;
    END LOOP;
    RETURN true;
  END IF;

  v_occ := public.ov2_ludo_build_occupancy(p_board);
  v_gi := public.ov2_ludo_to_global_idx(p_seat, v_target);
  v_cell := v_occ -> v_gi::text;
  IF v_cell IS NULL OR jsonb_typeof(v_cell) <> 'array' OR jsonb_array_length(v_cell) = 0 THEN
    RETURN true;
  END IF;
  v_allies := 0;
  v_enemies := 0;
  FOR v_i IN 0..(jsonb_array_length(v_cell) - 1) LOOP
    v_elem := v_cell -> v_i;
    IF (v_elem ->> 'seat')::int = p_seat THEN
      v_allies := v_allies + 1;
    ELSE
      v_enemies := v_enemies + 1;
    END IF;
  END LOOP;
  IF v_allies >= 1 THEN
    RETURN false;
  END IF;
  IF v_enemies >= 2 AND v_allies = 0 THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_list_movable_pieces(p_board jsonb, p_seat int, p_dice int)
RETURNS integer[]
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_arr int[] := ARRAY[]::integer[];
  v_i int;
  v_len int;
  v_key text := p_seat::text;
  v_pieces jsonb;
BEGIN
  v_pieces := p_board #> ARRAY['pieces', v_key];
  IF v_pieces IS NULL OR jsonb_typeof(v_pieces) <> 'array' THEN
    RETURN v_arr;
  END IF;
  v_len := jsonb_array_length(v_pieces);
  FOR v_i IN 0..(v_len - 1) LOOP
    IF public.ov2_ludo_can_move_piece(p_board, p_seat, v_i, p_dice) THEN
      v_arr := array_append(v_arr, v_i);
    END IF;
  END LOOP;
  RETURN v_arr;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_apply_move_on_board(p_board jsonb, p_seat int, p_piece int, p_dice int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_track int := 52;
  v_total int := 58;
  v_key text := p_seat::text;
  v_b jsonb;
  v_arr jsonb;
  v_pos int;
  v_new_pos int;
  v_occ jsonb;
  v_cell jsonb;
  v_elem jsonb;
  v_i int;
  v_enemy_seat int;
  v_enemy_piece int;
  v_gi int;
  v_finished jsonb;
  v_fs text;
  v_fc int;
  v_winner int;
BEGIN
  IF NOT public.ov2_ludo_can_move_piece(p_board, p_seat, p_piece, p_dice) THEN
    RETURN NULL;
  END IF;

  v_arr := p_board #> ARRAY['pieces', v_key];
  v_pos := (v_arr -> p_piece)::text::integer;
  IF v_pos < 0 THEN
    v_new_pos := 0;
  ELSE
    v_new_pos := v_pos + p_dice;
  END IF;

  v_b := p_board;

  IF v_new_pos = v_total THEN
    v_b := jsonb_set(v_b, ARRAY['pieces', v_key, p_piece::text], to_jsonb(v_new_pos), true);
    v_finished := COALESCE(v_b -> 'finished', '{}'::jsonb);
    v_fc := COALESCE((v_finished ->> v_key)::int, 0) + 1;
    v_b := jsonb_set(v_b, ARRAY['finished', v_key], to_jsonb(v_fc), true);
    v_b := jsonb_set(v_b, '{extraTurn}', 'true'::jsonb, true);
  ELSIF v_new_pos >= v_track THEN
    v_b := jsonb_set(v_b, ARRAY['pieces', v_key, p_piece::text], to_jsonb(v_new_pos), true);
  ELSE
    v_occ := public.ov2_ludo_build_occupancy(p_board);
    v_gi := public.ov2_ludo_to_global_idx(p_seat, v_new_pos);
    v_cell := COALESCE(v_occ -> v_gi::text, '[]'::jsonb);
    IF jsonb_typeof(v_cell) = 'array' THEN
      FOR v_i IN 0..(jsonb_array_length(v_cell) - 1) LOOP
        v_elem := v_cell -> v_i;
        IF (v_elem ->> 'seat')::int IS DISTINCT FROM p_seat THEN
          v_enemy_seat := (v_elem ->> 'seat')::int;
          v_enemy_piece := (v_elem ->> 'piece')::int;
          v_b := jsonb_set(v_b, ARRAY['pieces', v_enemy_seat::text, v_enemy_piece::text], '-1'::jsonb, true);
          v_b := jsonb_set(v_b, '{extraTurn}', 'true'::jsonb, true);
        END IF;
      END LOOP;
    END IF;
    v_b := jsonb_set(v_b, ARRAY['pieces', v_key, p_piece::text], to_jsonb(v_new_pos), true);
  END IF;

  v_b := jsonb_set(v_b, '{dice}', 'null'::jsonb, true);
  v_b := jsonb_set(v_b, '{lastDice}', to_jsonb(p_dice), true);

  v_finished := v_b -> 'finished';
  v_winner := NULL;
  IF v_finished IS NOT NULL AND jsonb_typeof(v_finished) = 'object' THEN
    FOR v_fs IN SELECT jsonb_object_keys(v_finished) LOOP
      IF COALESCE((v_finished ->> v_fs)::int, 0) >= 4 THEN
        v_winner := v_fs::int;
        EXIT;
      END IF;
    END LOOP;
  END IF;
  IF v_winner IS NOT NULL THEN
    v_b := jsonb_set(v_b, '{winner}', to_jsonb(v_winner), true);
  END IF;

  RETURN v_b;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_next_turn_on_board(p_board jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_active jsonb;
  v_n int;
  v_turn int;
  v_idx int := -1;
  v_i int;
  v_s int;
  v_last int;
  v_extra boolean;
  v_next_idx int;
BEGIN
  v_active := p_board -> 'activeSeats';
  IF v_active IS NULL OR jsonb_typeof(v_active) <> 'array' OR jsonb_array_length(v_active) = 0 THEN
    RETURN p_board;
  END IF;
  v_n := jsonb_array_length(v_active);
  v_turn := (p_board ->> 'turnSeat')::int;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_s := (v_active -> v_i)::text::int;
    IF v_s = v_turn THEN
      v_idx := v_i;
      EXIT;
    END IF;
  END LOOP;
  IF v_idx < 0 THEN
    RETURN jsonb_set(p_board, '{turnSeat}', v_active -> 0, true);
  END IF;
  v_last := COALESCE((p_board ->> 'lastDice')::int, (p_board ->> 'dice')::int);
  v_extra := COALESCE((p_board ->> 'extraTurn')::boolean, false);
  IF v_last = 6 OR v_extra THEN
    RETURN jsonb_set(p_board, '{extraTurn}', 'false'::jsonb, true);
  END IF;
  v_next_idx := (v_idx + 1) % v_n;
  RETURN jsonb_set(p_board, '{turnSeat}', v_active -> v_next_idx, true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_initial_board_json(p_active int[])
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'seatCount', cardinality(p_active),
    'activeSeats', to_jsonb(p_active),
    'turnSeat', p_active[1],
    'dice', NULL,
    'lastDice', NULL,
    'pieces', (
      SELECT COALESCE(jsonb_object_agg(x::text, '[-1,-1,-1,-1]'::jsonb), '{}'::jsonb)
      FROM unnest(p_active) AS t(x)
    ),
    'finished', (
      SELECT COALESCE(jsonb_object_agg(x::text, to_jsonb(0)), '{}'::jsonb)
      FROM unnest(p_active) AS t(x)
    ),
    'winner', NULL,
    'extraTurn', false
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_ludo_build_client_snapshot(
  p_session public.ov2_ludo_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_my_seat int;
  v_board jsonb;
  v_turn int;
  v_dice int;
  v_phase text;
  v_finished boolean;
  v_can_roll boolean := false;
  v_can_move boolean := false;
  v_legal int[];
  v_sess_id text := p_session.id::text;
  v_dice_elem jsonb;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := (v_board ->> 'turnSeat')::int;
  v_dice_elem := v_board -> 'dice';
  IF v_dice_elem IS NULL OR jsonb_typeof(v_dice_elem) = 'null' THEN
    v_dice := NULL;
  ELSE
    v_dice := (v_board ->> 'dice')::int;
  END IF;
  v_phase := p_session.phase;

  SELECT s.seat_index INTO v_my_seat
  FROM public.ov2_ludo_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;

  v_finished := (v_phase = 'finished' OR (v_board ->> 'winner') IS NOT NULL);

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL THEN
    IF v_my_seat = v_turn AND v_dice IS NULL THEN
      v_can_roll := true;
    END IF;
    IF v_my_seat = v_turn AND v_dice IS NOT NULL THEN
      v_legal := public.ov2_ludo_list_movable_pieces(v_board, v_turn, v_dice);
      IF array_length(v_legal, 1) IS NOT NULL AND array_length(v_legal, 1) > 0 THEN
        v_can_move := true;
      END IF;
    END IF;
  END IF;

  IF v_finished THEN
    v_can_roll := false;
    v_can_move := false;
  END IF;

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', v_sess_id,
    'roomId', p_session.room_id::text,
    'phase', v_phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my_seat IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_my_seat) END,
    'board', v_board,
    'turnSeat', to_jsonb(v_turn),
    'dice', CASE WHEN v_dice IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_dice) END,
    'lastDice', CASE WHEN p_session.last_dice IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_session.last_dice) END,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN 'null'::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'canClientRoll', v_can_roll,
    'canClientMovePiece', v_can_move,
    'boardViewReadOnly', (v_my_seat IS NULL OR v_finished OR (NOT v_can_roll AND NOT v_can_move)),
    'legalMovablePieceIndices', CASE
      WHEN v_legal IS NULL THEN 'null'::jsonb
      ELSE to_jsonb(v_legal)
    END
  );
END;
$$;

-- =============================================================================
-- ov2_ludo_open_session
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_open_session(
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
  v_pk text;
  v_member public.ov2_room_members%ROWTYPE;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_existing public.ov2_ludo_sessions%ROWTYPE;
  v_committed int;
  v_n int;
  v_active int[] := ARRAY[]::integer[];
  v_i int;
  v_board jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF trim(COALESCE(v_room.host_participant_key, '')) IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can open a Ludo session');
  END IF;
  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_ludo_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id AND status = 'live';
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_ludo_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT * INTO v_member FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Host is not a room member');
  END IF;

  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members WHERE room_id = p_room_id AND wallet_state = 'committed';
  IF v_committed < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two committed members');
  END IF;
  IF v_committed > 4 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'TOO_MANY_PLAYERS',
      'message', 'Ludo supports at most four committed members in this room.'
    );
  END IF;

  v_n := v_committed;
  FOR v_i IN 0..(v_n - 1) LOOP
    v_active := array_append(v_active, v_i);
  END LOOP;

  v_board := public.ov2_ludo_initial_board_json(v_active);

  INSERT INTO public.ov2_ludo_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, dice_value, last_dice, winner_seat, active_seats
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    v_board,
    (v_board ->> 'turnSeat')::int,
    NULL,
    NULL,
    NULL,
    v_active
  )
  RETURNING * INTO v_sess;

  -- Ludo ring seats 0..n-1 follow room order: ov2_room_members.seat_index first (NULLs last), then participant_key.
  INSERT INTO public.ov2_ludo_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    (ROW_NUMBER() OVER (ORDER BY m.seat_index ASC NULLS LAST, m.participant_key ASC)) - 1,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
  ORDER BY m.seat_index ASC NULLS LAST, m.participant_key ASC;

  UPDATE public.ov2_rooms SET active_session_id = v_sess.id, updated_at = now() WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

-- =============================================================================
-- ov2_ludo_roll
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_roll(
  p_room_id uuid,
  p_participant_key text,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_roll int;
  v_movable int[];
  v_turn int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk AND m.wallet_state = 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_ludo_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Ludo seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to roll');
  END IF;
  IF v_board ? 'dice' AND jsonb_typeof(v_board -> 'dice') <> 'null' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'DICE_ALREADY_SET', 'message', 'Roll already pending move');
  END IF;
  IF (v_board ->> 'winner') IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_FINISHED', 'message', 'Game already finished');
  END IF;

  v_roll := 1 + floor(random() * 6)::int;
  v_board := jsonb_set(v_board, '{dice}', to_jsonb(v_roll), true);

  v_movable := public.ov2_ludo_list_movable_pieces(v_board, v_turn, v_roll);
  IF v_movable IS NULL OR array_length(v_movable, 1) IS NULL OR array_length(v_movable, 1) = 0 THEN
    v_board := jsonb_set(v_board, '{lastDice}', to_jsonb(v_roll), true);
    v_board := jsonb_set(v_board, '{dice}', 'null'::jsonb, true);
    v_board := jsonb_set(v_board, '{extraTurn}', 'false'::jsonb, true);
    v_board := public.ov2_ludo_next_turn_on_board(v_board);
  END IF;

  UPDATE public.ov2_ludo_sessions SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    dice_value = CASE WHEN (v_board -> 'dice') IS NULL OR v_board -> 'dice' = 'null'::jsonb THEN NULL ELSE (v_board ->> 'dice')::int END,
    last_dice = (v_board ->> 'lastDice')::int,
    winner_seat = CASE WHEN (v_board ->> 'winner') IS NULL THEN NULL ELSE (v_board ->> 'winner')::int END,
    phase = CASE WHEN (v_board ->> 'winner') IS NOT NULL THEN 'finished' ELSE 'playing' END,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

-- =============================================================================
-- ov2_ludo_move
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_move(
  p_room_id uuid,
  p_participant_key text,
  p_piece_index integer,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_ludo_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_new_board jsonb;
  v_turn int;
  v_dice int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  IF p_piece_index IS NULL OR p_piece_index < 0 OR p_piece_index > 3 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid piece index');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_ludo_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk AND m.wallet_state = 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_COMMITTED', 'message', 'Member must be stake-committed');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_ludo_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No Ludo seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  v_dice := (v_board ->> 'dice')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn to move');
  END IF;
  IF v_dice IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DICE', 'message', 'Must roll before moving');
  END IF;

  IF NOT public.ov2_ludo_can_move_piece(v_board, v_seat, p_piece_index, v_dice) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE', 'message', 'Illegal move');
  END IF;

  v_new_board := public.ov2_ludo_apply_move_on_board(v_board, v_seat, p_piece_index, v_dice);
  IF v_new_board IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'APPLY_FAILED', 'message', 'Move apply failed');
  END IF;

  IF (v_new_board ->> 'winner') IS NULL THEN
    v_new_board := public.ov2_ludo_next_turn_on_board(v_new_board);
  END IF;

  UPDATE public.ov2_ludo_sessions SET
    board = v_new_board,
    turn_seat = (v_new_board ->> 'turnSeat')::int,
    dice_value = CASE WHEN (v_new_board -> 'dice') IS NULL OR v_new_board -> 'dice' = 'null'::jsonb THEN NULL ELSE (v_new_board ->> 'dice')::int END,
    last_dice = (v_new_board ->> 'lastDice')::int,
    winner_seat = CASE WHEN (v_new_board ->> 'winner') IS NULL THEN NULL ELSE (v_new_board ->> 'winner')::int END,
    phase = CASE WHEN (v_new_board ->> 'winner') IS NOT NULL THEN 'finished' ELSE 'playing' END,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

-- =============================================================================
-- ov2_ludo_get_snapshot (read-only; for client initial load + after realtime)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_ludo_get_snapshot(
  p_room_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_ludo_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Ludo room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active Ludo session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_ludo_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id AND status = 'live';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Ludo session not found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ludo_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_get_snapshot(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_open_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_open_session(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_roll(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_roll(uuid, text, bigint) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_ludo_move(uuid, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ludo_move(uuid, text, integer, bigint) TO anon, authenticated, service_role;

COMMIT;
