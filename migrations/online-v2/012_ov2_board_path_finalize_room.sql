-- Board Path Phase 6: room-level finalization (ledger marker + aggregated summary; no vault I/O).
-- Apply after 011_ov2_board_path_finalize_session.sql.

BEGIN;

-- --- ov2_rooms: room settlement / finalization (distinct from per-session settlement on board_path_sessions) ---

ALTER TABLE public.ov2_rooms
  ADD COLUMN IF NOT EXISTS settlement_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS settlement_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS finalized_at timestamptz,
  ADD COLUMN IF NOT EXISTS finalized_match_seq bigint;

UPDATE public.ov2_rooms
SET
  settlement_status = 'pending',
  settlement_revision = 0
WHERE settlement_status IS NULL OR trim(settlement_status) = '';

UPDATE public.ov2_rooms
SET settlement_revision = 0
WHERE settlement_revision IS NULL OR settlement_revision < 0;

ALTER TABLE public.ov2_rooms
  DROP CONSTRAINT IF EXISTS ov2_rooms_settlement_status_chk;

ALTER TABLE public.ov2_rooms
  ADD CONSTRAINT ov2_rooms_settlement_status_chk
  CHECK (settlement_status IN ('pending', 'finalized'));

ALTER TABLE public.ov2_rooms
  DROP CONSTRAINT IF EXISTS ov2_rooms_settlement_revision_chk;

ALTER TABLE public.ov2_rooms
  ADD CONSTRAINT ov2_rooms_settlement_revision_chk
  CHECK (settlement_revision >= 0);

CREATE INDEX IF NOT EXISTS idx_ov2_rooms_id_settlement_status
  ON public.ov2_rooms (id, settlement_status);

-- --- Public room JSON (PostgREST clients / RPC payloads) ---

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
    'settlement_status', COALESCE(r.settlement_status, 'pending'),
    'settlement_revision', COALESCE(r.settlement_revision, 0),
    'finalized_at', r.finalized_at,
    'finalized_match_seq', r.finalized_match_seq,
    'meta', COALESCE(r.meta, '{}'::jsonb)
  );
$$;

-- --- Economy: room_finalize ---

ALTER TABLE public.ov2_economy_events
  DROP CONSTRAINT IF EXISTS ov2_economy_events_kind_chk;

ALTER TABLE public.ov2_economy_events
  ADD CONSTRAINT ov2_economy_events_kind_chk CHECK (
    event_kind = ANY (
      ARRAY[
        'reserve',
        'commit',
        'release_reserve',
        'refund',
        'forfeit',
        'adjust',
        'session_finalize',
        'room_finalize'
      ]::text[]
    )
  );

-- =============================================================================
-- ov2_board_path_finalize_room — host-only; strict: all sessions ended, latest session-finalized.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_finalize_room(
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
  v_host text;
  v_idem_event text;
  v_max_seq int;
  v_latest public.ov2_board_path_sessions%ROWTYPE;
  v_summary jsonb;
  v_total bigint;
  v_updated int;
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

  v_host := trim(COALESCE(v_room.host_participant_key, ''));
  IF length(v_host) = 0 OR v_pk IS DISTINCT FROM v_host THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only the room host may finalize the room');
  END IF;

  v_idem_event := 'ov2:bp:room_finalize:' || v_room.id::text;

  IF v_room.settlement_status IS NOT DISTINCT FROM 'finalized' THEN
    v_summary := COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'participant_key', x.pk,
          'total_amount', x.tot
        )
        ORDER BY x.pk
      )
      FROM (
        SELECT sl.recipient_participant_key AS pk, sum(sl.amount)::bigint AS tot
        FROM public.ov2_settlement_lines sl
        WHERE sl.room_id = v_room.id
        GROUP BY sl.recipient_participant_key
      ) x
    ), '[]'::jsonb);

    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'room_id', v_room.id,
      'finalized', true,
      'settlement_summary', v_summary,
      'finalized_match_seq', v_room.finalized_match_seq,
      'settlement_status', v_room.settlement_status,
      'settlement_revision', v_room.settlement_revision,
      'finalized_at', v_room.finalized_at
    );
  END IF;

  SELECT COALESCE(max(match_seq), NULL)::int INTO v_max_seq
  FROM public.ov2_board_path_sessions
  WHERE room_id = p_room_id;

  IF v_max_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSIONS', 'message', 'No board path sessions for room');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_board_path_sessions s
    WHERE s.room_id = p_room_id AND s.phase IS DISTINCT FROM 'ended'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSIONS_NOT_ENDED',
      'message', 'All match sessions must be in ended phase before room finalization'
    );
  END IF;

  SELECT * INTO v_latest
  FROM public.ov2_board_path_sessions
  WHERE room_id = p_room_id AND match_seq = v_max_seq
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'LATEST_SESSION_MISSING', 'message', 'Latest session row not found');
  END IF;

  IF v_latest.settlement_status IS DISTINCT FROM 'finalized' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'SESSION_NOT_FINALIZED',
      'message', 'Latest match session must be settlement-finalized first'
    );
  END IF;

  v_summary := COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'participant_key', x.pk,
        'total_amount', x.tot
      )
      ORDER BY x.pk
    )
    FROM (
      SELECT sl.recipient_participant_key AS pk, sum(sl.amount)::bigint AS tot
      FROM public.ov2_settlement_lines sl
      WHERE sl.room_id = v_room.id
      GROUP BY sl.recipient_participant_key
    ) x
  ), '[]'::jsonb);

  SELECT COALESCE(sum(sl.amount), 0)::bigint INTO v_total
  FROM public.ov2_settlement_lines sl
  WHERE sl.room_id = v_room.id;

  INSERT INTO public.ov2_economy_events (
    room_id,
    participant_key,
    event_kind,
    amount,
    match_seq,
    idempotency_key,
    payload
  ) VALUES (
    v_room.id,
    v_pk,
    'room_finalize',
    COALESCE(v_total, 0),
    COALESCE(v_max_seq, 0),
    v_idem_event,
    jsonb_build_object(
      'game_id', 'ov2_board_path',
      'room_id', v_room.id,
      'finalized_match_seq', v_max_seq,
      'settlement_summary', v_summary
    )
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  UPDATE public.ov2_rooms
  SET
    settlement_status = 'finalized',
    finalized_at = COALESCE(finalized_at, now()),
    finalized_match_seq = v_max_seq,
    settlement_revision = settlement_revision + 1,
    updated_at = now()
  WHERE id = v_room.id
    AND settlement_status IS NOT DISTINCT FROM 'pending';

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;

  IF v_updated = 0 THEN
    IF v_room.settlement_status IS DISTINCT FROM 'finalized' THEN
      RETURN jsonb_build_object(
        'ok', false,
        'code', 'ROOM_FINALIZE_STATE',
        'message', 'Room could not be marked finalized'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', (v_updated = 0),
    'room_id', v_room.id,
    'finalized', true,
    'settlement_summary', v_summary,
    'finalized_match_seq', v_room.finalized_match_seq,
    'settlement_status', v_room.settlement_status,
    'settlement_revision', v_room.settlement_revision,
    'finalized_at', v_room.finalized_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_board_path_finalize_room(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_board_path_finalize_room(uuid, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.ov2_board_path_finalize_room(uuid, text) IS
  'Board Path Phase 6: host finalizes room after all sessions ended and latest session settlement-finalized.';

COMMIT;
