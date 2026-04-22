-- OV2 Tanks V1: prevent snapshot/ping/fire 500s from non-integer `turnDeadlineMs` text casts;
-- duplicate playfield JSON under `publicState` for clients that cannot read key `public`.
-- Apply after 151_ov2_tanks_v1_gameplay.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public._ov2_tanks_coerce_epoch_ms(p_text text, p_default bigint)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_text IS NULL OR btrim(p_text) = '' THEN p_default
    WHEN btrim(p_text) ~ '^-?[0-9]{1,18}$' THEN btrim(p_text)::bigint
    ELSE p_default
  END;
$$;

REVOKE ALL ON FUNCTION public._ov2_tanks_coerce_epoch_ms(text, bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public._ov2_tanks_advance_timeouts(p_session_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sess public.ov2_tanks_sessions%ROWTYPE;
  v_now bigint;
  v_dl bigint;
  v_ps jsonb;
  v_pub jsonb;
  v_pk0 text;
  v_pk1 text;
  v_act text;
  v_seat int;
  v_other int;
  v_ts jsonb;
  v_strike int;
  v_max_turns int;
  v_completed int;
  v_hp0 int;
  v_hp1 int;
BEGIN
  LOOP
    SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = p_session_id FOR UPDATE;
    EXIT WHEN NOT FOUND;
    EXIT WHEN v_sess.phase IS DISTINCT FROM 'playing';
    v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
    v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
    v_dl := public._ov2_tanks_coerce_epoch_ms(v_ps ->> 'turnDeadlineMs', v_now + 1);
    EXIT WHEN v_now < v_dl;

    v_pk0 := trim(coalesce(v_ps -> 'participants' ->> 0, ''));
    v_pk1 := trim(coalesce(v_ps -> 'participants' ->> 1, ''));
    v_act := trim(coalesce(v_ps ->> 'activeParticipantKey', ''));
    IF v_act = v_pk0 THEN
      v_seat := 0;
    ELSIF v_act = v_pk1 THEN
      v_seat := 1;
    ELSE
      PERFORM public._ov2_tanks_finish_session(
        p_session_id,
        public._ov2_tanks_second_mover_seat(v_ps),
        v_ps,
        'corrupt_state',
        false,
        v_sess.revision,
        NULL
      );
      EXIT;
    END IF;

    v_ts := coalesce(v_ps -> 'timeoutStrikes', '[0,0]'::jsonb);
    v_strike := coalesce((v_ts ->> v_seat::text)::int, 0) + 1;
    v_ts := jsonb_set(v_ts, ARRAY[v_seat::text], to_jsonb(v_strike), true);
    v_ps := jsonb_set(v_ps, '{timeoutStrikes}', v_ts, true);

    IF v_strike >= 3 THEN
      v_other := 1 - v_seat;
      PERFORM public._ov2_tanks_finish_session(p_session_id, v_other, v_ps, 'timeout_forfeit', false, v_sess.revision, NULL);
      EXIT;
    END IF;

    v_other := 1 - v_seat;
    v_act := CASE WHEN v_other = 0 THEN v_pk0 ELSE v_pk1 END;
    v_completed := coalesce((v_ps ->> 'completedTurns')::int, 0) + 1;
    v_ps := jsonb_set(v_ps, '{completedTurns}', to_jsonb(v_completed), true);
    v_ps := v_ps || jsonb_build_object(
      'activeParticipantKey', v_act,
      'turnStartedMs', v_now,
      'turnDeadlineMs', v_now + 30000,
      'lastEvent',
      jsonb_build_object('kind', 'timeout_turn', 'seat', v_seat, 'strike', v_strike, 'at', v_now)
    );

    v_max_turns := coalesce((v_ps ->> 'maxCompletedTurns')::int, 60);
    IF v_completed >= v_max_turns THEN
      v_hp0 := coalesce((v_ps #>> '{hp,0}')::int, 0);
      v_hp1 := coalesce((v_ps #>> '{hp,1}')::int, 0);
      IF v_hp0 = v_hp1 THEN
        PERFORM public._ov2_tanks_finish_session(
          p_session_id,
          public._ov2_tanks_second_mover_seat(v_ps),
          v_ps,
          'turn_cap',
          false,
          v_sess.revision,
          NULL
        );
      ELSIF v_hp0 > v_hp1 THEN
        PERFORM public._ov2_tanks_finish_session(p_session_id, 0, v_ps, 'turn_cap', false, v_sess.revision, NULL);
      ELSE
        PERFORM public._ov2_tanks_finish_session(p_session_id, 1, v_ps, 'turn_cap', false, v_sess.revision, NULL);
      END IF;
      EXIT;
    END IF;

    UPDATE public.ov2_tanks_sessions
    SET
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = p_session_id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_fire(
  p_room_id uuid,
  p_participant_key text,
  p_weapon text,
  p_angle_deg numeric,
  p_power numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tanks_sessions%ROWTYPE;
  v_seat int;
  v_ps jsonb;
  v_pub jsonb;
  v_now bigint;
  v_act text;
  w text := lower(trim(coalesce(p_weapon, '')));
  v_ch int;
  v_sim jsonb;
  v_kind text;
  hit_seat int;
  ix numeric;
  iy numeric;
  splash_r numeric;
  crater_r numeric;
  crater_d numeric;
  dmg int;
  smax int;
  hp0 int;
  hp1 int;
  dist numeric;
  sdmg int;
  opp int;
  v_pk0 text;
  v_pk1 text;
  v_next text;
  v_completed int;
  v_max_turns int;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  IF w NOT IN ('iron', 'he', 'burrower', 'finisher') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_WEAPON', 'message', 'Invalid weapon');
  END IF;
  IF p_angle_deg IS NULL OR p_angle_deg < 10::numeric OR p_angle_deg > 170::numeric THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_ANGLE', 'message', 'Angle out of range');
  END IF;
  IF p_power IS NULL OR p_power < 10::numeric OR p_power > 100::numeric THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_POWER', 'message', 'Power out of range');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  PERFORM public._ov2_tanks_advance_timeouts(v_sess.id);
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_PHASE', 'message', 'Match not accepting fire');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_tanks_seats WHERE session_id = v_sess.id AND participant_key = v_pk LIMIT 1;
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat');
  END IF;

  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  v_act := trim(coalesce(v_ps ->> 'activeParticipantKey', ''));
  IF v_act IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Inactive player cannot fire');
  END IF;

  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  IF v_now > public._ov2_tanks_coerce_epoch_ms(v_ps ->> 'turnDeadlineMs', v_now + 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TURN_EXPIRED', 'message', 'Turn timer expired; wait for timeout resolution');
  END IF;

  v_ch := coalesce((v_ps -> 'chargesSeat' -> v_seat ->> w)::int, 0);
  IF w <> 'iron' AND v_ch <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_CHARGES', 'message', 'No charges for that weapon');
  END IF;

  v_pub := coalesce(v_sess.public_state, '{}'::jsonb);
  v_sim := public._ov2_tanks_sim_shot(v_pub, v_seat, w, p_angle_deg, p_power);
  v_kind := v_sim ->> 'kind';

  IF w <> 'iron' THEN
    v_ps := jsonb_set(
      v_ps,
      ARRAY['chargesSeat', v_seat::text, w],
      to_jsonb(v_ch - 1),
      true
    );
  END IF;

  IF v_kind = 'oob' THEN
    v_ps := v_ps || jsonb_build_object(
      'lastEvent',
      jsonb_build_object('kind', 'miss_oob', 'weapon', w, 'at', v_now)
    );
  ELSE
    ix := (v_sim ->> 'x')::numeric;
    iy := (v_sim ->> 'y')::numeric;
    splash_r := coalesce((v_sim ->> 'splashR')::numeric, 0);
    crater_r := coalesce((v_sim ->> 'craterR')::numeric, 10);
    crater_d := coalesce((v_sim ->> 'craterD')::numeric, 10);
    v_pub := public._ov2_tanks_apply_crater(v_pub, ix, crater_r, crater_d);
    dmg := public._ov2_tanks_weapon_direct_damage(w);
    smax := public._ov2_tanks_weapon_splash_max(w);
    hp0 := coalesce((v_ps #>> '{hp,0}')::int, 0);
    hp1 := coalesce((v_ps #>> '{hp,1}')::int, 0);

    IF v_kind = 'tank_direct' THEN
      hit_seat := (v_sim ->> 'hitSeat')::int;
      IF hit_seat = 0 THEN
        hp0 := greatest(hp0 - dmg, 0);
      ELSE
        hp1 := greatest(hp1 - dmg, 0);
      END IF;
      v_pub := public._ov2_tanks_apply_crater(v_pub, ix, greatest(crater_r * 0.55, 6::numeric), crater_d * 0.65);
    END IF;

    v_pub := public._ov2_tanks_clamp_tanks_on_terrain(v_pub);

    IF smax > 0 AND splash_r > 0 THEN
      dist := sqrt(
        power(ix - coalesce((v_pub -> 'tanks' -> 0 ->> 'x')::numeric, 0), 2)
        + power(iy - coalesce((v_pub -> 'tanks' -> 0 ->> 'y')::numeric, 0), 2)
      );
      IF dist <= splash_r AND dist >= 0 THEN
        sdmg := floor(smax * (1::numeric - dist / splash_r))::int;
        hp0 := greatest(hp0 - sdmg, 0);
      END IF;
      dist := sqrt(
        power(ix - coalesce((v_pub -> 'tanks' -> 1 ->> 'x')::numeric, 0), 2)
        + power(iy - coalesce((v_pub -> 'tanks' -> 1 ->> 'y')::numeric, 0), 2)
      );
      IF dist <= splash_r AND dist >= 0 THEN
        sdmg := floor(smax * (1::numeric - dist / splash_r))::int;
        hp1 := greatest(hp1 - sdmg, 0);
      END IF;
    END IF;

    v_ps := jsonb_set(v_ps, '{hp}', jsonb_build_array(hp0, hp1), true);
    v_ps := v_ps || jsonb_build_object(
      'lastEvent',
      jsonb_build_object(
        'kind', v_kind,
        'weapon', w,
        'impact', jsonb_build_object('x', ix, 'y', iy),
        'at', v_now
      )
    );
  END IF;

  v_completed := coalesce((v_ps ->> 'completedTurns')::int, 0) + 1;
  v_ps := jsonb_set(v_ps, '{completedTurns}', to_jsonb(v_completed), true);

  v_max_turns := coalesce((v_ps ->> 'maxCompletedTurns')::int, 60);
  hp0 := coalesce((v_ps #>> '{hp,0}')::int, 0);
  hp1 := coalesce((v_ps #>> '{hp,1}')::int, 0);

  IF hp0 <= 0 OR hp1 <= 0 THEN
    IF hp0 <= 0 AND hp1 <= 0 THEN
      PERFORM public._ov2_tanks_finish_session(v_sess.id, 1 - v_seat, v_ps, 'hp', false, v_sess.revision, v_pub);
    ELSIF hp0 <= 0 THEN
      PERFORM public._ov2_tanks_finish_session(v_sess.id, 1, v_ps, 'hp', false, v_sess.revision, v_pub);
    ELSE
      PERFORM public._ov2_tanks_finish_session(v_sess.id, 0, v_ps, 'hp', false, v_sess.revision, v_pub);
    END IF;
  ELSIF v_completed >= v_max_turns THEN
    IF hp0 = hp1 THEN
      PERFORM public._ov2_tanks_finish_session(
        v_sess.id,
        public._ov2_tanks_second_mover_seat(v_ps),
        v_ps,
        'turn_cap',
        false,
        v_sess.revision,
        v_pub
      );
    ELSIF hp0 > hp1 THEN
      PERFORM public._ov2_tanks_finish_session(v_sess.id, 0, v_ps, 'turn_cap', false, v_sess.revision, v_pub);
    ELSE
      PERFORM public._ov2_tanks_finish_session(v_sess.id, 1, v_ps, 'turn_cap', false, v_sess.revision, v_pub);
    END IF;
  ELSE
    v_pk0 := trim(coalesce(v_ps -> 'participants' ->> 0, ''));
    v_pk1 := trim(coalesce(v_ps -> 'participants' ->> 1, ''));
    opp := 1 - v_seat;
    v_next := CASE WHEN opp = 0 THEN v_pk0 ELSE v_pk1 END;
    v_ps := v_ps || jsonb_build_object(
      'activeParticipantKey', v_next,
      'turnStartedMs', v_now,
      'turnDeadlineMs', v_now + 30000
    );
    UPDATE public.ov2_tanks_sessions
    SET
      public_state = v_pub,
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id;
  END IF;

  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_build_client_snapshot(
  p_session public.ov2_tanks_sessions,
  p_participant_key text
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_my int;
  v_pub jsonb;
  v_ps jsonb;
  v_now bigint := (extract(epoch from clock_timestamp()) * 1000)::bigint;
  v_dead bigint;
  v_rem bigint;
  v_turn_pk text;
  v_is_turn boolean := false;
BEGIN
  SELECT s.seat_index INTO v_my
  FROM public.ov2_tanks_seats s
  WHERE s.session_id = p_session.id AND s.participant_key = v_pk;

  v_pub := coalesce(p_session.public_state, '{}'::jsonb);
  v_ps := coalesce(p_session.parity_state, '{}'::jsonb);
  v_turn_pk := trim(coalesce(v_ps ->> 'activeParticipantKey', ''));
  IF length(v_pk) > 0 AND v_turn_pk = v_pk THEN
    v_is_turn := true;
  END IF;
  v_dead := public._ov2_tanks_coerce_epoch_ms(v_ps ->> 'turnDeadlineMs', v_now);
  v_rem := greatest(0::bigint, v_dead - v_now);

  RETURN jsonb_build_object(
    'revision', p_session.revision,
    'sessionId', p_session.id::text,
    'roomId', p_session.room_id::text,
    'phase', p_session.phase,
    'mySeat', CASE WHEN v_my IS NULL THEN NULL::jsonb ELSE to_jsonb(v_my) END,
    'winnerSeat', CASE WHEN p_session.winner_seat IS NULL THEN NULL::jsonb ELSE to_jsonb(p_session.winner_seat) END,
    'serverNowMs', to_jsonb(v_now),
    'turnMsRemaining', to_jsonb(v_rem),
    'isMyTurn', to_jsonb(v_is_turn),
    'public', v_pub,
    'publicState', v_pub,
    'parity', v_ps
  );
END;
$$;

COMMIT;
