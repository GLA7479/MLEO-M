-- OV2 Tanks V1: authoritative fire, terrain deformation, HP/splash, timeouts, snapshots.
-- Apply after 147_ov2_tanks_v1_rpcs.sql (replaces several functions from 147).

BEGIN;

CREATE OR REPLACE FUNCTION public._ov2_tanks_terrain_y(p_samples jsonb, p_map_w numeric, p_x numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
  t numeric;
  i0 int;
  i1 int;
  y0 numeric;
  y1 numeric;
BEGIN
  IF p_samples IS NULL OR jsonb_typeof(p_samples) <> 'array' OR p_map_w IS NULL OR p_map_w <= 0 THEN
    RETURN 400::numeric;
  END IF;
  n := jsonb_array_length(p_samples);
  IF n IS NULL OR n < 2 THEN
    RETURN 400::numeric;
  END IF;
  t := (p_x / p_map_w) * (n - 1)::numeric;
  IF t <= 0 THEN
    RETURN (p_samples #>> '{0}')::numeric;
  END IF;
  IF t >= (n - 1) THEN
    RETURN (p_samples #>> ARRAY[(n - 1)::text])::numeric;
  END IF;
  i0 := floor(t)::int;
  IF i0 < 0 THEN
    i0 := 0;
  END IF;
  IF i0 > n - 2 THEN
    i0 := n - 2;
  END IF;
  i1 := i0 + 1;
  y0 := (p_samples #>> ARRAY[i0::text])::numeric;
  y1 := (p_samples #>> ARRAY[i1::text])::numeric;
  RETURN y0 + (y1 - y0) * (t - i0::numeric);
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_clamp_tanks_on_terrain(p_pub jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_samples jsonb;
  v_map_w numeric;
  v_tanks jsonb;
  i int;
  n int;
  tx numeric;
  ty numeric;
  surf numeric;
  out jsonb := '[]'::jsonb;
  rec jsonb;
BEGIN
  v_samples := p_pub -> 'samples';
  v_map_w := coalesce((p_pub ->> 'mapW')::numeric, 960);
  v_tanks := coalesce(p_pub -> 'tanks', '[]'::jsonb);
  IF jsonb_typeof(v_tanks) <> 'array' THEN
    RETURN p_pub;
  END IF;
  n := jsonb_array_length(v_tanks);
  IF n IS NULL OR n <= 0 THEN
    RETURN p_pub;
  END IF;
  FOR i IN 0..(n - 1) LOOP
    rec := v_tanks -> i;
    EXIT WHEN rec IS NULL;
    tx := coalesce((rec ->> 'x')::numeric, 0);
    surf := public._ov2_tanks_terrain_y(v_samples, v_map_w, tx);
    ty := surf - 22::numeric;
    out := out || jsonb_build_array(
      jsonb_build_object(
        'seat', (rec ->> 'seat')::int,
        'x', tx,
        'y', ty
      )
    );
  END LOOP;
  RETURN jsonb_set(p_pub, '{tanks}', out, true);
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_apply_crater(p_pub jsonb, hit_x numeric, hit_r numeric, hit_depth numeric)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  samples jsonb;
  map_w numeric;
  n int;
  i int;
  xi numeric;
  dist numeric;
  delta numeric;
  yi numeric;
BEGIN
  samples := p_pub -> 'samples';
  map_w := coalesce((p_pub ->> 'mapW')::numeric, 960);
  IF samples IS NULL OR jsonb_typeof(samples) <> 'array' OR hit_r IS NULL OR hit_r <= 0 OR hit_depth IS NULL OR hit_depth <= 0 THEN
    RETURN p_pub;
  END IF;
  n := jsonb_array_length(samples);
  IF n IS NULL OR n < 2 THEN
    RETURN p_pub;
  END IF;
  FOR i IN 0..(n - 1) LOOP
    xi := (i::numeric / (n - 1)::numeric) * map_w;
    dist := abs(xi - hit_x);
    IF dist < hit_r THEN
      delta := (1::numeric - dist / hit_r) * hit_depth;
      yi := (samples #>> ARRAY[i::text])::numeric;
      samples := jsonb_set(samples, ARRAY[i::text], to_jsonb(yi + delta), true);
    END IF;
  END LOOP;
  RETURN jsonb_set(p_pub, '{samples}', samples, true);
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_sim_shot(
  p_pub jsonb,
  p_shooter_seat int,
  p_weapon text,
  p_angle_deg numeric,
  p_power numeric
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  map_w numeric := coalesce((p_pub ->> 'mapW')::numeric, 960);
  map_h numeric := coalesce((p_pub ->> 'mapH')::numeric, 540);
  samples jsonb := p_pub -> 'samples';
  tanks jsonb := coalesce(p_pub -> 'tanks', '[]'::jsonb);
  t0 jsonb;
  t1 jsonb;
  sx numeric;
  sy numeric;
  ox numeric;
  oy numeric;
  a numeric;
  sp numeric;
  vx numeric;
  vy numeric;
  px numeric;
  py numeric;
  g numeric := 880::numeric;
  dt numeric := 0.016::numeric;
  step int;
  ty numeric;
  d0 numeric;
  d1 numeric;
  opp int;
  self jsonb;
  opp_t jsonb;
  barrel int := 8;
  tr numeric := 30::numeric;
  w text := lower(trim(coalesce(p_weapon, '')));
  splash_r numeric := 0::numeric;
  crater_r numeric := 10::numeric;
  crater_d numeric := 10::numeric;
BEGIN
  IF p_shooter_seat NOT IN (0, 1) THEN
    RETURN jsonb_build_object('kind', 'oob');
  END IF;
  opp := 1 - p_shooter_seat;
  t0 := tanks -> 0;
  t1 := tanks -> 1;
  IF t0 IS NULL OR t1 IS NULL THEN
    RETURN jsonb_build_object('kind', 'oob');
  END IF;
  IF p_shooter_seat = 0 THEN
    self := t0;
    opp_t := t1;
  ELSE
    self := t1;
    opp_t := t0;
  END IF;
  sx := coalesce((self ->> 'x')::numeric, 0);
  sy := coalesce((self ->> 'y')::numeric, 0);
  a := radians(p_angle_deg);
  sp := (greatest(10::numeric, least(100::numeric, p_power)) / 100::numeric) * 780::numeric;
  vx := cos(a) * sp;
  vy := -sin(a) * sp;
  px := sx + cos(a) * 34::numeric;
  py := sy - sin(a) * 34::numeric;

  IF w = 'iron' THEN
    splash_r := 0::numeric;
    crater_r := 9::numeric;
    crater_d := 9::numeric;
  ELSIF w = 'he' THEN
    splash_r := 52::numeric;
    crater_r := 18::numeric;
    crater_d := 16::numeric;
  ELSIF w = 'burrower' THEN
    splash_r := 0::numeric;
    crater_r := 26::numeric;
    crater_d := 22::numeric;
  ELSIF w = 'finisher' THEN
    splash_r := 44::numeric;
    crater_r := 15::numeric;
    crater_d := 18::numeric;
  ELSE
    RETURN jsonb_build_object('kind', 'oob');
  END IF;

  FOR step IN 1..260 LOOP
    px := px + vx * dt;
    py := py + vy * dt;
    vy := vy + g * dt;

    IF px < 0::numeric OR px > map_w OR py < -260::numeric OR py > map_h + 120::numeric THEN
      RETURN jsonb_build_object('kind', 'oob');
    END IF;

    ox := coalesce((opp_t ->> 'x')::numeric, 0);
    oy := coalesce((opp_t ->> 'y')::numeric, 0);
    d1 := sqrt((px - ox) * (px - ox) + (py - oy) * (py - oy));
    IF step > barrel AND d1 < tr THEN
      RETURN jsonb_build_object('kind', 'tank_direct', 'hitSeat', opp, 'x', px, 'y', py, 'splashR', splash_r, 'craterR', crater_r, 'craterD', crater_d);
    END IF;

    IF step > barrel THEN
      ox := coalesce((self ->> 'x')::numeric, 0);
      oy := coalesce((self ->> 'y')::numeric, 0);
      d0 := sqrt((px - ox) * (px - ox) + (py - oy) * (py - oy));
      IF d0 < tr THEN
        RETURN jsonb_build_object('kind', 'tank_direct', 'hitSeat', p_shooter_seat, 'x', px, 'y', py, 'splashR', splash_r, 'craterR', crater_r, 'craterD', crater_d);
      END IF;
    END IF;

    ty := public._ov2_tanks_terrain_y(samples, map_w, px);
    IF py >= ty THEN
      RETURN jsonb_build_object('kind', 'terrain', 'x', px, 'y', ty, 'splashR', splash_r, 'craterR', crater_r, 'craterD', crater_d);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('kind', 'oob');
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_weapon_direct_damage(p_weapon text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(p_weapon, '')))
    WHEN 'iron' THEN 15
    WHEN 'he' THEN 22
    WHEN 'burrower' THEN 12
    WHEN 'finisher' THEN 38
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_weapon_splash_max(p_weapon text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(trim(coalesce(p_weapon, '')))
    WHEN 'iron' THEN 0
    WHEN 'he' THEN 14
    WHEN 'burrower' THEN 0
    WHEN 'finisher' THEN 18
    ELSE 0
  END;
$$;

-- V1: no draws — second mover (non–first-mover seat) wins HP ties at turn cap.
CREATE OR REPLACE FUNCTION public._ov2_tanks_second_mover_seat(p_ps jsonb)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN trim(coalesce(p_ps ->> 'firstMoverKey', '')) = trim(coalesce(p_ps -> 'participants' ->> 1, ''))
    THEN 0::int
    ELSE 1::int
  END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_tanks_finish_session(
  p_session_id uuid,
  p_winner_seat int,
  p_ps jsonb,
  p_reason text,
  p_forfeit boolean,
  p_revision bigint,
  p_pub jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ps jsonb := p_ps;
  v_ws int := p_winner_seat;
BEGIN
  IF v_ws IS NULL OR v_ws NOT IN (0, 1) THEN
    v_ws := public._ov2_tanks_second_mover_seat(v_ps);
  END IF;
  v_ps := v_ps || jsonb_build_object(
    'matchEnd',
    jsonb_build_object(
      'reason', coalesce(p_reason, 'unknown'),
      'forfeit', coalesce(p_forfeit, false),
      'at', (extract(epoch from clock_timestamp()) * 1000)::bigint
    )
  );
  UPDATE public.ov2_tanks_sessions
  SET
    phase = 'finished',
    winner_seat = v_ws,
    public_state = CASE WHEN p_pub IS NOT NULL THEN p_pub ELSE public_state END,
    parity_state = v_ps,
    revision = p_revision + 1,
    updated_at = now()
  WHERE id = p_session_id;
END;
$$;

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
    v_dl := coalesce((v_ps ->> 'turnDeadlineMs')::bigint, v_now + 1);
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
    v_strike := coalesce((v_ts ->> v_seat)::int, 0) + 1;
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

CREATE OR REPLACE FUNCTION public.ov2_tanks_voluntary_forfeit(p_room_id uuid, p_participant_key text)
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
  v_other int;
  v_ps jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  SELECT seat_index INTO v_seat FROM public.ov2_tanks_seats WHERE session_id = v_sess.id AND participant_key = v_pk LIMIT 1;
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'Not seated in tanks session');
  END IF;
  v_other := 1 - v_seat;
  v_ps := coalesce(v_sess.parity_state, '{}'::jsonb);
  PERFORM public._ov2_tanks_finish_session(v_sess.id, v_other, v_ps, 'voluntary_forfeit', true, v_sess.revision, NULL);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_ping(p_room_id uuid, p_participant_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tanks_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' OR v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ov2_tanks_seats s WHERE s.session_id = v_sess.id AND s.participant_key = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not in session');
  END IF;
  PERFORM public._ov2_tanks_advance_timeouts(v_sess.id);
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
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
  IF v_now > coalesce((v_ps ->> 'turnDeadlineMs')::bigint, v_now + 1) THEN
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
  v_dead := coalesce((v_ps ->> 'turnDeadlineMs')::bigint, v_now);
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
    'parity', v_ps
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_open_session(
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
  v_sess public.ov2_tanks_sessions%ROWTYPE;
  v_existing public.ov2_tanks_sessions%ROWTYPE;
  v_seated int;
  v_now bigint;
  v_pub jsonb;
  v_ps jsonb;
  v_samples jsonb;
  v_seed bigint;
  v_pk0 text;
  v_pk1 text;
  map_w numeric := 960::numeric;
  x0 numeric;
  x1 numeric;
  y0 numeric;
  y1 numeric;
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
  IF v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not a Tanks room');
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
    FROM public.ov2_tanks_sessions
    WHERE id = v_room.active_session_id AND room_id = p_room_id;
    IF FOUND AND v_existing.status = 'live' AND v_existing.phase = 'playing' THEN
      RETURN jsonb_build_object(
        'ok', true,
        'idempotent', true,
        'snapshot', public.ov2_tanks_build_client_snapshot(v_existing, v_pk)
      );
    END IF;
  END IF;

  SELECT count(*)::int INTO v_seated
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL;
  IF v_seated <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEAT_COUNT', 'message', 'Tanks V1 needs exactly two seated players');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'STAKES_NOT_COMMITTED', 'message', 'All seated players must commit stakes');
  END IF;

  v_seed := (extract(epoch from clock_timestamp()) * 1000)::bigint % 2000000000;
  SELECT coalesce(
    jsonb_agg(round((280 + 55 * sin((i / 64.0) * pi() + (v_seed % 997) / 250.0))::numeric, 2) ORDER BY i),
    '[]'::jsonb
  )
  INTO v_samples
  FROM generate_series(0, 64) AS g(i);

  v_pub := jsonb_build_object(
    'terrainSeed', v_seed,
    'mapW', map_w,
    'mapH', 540,
    'samples', v_samples
  );

  x0 := map_w * 0.25;
  x1 := map_w * 0.75;
  y0 := public._ov2_tanks_terrain_y(v_samples, map_w, x0) - 22::numeric;
  y1 := public._ov2_tanks_terrain_y(v_samples, map_w, x1) - 22::numeric;
  v_pub := v_pub || jsonb_build_object(
    'tanks',
    jsonb_build_array(
      jsonb_build_object('seat', 0, 'x', x0, 'y', y0),
      jsonb_build_object('seat', 1, 'x', x1, 'y', y1)
    )
  );

  SELECT trim(m.participant_key) INTO v_pk0
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index = 0
  LIMIT 1;
  SELECT trim(m.participant_key) INTO v_pk1
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index = 1
  LIMIT 1;

  IF v_pk0 IS NULL OR length(v_pk0) = 0 OR v_pk1 IS NULL OR length(v_pk1) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_SEATS', 'message', 'Seat 0 and seat 1 must be occupied');
  END IF;

  v_now := (extract(epoch from clock_timestamp()) * 1000)::bigint;

  v_ps := jsonb_build_object(
    'rulesVersion', 'tanks_v1',
    'turnIndex', 1,
    'completedTurns', 0,
    'maxCompletedTurns', 60,
    'firstMoverKey', v_pk0,
    'activeParticipantKey', v_pk0,
    'turnStartedMs', v_now,
    'turnDeadlineMs', v_now + 30000,
    'participants', jsonb_build_array(v_pk0, v_pk1),
    'hp', jsonb_build_array(80, 80),
    'timeoutStrikes', jsonb_build_array(0, 0),
    'chargesSeat', jsonb_build_array(
      jsonb_build_object('iron', -1, 'he', 6, 'burrower', 3, 'finisher', 1),
      jsonb_build_object('iron', -1, 'he', 6, 'burrower', 3, 'finisher', 1)
    )
  );

  INSERT INTO public.ov2_tanks_sessions (
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
    v_pub,
    v_ps
  )
  RETURNING * INTO v_sess;

  INSERT INTO public.ov2_tanks_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess.id,
    m.seat_index::int,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess.id, active_runtime_id = v_sess.id, updated_at = now()
  WHERE id = p_room_id;

  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_sess.id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_tanks_get_snapshot(
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
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_sess public.ov2_tanks_sessions%ROWTYPE;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_tanks' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ov2_tanks_seats s WHERE s.session_id = v_sess.id AND s.participant_key = v_pk) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Not in session');
  END IF;
  PERFORM public._ov2_tanks_advance_timeouts(v_sess.id);
  SELECT * INTO v_sess FROM public.ov2_tanks_sessions WHERE id = v_room.active_session_id AND room_id = p_room_id;
  RETURN jsonb_build_object('ok', true, 'snapshot', public.ov2_tanks_build_client_snapshot(v_sess, v_pk));
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_tanks_terrain_y(jsonb, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_clamp_tanks_on_terrain(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_apply_crater(jsonb, numeric, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_sim_shot(jsonb, int, text, numeric, numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_weapon_direct_damage(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_weapon_splash_max(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_second_mover_seat(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_finish_session(uuid, int, jsonb, text, boolean, bigint, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_tanks_advance_timeouts(uuid) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.ov2_tanks_build_client_snapshot(public.ov2_tanks_sessions, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_build_client_snapshot(public.ov2_tanks_sessions, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_open_session(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_open_session(uuid, text, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_get_snapshot(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_get_snapshot(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_fire(uuid, text, text, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_fire(uuid, text, text, numeric, numeric) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_ping(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_ping(uuid, text) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_tanks_voluntary_forfeit(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_tanks_voluntary_forfeit(uuid, text) TO anon, authenticated, service_role;

COMMIT;
