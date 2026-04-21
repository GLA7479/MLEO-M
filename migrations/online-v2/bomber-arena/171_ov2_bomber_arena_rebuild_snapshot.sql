-- OV2 Bomber Arena — rebuild v2 authoritative snapshot fields (plan §5). Apply after 170 helpers.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_bomber_arena_build_client_snapshot(
  p_session_id uuid,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(COALESCE(p_participant_key, ''));
  v_sid uuid := p_session_id;
  v_room_id uuid;
  v_match_seq int;
  v_revision bigint;
  v_sim_tick bigint;
  v_phase text;
  v_status text;
  v_board jsonb;
  v_turn int;
  v_my_seat int;
  v_winner int;
  v_is_draw boolean;
  v_max_sim int;
  v_ticks_rem int;
  v_rules_phase text;
  v_eff_sd_radius int;
  v_base_radius int;
  v_sd_start int;
  v_can_wait boolean;
  v_legal_moves int;
  v_last_action jsonb;
  v_finish_reason text;
BEGIN
  IF v_sid IS NULL THEN
    RETURN jsonb_build_object('error', true, 'message', 'session_id required');
  END IF;

  v_room_id := (
    SELECT s.room_id FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_match_seq := (
    SELECT s.match_seq FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_revision := (
    SELECT s.revision FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_sim_tick := (
    SELECT s.sim_tick FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_phase := (
    SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_status := (
    SELECT s.status FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_board := (
    SELECT coalesce(s.board, '{}'::jsonb) FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_turn := coalesce((v_board ->> 'turnSeat')::int, 0);
  v_winner := (
    SELECT s.winner_seat FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  );
  v_is_draw := coalesce((
    SELECT s.is_draw FROM public.ov2_bomber_arena_sessions s WHERE s.id = v_sid LIMIT 1
  ), false);

  v_my_seat := NULL;
  IF length(v_pk) > 0 THEN
    v_my_seat := (
      SELECT s.seat_index
      FROM public.ov2_bomber_arena_seats s
      WHERE s.session_id = v_sid AND trim(s.participant_key) = v_pk
      LIMIT 1
    );
  END IF;

  v_max_sim := greatest(coalesce((v_board ->> 'maxSimTicks')::int, 200), 1);
  v_sd_start := greatest(coalesce((v_board ->> 'suddenDeathStartTick')::int, 140), 1);
  v_base_radius := greatest(coalesce((v_board ->> 'bombRadius')::int, 1), 1);
  v_eff_sd_radius := greatest(coalesce((v_board ->> 'suddenDeathBombRadius')::int, 2), 1);

  IF v_phase IS DISTINCT FROM 'playing' THEN
    v_ticks_rem := 0;
    v_rules_phase := coalesce(nullif(trim(v_board ->> 'rulesPhase'), ''), 'finished');
    v_can_wait := false;
    v_legal_moves := 0;
  ELSE
    v_ticks_rem := greatest(v_max_sim - v_sim_tick::int, 0);
    v_rules_phase := coalesce(nullif(trim(v_board ->> 'rulesPhase'), ''), 'normal');
    IF v_sim_tick >= v_sd_start THEN
      v_rules_phase := 'sudden_death';
    END IF;
    IF v_my_seat IS NULL THEN
      v_can_wait := false;
      v_legal_moves := 0;
    ELSIF v_my_seat NOT IN (0, 1) THEN
      v_can_wait := false;
      v_legal_moves := 0;
    ELSE
      v_legal_moves := public.ov2_bomber_arena_legal_move_count(v_board, v_my_seat);
      v_can_wait := (v_turn = v_my_seat) AND (v_legal_moves = 0);
    END IF;
  END IF;

  v_last_action := v_board #> '{meta,lastAction}';
  IF v_last_action IS NULL OR jsonb_typeof(v_last_action) = 'null' THEN
    v_last_action := 'null'::jsonb;
  END IF;

  v_finish_reason := nullif(trim(v_board #>> '{meta,finishReason}'), '');
  IF v_phase IS DISTINCT FROM 'finished' THEN
    v_finish_reason := NULL;
  ELSIF v_finish_reason IS NULL OR v_finish_reason = '' THEN
    IF v_is_draw THEN
      IF v_sim_tick >= v_max_sim THEN
        v_finish_reason := 'time_limit';
      ELSE
        v_finish_reason := 'double_ko';
      END IF;
    ELSIF v_winner IS NOT NULL AND v_winner IN (0, 1) THEN
      v_finish_reason := 'elimination';
    ELSE
      v_finish_reason := 'unknown';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'sessionId', v_sid,
    'roomId', v_room_id,
    'matchSeq', v_match_seq,
    'revision', v_revision,
    'simTick', v_sim_tick,
    'phase', v_phase,
    'status', v_status,
    'turnSeat', v_turn,
    'board', v_board,
    'mySeat', to_jsonb(v_my_seat),
    'winnerSeat', to_jsonb(v_winner),
    'isDraw', v_is_draw,
    'maxSimTicks', v_max_sim,
    'simTicksRemaining', v_ticks_rem,
    'rulesPhase', to_jsonb(coalesce(v_rules_phase, 'normal')),
    'suddenDeathBombRadius', CASE WHEN v_phase = 'playing' AND v_sim_tick >= v_sd_start THEN to_jsonb(v_eff_sd_radius) ELSE to_jsonb(v_base_radius) END,
    'canWait', v_can_wait,
    'legalMoveCount', v_legal_moves,
    'lastAction', v_last_action,
    'finishReason', CASE
      WHEN v_phase = 'finished' THEN to_jsonb(coalesce(v_finish_reason, 'unknown'))
      ELSE 'null'::jsonb
    END,
    'seats', coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'seatIndex', s.seat_index,
          'participantKey', trim(s.participant_key),
          'isAlive', s.is_alive
        )
        ORDER BY s.seat_index
      )
      FROM public.ov2_bomber_arena_seats s
      WHERE s.session_id = v_sid
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_bomber_arena_build_client_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_bomber_arena_build_client_snapshot(uuid, text) TO anon, authenticated, service_role;

COMMIT;
