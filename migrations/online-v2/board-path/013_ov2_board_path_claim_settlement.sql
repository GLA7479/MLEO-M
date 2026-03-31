-- Board Path: deliver finalized settlement lines to participants (DB claim + client vault credit).
-- Additive only. Apply after 012_ov2_board_path_finalize_room.sql.

BEGIN;

ALTER TABLE public.ov2_settlement_lines
  ADD COLUMN IF NOT EXISTS vault_delivered_at timestamptz;

COMMENT ON COLUMN public.ov2_settlement_lines.vault_delivered_at IS
  'When this line was claimed for vault delivery; null = not yet delivered. Idempotent per line.';

CREATE INDEX IF NOT EXISTS idx_ov2_settlement_lines_room_recipient_undelivered
  ON public.ov2_settlement_lines (room_id, recipient_participant_key)
  WHERE vault_delivered_at IS NULL;

-- =============================================================================
-- ov2_board_path_claim_settlement — room finalized; member claims own lines only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ov2_board_path_claim_settlement(
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

  IF v_room.product_game_id IS DISTINCT FROM 'ov2_board_path' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a board path room');
  END IF;

  IF v_room.settlement_status IS DISTINCT FROM 'finalized' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_FINALIZED',
      'message', 'Room must be settlement-finalized before claiming'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND trim(m.participant_key) = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not a member of this room');
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
  )
  INTO v_has_any;

  SELECT EXISTS (
    SELECT 1
    FROM public.ov2_settlement_lines sl
    WHERE sl.room_id = p_room_id
      AND trim(sl.recipient_participant_key) = v_pk
      AND sl.vault_delivered_at IS NULL
  )
  INTO v_has_undelivered;

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

  SELECT x.j, x.t
  INTO v_lines, v_total
  FROM (
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
      ) AS j,
      COALESCE(sum(u.amount), 0)::bigint AS t
    FROM u
  ) x;

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

GRANT EXECUTE ON FUNCTION public.ov2_board_path_claim_settlement(uuid, text) TO anon, authenticated, service_role;

COMMIT;
