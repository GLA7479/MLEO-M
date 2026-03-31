-- OV2 Ludo parity fix:
-- Force immediate turn pass when a roll has zero legal moves (even on 6).
-- This prevents stale same-seat 30s deadlines and false missed-turn penalties.

BEGIN;

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
  v_next_turn int;
  v_new_deadline timestamptz;
  v_active int[];
  v_idx int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_ludo' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
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
    -- Strict no-legal-move parity: always pass to next active seat immediately.
    v_board := jsonb_set(v_board, '{lastDice}', to_jsonb(v_roll), true);
    v_board := jsonb_set(v_board, '{dice}', 'null'::jsonb, true);
    v_board := jsonb_set(v_board, '{extraTurn}', 'false'::jsonb, true);

    v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);
    IF cardinality(v_active) > 0 THEN
      v_idx := array_position(v_active, v_turn);
      IF v_idx IS NULL THEN
        v_next_turn := v_active[1];
      ELSE
        v_next_turn := v_active[(v_idx % cardinality(v_active)) + 1];
      END IF;
    ELSE
      v_next_turn := NULL;
    END IF;
    v_board := jsonb_set(v_board, '{turnSeat}', CASE WHEN v_next_turn IS NULL THEN 'null'::jsonb ELSE to_jsonb(v_next_turn) END, true);
  END IF;

  v_next_turn := CASE WHEN (v_board ->> 'winner') IS NULL THEN (v_board ->> 'turnSeat')::int ELSE NULL END;
  IF (v_board ->> 'winner') IS NOT NULL THEN
    v_new_deadline := NULL;
  ELSIF v_sess.current_turn IS DISTINCT FROM v_next_turn OR v_sess.turn_deadline IS NULL THEN
    v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));
  ELSE
    v_new_deadline := v_sess.turn_deadline;
  END IF;

  UPDATE public.ov2_ludo_sessions SET
    board = v_board,
    turn_seat = (v_board ->> 'turnSeat')::int,
    dice_value = CASE WHEN (v_board -> 'dice') IS NULL OR v_board -> 'dice' = 'null'::jsonb THEN NULL ELSE (v_board ->> 'dice')::int END,
    last_dice = (v_board ->> 'lastDice')::int,
    winner_seat = CASE WHEN (v_board ->> 'winner') IS NULL THEN NULL ELSE (v_board ->> 'winner')::int END,
    phase = CASE WHEN (v_board ->> 'winner') IS NOT NULL THEN 'finished' ELSE 'playing' END,
    current_turn = v_next_turn,
    turn_deadline = v_new_deadline,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_ludo_build_client_snapshot(v_sess, v_pk));
END;
$$;

COMMIT;
