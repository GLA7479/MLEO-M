-- Expose parity_state.__result__ to Dominoes client snapshot when phase = finished.
-- Apply after 099_ov2_dominoes_rpcs.sql. No game logic change — read-only field on snapshot.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_dominoes_build_client_snapshot(
  p_session public.ov2_dominoes_sessions,
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
  v_phase text;
  v_finished boolean;
  v_line jsonb;
  v_td bigint;
  v_secrets jsonb;
  v_hand jsonb;
  v_opp_hand int;
  v_bone int;
  v_mult int;
  v_pd jsonb;
  v_can_play boolean := false;
  v_can_respond_dbl boolean := false;
  v_can_offer_dbl boolean := false;
  v_dbl_acc int;
  v_playing boolean;
BEGIN
  v_board := COALESCE(p_session.board, '{}'::jsonb);
  v_phase := p_session.phase;
  v_finished := (v_phase = 'finished' OR p_session.winner_seat IS NOT NULL);
  v_playing := (p_session.status = 'live' AND NOT v_finished AND v_phase = 'playing');
  v_line := COALESCE(v_board -> 'line', '[]'::jsonb);
  v_turn := NULL;
  BEGIN
    v_turn := (v_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_turn := NULL;
  END;

  SELECT s.seat_index INTO v_my_seat
  FROM public.ov2_dominoes_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;

  SELECT d.payload INTO v_secrets
  FROM public.ov2_dominoes_secrets d
  WHERE d.session_id = p_session.id;

  v_hand := '[]'::jsonb;
  v_opp_hand := 0;
  v_bone := 0;
  IF v_secrets IS NOT NULL AND jsonb_typeof(v_secrets) = 'object' THEN
    IF v_my_seat IS NOT NULL AND v_my_seat IN (0, 1) THEN
      v_hand := COALESCE(v_secrets -> 'hands' -> (v_my_seat::text), '[]'::jsonb);
      IF jsonb_typeof(v_hand) <> 'array' THEN
        v_hand := '[]'::jsonb;
      END IF;
      v_opp_hand := COALESCE(
        jsonb_array_length(COALESCE(v_secrets -> 'hands' -> (CASE WHEN v_my_seat = 0 THEN '1' ELSE '0' END), '[]'::jsonb)),
        0
      );
    ELSE
      v_opp_hand := 0;
    END IF;
    v_bone := COALESCE(jsonb_array_length(COALESCE(v_secrets -> 'boneyard', '[]'::jsonb)), 0);
  END IF;

  v_mult := public.ov2_dom_parity_stake_mult(p_session.parity_state);
  v_pd := p_session.parity_state -> 'pending_double';
  IF v_pd IS NULL OR jsonb_typeof(v_pd) <> 'object' THEN
    v_pd := NULL;
  END IF;

  IF v_playing AND v_my_seat IS NOT NULL AND v_turn IN (0, 1) AND v_my_seat = v_turn
     AND v_pd IS NULL
     AND jsonb_typeof(v_line) = 'array' THEN
    v_can_play := public.ov2_dom_hand_has_legal_on_line(v_line, v_hand)
      OR (public.ov2_dom_line_len(v_line) = 0 AND jsonb_array_length(v_hand) > 0);
  END IF;

  IF v_playing AND v_pd IS NOT NULL THEN
    BEGIN
      IF (v_pd ->> 'responder_seat')::int IS NOT DISTINCT FROM v_my_seat THEN
        v_can_respond_dbl := true;
      END IF;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_can_respond_dbl := false;
    END;
  END IF;

  v_dbl_acc := COALESCE((p_session.parity_state ->> 'doubles_accepted')::int, 0);
  IF v_playing AND v_pd IS NULL AND v_my_seat IS NOT NULL AND v_turn IN (0, 1) AND v_my_seat = v_turn THEN
    IF v_mult < 16 AND v_dbl_acc < 4 THEN
      v_can_offer_dbl := true;
    END IF;
  END IF;

  v_td := NULL;
  IF v_playing AND COALESCE(p_session.parity_state, '{}'::jsonb) ? 'turn_deadline_at' THEN
    BEGIN
      v_td := (p_session.parity_state ->> 'turn_deadline_at')::bigint;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_td := NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', v_phase,
    'activeSeats', to_jsonb(p_session.active_seats),
    'mySeat', CASE WHEN v_my_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my_seat) END,
    'board', jsonb_build_object(
      'turnSeat', CASE WHEN v_turn IS NULL THEN NULL::jsonb ELSE to_jsonb(v_turn) END,
      'line', v_line,
      'winner', v_board -> 'winner'
    ),
    'turnSeat', CASE WHEN v_turn IS NULL THEN NULL::jsonb ELSE to_jsonb(v_turn) END,
    'line', v_line,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'myHand', v_hand,
    'oppHandCount', to_jsonb(v_opp_hand),
    'boneyardCount', to_jsonb(v_bone),
    'stakeMultiplier', to_jsonb(v_mult),
    'doublesAccepted', to_jsonb(v_dbl_acc),
    'pendingDouble', COALESCE(to_jsonb(v_pd), 'null'::jsonb),
    'canClientPlayTiles', v_can_play,
    'canOfferDouble', v_can_offer_dbl,
    'mustRespondDouble', v_can_respond_dbl,
    'turnDeadline', CASE WHEN v_td IS NULL THEN NULL::jsonb ELSE to_jsonb(v_td) END,
    'missedTurns', COALESCE(p_session.parity_state -> 'missed_turns', jsonb_build_object('0', 0, '1', 0)),
    'result', (
      CASE
        WHEN p_session.phase = 'finished' THEN COALESCE(p_session.parity_state, '{}'::jsonb) -> '__result__'
        ELSE NULL
      END
    )
  );
END;
$$;

COMMIT;
