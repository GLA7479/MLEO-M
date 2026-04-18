-- OV2 Snakes & Ladders: authoritative shared-room game + settlement + shared RPC extensions.
-- Apply after 149_ov2_settlement_two_phase_vault_delivery.sql (and after meldmatch/121 shared integration).
-- Terminal fork basis for shared functions: goal-duel/141_ov2_goal_duel_shared_integration.sql (full leave/forfeit branches),
-- extended with ov2_snakes_ladders. Double/forfeit/missed_turn Rule8: see 151_ov2_snakes_ladders_double_rule8_from_ludo077.sql.

BEGIN;

-- -----------------------------------------------------------------------------
-- Schema
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ov2_snakes_ladders_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  match_seq integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'live',
  phase text NOT NULL DEFAULT 'playing',
  revision bigint NOT NULL DEFAULT 0,
  board jsonb NOT NULL,
  turn_seat integer,
  dice_value integer,
  last_dice integer,
  winner_seat integer,
  active_seats integer[] NOT NULL DEFAULT ARRAY[]::integer[],
  current_turn integer,
  turn_deadline timestamptz,
  parity_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_snakes_ladders_sessions_status_chk CHECK (status = ANY (ARRAY['live', 'closed']::text[])),
  CONSTRAINT ov2_snakes_ladders_sessions_phase_chk CHECK (phase = ANY (ARRAY['playing', 'finished', 'cancelled']::text[])),
  CONSTRAINT ov2_snakes_ladders_sessions_revision_chk CHECK (revision >= 0),
  CONSTRAINT ov2_snakes_ladders_sessions_room_match UNIQUE (room_id, match_seq)
);

CREATE INDEX IF NOT EXISTS idx_ov2_snakes_ladders_sessions_room ON public.ov2_snakes_ladders_sessions (room_id);
CREATE INDEX IF NOT EXISTS idx_ov2_snakes_ladders_sessions_room_live ON public.ov2_snakes_ladders_sessions (room_id) WHERE status = 'live';

CREATE TABLE IF NOT EXISTS public.ov2_snakes_ladders_seats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  session_id uuid NOT NULL REFERENCES public.ov2_snakes_ladders_sessions (id) ON DELETE CASCADE,
  seat_index integer NOT NULL,
  participant_key text NOT NULL,
  room_member_id uuid REFERENCES public.ov2_room_members (id) ON DELETE SET NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT ov2_snakes_ladders_seats_seat_chk CHECK (seat_index >= 0 AND seat_index <= 3),
  CONSTRAINT ov2_snakes_ladders_seats_session_seat UNIQUE (session_id, seat_index),
  CONSTRAINT ov2_snakes_ladders_seats_session_participant UNIQUE (session_id, participant_key)
);

CREATE INDEX IF NOT EXISTS idx_ov2_snakes_ladders_seats_session ON public.ov2_snakes_ladders_seats (session_id);

ALTER TABLE public.ov2_snakes_ladders_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_snakes_ladders_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_snakes_ladders_sessions_select_public ON public.ov2_snakes_ladders_sessions;
CREATE POLICY ov2_snakes_ladders_sessions_select_public ON public.ov2_snakes_ladders_sessions
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ov2_snakes_ladders_sessions_insert_deny ON public.ov2_snakes_ladders_sessions;
CREATE POLICY ov2_snakes_ladders_sessions_insert_deny ON public.ov2_snakes_ladders_sessions
  FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS ov2_snakes_ladders_sessions_update_deny ON public.ov2_snakes_ladders_sessions;
CREATE POLICY ov2_snakes_ladders_sessions_update_deny ON public.ov2_snakes_ladders_sessions
  FOR UPDATE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS ov2_snakes_ladders_sessions_delete_deny ON public.ov2_snakes_ladders_sessions;
CREATE POLICY ov2_snakes_ladders_sessions_delete_deny ON public.ov2_snakes_ladders_sessions
  FOR DELETE TO anon, authenticated USING (false);

DROP POLICY IF EXISTS ov2_snakes_ladders_seats_select_public ON public.ov2_snakes_ladders_seats;
CREATE POLICY ov2_snakes_ladders_seats_select_public ON public.ov2_snakes_ladders_seats
  FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS ov2_snakes_ladders_seats_insert_deny ON public.ov2_snakes_ladders_seats;
CREATE POLICY ov2_snakes_ladders_seats_insert_deny ON public.ov2_snakes_ladders_seats
  FOR INSERT TO anon, authenticated WITH CHECK (false);
