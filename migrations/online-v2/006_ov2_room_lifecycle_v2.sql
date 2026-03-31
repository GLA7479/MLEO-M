-- OV2 room lifecycle v2: canonical RPC names, JSON payloads, capacity + passcode rules, host transfer, RLS hardening.
-- Apply after 005_ov2_room_rpcs.sql. Replaces ov2_rpc_room_* with ov2_* functions.

BEGIN;

-- --- Schema: capacity (sane bounds enforced in RPC + CHECK) ---

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS max_seats integer NOT NULL DEFAULT 8
  CHECK (max_seats >= 2 AND max_seats <= 16);

COMMENT ON COLUMN public.ov2_rooms.max_seats IS 'Maximum seated members; enforced by ov2_join_room.';

-- --- Helpers: public JSON (never exposes passcode) ---

CREATE OR REPLACE FUNCTION public.ov2_room_to_public_jsonb(r public.ov2_rooms)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', r.id,
    'created_at', r.created_at,
    'updated_at', r.updated_at,
    'product_game_id', r.product_game_id,
    'title', r.title,
    'lifecycle_phase', r.lifecycle_phase,
    'stake_per_seat', r.stake_per_seat,
    'host_participant_key', r.host_participant_key,
    'is_private', r.is_private,
    'max_seats', r.max_seats,
    'match_seq', r.match_seq,
    'pot_locked', r.pot_locked,
    'active_session_id', r.active_session_id,
    'closed_reason', r.closed_reason,
    'meta', COALESCE(r.meta, '{}'::jsonb)
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_members_to_public_jsonb(p_room_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', m.id,
        'created_at', m.created_at,
        'updated_at', m.updated_at,
        'room_id', m.room_id,
        'participant_key', m.participant_key,
        'display_name', m.display_name,
        'seat_index', m.seat_index,
        'wallet_state', m.wallet_state,
        'amount_locked', m.amount_locked,
        'is_ready', m.is_ready,
        'meta', COALESCE(m.meta, '{}'::jsonb)
      )
      ORDER BY m.created_at ASC NULLS LAST, m.participant_key ASC
    ),
    '[]'::jsonb
  )
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id;
$$;

-- --- Drop legacy RPCs from 005 ---

DROP FUNCTION IF EXISTS public.ov2_rpc_room_create(text, text, bigint, text, text);
DROP FUNCTION IF EXISTS public.ov2_rpc_room_join(uuid, text, text);
DROP FUNCTION IF EXISTS public.ov2_rpc_room_leave(uuid, text);
DROP FUNCTION IF EXISTS public.ov2_rpc_room_set_ready(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.ov2_rpc_room_start(uuid, text);

-- --- ov2_create_room ---

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
  IF v_game NOT IN ('ov2_board_path', 'ov2_mark_grid', 'ov2_ludo') THEN
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

-- --- ov2_join_room ---

CREATE OR REPLACE FUNCTION public.ov2_join_room(
  p_room_id uuid,
  p_participant_key text,
  p_display_name text,
  p_passcode text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_cnt int;
  v_pc text;
  v_in text;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'lobby' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'This room is not accepting new players.'
    );
  END IF;

  v_pc := NULLIF(trim(COALESCE(v_room.passcode, '')), '');
  IF v_pc IS NOT NULL THEN
    v_in := trim(COALESCE(p_passcode, ''));
    IF v_in IS DISTINCT FROM v_pc THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'INVALID_PASSCODE',
        'message', 'Incorrect passcode.'
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.ov2_room_members WHERE room_id = p_room_id;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members
    WHERE room_id = p_room_id AND participant_key = v_pk
  ) THEN
    UPDATE public.ov2_room_members
    SET
      display_name = COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), display_name),
      is_ready = false,
      updated_at = now()
    WHERE room_id = p_room_id AND participant_key = v_pk;

    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

    RETURN jsonb_build_object(
      'ok', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', public.ov2_members_to_public_jsonb(p_room_id)
    );
  END IF;

  IF v_cnt >= v_room.max_seats THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_FULL',
      'message', 'This room is full.'
    );
  END IF;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    wallet_state,
    is_ready
  ) VALUES (
    p_room_id,
    v_pk,
    NULLIF(trim(COALESCE(p_display_name, '')), ''),
    'none',
    false
  );

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'DUPLICATE_MEMBER',
      'message', 'You are already in this room.'
    );
END;
$$;

-- --- ov2_leave_room ---

CREATE OR REPLACE FUNCTION public.ov2_leave_room(
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
  v_cnt int;
  v_new_host text;
  v_remaining int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase NOT IN ('lobby', 'pending_start') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'You cannot leave during an active match.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'You are not in this room.'
    );
  END IF;

  SELECT count(*)::int INTO v_cnt FROM public.ov2_room_members WHERE room_id = p_room_id;

  IF v_cnt <= 1 THEN
    DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;
    UPDATE public.ov2_rooms
    SET
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      updated_at = now()
    WHERE id = p_room_id
    RETURNING * INTO v_room;

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'room', public.ov2_room_to_public_jsonb(v_room),
      'members', '[]'::jsonb
    );
  END IF;

  IF v_room.host_participant_key IS NOT DISTINCT FROM v_pk THEN
    SELECT m.participant_key INTO v_new_host
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key IS DISTINCT FROM v_pk
    ORDER BY m.created_at ASC NULLS LAST, m.participant_key ASC
    LIMIT 1;

    IF v_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_rooms
    SET host_participant_key = v_new_host, updated_at = now()
    WHERE id = p_room_id;
  END IF;

  DELETE FROM public.ov2_room_members WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_remaining = ROW_COUNT;
  IF v_remaining = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- ov2_set_ready ---

