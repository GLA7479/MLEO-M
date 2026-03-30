-- Board Path: session columns + open_session RPC + RLS. Apply after 007_ov2_stake_commit.sql.

BEGIN;

-- --- Session row: align with app session shape (keep legacy engine_phase / board / turn) ---

ALTER TABLE public.ov2_board_path_sessions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'live',
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS turn_index integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS active_seat_index integer,
  ADD COLUMN IF NOT EXISTS turn_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS board_state jsonb NOT NULL DEFAULT '{"pathLength": 30, "positions": {}}'::jsonb,
  ADD COLUMN IF NOT EXISTS event_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS revision bigint NOT NULL DEFAULT 0;

UPDATE public.ov2_board_path_sessions
SET phase = COALESCE(NULLIF(trim(phase), ''), NULLIF(trim(engine_phase), ''), 'pregame')
WHERE phase IS NULL OR trim(phase) = '';

ALTER TABLE public.ov2_board_path_sessions
  ALTER COLUMN phase SET DEFAULT 'pregame';

ALTER TABLE public.ov2_board_path_sessions
  ALTER COLUMN phase SET NOT NULL;

UPDATE public.ov2_board_path_sessions SET engine_phase = phase WHERE engine_phase IS DISTINCT FROM phase;

-- Normalize rows before CHECK constraints
UPDATE public.ov2_board_path_sessions
SET phase = 'pregame'
WHERE phase IS NULL OR trim(phase) = '' OR phase NOT IN ('pregame', 'playing', 'ended');

UPDATE public.ov2_board_path_sessions
SET status = 'live'
WHERE status IS NULL OR trim(status) = '' OR status NOT IN ('live', 'closed');

UPDATE public.ov2_board_path_sessions
SET revision = 0
WHERE revision < 0;

UPDATE public.ov2_board_path_sessions
SET event_log = '[]'::jsonb
WHERE jsonb_typeof(event_log) IS DISTINCT FROM 'array';

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_phase_chk;
ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_phase_chk
  CHECK (phase IN ('pregame', 'playing', 'ended'));

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_status_chk;
ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_status_chk
  CHECK (status IN ('live', 'closed'));

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_revision_chk;
ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_revision_chk
  CHECK (revision >= 0);

ALTER TABLE public.ov2_board_path_sessions
  DROP CONSTRAINT IF EXISTS ov2_board_path_sessions_event_log_array_chk;
ALTER TABLE public.ov2_board_path_sessions
  ADD CONSTRAINT ov2_board_path_sessions_event_log_array_chk
  CHECK (jsonb_typeof(event_log) = 'array');

-- --- Seats: host / ready flags ---

ALTER TABLE public.ov2_board_path_seats
  ADD COLUMN IF NOT EXISTS is_host boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_ready boolean NOT NULL DEFAULT false;

UPDATE public.ov2_board_path_seats s
SET is_ready = COALESCE(m.is_ready, false)
FROM public.ov2_room_members m
WHERE s.room_member_id IS NOT NULL
  AND m.id = s.room_member_id;

UPDATE public.ov2_board_path_seats s
SET is_host = (s.participant_key = trim(r.host_participant_key))
FROM public.ov2_board_path_sessions bp
JOIN public.ov2_rooms r ON r.id = bp.room_id
WHERE s.session_id = bp.id;

-- --- Helpers: JSON session + seats for RPC / clients ---

CREATE OR REPLACE FUNCTION public.ov2_board_path_session_to_jsonb(p_session public.ov2_board_path_sessions)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', p_session.id,
    'room_id', p_session.room_id,
    'match_seq', p_session.match_seq,
    'status', p_session.status,
    'phase', p_session.phase,
    'engine_phase', p_session.engine_phase,
    'turn_index', p_session.turn_index,
    'active_seat_index', p_session.active_seat_index,
    'turn_meta', COALESCE(p_session.turn_meta, '{}'::jsonb),
    'board_state', COALESCE(p_session.board_state, '{}'::jsonb),
    'event_log', COALESCE(p_session.event_log, '[]'::jsonb),
    'revision', p_session.revision,
    'created_at', p_session.created_at
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_board_path_seats_to_jsonb(p_session_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'session_id', s.session_id,
        'seat_index', s.seat_index,
        'participant_key', s.participant_key,
        'is_host', s.is_host,
        'is_ready', s.is_ready,
        'created_at', s.created_at
      )
      ORDER BY s.seat_index
    ),
    '[]'::jsonb
  )
  FROM public.ov2_board_path_seats s
  WHERE s.session_id = p_session_id;