DROP POLICY IF EXISTS ov2_snakes_ladders_seats_update_deny ON public.ov2_snakes_ladders_seats;
CREATE POLICY ov2_snakes_ladders_seats_update_deny ON public.ov2_snakes_ladders_seats
  FOR UPDATE TO anon, authenticated USING (false);
DROP POLICY IF EXISTS ov2_snakes_ladders_seats_delete_deny ON public.ov2_snakes_ladders_seats;
CREATE POLICY ov2_snakes_ladders_seats_delete_deny ON public.ov2_snakes_ladders_seats
  FOR DELETE TO anon, authenticated USING (false);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_snakes_ladders_sessions;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ov2_snakes_ladders_seats;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- -----------------------------------------------------------------------------
-- Static V1 edges (single hop from landing cell). Keys are text cell numbers 1..99.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_board_edges()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'ladders',
    '{"2":"15","7":"28","22":"41","28":"55","41":"63","50":"69","57":"76","65":"82","68":"90","71":"91"}'::jsonb,
    'snakes',
    '{"99":"80","94":"71","89":"52","74":"35","62":"19","49":"12","16":"6"}'::jsonb
  );
$$;

CREATE OR REPLACE FUNCTION public._ov2_snakes_ladders_apply_edges_once(p_cell int, p_edges jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  v2 int;
BEGIN
  IF p_cell IS NULL OR p_cell < 1 OR p_cell > 100 THEN
    RETURN p_cell;
  END IF;
  k := p_cell::text;
  IF (p_edges -> 'ladders') ? k THEN
    v2 := (p_edges -> 'ladders' ->> k)::int;
    IF v2 IS NOT NULL AND v2 BETWEEN 1 AND 100 THEN
      RETURN v2;
    END IF;
  END IF;
  IF (p_edges -> 'snakes') ? k THEN
    v2 := (p_edges -> 'snakes' ->> k)::int;
    IF v2 IS NOT NULL AND v2 BETWEEN 1 AND 100 THEN
      RETURN v2;
    END IF;
  END IF;
  RETURN p_cell;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_initial_board_json(p_active int[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_pos jsonb := '{}'::jsonb;
  s int;
  v_first int;
BEGIN
  IF p_active IS NULL OR cardinality(p_active) < 1 THEN
    RETURN jsonb_build_object('turnSeat', NULL, 'positions', '{}'::jsonb, 'dice', NULL, 'winner', NULL, 'lastDice', NULL);
  END IF;
  FOREACH s IN ARRAY p_active
  LOOP
    v_pos := v_pos || jsonb_build_object(s::text, 1);
  END LOOP;
  v_first := p_active[1];
  RETURN jsonb_build_object(
    'turnSeat', to_jsonb(v_first),
    'positions', v_pos,
    'dice', NULL,
    'winner', NULL,
    'lastDice', NULL
  );
END;
$$;

-- -----------------------------------------------------------------------------
-- Primary session pointer hygiene (parity with ov2_ludo_primary_session_id)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_primary_session_id(p_room_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_primary uuid;
  v_dupes uuid[];
BEGIN
  SELECT s.id INTO v_primary
  FROM public.ov2_snakes_ladders_sessions s
  WHERE s.room_id = p_room_id AND s.status = 'live'
  ORDER BY
    CASE WHEN s.phase IS DISTINCT FROM 'finished' THEN 0 ELSE 1 END,
    s.created_at DESC NULLS LAST,
    s.id DESC
  LIMIT 1;

  IF v_primary IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(array_agg(s.id), ARRAY[]::uuid[])
  INTO v_dupes
  FROM public.ov2_snakes_ladders_sessions s
  WHERE s.room_id = p_room_id AND s.status = 'live' AND s.id <> v_primary;

  IF cardinality(v_dupes) > 0 THEN
    INSERT INTO public.ov2_snakes_ladders_seats (session_id, seat_index, participant_key, room_member_id, meta)
    SELECT v_primary, ds.seat_index, ds.participant_key, ds.room_member_id, COALESCE(ds.meta, '{}'::jsonb)
    FROM public.ov2_snakes_ladders_seats ds
    WHERE ds.session_id = ANY (v_dupes)
    ORDER BY ds.created_at ASC, ds.id ASC
    ON CONFLICT DO NOTHING;
  END IF;

  DELETE FROM public.ov2_snakes_ladders_sessions s
  WHERE s.room_id = p_room_id AND s.status = 'live' AND s.id <> v_primary;

  UPDATE public.ov2_rooms SET active_session_id = v_primary, updated_at = now()
  WHERE id = p_room_id AND active_session_id IS DISTINCT FROM v_primary;

  RETURN v_primary;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_primary_session_id(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_primary_session_id(uuid) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Client snapshot (double UI + roll / complete affordances)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_build_client_snapshot(
  p_session public.ov2_snakes_ladders_sessions,
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
  v_can_complete_move boolean := false;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, p_session.current_turn);
  v_phase := COALESCE(p_session.phase, 'playing');
  v_finished := (v_phase = 'finished' OR (v_board ->> 'winner') IS NOT NULL);

  IF length(v_pk) > 0 THEN
    SELECT s.seat_index INTO v_my_seat
    FROM public.ov2_snakes_ladders_seats s
    WHERE s.session_id = p_session.id AND s.participant_key = v_pk
    LIMIT 1;
  END IF;

  v_dice := NULL;
  IF v_board ? 'dice' AND jsonb_typeof(v_board -> 'dice') <> 'null' THEN
    v_dice := (v_board ->> 'dice')::int;
  ELSIF p_session.dice_value IS NOT NULL THEN
    v_dice := p_session.dice_value;
  END IF;

  IF p_session.status = 'live' AND NOT v_finished AND v_my_seat IS NOT NULL THEN
    IF v_turn IS NOT DISTINCT FROM v_my_seat THEN
      IF v_dice IS NULL THEN
        v_can_roll := true;
      ELSE
        v_can_complete_move := true;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sessionId', p_session.id,
    'revision', p_session.revision,
    'phase', v_phase,
    'status', p_session.status,
    'roomId', p_session.room_id,
    'turnSeat', v_turn,
    'mySeat', v_my_seat,
    'board', v_board,
    'dice', to_jsonb(v_dice),
    'parity', COALESCE(p_session.parity_state, '{}'::jsonb),
    'activeSeats', to_jsonb(COALESCE(p_session.active_seats, ARRAY[]::int[])),
    'currentTurn', p_session.current_turn,
    'turnDeadline',
      CASE
        WHEN p_session.turn_deadline IS NULL THEN 'null'::jsonb
        ELSE to_jsonb((extract(epoch from p_session.turn_deadline) * 1000)::bigint)
      END,
    'canRoll', v_can_roll,
    'canCompleteMove', v_can_complete_move,
    'canClientRoll', v_can_roll,
    'canClientMovePiece', v_can_complete_move,
    'boardViewReadOnly', (v_my_seat IS NULL OR v_finished),
    'winnerSeat', p_session.winner_seat,
    'doublePending', COALESCE((p_session.parity_state -> '__double__' ->> 'awaiting'), '') <> '',
    'doubleState', COALESCE(p_session.parity_state -> '__double__', '{}'::jsonb),
    'doubleInitiations', COALESCE(p_session.parity_state -> '__double_initiations', '{}'::jsonb),
    'doubleCycleUsedSeats', COALESCE(p_session.parity_state -> '__double_cycle_used', '[]'::jsonb),
    'result', p_session.parity_state -> '__result__'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_build_client_snapshot(public.ov2_snakes_ladders_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_build_client_snapshot(public.ov2_snakes_ladders_sessions, text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_get_snapshot(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess
  FROM public.ov2_snakes_ladders_sessions
  WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_get_snapshot(uuid, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- open_session (shared-room IN_GAME + committed stakes; double Rule8 in 151 — same pattern as Ludo, no extra open_session liability guard)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_open_session(
  p_room_id uuid,
  p_participant_key text,
  p_presence_leader_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_existing public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_seated_count int;
  v_active int[];
  v_board jsonb;
  v_is_shared boolean;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM COALESCE(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  v_is_shared := COALESCE(v_room.shared_schema_version, 0) = 1;
  IF v_is_shared THEN
    IF COALESCE(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.ov2_snakes_ladders_sessions
  WHERE id = public.ov2_snakes_ladders_primary_session_id(p_room_id)
    AND room_id = p_room_id
    AND status = 'live';
  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_existing, v_pk)
    );
  END IF;

  SELECT count(*)::int INTO v_seated_count
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND seat_index IS NOT NULL;
  IF v_seated_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;
  IF v_seated_count > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Snakes & Ladders supports at most four seated members');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKES_NOT_COMMITTED',
      'message', 'All seated players must have committed stakes before starting'
    );
  END IF;

  SELECT array_agg(m.seat_index ORDER BY m.seat_index ASC)
  INTO v_active
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;

  IF v_active IS NULL OR cardinality(v_active) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;

  v_board := public.ov2_snakes_ladders_initial_board_json(v_active);

  INSERT INTO public.ov2_snakes_ladders_sessions (
    room_id, match_seq, status, phase, revision, board, turn_seat, dice_value, last_dice, winner_seat, active_seats,
    current_turn, turn_deadline, parity_state
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
    v_active,
    (v_board ->> 'turnSeat')::int,
    now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30))),
    jsonb_build_object(
      '__entry__', v_room.stake_per_seat,
      '__stake_seat_count', to_jsonb(v_seated_count),
      '__double__', jsonb_build_object('value', 1, 'proposed_by', NULL, 'awaiting', NULL, 'pending', '[]'::jsonb, 'locks', '{}'::jsonb, 'expires_at', NULL),
      '__double_initiations', '{}'::jsonb,
      '__double_cycle_used', '[]'::jsonb,
      '__result__', NULL
    )
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_snakes_ladders_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT v_sess.id, m.seat_index, m.participant_key, m.id, '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, active_runtime_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_open_session(uuid, text, text) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- roll: authoritative RNG; leaves dice pending for optional double + complete_move
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_roll(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_roll int;
  v_new_deadline timestamptz;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);
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
  v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    board = v_board,
    dice_value = v_roll,
    turn_seat = v_turn,
    turn_deadline = v_new_deadline,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_roll(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_roll(uuid, text, bigint) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- complete_move: consume dice, move with exact-100 + single edge hop; 6 grants same-player next roll
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_complete_move(
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
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sess public.ov2_snakes_ladders_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_roll int;
  v_cell int;
  v_edges jsonb;
  v_target int;
  v_final int;
  v_active int[];
  v_idx int;
  v_next int;
  v_new_deadline timestamptz;
  v_mult int;
  v_entry bigint;
  v_sc int;
  v_prize bigint;
  v_loss bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_snakes_ladders_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not in playing phase');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := COALESCE(v_sess.board, '{}'::jsonb);
  v_turn := COALESCE((v_board ->> 'turnSeat')::int, v_sess.current_turn);
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  IF v_board ? 'dice' AND jsonb_typeof(v_board -> 'dice') <> 'null' THEN
    v_roll := (v_board ->> 'dice')::int;
  ELSIF v_sess.dice_value IS NOT NULL THEN
    v_roll := v_sess.dice_value;
  ELSE
    RETURN jsonb_build_object('ok', false, 'code', 'NO_DICE', 'message', 'Roll before moving');
  END IF;

  IF v_roll < 1 OR v_roll > 6 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_DICE', 'message', 'Invalid dice');
  END IF;

  v_cell := COALESCE(NULLIF((v_board -> 'positions' ->> v_turn::text), '')::int, 1);
  v_edges := public.ov2_snakes_ladders_board_edges();
  v_active := COALESCE(v_sess.active_seats, ARRAY[]::int[]);

  IF v_cell + v_roll > 100 THEN
    v_board := jsonb_set(v_board, '{dice}', 'null'::jsonb, true);
    v_board := jsonb_set(v_board, '{lastDice}', to_jsonb(v_roll), true);
    v_idx := array_position(v_active, v_turn);
    v_next := v_active[(COALESCE(v_idx, 0) % cardinality(v_active)) + 1];
    v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_next), true);
    v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));
    UPDATE public.ov2_snakes_ladders_sessions
    SET
      board = v_board,
      dice_value = NULL,
      last_dice = v_roll,
      current_turn = v_next,
      turn_seat = v_next,
      turn_deadline = v_new_deadline,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
  END IF;

  v_target := v_cell + v_roll;
  v_final := public._ov2_snakes_ladders_apply_edges_once(v_target, v_edges);

  v_board := jsonb_set(
    v_board,
    '{positions}',
    COALESCE(v_board -> 'positions', '{}'::jsonb) || jsonb_build_object(v_turn::text, to_jsonb(v_final)),
    true
  );
  v_board := jsonb_set(v_board, '{dice}', 'null'::jsonb, true);
  v_board := jsonb_set(v_board, '{lastDice}', to_jsonb(v_roll), true);

  IF v_final = 100 THEN
    v_board := jsonb_set(v_board, '{winner}', to_jsonb(v_turn), true);
    v_mult := COALESCE((v_sess.parity_state -> '__double__' ->> 'value')::int, 1);
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_sc := COALESCE(NULLIF((v_sess.parity_state ->> '__stake_seat_count'), '')::int, 0);
    IF v_sc < 1 THEN
      SELECT count(*)::int INTO v_sc FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess.id;
    END IF;
    v_loss := GREATEST(v_entry, 0) * GREATEST(v_mult, 1);
    v_prize := CASE WHEN v_sc > 0 AND v_loss > 0 THEN v_loss * v_sc ELSE 0 END;
    v_sess.parity_state := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_turn,
        'multiplier', v_mult,
        'prize', v_prize,
        'lossPerSeat', v_loss,
        'rule8', false,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_snakes_ladders_sessions
    SET
      board = v_board,
      dice_value = NULL,
      last_dice = v_roll,
      winner_seat = v_turn,
      phase = 'finished',
      current_turn = NULL,
      turn_seat = v_turn,
      turn_deadline = NULL,
      parity_state = v_sess.parity_state,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
  END IF;

  IF v_roll = 6 THEN
    v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_turn), true);
    v_next := v_turn;
  ELSE
    v_idx := array_position(v_active, v_turn);
    v_next := v_active[(COALESCE(v_idx, 0) % cardinality(v_active)) + 1];
    v_board := jsonb_set(v_board, '{turnSeat}', to_jsonb(v_next), true);
  END IF;

  v_new_deadline := now() + make_interval(secs => GREATEST(5, COALESCE(NULLIF(current_setting('app.ludo_turn_seconds', true), '')::int, 30)));

  UPDATE public.ov2_snakes_ladders_sessions
  SET
    board = v_board,
    dice_value = NULL,
    last_dice = v_roll,
    current_turn = v_next,
    turn_seat = v_next,
    turn_deadline = v_new_deadline,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_snakes_ladders_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_complete_move(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_complete_move(uuid, text, bigint) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Finish settlement + claim (parity with Ludo 076)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_after_finish_emit_settlement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_res jsonb;
  v_winner_seat int;
  v_winner_pk text;
  v_prize bigint;
  v_loss bigint;
  v_winner_amount bigint;
  v_entry bigint;
  v_mult int;
  v_seat_count int;
  v_pot_n int;
  r record;
  v_idem text;
  v_room_id uuid := NEW.room_id;
  v_match_seq int := NEW.match_seq;
  v_sess_id uuid := NEW.id;
BEGIN
  v_res := COALESCE(NEW.parity_state, '{}'::jsonb) -> '__result__';
  IF v_res IS NULL OR jsonb_typeof(v_res) = 'null' THEN
    RETURN NULL;
  END IF;
  IF NOT (v_res ? 'winner') THEN
    RETURN NULL;
  END IF;

  v_winner_seat := (v_res ->> 'winner')::int;
  IF v_winner_seat IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT trim(participant_key) INTO v_winner_pk
  FROM public.ov2_snakes_ladders_seats
  WHERE session_id = v_sess_id AND seat_index = v_winner_seat
  LIMIT 1;

  IF v_winner_pk IS NULL OR length(v_winner_pk) = 0 THEN
    RETURN NULL;
  END IF;

  v_entry := COALESCE((NEW.parity_state ->> '__entry__')::bigint, 0);
  v_mult := COALESCE((NEW.parity_state -> '__double__' ->> 'value')::int, 1);
  IF v_mult IS NULL OR v_mult < 1 THEN
    v_mult := 1;
  END IF;

  v_prize := COALESCE(NULLIF((v_res ->> 'prize'), '')::bigint, 0);
  v_loss := COALESCE(NULLIF((v_res ->> 'lossPerSeat'), '')::bigint, 0);
  IF v_loss IS NULL OR v_loss <= 0 THEN
    v_loss := v_entry * v_mult;
  END IF;

  v_pot_n := COALESCE(NULLIF((NEW.parity_state ->> '__stake_seat_count'), '')::int, 0);
  IF v_pot_n < 1 THEN
    SELECT count(*)::int INTO v_pot_n FROM public.ov2_snakes_ladders_seats WHERE session_id = v_sess_id;
  END IF;

  IF v_prize IS NULL OR v_prize <= 0 THEN
    IF v_pot_n > 0 AND v_loss > 0 THEN
      v_prize := v_loss * v_pot_n;
    ELSE
      v_prize := 0;
    END IF;
  ELSIF v_loss > 0 AND v_pot_n >= 2 AND v_prize < v_loss * v_pot_n THEN
    v_prize := v_loss * v_pot_n;
  END IF;

  v_seat_count := v_pot_n;

  v_winner_amount := GREATEST(v_prize, 0);

  v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || v_winner_pk || ':snakes_ladders_win:';
  INSERT INTO public.ov2_settlement_lines (
    room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
  ) VALUES (
    v_room_id,
    v_match_seq,
    v_winner_pk,
    'snakes_ladders_win',
    v_winner_amount,
    v_idem,
    v_sess_id,
    jsonb_build_object(
      'gameId', 'ov2_snakes_ladders',
      'sessionId', v_sess_id,
      'winnerSeat', v_winner_seat,
      'prize', v_prize,
      'lossPerSeat', v_loss,
      'credit', v_winner_amount,
      'settlementMode', 'full_pot'
    )
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  FOR r IN
    SELECT trim(participant_key) AS pk, seat_index
    FROM public.ov2_snakes_ladders_seats
    WHERE session_id = v_sess_id AND seat_index IS DISTINCT FROM v_winner_seat
  LOOP
    IF r.pk IS NULL OR length(r.pk) = 0 THEN
      CONTINUE;
    END IF;
    v_idem := 'ov2:settle:' || v_room_id::text || ':' || v_sess_id::text || ':' || r.pk || ':snakes_ladders_loss:';
    INSERT INTO public.ov2_settlement_lines (
      room_id, match_seq, recipient_participant_key, line_kind, amount, idempotency_key, game_session_id, meta
    ) VALUES (
      v_room_id,
      v_match_seq,
      r.pk,
      'snakes_ladders_loss',
      0,
      v_idem,
      v_sess_id,
      jsonb_build_object(
        'gameId', 'ov2_snakes_ladders',
        'sessionId', v_sess_id,
        'seat', r.seat_index,
        'lossPerSeat', v_loss,
        'settlementMode', 'full_pot'
      )
    )
    ON CONFLICT (idempotency_key) DO NOTHING;
  END LOOP;

  UPDATE public.ov2_snakes_ladders_sessions
  SET status = 'closed', updated_at = now()
  WHERE id = v_sess_id AND status IS DISTINCT FROM 'closed';

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_ov2_snakes_ladders_finish_settlement ON public.ov2_snakes_ladders_sessions;
CREATE TRIGGER trg_ov2_snakes_ladders_finish_settlement
AFTER UPDATE OF phase ON public.ov2_snakes_ladders_sessions
FOR EACH ROW
WHEN (NEW.phase IS NOT DISTINCT FROM 'finished' AND OLD.phase IS DISTINCT FROM 'finished')
EXECUTE FUNCTION public.ov2_snakes_ladders_after_finish_emit_settlement();

CREATE OR REPLACE FUNCTION public.ov2_snakes_ladders_claim_settlement(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_has_any boolean;
  v_has_undelivered boolean;
  v_lines jsonb;
  v_total bigint;
  v_idempotent boolean;
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
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_snakes_ladders' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Snakes & Ladders room');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member of this room');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk
  ) INTO v_has_any;

  SELECT EXISTS (
    SELECT 1 FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id AND trim(sl.recipient_participant_key) = v_pk AND sl.vault_delivered_at IS NULL
  ) INTO v_has_undelivered;

  IF NOT v_has_undelivered THEN
    v_idempotent := v_has_any;
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', v_idempotent,
      'room_id', p_room_id,
      'participant_key', v_pk,
      'lines', '[]'::jsonb,
      'total_amount', 0
    );
  END IF;

  WITH u AS (
    UPDATE public.ov2_settlement_lines sl
    SET vault_delivered_at = now()
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND sl.vault_delivered_at IS NULL
    RETURNING sl.id, sl.amount, sl.line_kind, sl.idempotency_key, sl.match_seq
  )
  SELECT
    COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'id', u.id,
          'amount', u.amount,
          'line_kind', u.line_kind,
          'idempotency_key', u.idempotency_key,
          'match_seq', u.match_seq
        )
        ORDER BY u.match_seq, u.id
      ),
      '[]'::jsonb
    ),
    COALESCE(sum(u.amount), 0)::bigint
  INTO v_lines, v_total
  FROM u;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'room_id', p_room_id,
    'participant_key', v_pk,
    'lines', COALESCE(v_lines, '[]'::jsonb),
    'total_amount', COALESCE(v_total, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_snakes_ladders_claim_settlement(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_snakes_ladders_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;

