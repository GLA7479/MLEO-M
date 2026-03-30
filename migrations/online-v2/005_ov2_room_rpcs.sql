-- OV2 server-safe room mutations: SECURITY DEFINER RPCs + RLS (read-only direct access).
-- Apply after 001–003. Fresh DB: run 001, 002, 003, then this file.

BEGIN;

-- --- RPC: atomic create room + host member ---

CREATE OR REPLACE FUNCTION public.ov2_rpc_room_create(
  p_product_game_id text,
  p_title text,
  p_stake_per_seat bigint,
  p_host_participant_key text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
BEGIN
  IF p_stake_per_seat IS NULL OR p_stake_per_seat < 100 THEN
    RAISE EXCEPTION 'OV2: stake_per_seat must be >= 100';
  END IF;
  IF p_product_game_id IS NULL OR length(trim(p_product_game_id)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid product_game_id';
  END IF;
  IF p_host_participant_key IS NULL OR length(trim(p_host_participant_key)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid host participant';
  END IF;

  INSERT INTO public.ov2_rooms (
    product_game_id,
    title,
    stake_per_seat,
    host_participant_key,
    lifecycle_phase
  ) VALUES (
    trim(p_product_game_id),
    COALESCE(NULLIF(trim(p_title), ''), 'Table'),
    p_stake_per_seat,
    trim(p_host_participant_key),
    'lobby'
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
    trim(p_host_participant_key),
    NULLIF(trim(p_display_name), ''),
    'none',
    false
  );

  RETURN to_jsonb(v_room);
END;
$$;

-- --- RPC: join (lobby only) ---

CREATE OR REPLACE FUNCTION public.ov2_rpc_room_join(
  p_room_id uuid,
  p_participant_key text,
  p_display_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase text;
BEGIN
  IF p_room_id IS NULL THEN
    RAISE EXCEPTION 'OV2: invalid room';
  END IF;
  IF p_participant_key IS NULL OR length(trim(p_participant_key)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid participant';
  END IF;

  SELECT lifecycle_phase INTO v_phase
  FROM public.ov2_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OV2: room not found';
  END IF;
  IF v_phase IS DISTINCT FROM 'lobby' THEN
    RAISE EXCEPTION 'OV2: room not joinable';
  END IF;

  INSERT INTO public.ov2_room_members (
    room_id,
    participant_key,
    display_name,
    wallet_state,
    is_ready
  ) VALUES (
    p_room_id,
    trim(p_participant_key),
    NULLIF(trim(p_display_name), ''),
    'none',
    false
  )
  ON CONFLICT (room_id, participant_key) DO UPDATE SET
    display_name = COALESCE(EXCLUDED.display_name, public.ov2_room_members.display_name),
    is_ready = false,
    updated_at = now();
END;
$$;

-- --- RPC: leave (idempotent) ---

CREATE OR REPLACE FUNCTION public.ov2_rpc_room_leave(
  p_room_id uuid,
  p_participant_key text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_room_id IS NULL OR p_participant_key IS NULL OR length(trim(p_participant_key)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid arguments';
  END IF;

  DELETE FROM public.ov2_room_members
  WHERE room_id = p_room_id AND participant_key = trim(p_participant_key);
END;
$$;

-- --- RPC: ready toggle (lobby only, must be member) ---

CREATE OR REPLACE FUNCTION public.ov2_rpc_room_set_ready(
  p_room_id uuid,
  p_participant_key text,
  p_is_ready boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_phase text;
  v_n int;
BEGIN
  IF p_room_id IS NULL OR p_participant_key IS NULL OR length(trim(p_participant_key)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid arguments';
  END IF;

  SELECT lifecycle_phase INTO v_phase
  FROM public.ov2_rooms
  WHERE id = p_room_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OV2: room not found';
  END IF;
  IF v_phase IS DISTINCT FROM 'lobby' THEN
    RAISE EXCEPTION 'OV2: not in lobby';
  END IF;

  UPDATE public.ov2_room_members
  SET
    is_ready = p_is_ready,
    updated_at = now()
  WHERE room_id = p_room_id AND participant_key = trim(p_participant_key);

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'OV2: not a member';
  END IF;
END;
$$;

-- --- RPC: host start -> pending_start (validated) ---

CREATE OR REPLACE FUNCTION public.ov2_rpc_room_start(
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
  v_min int;
  v_cnt int;
  v_upd int;
  v_all_ready boolean;
BEGIN
  IF p_room_id IS NULL OR p_host_participant_key IS NULL OR length(trim(p_host_participant_key)) = 0 THEN
    RAISE EXCEPTION 'OV2: invalid arguments';
  END IF;

  SELECT * INTO v_room
  FROM public.ov2_rooms
  WHERE id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'OV2: room not found';
  END IF;

  IF v_room.host_participant_key IS DISTINCT FROM trim(p_host_participant_key) THEN
    RAISE EXCEPTION 'OV2: not host';
  END IF;

  IF v_room.lifecycle_phase IS DISTINCT FROM 'lobby' THEN
    RAISE EXCEPTION 'OV2: wrong phase';
  END IF;

  v_min := CASE trim(v_room.product_game_id)
    WHEN 'ov2_board_path' THEN 2
    WHEN 'ov2_mark_grid' THEN 2
    ELSE 2
  END;

  SELECT count(*)::int INTO v_cnt
  FROM public.ov2_room_members
  WHERE room_id = p_room_id;

  IF v_cnt < v_min THEN
    RAISE EXCEPTION 'OV2: not enough players';
  END IF;

  SELECT COALESCE(bool_and(is_ready), false) INTO v_all_ready
  FROM public.ov2_room_members
  WHERE room_id = p_room_id;

  IF NOT v_all_ready THEN
    RAISE EXCEPTION 'OV2: not all ready';
  END IF;

  UPDATE public.ov2_rooms
  SET
    lifecycle_phase = 'pending_start',
    updated_at = now()
  WHERE id = p_room_id AND lifecycle_phase = 'lobby'
  RETURNING * INTO v_room;

  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd = 0 THEN
    RAISE EXCEPTION 'OV2: concurrent state change';
  END IF;

  RETURN to_jsonb(v_room);
END;
$$;

-- --- Permissions: callable from Supabase anon/authenticated (client passes participant proof in args; future: bind to auth) ---

REVOKE ALL ON FUNCTION public.ov2_rpc_room_create(text, text, bigint, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_rpc_room_join(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_rpc_room_leave(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_rpc_room_set_ready(uuid, text, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ov2_rpc_room_start(uuid, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ov2_rpc_room_create(text, text, bigint, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_rpc_room_join(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_rpc_room_leave(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_rpc_room_set_ready(uuid, text, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_rpc_room_start(uuid, text) TO anon, authenticated, service_role;

-- --- RLS: reads allowed; writes only via SECURITY DEFINER functions above ---

ALTER TABLE public.ov2_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_room_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_rooms_select_public ON public.ov2_rooms;
CREATE POLICY ov2_rooms_select_public ON public.ov2_rooms
  FOR SELECT TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS ov2_room_members_select_public ON public.ov2_room_members;
CREATE POLICY ov2_room_members_select_public ON public.ov2_room_members
  FOR SELECT TO anon, authenticated
  USING (true);

COMMENT ON FUNCTION public.ov2_rpc_room_create IS 'OV2 atomic room + host row; stake min 100 enforced.';
COMMENT ON FUNCTION public.ov2_rpc_room_start IS 'OV2 host-only lobby->pending_start; min players + all ready enforced server-side.';

-- Next paid step (not implemented here): e.g. ov2_rpc_stake_lock(room, participant, amount, idempotency_key)
--   row-locks room, inserts ov2_economy_events, transitions toward pending_stakes/active; client debits vault only after RPC ok.

COMMIT;
