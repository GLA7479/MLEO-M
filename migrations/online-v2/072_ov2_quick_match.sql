-- OV2 Quick Match / Auto Match (shared-room games only: Ludo, Rummy 51, Bingo).
-- Queue + offer layer; hidden rooms after confirm; OPEN + meta.ov2_quick_match; server-driven auto-start.
-- Apply after 071. Does not modify wave games.

BEGIN;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ov2_quick_match_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  product_game_id text NOT NULL,
  stake_per_seat bigint NOT NULL CHECK (stake_per_seat IN (100, 1000, 10000, 100000)),
  status text NOT NULL DEFAULT 'confirming'
    CHECK (status = ANY (ARRAY['confirming','room_ready','cancelled','expired','completed']::text[])),
  confirm_deadline_at timestamptz NOT NULL,
  room_id uuid REFERENCES public.ov2_rooms (id) ON DELETE SET NULL,
  lobby_deadline_at timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_ov2_qm_offers_status_deadline
  ON public.ov2_quick_match_offers (status, confirm_deadline_at);

CREATE TABLE IF NOT EXISTS public.ov2_quick_match_offer_members (
  offer_id uuid NOT NULL REFERENCES public.ov2_quick_match_offers (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  display_name text NOT NULL DEFAULT 'Player',
  confirmed_at timestamptz NULL,
  declined_at timestamptz NULL,
  PRIMARY KEY (offer_id, participant_key)
);

CREATE TABLE IF NOT EXISTS public.ov2_quick_match_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  participant_key text NOT NULL,
  display_name text NOT NULL DEFAULT 'Player',
  product_game_id text NOT NULL,
  stake_per_seat bigint NOT NULL CHECK (stake_per_seat IN (100, 1000, 10000, 100000)),
  preferred_max_players integer NULL,
  status text NOT NULL DEFAULT 'waiting'
    CHECK (status = ANY (ARRAY['waiting','matched','cancelled','expired','completed']::text[])),
  offer_id uuid NULL REFERENCES public.ov2_quick_match_offers (id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ov2_qm_queue_one_active
  ON public.ov2_quick_match_queue (participant_key)
  WHERE status IN ('waiting', 'matched');

CREATE INDEX IF NOT EXISTS idx_ov2_qm_queue_match
  ON public.ov2_quick_match_queue (product_game_id, stake_per_seat, status)
  WHERE status = 'waiting';

ALTER TABLE public.ov2_quick_match_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_quick_match_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ov2_quick_match_offer_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_qm_queue_deny_all ON public.ov2_quick_match_queue;
CREATE POLICY ov2_qm_queue_deny_all ON public.ov2_quick_match_queue FOR ALL TO public USING (false);

DROP POLICY IF EXISTS ov2_qm_offers_deny_all ON public.ov2_quick_match_offers;
CREATE POLICY ov2_qm_offers_deny_all ON public.ov2_quick_match_offers FOR ALL TO public USING (false);

DROP POLICY IF EXISTS ov2_qm_offer_members_deny_all ON public.ov2_quick_match_offer_members;
CREATE POLICY ov2_qm_offer_members_deny_all ON public.ov2_quick_match_offer_members FOR ALL TO public USING (false);

REVOKE ALL ON public.ov2_quick_match_queue FROM PUBLIC;
REVOKE ALL ON public.ov2_quick_match_offers FROM PUBLIC;
REVOKE ALL ON public.ov2_quick_match_offer_members FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_qm_allowed_product(p_game text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(COALESCE(p_game, '')) IN ('ov2_ludo', 'ov2_rummy51', 'ov2_bingo');
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_max_players_for_product(p_game text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_game, ''))
    WHEN 'ov2_bingo' THEN 8
    ELSE 4
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_is_allowed_stake(p_stake bigint)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_stake, 0) IN (100::bigint, 1000::bigint, 10000::bigint, 100000::bigint);
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_is_allowed_stake(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ov2_qm_json_invite_keys(p_offer_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    jsonb_agg(to_jsonb(m.participant_key) ORDER BY m.participant_key),
    '[]'::jsonb
  )
  FROM public.ov2_quick_match_offer_members m
  WHERE m.offer_id = p_offer_id
    AND m.confirmed_at IS NOT NULL
    AND m.declined_at IS NULL;
$$;

-- ---------------------------------------------------------------------------
-- Public room JSON: expose quick match subset for clients (from meta)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_shared_room_to_public_jsonb(r public.ov2_rooms)
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
    'status', r.status,
    'visibility_mode', r.visibility_mode,
    'join_code', r.join_code,
    'requires_password', (r.visibility_mode = 'private' AND r.password_hash IS NOT NULL),
    'min_players', r.min_players,
    'max_players', r.max_players,
    'stake_per_seat', r.stake_per_seat,
    'host_member_id', r.host_member_id,
    'created_by_participant_key', r.created_by_participant_key,
    'active_runtime_id', r.active_runtime_id,
    'room_revision', r.room_revision,
    'last_activity_at', r.last_activity_at,
    'is_hard_closed', r.is_hard_closed,
    'hard_closed_at', r.hard_closed_at,
    'hard_close_reason', r.hard_close_reason,
    'started_at', r.started_at,
    'ended_at', r.ended_at,
    'shared_schema_version', r.shared_schema_version,
    'quick_match', COALESCE(r.meta->'ov2_quick_match', '{}'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Internal: cancel quick-match room (below min at deadline or failure)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_qm_cancel_room_internal(p_room_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_meta jsonb;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN;
  END IF;
  v_meta := jsonb_set(
    v_meta,
    '{ov2_quick_match}',
    COALESCE(v_room.meta->'ov2_quick_match', '{}'::jsonb) || jsonb_build_object(
      'cancelled_at', to_jsonb(now()),
      'cancel_reason', to_jsonb(COALESCE(NULLIF(trim(p_reason), ''), 'cancelled'))
    ),
    true
  );
  UPDATE public.ov2_rooms
  SET
    status = 'CLOSED',
    is_hard_closed = true,
    hard_closed_at = COALESCE(hard_closed_at, now()),
    hard_close_reason = COALESCE(NULLIF(trim(p_reason), ''), 'quick_match_cancelled'),
    lifecycle_phase = CASE
      WHEN lifecycle_phase = 'active' THEN lifecycle_phase
      ELSE 'aborted'
    END,
    meta = v_meta,
    ended_at = COALESCE(ended_at, now()),
    updated_at = now()
  WHERE id = p_room_id
    AND COALESCE(upper(trim(status)), '') = 'OPEN';
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_cancel_room_internal(uuid, text) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Auto-start at lobby deadline (eligible = seated + wallet committed)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_auto_start_deadline(p_room_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_meta jsonb;
  v_deadline timestamptz;
  v_min int;
  v_elig int;
  v_host text;
  v_intent jsonb;
  v_start jsonb;
  v_offer_id uuid;
BEGIN
  IF p_room_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', true, 'code', 'SKIP', 'message', 'Room not OPEN.');
  END IF;

  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_QUICK_MATCH', 'message', 'Not a quick match room.');
  END IF;

  v_deadline := NULL;
  BEGIN
    v_deadline := (v_meta#>>'{ov2_quick_match,lobby_deadline_at}')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    v_deadline := NULL;
  END;

  IF v_deadline IS NULL OR now() < v_deadline THEN
    RETURN jsonb_build_object('ok', true, 'code', 'WAIT', 'message', 'Lobby deadline not reached.');
  END IF;

  IF COALESCE((v_meta#>>'{ov2_quick_match,auto_start_done}')::boolean, false) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'DONE', 'message', 'Already processed.');
  END IF;

  v_min := GREATEST(COALESCE(v_room.min_players, 2), 2);

  SELECT count(*)::int INTO v_elig
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id
    AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
    AND m.seat_index IS NOT NULL
    AND m.wallet_state = 'committed';

  IF v_elig < v_min THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_below_min_at_deadline');
    BEGIN
      v_offer_id := (v_meta#>>'{ov2_quick_match,offer_id}')::uuid;
    EXCEPTION WHEN OTHERS THEN
      v_offer_id := NULL;
    END;
    IF v_offer_id IS NOT NULL THEN
      UPDATE public.ov2_quick_match_offers
      SET status = 'cancelled', updated_at = now()
      WHERE id = v_offer_id AND status = 'room_ready';
    END IF;
    RETURN jsonb_build_object('ok', true, 'code', 'CANCELLED', 'message', 'Below minimum eligible players at deadline.');
  END IF;

  v_host := trim(COALESCE(v_room.host_participant_key, ''));
  IF length(v_host) = 0 THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_missing_host');
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Missing host.');
  END IF;

  UPDATE public.ov2_room_members
  SET is_ready = true, updated_at = now()
  WHERE room_id = p_room_id
    AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

  IF v_room.lifecycle_phase = 'lobby' THEN
    v_intent := public.ov2_start_room_intent(p_room_id, v_host);
    IF COALESCE((v_intent->>'ok')::boolean, false) IS NOT TRUE THEN
      UPDATE public.ov2_room_members
      SET is_ready = true, updated_at = now()
      WHERE room_id = p_room_id;
      v_intent := public.ov2_start_room_intent(p_room_id, v_host);
    END IF;
    IF COALESCE((v_intent->>'ok')::boolean, false) IS NOT TRUE THEN
      PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_start_intent_failed');
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'START_INTENT_FAILED',
        'message', COALESCE(v_intent->>'message', 'Could not enter stake phase.')
      );
    END IF;
    SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  END IF;

  v_start := public.ov2_shared_host_start(p_room_id, v_host);
  IF COALESCE((v_start->>'ok')::boolean, false) IS NOT TRUE THEN
    PERFORM public.ov2_qm_cancel_room_internal(p_room_id, 'quick_match_host_start_failed');
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'HOST_START_FAILED',
      'message', COALESCE(v_start->>'message', 'Could not start match.')
    );
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  v_meta := jsonb_set(
    v_meta,
    '{ov2_quick_match}',
    COALESCE(v_room.meta->'ov2_quick_match', '{}'::jsonb) || jsonb_build_object(
      'auto_start_done', true,
      'auto_started_at', to_jsonb(now())
    ),
    true
  );

  UPDATE public.ov2_rooms
  SET meta = v_meta, updated_at = now()
  WHERE id = p_room_id;

  BEGIN
    v_offer_id := (v_meta#>>'{ov2_quick_match,offer_id}')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_offer_id := NULL;
  END;
  IF v_offer_id IS NOT NULL THEN
    UPDATE public.ov2_quick_match_offers
    SET status = 'completed', updated_at = now()
    WHERE id = v_offer_id AND status = 'room_ready';
  END IF;

  RETURN jsonb_build_object('ok', true, 'code', 'STARTED', 'runtime_handoff', v_start->'runtime_handoff');
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid) FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- Join hidden quick-match room (invited confirmers only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_join_invited_room(
  p_room_id uuid,
  p_participant_key text,
  p_display_name text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_dn text := COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), 'Player');
  v_meta jsonb;
  v_keys jsonb;
  v_allowed boolean := false;
  k text;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key are required.');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.shared_schema_version IS DISTINCT FROM 1 OR v_room.is_hard_closed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF COALESCE(upper(trim(v_room.status)), '') <> 'OPEN' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'This room is not accepting new players.');
  END IF;

  v_meta := COALESCE(v_room.meta, '{}'::jsonb);
  IF NOT (v_meta ? 'ov2_quick_match') THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  v_keys := v_meta#>'{ov2_quick_match,invite_keys}';
  IF v_keys IS NULL OR jsonb_typeof(v_keys) <> 'array' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  FOR k IN SELECT jsonb_array_elements_text(v_keys)
  LOOP
    IF trim(k) = v_pk THEN
      v_allowed := true;
      EXIT;
    END IF;
  END LOOP;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'room_not_found_or_invalid_credentials',
      'message', 'Room not found or invalid credentials.'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) AND (
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) >= COALESCE(v_room.max_players, v_room.max_seats) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_FULL', 'message', 'Room capacity reached.');
  END IF;

  INSERT INTO public.ov2_room_members (
    room_id, participant_key, display_name, role, member_state, joined_at
  ) VALUES (
    p_room_id, v_pk, v_dn, 'member', 'joined', now()
  )
  ON CONFLICT ON CONSTRAINT ov2_room_members_room_participant
  DO UPDATE SET
    display_name = EXCLUDED.display_name,
    member_state = 'joined',
    left_at = NULL,
    joined_at = now(),
    updated_at = now();

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  RETURN jsonb_build_object(
    'ok', true,
    'room', public.ov2_shared_room_to_public_jsonb(v_room),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Form offers from queue + finalize confirms (creates hidden room)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_qm_finalize_expired_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_confirmed int;
  v_room_id uuid;
  v_code text;
  v_member_id uuid;
  v_host text;
  v_invite jsonb;
  v_lobby_deadline timestamptz;
  v_title text;
  v_max int;
BEGIN
  FOR r IN
    SELECT * FROM public.ov2_quick_match_offers o
    WHERE o.status = 'confirming'
      AND o.room_id IS NULL
      AND (
        o.confirm_deadline_at <= now()
        OR (
          NOT EXISTS (
            SELECT 1 FROM public.ov2_quick_match_offer_members m
            WHERE m.offer_id = o.id AND m.declined_at IS NOT NULL
          )
          AND NOT EXISTS (
            SELECT 1 FROM public.ov2_quick_match_offer_members m
            WHERE m.offer_id = o.id AND m.confirmed_at IS NULL
          )
          AND (
            SELECT count(*)::int FROM public.ov2_quick_match_offer_members m
            WHERE m.offer_id = o.id AND m.confirmed_at IS NOT NULL
          ) >= 2
        )
      )
    ORDER BY o.confirm_deadline_at ASC
    FOR UPDATE OF o SKIP LOCKED
  LOOP
    SELECT count(*)::int INTO v_confirmed
    FROM public.ov2_quick_match_offer_members m
    WHERE m.offer_id = r.id AND m.confirmed_at IS NOT NULL AND m.declined_at IS NULL;

    IF v_confirmed < 2 THEN
      UPDATE public.ov2_quick_match_offers SET status = 'expired', updated_at = now() WHERE id = r.id;
      UPDATE public.ov2_quick_match_queue
      SET status = 'waiting', offer_id = NULL, updated_at = now(), expires_at = now() + interval '30 minutes'
      WHERE offer_id = r.id AND status = 'matched';
      CONTINUE;
    END IF;

    v_invite := public.ov2_qm_json_invite_keys(r.id);
    SELECT m.participant_key INTO v_host
    FROM public.ov2_quick_match_offer_members m
    WHERE m.offer_id = r.id AND m.confirmed_at IS NOT NULL AND m.declined_at IS NULL
    ORDER BY m.participant_key ASC
    LIMIT 1;

    v_max := public.ov2_qm_max_players_for_product(r.product_game_id);
    v_title := 'Quick Match';
    v_code := public.ov2_shared_generate_join_code();
    v_lobby_deadline := now() + interval '90 seconds';

    INSERT INTO public.ov2_rooms (
      product_game_id,
      title,
      lifecycle_phase,
      stake_per_seat,
      host_participant_key,
      is_private,
      max_seats,
      shared_schema_version,
      status,
      visibility_mode,
      password_hash,
      join_code,
      min_players,
      max_players,
      created_by_participant_key,
      room_revision,
      last_activity_at,
      is_hard_closed,
      meta
    ) VALUES (
      r.product_game_id,
      v_title,
      'lobby',
      r.stake_per_seat,
      v_host,
      false,
      v_max,
      1,
      'OPEN',
      'hidden',
      NULL,
      v_code,
      2,
      v_max,
      v_host,
      0,
      now(),
      false,
      jsonb_build_object(
        'ov2_quick_match',
        jsonb_build_object(
          'offer_id', to_jsonb(r.id),
          'invite_keys', v_invite,
          'lobby_deadline_at', to_jsonb(v_lobby_deadline),
          'auto_start_done', false,
          'v', 1
        )
      )
    )
    RETURNING id INTO v_room_id;

    INSERT INTO public.ov2_room_members (
      room_id,
      participant_key,
      display_name,
      role,
      member_state,
      joined_at
    )
    SELECT v_room_id, m.participant_key, m.display_name, 'host', 'joined', now()
    FROM public.ov2_quick_match_offer_members m
    WHERE m.offer_id = r.id AND m.participant_key = v_host AND m.confirmed_at IS NOT NULL AND m.declined_at IS NULL
    RETURNING id INTO v_member_id;

    UPDATE public.ov2_rooms SET host_member_id = v_member_id WHERE id = v_room_id;

    UPDATE public.ov2_quick_match_offers
    SET room_id = v_room_id, lobby_deadline_at = v_lobby_deadline, status = 'room_ready', updated_at = now()
    WHERE id = r.id;

    UPDATE public.ov2_quick_match_queue q
    SET status = 'completed', updated_at = now()
    WHERE q.offer_id = r.id
      AND q.participant_key IN (
        SELECT m.participant_key
        FROM public.ov2_quick_match_offer_members m
        WHERE m.offer_id = r.id AND m.confirmed_at IS NOT NULL AND m.declined_at IS NULL
      );

    UPDATE public.ov2_quick_match_queue
    SET status = 'waiting', offer_id = NULL, expires_at = now() + interval '30 minutes', updated_at = now()
    WHERE offer_id = r.id AND status = 'matched';

    PERFORM public.ov2_shared_touch_room_activity(v_room_id);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_finalize_expired_offers() FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.ov2_qm_try_form_offers()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  v_offer_id uuid;
  v_deadline timestamptz;
  v_max int;
  qid uuid;
BEGIN
  FOR b IN
    SELECT q.product_game_id, q.stake_per_seat, count(*)::int AS c
    FROM public.ov2_quick_match_queue q
    WHERE q.status = 'waiting' AND q.expires_at > now()
    GROUP BY q.product_game_id, q.stake_per_seat
    HAVING count(*) >= 2
  LOOP
    v_max := public.ov2_qm_max_players_for_product(b.product_game_id);
    v_deadline := now() + interval '15 seconds';

    INSERT INTO public.ov2_quick_match_offers (
      product_game_id, stake_per_seat, status, confirm_deadline_at
    ) VALUES (
      b.product_game_id, b.stake_per_seat, 'confirming', v_deadline
    )
    RETURNING id INTO v_offer_id;

    FOR qid IN
      SELECT id FROM public.ov2_quick_match_queue
      WHERE product_game_id = b.product_game_id
        AND stake_per_seat = b.stake_per_seat
        AND status = 'waiting'
        AND expires_at > now()
      ORDER BY random()
      LIMIT v_max
    LOOP
      UPDATE public.ov2_quick_match_queue
      SET status = 'matched', offer_id = v_offer_id, updated_at = now()
      WHERE id = qid AND status = 'waiting';

      INSERT INTO public.ov2_quick_match_offer_members (offer_id, participant_key, display_name)
      SELECT v_offer_id, q.participant_key, q.display_name
      FROM public.ov2_quick_match_queue q
      WHERE q.id = qid
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_qm_try_form_offers() FROM PUBLIC;

-- ---------------------------------------------------------------------------
-- RPC: enqueue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_enqueue(
  p_participant_key text,
  p_display_name text,
  p_product_game_id text,
  p_stake_per_seat bigint,
  p_preferred_max_players integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_dn text := COALESCE(NULLIF(trim(COALESCE(p_display_name, '')), ''), 'Player');
  v_game text := trim(COALESCE(p_product_game_id, ''));
  v_stake bigint;
  v_id uuid;
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key is required.');
  END IF;
  IF NOT public.ov2_qm_allowed_product(v_game) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_GAME', 'message', 'Quick match is not available for this game.');
  END IF;
  IF p_stake_per_seat IS NULL OR NOT public.ov2_qm_is_allowed_stake(p_stake_per_seat) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_STAKE',
      'message', 'Quick match stake must be exactly 100, 1000, 10000, or 100000.'
    );
  END IF;
  v_stake := p_stake_per_seat;

  PERFORM public.ov2_qm_finalize_expired_offers();
  PERFORM public.ov2_qm_try_form_offers();

  IF EXISTS (
    SELECT 1 FROM public.ov2_quick_match_queue
    WHERE participant_key = v_pk AND status = 'matched'
  ) THEN
    PERFORM public.ov2_qm_try_form_offers();
    RETURN public.ov2_quick_match_tick(v_pk, NULL);
  END IF;

  SELECT id INTO v_id
  FROM public.ov2_quick_match_queue
  WHERE participant_key = v_pk AND status = 'waiting'
  LIMIT 1;

  IF FOUND THEN
    UPDATE public.ov2_quick_match_queue
    SET
      display_name = v_dn,
      product_game_id = v_game,
      stake_per_seat = v_stake,
      preferred_max_players = p_preferred_max_players,
      expires_at = now() + interval '30 minutes',
      updated_at = now()
    WHERE id = v_id;
  ELSE
    INSERT INTO public.ov2_quick_match_queue (
      participant_key, display_name, product_game_id, stake_per_seat, preferred_max_players,
      status, expires_at
    ) VALUES (
      v_pk, v_dn, v_game, v_stake, p_preferred_max_players,
      'waiting', now() + interval '30 minutes'
    );
  END IF;

  PERFORM public.ov2_qm_try_form_offers();

  RETURN public.ov2_quick_match_tick(v_pk, NULL);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: leave queue
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_leave_queue(p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  r record;
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key is required.');
  END IF;

  UPDATE public.ov2_quick_match_queue
  SET status = 'cancelled', updated_at = now()
  WHERE participant_key = v_pk AND status = 'waiting';

  FOR r IN
    SELECT o.id AS oid
    FROM public.ov2_quick_match_offers o
    JOIN public.ov2_quick_match_offer_members m ON m.offer_id = o.id
    WHERE m.participant_key = v_pk
      AND o.status = 'confirming'
      AND o.room_id IS NULL
  LOOP
    UPDATE public.ov2_quick_match_offers SET status = 'cancelled', updated_at = now() WHERE id = r.oid;
    UPDATE public.ov2_quick_match_queue
    SET status = 'waiting', offer_id = NULL, expires_at = now() + interval '30 minutes', updated_at = now()
    WHERE offer_id = r.oid AND status = 'matched';
  END LOOP;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: confirm / decline
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_confirm(p_offer_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_n int;
BEGIN
  IF p_offer_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'offer_id and participant_key are required.');
  END IF;

  UPDATE public.ov2_quick_match_offer_members
  SET confirmed_at = now()
  WHERE offer_id = p_offer_id AND participant_key = v_pk AND declined_at IS NULL;

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_OFFER', 'message', 'Not part of this offer.');
  END IF;

  PERFORM public.ov2_qm_finalize_expired_offers();
  PERFORM public.ov2_qm_try_form_offers();

  RETURN public.ov2_quick_match_tick(v_pk, NULL);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_quick_match_decline(p_offer_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
BEGIN
  IF p_offer_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'offer_id and participant_key are required.');
  END IF;

  UPDATE public.ov2_quick_match_offer_members
  SET declined_at = now()
  WHERE offer_id = p_offer_id AND participant_key = v_pk;

  IF EXISTS (
    SELECT 1 FROM public.ov2_quick_match_offers
    WHERE id = p_offer_id AND status = 'confirming' AND room_id IS NULL
  ) THEN
    UPDATE public.ov2_quick_match_offers SET status = 'cancelled', updated_at = now() WHERE id = p_offer_id;
    UPDATE public.ov2_quick_match_queue
    SET status = 'waiting', offer_id = NULL, expires_at = now() + interval '30 minutes', updated_at = now()
    WHERE offer_id = p_offer_id AND status = 'matched';
  END IF;

  PERFORM public.ov2_qm_try_form_offers();

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ---------------------------------------------------------------------------
-- RPC: tick (poll + process deadlines for room)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ov2_quick_match_tick(
  p_participant_key text,
  p_room_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_q public.ov2_quick_match_queue%ROWTYPE;
  v_o public.ov2_quick_match_offers%ROWTYPE;
  v_peers jsonb;
  v_now timestamptz := now();
BEGIN
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key is required.');
  END IF;

  UPDATE public.ov2_quick_match_queue
  SET status = 'expired', updated_at = now()
  WHERE participant_key = v_pk AND status = 'waiting' AND expires_at <= v_now;

  PERFORM public.ov2_qm_finalize_expired_offers();
  PERFORM public.ov2_qm_try_form_offers();

  IF p_room_id IS NOT NULL THEN
    PERFORM public.ov2_quick_match_auto_start_deadline(p_room_id);
  END IF;

  SELECT * INTO v_o
  FROM public.ov2_quick_match_offers o
  WHERE o.status = 'room_ready'
    AND o.room_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.ov2_quick_match_offer_members m
      WHERE m.offer_id = o.id AND m.participant_key = v_pk AND m.confirmed_at IS NOT NULL
    )
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'join_room',
      'room_id', v_o.room_id,
      'lobby_deadline_at', v_o.lobby_deadline_at
    );
  END IF;

  SELECT * INTO v_o
  FROM public.ov2_quick_match_offers o
  JOIN public.ov2_quick_match_offer_members m ON m.offer_id = o.id
  WHERE m.participant_key = v_pk
    AND o.status = 'confirming'
    AND o.room_id IS NULL
    AND o.confirm_deadline_at > v_now
  ORDER BY o.created_at DESC
  LIMIT 1;

  IF FOUND THEN
    SELECT COALESCE(
      jsonb_agg(
        jsonb_build_object(
          'display_name', m.display_name,
          'is_you', m.participant_key = v_pk,
          'confirmed', m.confirmed_at IS NOT NULL
        )
        ORDER BY m.participant_key
      ),
      '[]'::jsonb
    ) INTO v_peers
    FROM public.ov2_quick_match_offer_members m
    WHERE m.offer_id = v_o.id;

    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'confirm',
      'offer_id', v_o.id,
      'confirm_deadline_at', v_o.confirm_deadline_at,
      'product_game_id', v_o.product_game_id,
      'stake_per_seat', v_o.stake_per_seat,
      'peers', v_peers
    );
  END IF;

  SELECT * INTO v_q
  FROM public.ov2_quick_match_queue
  WHERE participant_key = v_pk AND status = 'waiting' AND expires_at > v_now
  ORDER BY updated_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'phase', 'waiting',
      'product_game_id', v_q.product_game_id,
      'stake_per_seat', v_q.stake_per_seat
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'phase', 'idle');
END;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

GRANT EXECUTE ON FUNCTION public.ov2_quick_match_enqueue(text, text, text, bigint, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_leave_queue(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_confirm(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_decline(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_tick(text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_join_invited_room(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_quick_match_auto_start_deadline(uuid) TO anon, authenticated, service_role;

COMMENT ON TABLE public.ov2_quick_match_queue IS 'OV2 Quick Match V1: waiting players keyed by game + stake.';
COMMENT ON TABLE public.ov2_quick_match_offers IS 'OV2 Quick Match V1: ephemeral match offers (confirm then hidden room).';

COMMIT;
