-- Tile Rush Duel: open session, snapshots, pair removal, heartbeat ping.
-- Apply after 133_ov2_tile_rush_duel_engine.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_tile_rush_duel_build_client_snapshot(
  p_session public.ov2_tile_rush_duel_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_my int;
  v_pub jsonb;
  v_ps jsonb;
  v_tiles jsonb;
  v_out jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_cols int := public.ov2_trd_const_cols();
  v_rows int := public.ov2_trd_const_rows();
  v_c int;
  v_r int;
  v_de bigint;
  v_s0 int;
  v_s1 int;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_tile_rush_duel_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;
  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);
  v_tiles := coalesce(v_pub -> 'tiles', '[]'::jsonb);
  IF v_my = 1 THEN
    FOR v_elem IN SELECT value FROM jsonb_array_elements(v_tiles) AS t(value)
    LOOP
      v_r := (v_elem ->> 'r')::int;
      v_c := (v_elem ->> 'c')::int;
      v_out := v_out || jsonb_build_array(
        v_elem || jsonb_build_object('r', v_r, 'c', v_cols - 1 - v_c)
      );
    END LOOP;
  ELSE
    v_out := v_tiles;
  END IF;
  v_de := NULL;
  IF v_ps ? 'duel_end_ms' THEN
    BEGIN
      v_de := (v_ps ->> 'duel_end_ms')::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_de := NULL;
    END;
  END IF;
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);
  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'playerCount', p_session.player_count,
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'public', jsonb_build_object(
      'tiles', v_out,
      'rows', coalesce((v_pub ->> 'rows')::int, v_rows),
      'cols', coalesce((v_pub ->> 'cols')::int, v_cols)
    ),
    'score0', to_jsonb(v_s0),
    'score1', to_jsonb(v_s1),
    'myScore', CASE
      WHEN v_my = 0 THEN to_jsonb(v_s0)
      WHEN v_my = 1 THEN to_jsonb(v_s1)
      ELSE NULL::jsonb
    END,
    'duelEndMs', CASE WHEN v_de IS NULL THEN NULL::jsonb ELSE to_jsonb(v_de) END,
    'layoutSeed', v_ps -> 'layout_seed',
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'remainingTiles', to_jsonb(public.ov2_trd_remaining_tile_count(v_tiles)),
    'result', v_ps -> '__result__'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tile_rush_duel_open_session(
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
  v_sess public.ov2_tile_rush_duel_sessions%ROWTYPE;
  v_existing public.ov2_tile_rush_duel_sessions%ROWTYPE;
  v_seated int;
  v_entry bigint;
  v_ps jsonb;
  v_pub jsonb;
  v_seed text;
  v_seed_cur text;
  v_tiles jsonb;
  v_now bigint;
  v_attempt int := 0;
  v_cols int := public.ov2_trd_const_cols();
  v_rows int := public.ov2_trd_const_rows();
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required');
  END IF;
  v_pk := trim(coalesce(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;
  PERFORM coalesce(p_presence_leader_key, '');

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_tile_rush_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Tile Rush Duel room');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;
  IF v_room.host_participant_key IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;
  IF coalesce(v_room.shared_schema_version, 0) = 1 THEN
    IF coalesce(v_room.status, '') IS DISTINCT FROM 'IN_GAME' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_STARTED', 'message', 'Room must be started before opening a session.');
    END IF;
  ELSE
    IF v_room.lifecycle_phase IS DISTINCT FROM 'active' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_ACTIVE', 'message', 'Room must be active before opening a session.');
    END IF;
  END IF;

  IF v_room.active_session_id IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.ov2_tile_rush_duel_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Tile Rush Duel needs exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  v_entry := coalesce(v_room.stake_per_seat, 0);
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  INSERT INTO public.ov2_tile_rush_duel_sessions (
    room_id, match_seq, status, phase, revision, winner_seat, active_seats, player_count, public_state, parity_state
  ) VALUES (
    p_room_id,
    v_room.match_seq,
    'live',
    'playing',
    0,
    NULL,
    ARRAY[0, 1]::integer[],
    2,
    jsonb_build_object('tiles', '[]'::jsonb, 'rows', public.ov2_trd_const_rows(), 'cols', public.ov2_trd_const_cols()),
    jsonb_build_object('__entry__', to_jsonb(v_entry))
  )
  RETURNING * INTO v_sess;

  v_seed := public.ov2_trd_layout_seed(v_sess.id, v_sess.match_seq);
  v_seed_cur := v_seed;
  LOOP
    v_tiles := public.ov2_trd_build_tiles_from_seed(v_seed_cur);
    EXIT
      WHEN coalesce(jsonb_array_length(v_tiles), 0) = v_rows * v_cols
        AND public.ov2_trd_has_any_legal_pair(v_tiles, v_cols);
    v_attempt := v_attempt + 1;
    IF v_attempt > 300 THEN
      DELETE FROM public.ov2_tile_rush_duel_sessions WHERE id = v_sess.id;
      RETURN jsonb_build_object('ok', false, 'code', 'LAYOUT_FAIL', 'message', 'Could not build a playable opening board');
    END IF;
    v_seed_cur := md5(coalesce(v_seed, '') || ':trd_open:' || v_attempt::text);
  END LOOP;

  v_ps := jsonb_build_object(
    '__entry__', to_jsonb(v_entry),
    'layout_seed', to_jsonb(v_seed_cur),
    'score0', 0,
    'score1', 0,
    'last_scoring_seat', NULL::jsonb,
    'duel_end_ms', v_now + public.ov2_trd_duel_duration_ms(),
    'last_action_ms_0', v_now,
    'last_action_ms_1', v_now
  );
  v_pub := jsonb_build_object(
    'tiles', v_tiles,
    'rows', public.ov2_trd_const_rows(),
    'cols', public.ov2_trd_const_cols()
  );

  UPDATE public.ov2_tile_rush_duel_sessions
  SET public_state = v_pub, parity_state = v_ps, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_tile_rush_duel_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index::int,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, active_runtime_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_sess FROM public.ov2_tile_rush_duel_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_sess, v_pk)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tile_rush_duel_get_snapshot(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tile_rush_duel_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tile_rush_duel' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tile_rush_duel_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tile_rush_duel_ping(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tile_rush_duel_sessions%ROWTYPE;
  v_seat int;
  v_ps jsonb;
  v_now bigint;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tile_rush_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tile_rush_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Not in active duel');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_tile_rush_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  IF v_seat = 0 THEN
    v_ps := jsonb_set(v_ps, '{last_action_ms_0}', to_jsonb(v_now), true);
  ELSE
    v_ps := jsonb_set(v_ps, '{last_action_ms_1}', to_jsonb(v_now), true);
  END IF;
  UPDATE public.ov2_tile_rush_duel_sessions
  SET parity_state = v_ps, updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tile_rush_duel_remove_pair(
  p_room_id uuid,
  p_participant_key text,
  p_r1 int,
  p_c1 int,
  p_r2 int,
  p_c2 int,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tile_rush_duel_sessions%ROWTYPE;
  v_seat int;
  v_pub jsonb;
  v_ps jsonb;
  v_tiles jsonb;
  v_cols int := public.ov2_trd_const_cols();
  v_k1 int;
  v_k2 int;
  v_elem jsonb;
  v_new jsonb := '[]'::jsonb;
  v_now bigint;
  v_s0 int;
  v_s1 int;
  v_rem int;
  v_entry bigint;
  v_mult int := 1;
  v_rows int := public.ov2_trd_const_rows();
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tile_rush_duel' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room or session missing');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tile_rush_duel_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Not in active duel');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'revision', v_sess.revision);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_tile_rush_duel_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  v_tiles := coalesce(v_pub -> 'tiles', '[]'::jsonb);

  IF p_r1 = p_r2 AND p_c1 = p_c2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SAME_CELL', 'message', 'Pick two different tiles');
  END IF;
  IF NOT public.ov2_trd_tile_free_at(v_tiles, v_cols, p_r1, p_c1) OR NOT public.ov2_trd_tile_free_at(v_tiles, v_cols, p_r2, p_c2) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FREE', 'message', 'One or both tiles are not playable');
  END IF;

  SELECT (x ->> 'kind')::int INTO v_k1
  FROM jsonb_array_elements(v_tiles) AS t(x)
  WHERE (x ->> 'r')::int = p_r1 AND (x ->> 'c')::int = p_c1 AND coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
  LIMIT 1;
  SELECT (x ->> 'kind')::int INTO v_k2
  FROM jsonb_array_elements(v_tiles) AS t(x)
  WHERE (x ->> 'r')::int = p_r2 AND (x ->> 'c')::int = p_c2 AND coalesce((x ->> 'removed')::boolean, false) IS NOT TRUE
  LIMIT 1;
  IF v_k1 IS NULL OR v_k2 IS NULL OR v_k1 IS DISTINCT FROM v_k2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KIND_MISMATCH', 'message', 'Kinds do not match');
  END IF;

  FOR v_elem IN SELECT value FROM jsonb_array_elements(v_tiles) AS t(value)
  LOOP
    IF (v_elem ->> 'r')::int = p_r1 AND (v_elem ->> 'c')::int = p_c1 AND coalesce((v_elem ->> 'removed')::boolean, false) IS NOT TRUE THEN
      v_new := v_new || jsonb_build_array(jsonb_set(v_elem, '{removed}', 'true'::jsonb, true));
    ELSIF (v_elem ->> 'r')::int = p_r2 AND (v_elem ->> 'c')::int = p_c2 AND coalesce((v_elem ->> 'removed')::boolean, false) IS NOT TRUE THEN
      v_new := v_new || jsonb_build_array(jsonb_set(v_elem, '{removed}', 'true'::jsonb, true));
    ELSE
      v_new := v_new || jsonb_build_array(v_elem);
    END IF;
  END LOOP;

  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_s0 := coalesce((v_ps ->> 'score0')::int, 0);
  v_s1 := coalesce((v_ps ->> 'score1')::int, 0);
  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  IF v_seat = 0 THEN
    v_s0 := v_s0 + 1;
    v_ps := jsonb_set(v_ps, '{score0}', to_jsonb(v_s0), true);
  ELSE
    v_s1 := v_s1 + 1;
    v_ps := jsonb_set(v_ps, '{score1}', to_jsonb(v_s1), true);
  END IF;
  v_ps := jsonb_set(v_ps, '{last_scoring_seat}', to_jsonb(v_seat), true);
  IF v_seat = 0 THEN
    v_ps := jsonb_set(v_ps, '{last_action_ms_0}', to_jsonb(v_now), true);
  ELSE
    v_ps := jsonb_set(v_ps, '{last_action_ms_1}', to_jsonb(v_now), true);
  END IF;

  v_pub := jsonb_set(v_pub, '{tiles}', v_new, true);
  v_rem := public.ov2_trd_remaining_tile_count(v_new);

  IF v_rem > 0 AND NOT public.ov2_trd_has_any_legal_pair(v_new, v_cols) THEN
    v_new := public.ov2_trd_repack_remaining_tiles_valid(
      v_new,
      v_cols,
      v_rows,
      coalesce(v_sess.id::text, '') || ':' || (v_sess.revision + 1)::text || ':' || v_now::text || ':trd_repack'
    );
    IF NOT public.ov2_trd_has_any_legal_pair(v_new, v_cols) THEN
      v_new := public.ov2_trd_repack_remaining_tiles_valid(
        v_new,
        v_cols,
        v_rows,
        md5(
          coalesce(v_sess.id::text, '')
            || ':'
            || v_now::text
            || ':'
            || coalesce(v_pk, '')
            || ':trd_repack2'
        )
      );
    END IF;
    v_pub := jsonb_set(v_pub, '{tiles}', v_new, true);
    v_ps := jsonb_set(v_ps, '{last_board_repack_ms}', to_jsonb(v_now), true);
  END IF;

  IF v_rem = 0 THEN
    v_entry := coalesce((v_ps ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      v_ps,
      '{__result__}',
      jsonb_build_object(
        'winner', v_seat,
        'prize', v_entry * 2 * v_mult,
        'lossPerSeat', v_entry * v_mult,
        'stakeMultiplier', v_mult,
        'cleared', true,
        'timestamp', v_now
      ),
      true
    );
    UPDATE public.ov2_tile_rush_duel_sessions
    SET
      public_state = v_pub,
      parity_state = v_ps,
      phase = 'finished',
      winner_seat = v_seat,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_sess, v_pk));
  END IF;

  UPDATE public.ov2_tile_rush_duel_sessions
  SET
    public_state = v_pub,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tile_rush_duel_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_tile_rush_duel_build_client_snapshot(public.ov2_tile_rush_duel_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tile_rush_duel_build_client_snapshot(public.ov2_tile_rush_duel_sessions, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_tile_rush_duel_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tile_rush_duel_open_session(uuid, text, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_tile_rush_duel_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tile_rush_duel_get_snapshot(uuid, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_tile_rush_duel_ping(uuid, text, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tile_rush_duel_ping(uuid, text, bigint) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_tile_rush_duel_remove_pair(uuid, text, int, int, int, int, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tile_rush_duel_remove_pair(uuid, text, int, int, int, int, bigint) TO anon, authenticated, service_role;

COMMIT;