$$;

-- --- RPC: idempotent open (host-only, active room, no active_session_id on first open) ---

CREATE OR REPLACE FUNCTION public.ov2_board_path_open_session(
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
  v_sess public.ov2_board_path_sessions%ROWTYPE;
  v_member public.ov2_room_members%ROWTYPE;
  v_total int;
  v_committed int;
  v_ms bigint;
  v_started bigint;
  v_seat_count int;
  v_exp_keys text[];
  v_act_keys text[];
  v_rebuild_seats boolean;
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

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF trim(COALESCE(v_room.host_participant_key, '')) IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the host can open a session');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active');
  END IF;

  SELECT * INTO v_member
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Host is not a room member');
  END IF;

  SELECT count(*)::int INTO v_total
  FROM public.ov2_room_members
  WHERE room_id = p_room_id;

  SELECT count(*)::int INTO v_committed
  FROM public.ov2_room_members
  WHERE room_id = p_room_id AND wallet_state = 'committed';

  IF v_total < 2 OR v_committed <> v_total THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_INCOMPLETE', 'message', 'All members must be committed');
  END IF;

  -- Idempotent: room already bound to a session (self-heal seats vs committed members)
  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_sess FROM public.ov2_board_path_sessions WHERE id = v_room.active_session_id;
    IF FOUND THEN
      SELECT count(*)::int INTO v_seat_count
      FROM public.ov2_board_path_seats
      WHERE session_id = v_sess.id;

      SELECT array_agg(participant_key ORDER BY participant_key)
      INTO v_exp_keys
      FROM public.ov2_room_members
      WHERE room_id = p_room_id AND wallet_state = 'committed';

      SELECT array_agg(participant_key ORDER BY participant_key)
      INTO v_act_keys
      FROM public.ov2_board_path_seats
      WHERE session_id = v_sess.id;

      v_rebuild_seats :=
        v_seat_count IS DISTINCT FROM v_committed
        OR v_exp_keys IS DISTINCT FROM v_act_keys;

      IF v_rebuild_seats THEN
        DELETE FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;

        INSERT INTO public.ov2_board_path_seats (
          session_id,
          room_member_id,
          seat_index,
          participant_key,
          is_host,
          is_ready,
          meta
        )
        SELECT
          v_sess.id,
          m.id,
          (ROW_NUMBER() OVER (ORDER BY m.participant_key ASC)) - 1,
          m.participant_key,
          (trim(COALESCE(m.participant_key, '')) = trim(COALESCE(v_room.host_participant_key, ''))),
          COALESCE(m.is_ready, false),
          '{}'::jsonb
        FROM public.ov2_room_members m
        WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
        ORDER BY m.participant_key ASC;
      END IF;

      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'session', public.ov2_board_path_session_to_jsonb(v_sess),
        'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
      );
    END IF;
  END IF;

  -- Idempotent: session row exists for this match but room not yet linked (repair)
  SELECT * INTO v_sess
  FROM public.ov2_board_path_sessions
  WHERE room_id = p_room_id AND match_seq = v_room.match_seq
  ORDER BY created_at ASC
  LIMIT 1;

  IF FOUND THEN
    SELECT count(*)::int INTO v_seat_count
    FROM public.ov2_board_path_seats
    WHERE session_id = v_sess.id;

    SELECT array_agg(participant_key ORDER BY participant_key)
    INTO v_exp_keys
    FROM public.ov2_room_members
    WHERE room_id = p_room_id AND wallet_state = 'committed';

    SELECT array_agg(participant_key ORDER BY participant_key)
    INTO v_act_keys
    FROM public.ov2_board_path_seats
    WHERE session_id = v_sess.id;

    v_rebuild_seats :=
      v_seat_count IS DISTINCT FROM v_committed
      OR v_exp_keys IS DISTINCT FROM v_act_keys;

    IF v_rebuild_seats THEN
      DELETE FROM public.ov2_board_path_seats WHERE session_id = v_sess.id;

      INSERT INTO public.ov2_board_path_seats (
        session_id,
        room_member_id,
        seat_index,
        participant_key,
        is_host,
        is_ready,
        meta
      )
      SELECT
        v_sess.id,
        m.id,
        (ROW_NUMBER() OVER (ORDER BY m.participant_key ASC)) - 1,
        m.participant_key,
        (trim(COALESCE(m.participant_key, '')) = trim(COALESCE(v_room.host_participant_key, ''))),
        COALESCE(m.is_ready, false),
        '{}'::jsonb
      FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
      ORDER BY m.participant_key ASC;
    END IF;

    UPDATE public.ov2_rooms
    SET active_session_id = v_sess.id, updated_at = now()
    WHERE id = p_room_id AND active_session_id IS NULL;

    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'session', public.ov2_board_path_session_to_jsonb(v_sess),
      'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
    );
  END IF;

  -- active_session_id must still be null for brand-new session
  IF v_room.active_session_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_ALREADY_OPEN', 'message', 'Room already has a session binding');
  END IF;

  v_ms := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_started := v_ms;

  INSERT INTO public.ov2_board_path_sessions (
    room_id,
    match_seq,
    engine_phase,
    phase,
    status,
    turn_index,
    active_seat_index,
    turn_meta,
    board_state,
    event_log,
    revision,
    turn
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'pregame',
    'pregame',
    'live',
    0,
    NULL,
    jsonb_build_object(
      'turnNumber', 1,
      'activeSeatIndex', NULL,
      'startedAt', v_started
    ),
    '{"pathLength": 30, "positions": {}}'::jsonb,
    '[]'::jsonb,
    0,
    '{}'::jsonb
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_board_path_seats (
    session_id,
    room_member_id,
    seat_index,
    participant_key,
    is_host,
    is_ready,
    meta
  )
  SELECT
    v_sess.id,
    m.id,
    (ROW_NUMBER() OVER (ORDER BY m.participant_key ASC)) - 1,
    m.participant_key,
    (trim(COALESCE(m.participant_key, '')) = trim(COALESCE(v_room.host_participant_key, ''))),
    COALESCE(m.is_ready, false),
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.wallet_state = 'committed'
  ORDER BY m.participant_key ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'session', public.ov2_board_path_session_to_jsonb(v_sess),
    'seats', public.ov2_board_path_seats_to_jsonb(v_sess.id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_board_path_open_session(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_open_session(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_board_path_session_to_jsonb(public.ov2_board_path_sessions) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_board_path_seats_to_jsonb(uuid) FROM PUBLIC;

COMMENT ON FUNCTION public.ov2_board_path_open_session(uuid, text) IS 'Host-only: create board path session + seats (participant_key order), set ov2_rooms.active_session_id; idempotent.';

-- --- RLS: read like ov2_rooms; writes via RPC only ---

ALTER TABLE public.ov2_board_path_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_board_path_seats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_board_path_sessions_select_public ON public.ov2_board_path_sessions;
CREATE POLICY ov2_board_path_sessions_select_public ON public.ov2_board_path_sessions
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_board_path_sessions_insert_deny ON public.ov2_board_path_sessions;
CREATE POLICY ov2_board_path_sessions_insert_deny ON public.ov2_board_path_sessions
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_board_path_sessions_update_deny ON public.ov2_board_path_sessions;
CREATE POLICY ov2_board_path_sessions_update_deny ON public.ov2_board_path_sessions
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_board_path_sessions_delete_deny ON public.ov2_board_path_sessions;
CREATE POLICY ov2_board_path_sessions_delete_deny ON public.ov2_board_path_sessions
  FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_board_path_seats_select_public ON public.ov2_board_path_seats;
CREATE POLICY ov2_board_path_seats_select_public ON public.ov2_board_path_seats
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_board_path_seats_insert_deny ON public.ov2_board_path_seats;
CREATE POLICY ov2_board_path_seats_insert_deny ON public.ov2_board_path_seats
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_board_path_seats_update_deny ON public.ov2_board_path_seats;
CREATE POLICY ov2_board_path_seats_update_deny ON public.ov2_board_path_seats
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_board_path_seats_delete_deny ON public.ov2_board_path_seats;
CREATE POLICY ov2_board_path_seats_delete_deny ON public.ov2_board_path_seats
  FOR DELETE TO anon, authenticated
  USING (false);

COMMIT;