CREATE OR REPLACE FUNCTION public.ov2_set_ready(
  p_room_id uuid,
  p_participant_key text,
  p_is_ready boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_n int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'lobby' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'Ready can only be changed in the lobby.'
    );
  END IF;

  UPDATE public.ov2_room_members
  SET is_ready = COALESCE(p_is_ready, false), updated_at = now()
  WHERE room_id = p_room_id AND participant_key = v_pk;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_MEMBER',
      'message', 'You are not in this room.'
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- ov2_start_room_intent ---

CREATE OR REPLACE FUNCTION public.ov2_start_room_intent(
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
  v_host text;
  v_min int;
  v_cnt int;
  v_all_ready boolean;
  v_upd int;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  v_host := trim(COALESCE(p_host_participant_key, ''));
  IF length(v_host) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Host participant is required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM v_host THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_HOST',
      'message', 'Only the host can start the match.'
    );
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'lobby' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'The room is not in a state that allows starting.'
    );
  END IF;

  v_min := CASE trim(v_room.product_game_id)
    WHEN 'ov2_board_path' THEN 2
    WHEN 'ov2_mark_grid' THEN 2
    ELSE 2
  END;

  SELECT count(*)::int INTO v_cnt FROM public.ov2_room_members WHERE room_id = p_room_id;

  IF v_cnt < v_min THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ENOUGH_PLAYERS',
      'message', format('Need at least %s players to start.', v_min)
    );
  END IF;

  SELECT COALESCE(bool_and(is_ready), false) INTO v_all_ready
  FROM public.ov2_room_members
  WHERE room_id = p_room_id;

  IF NOT v_all_ready THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'NOT_ALL_READY',
      'message', 'All players must be ready before starting.'
    );
  END IF;

  UPDATE public.ov2_rooms
  SET
    lifecycle_phase = 'pending_start',
    updated_at = now()
  WHERE id = p_room_id AND lifecycle_phase = 'lobby'
  RETURNING * INTO v_room;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STATE',
      'message', 'Could not start — room state changed. Try again.'
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_room_to_public_jsonb(v_room),
    'members', public.ov2_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- --- Permissions ---

REVOKE ALL ON FUNCTION public.ov2_room_to_public_jsonb(public.ov2_rooms) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_members_to_public_jsonb(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_create_room(text, text, bigint, text, text, boolean, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_join_room(uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_leave_room(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_set_ready(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_start_room_intent(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ov2_create_room(text, text, bigint, text, text, boolean, text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_join_room(uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_leave_room(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_set_ready(uuid, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_start_room_intent(uuid, text) TO anon, authenticated, service_role;

-- Helpers: callable only by owner/superuser by default; do not expose to PostgREST clients
REVOKE ALL ON FUNCTION public.ov2_room_to_public_jsonb(public.ov2_rooms) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.ov2_members_to_public_jsonb(uuid) FROM anon, authenticated;

-- --- RLS: explicit deny direct writes (reads unchanged from 005) ---

DROP POLICY IF EXISTS ov2_rooms_insert_deny ON public.ov2_rooms;
CREATE POLICY ov2_rooms_insert_deny ON public.ov2_rooms
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_rooms_update_deny ON public.ov2_rooms;
CREATE POLICY ov2_rooms_update_deny ON public.ov2_rooms
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_rooms_delete_deny ON public.ov2_rooms;
CREATE POLICY ov2_rooms_delete_deny ON public.ov2_rooms
  FOR DELETE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_room_members_insert_deny ON public.ov2_room_members;
CREATE POLICY ov2_room_members_insert_deny ON public.ov2_room_members
  FOR INSERT TO anon, authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS ov2_room_members_update_deny ON public.ov2_room_members;
CREATE POLICY ov2_room_members_update_deny ON public.ov2_room_members
  FOR UPDATE TO anon, authenticated
  USING (false);

DROP POLICY IF EXISTS ov2_room_members_delete_deny ON public.ov2_room_members;
CREATE POLICY ov2_room_members_delete_deny ON public.ov2_room_members
  FOR DELETE TO anon, authenticated
  USING (false);

COMMENT ON FUNCTION public.ov2_create_room IS 'OV2: create lobby room + host member; allowlisted game ids (ov2_board_path, ov2_mark_grid, ov2_ludo); stake >= 100; max_seats 2–16.';
COMMENT ON FUNCTION public.ov2_join_room IS 'OV2: join lobby if not full; passcode when set; idempotent re-join for same participant.';
COMMENT ON FUNCTION public.ov2_leave_room IS 'OV2: leave in lobby or pending_start; host transfer; close room when empty.';
COMMENT ON FUNCTION public.ov2_set_ready IS 'OV2: toggle ready in lobby only.';
COMMENT ON FUNCTION public.ov2_start_room_intent IS 'OV2: host-only lobby -> pending_start; min players + all ready.';

COMMIT;
