-- OV2 Orbit Trap: deterministic engine helpers in PL/pgSQL (mirrors lib/online-v2/orbit-trap/ov2OrbitTrapEngine.js).
-- Apply after orbit-trap/159_ov2_orbit_trap_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public._ot_key(p_ring text, p_slot int)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(COALESCE(p_ring, '')) || ':' || (p_slot::text);
$$;

CREATE OR REPLACE FUNCTION public._ot_parse_key(p_k text, OUT o_ring text, OUT o_slot int)
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  o_ring := split_part(p_k, ':', 1);
  o_slot := (split_part(p_k, ':', 2))::int;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_neighbor_keys(p_k text)
RETURNS SETOF text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  r text;
  s int;
BEGIN
  r := split_part(p_k, ':', 1);
  s := (split_part(p_k, ':', 2))::int;
  IF r = 'core' THEN
    RETURN;
  ELSIF r = 'outer' THEN
    RETURN NEXT public._ot_key('outer', (s + 1) % 8);
    RETURN NEXT public._ot_key('outer', (s - 1 + 8) % 8);
    IF s IN (1, 4, 6) THEN
      RETURN NEXT public._ot_key('mid', s);
    END IF;
  ELSIF r = 'mid' THEN
    RETURN NEXT public._ot_key('mid', (s + 1) % 8);
    RETURN NEXT public._ot_key('mid', (s - 1 + 8) % 8);
    IF s IN (1, 4, 6) THEN
      RETURN NEXT public._ot_key('outer', s);
    END IF;
    IF s IN (0, 3, 5) THEN
      RETURN NEXT public._ot_key('inner', s);
    END IF;
  ELSIF r = 'inner' THEN
    RETURN NEXT public._ot_key('inner', (s + 1) % 8);
    RETURN NEXT public._ot_key('inner', (s - 1 + 8) % 8);
    IF s IN (0, 3, 5) THEN
      RETURN NEXT public._ot_key('mid', s);
    END IF;
    RETURN NEXT public._ot_key('core', 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_occupant_seat(p_state jsonb, p_ring text, p_slot int, p_except int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int;
  pr jsonb;
BEGIN
  FOR i IN 0..3 LOOP
    IF i = p_except THEN
      CONTINUE;
    END IF;
    pr := p_state->'players'->i;
    IF pr IS NULL THEN
      CONTINUE;
    END IF;
    IF (pr->>'ring') = p_ring AND (pr->>'slot')::int = p_slot THEN
      RETURN i;
    END IF;
  END LOOP;
  RETURN -1;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_bump_push_valid(p_state jsonb, p_def int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  pr jsonb;
  r text;
  s int;
  ps int;
BEGIN
  pr := p_state->'players'->p_def;
  r := pr->>'ring';
  IF r = 'core' THEN
    RETURN false;
  END IF;
  s := (pr->>'slot')::int;
  ps := (s + 1) % 8;
  RETURN public._ot_occupant_seat(p_state, r, ps, p_def) < 0;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_effective_move_budget(p_player jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_heavy boolean;
BEGIN
  IF COALESCE((p_player->>'stunActive')::boolean, false) THEN
    RETURN 1;
  END IF;
  IF COALESCE((p_player->>'trapSlowPending')::boolean, false)
     AND COALESCE((p_player->>'boostPending')::boolean, false) THEN
    RETURN 1;
  END IF;
  IF COALESCE((p_player->>'trapSlowPending')::boolean, false) THEN
    RETURN 1;
  END IF;
  v_heavy := COALESCE((p_player->>'orbsHeld')::int, 0) >= 2;
  IF COALESCE((p_player->>'boostPending')::boolean, false) THEN
    IF v_heavy THEN
      RETURN 2;
    END IF;
    RETURN 3;
  END IF;
  IF v_heavy THEN
    RETURN 1;
  END IF;
  RETURN 2;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_can_rotate(p_player jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NOT COALESCE((p_player->>'stunActive')::boolean, false)
    AND COALESCE((p_player->>'orbsHeld')::int, 0) < 2;
$$;

CREATE OR REPLACE FUNCTION public._ot_is_ring_locked(p_state jsonb, p_ring text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  lk jsonb;
BEGIN
  lk := p_state->'ringLock';
  IF lk IS NULL OR jsonb_typeof(lk) <> 'object' THEN
    RETURN false;
  END IF;
  RETURN (lk->>'ring') IS NOT DISTINCT FROM p_ring;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_cell_is_trap(p_k text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_k IN ('outer:3', 'mid:7');
$$;

CREATE OR REPLACE FUNCTION public._ot_cell_is_boost(p_k text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_k IN ('outer:7', 'inner:2');
$$;

CREATE OR REPLACE FUNCTION public._ot_cell_is_lock_slot(p_k text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_k IN ('mid:1', 'inner:4');
$$;

CREATE OR REPLACE FUNCTION public._ot_bfs_distances(
  p_state jsonb,
  p_actor int,
  p_budget int,
  p_orbs_start int,
  p_started_inner boolean
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  p jsonb;
  v_start text;
  v_dist jsonb := '{}'::jsonb;
  v_q text[] := ARRAY[]::text[];
  v_head int := 1;
  v_cur text;
  v_d int;
  v_nb text;
  v_nr text;
  v_ns int;
  v_nd int;
  v_occ int;
BEGIN
  p := p_state->'players'->p_actor;
  v_start := public._ot_key(p->>'ring', (p->>'slot')::int);
  v_dist := jsonb_build_object(v_start, 0);
  v_q := array_append(v_q, v_start);

  WHILE v_head <= COALESCE(array_length(v_q, 1), 0) LOOP
    v_cur := v_q[v_head];
    v_head := v_head + 1;
    v_d := COALESCE((v_dist->>v_cur)::int, 0);
    IF v_d >= p_budget THEN
      CONTINUE;
    END IF;

    FOR v_nb IN
      SELECT x
      FROM public._ot_neighbor_keys(v_cur) AS t(x)
    LOOP
      SELECT * INTO v_nr, v_ns FROM public._ot_parse_key(v_nb);
      v_nd := v_d + 1;
      IF v_nd > p_budget THEN
        CONTINUE;
      END IF;

      IF v_nr = 'core' THEN
        IF p_orbs_start < 2 OR NOT p_started_inner THEN
          CONTINUE;
        END IF;
      END IF;

      v_occ := public._ot_occupant_seat(p_state, v_nr, v_ns, p_actor);
      IF v_occ >= 0 THEN
        IF NOT (v_dist ? v_nb) OR v_nd < COALESCE((v_dist->>v_nb)::int, 999999) THEN
          v_dist := v_dist || jsonb_build_object(v_nb, v_nd);
        END IF;
        CONTINUE;
      END IF;

      IF NOT (v_dist ? v_nb) OR v_nd < COALESCE((v_dist->>v_nb)::int, 999999) THEN
        v_dist := v_dist || jsonb_build_object(v_nb, v_nd);
        v_q := array_append(v_q, v_nb);
      END IF;
    END LOOP;
  END LOOP;

  RETURN v_dist;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_has_legal_path(
  p_state jsonb,
  p_actor int,
  p_to_ring text,
  p_to_slot int,
  p_budget int
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  p jsonb;
  v_dest text;
  v_steps int;
  v_dist jsonb;
BEGIN
  p := p_state->'players'->p_actor;
  v_dest := public._ot_key(p_to_ring, p_to_slot);
  v_dist := public._ot_bfs_distances(
    p_state,
    p_actor,
    p_budget,
    COALESCE((p->>'orbsHeld')::int, 0),
    COALESCE((p_state->>'startedTurnOnInner')::boolean, false)
  );
  IF NOT (v_dist ? v_dest) THEN
    RETURN false;
  END IF;
  v_steps := (v_dist->>v_dest)::int;
  RETURN v_steps >= 1 AND v_steps <= p_budget;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_initial_state_jsonb()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'revision', 0,
    'phase', 'playing',
    'turnSeat', 0,
    'winnerSeat', NULL,
    'players', jsonb_build_array(
      jsonb_build_object(
        'ring', 'outer', 'slot', 0, 'orbsHeld', 0, 'lockToken', false,
        'stunActive', false, 'trapSlowPending', false, 'boostPending', false
      ),
      jsonb_build_object(
        'ring', 'outer', 'slot', 2, 'orbsHeld', 0, 'lockToken', false,
        'stunActive', false, 'trapSlowPending', false, 'boostPending', false
      ),
      jsonb_build_object(
        'ring', 'outer', 'slot', 4, 'orbsHeld', 0, 'lockToken', false,
        'stunActive', false, 'trapSlowPending', false, 'boostPending', false
      ),
      jsonb_build_object(
        'ring', 'outer', 'slot', 6, 'orbsHeld', 0, 'lockToken', false,
        'stunActive', false, 'trapSlowPending', false, 'boostPending', false
      )
    ),
    'looseOrbs', '[]'::jsonb,
    'fixedOrbKeys', jsonb_build_array('outer:5', 'mid:2', 'inner:6'),
    'ringLock', NULL,
    'startedTurnOnInner', false
  );
$$;

CREATE OR REPLACE FUNCTION public._ot_advance_turn(st jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_prev int;
  v_next int;
  v_lock jsonb;
  v_nr text;
BEGIN
  v_prev := (st->>'turnSeat')::int;
  IF COALESCE((st->'players'->v_prev->>'stunActive')::boolean, false) THEN
    st := jsonb_set(st, ARRAY['players', v_prev::text, 'stunActive'], 'false'::jsonb, true);
  END IF;
  v_next := (v_prev + 1) % 4;
  st := jsonb_set(st, '{turnSeat}', to_jsonb(v_next), true);

  v_lock := st->'ringLock';
  IF v_lock IS NOT NULL AND jsonb_typeof(v_lock) = 'object' THEN
    IF (v_lock->>'ownerSeat')::int IS NOT DISTINCT FROM v_next THEN
      st := jsonb_set(st, '{ringLock}', 'null'::jsonb, true);
    END IF;
  END IF;

  v_nr := st #>> ARRAY['players', v_next::text, 'ring'];
  st := jsonb_set(st, '{startedTurnOnInner}', to_jsonb(v_nr = 'inner'), true);
  RETURN st;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_clear_consumed_move_modifiers(st jsonb, mover int, had_trap boolean, had_boost boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
BEGIN
  IF had_trap AND had_boost THEN
    st := jsonb_set(st, ARRAY['players', mover::text, 'trapSlowPending'], 'false'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', mover::text, 'boostPending'], 'false'::jsonb, true);
  ELSE
    IF had_trap THEN
      st := jsonb_set(st, ARRAY['players', mover::text, 'trapSlowPending'], 'false'::jsonb, true);
    END IF;
    IF had_boost THEN
      st := jsonb_set(st, ARRAY['players', mover::text, 'boostPending'], 'false'::jsonb, true);
    END IF;
  END IF;
  RETURN st;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_rotate_slot(p_ring text, p_slot int, p_dir int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_ring = 'core' THEN
    RETURN p_slot;
  END IF;
  RETURN (p_slot + p_dir + 64) % 8;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_apply_ring_rotation(st jsonb, p_ring text, p_dir int)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  i int;
  pr jsonb;
  v_ns int;
  v_lo jsonb;
  v_new_lo jsonb := '[]'::jsonb;
  v_elem jsonb;
  v_fixed jsonb;
  v_new_fixed jsonb := '[]'::jsonb;
  v_fk text;
  v_fr text;
  v_fs int;
BEGIN
  FOR i IN 0..3 LOOP
    pr := st->'players'->i;
    IF (pr->>'ring') = p_ring THEN
      v_ns := public._ot_rotate_slot(p_ring, (pr->>'slot')::int, p_dir);
      pr := jsonb_set(pr, '{slot}', to_jsonb(v_ns), true);
      st := jsonb_set(st, ARRAY['players', i::text], pr, true);
    END IF;
  END LOOP;

  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(st->'looseOrbs', '[]'::jsonb)) AS t(value)
  LOOP
    IF (v_elem->>'ring') = p_ring THEN
      v_ns := public._ot_rotate_slot(p_ring, (v_elem->>'slot')::int, p_dir);
      v_lo := jsonb_set(v_elem, '{slot}', to_jsonb(v_ns), true);
    ELSE
      v_lo := v_elem;
    END IF;
    v_new_lo := v_new_lo || jsonb_build_array(v_lo);
  END LOOP;
  st := jsonb_set(st, '{looseOrbs}', v_new_lo, true);

  FOR v_fk IN
    SELECT value
    FROM jsonb_array_elements_text(COALESCE(st->'fixedOrbKeys', '[]'::jsonb)) AS t(value)
  LOOP
    SELECT * INTO v_fr, v_fs FROM public._ot_parse_key(v_fk);
    IF v_fr = p_ring THEN
      v_fk := public._ot_key(v_fr, public._ot_rotate_slot(p_ring, v_fs, p_dir));
    END IF;
    v_new_fixed := v_new_fixed || to_jsonb(v_fk);
  END LOOP;
  st := jsonb_set(st, '{fixedOrbKeys}', v_new_fixed, true);
  RETURN st;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_try_apply_action(p_state jsonb, p_seat int, p_action jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  st jsonb;
  typ text;
  v_phase text;
  v_turn int;
  p jsonb;
  budget int;
  occ_pre int;
  had_trap boolean;
  had_boost boolean;
  v_ring text;
  v_dir int;
  v_to_ring text;
  v_to_slot int;
  v_k text;
  def jsonb;
  atk jsonb;
  v_pick int;
  v_new_loose jsonb;
  v_elem jsonb;
  v_fixed jsonb;
  v_new_fixed jsonb;
  v_fk text;
  v_won boolean;
  v_started_inner boolean;
  v_loose_on_cell int;
  v_add int;
BEGIN
  typ := lower(trim(COALESCE(p_action->>'type', '')));
  st := p_state;
  v_phase := COALESCE(st->>'phase', 'playing');
  v_turn := (st->>'turnSeat')::int;

  IF v_phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_playing');
  END IF;

  IF p_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_your_turn');
  END IF;

  p := st->'players'->p_seat;

  IF typ = 'rotate' THEN
    v_ring := trim(COALESCE(p_action->>'ring', ''));
    v_dir := COALESCE((p_action->>'dir')::int, 0);
    IF v_ring = 'core' OR v_ring NOT IN ('outer', 'mid', 'inner') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'bad_ring');
    END IF;
    IF v_dir NOT IN (1, -1) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'bad_dir');
    END IF;
    IF NOT public._ot_can_rotate(p) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'cannot_rotate');
    END IF;
    IF public._ot_is_ring_locked(st, v_ring) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'ring_locked');
    END IF;
    had_trap := COALESCE((p->>'trapSlowPending')::boolean, false);
    had_boost := COALESCE((p->>'boostPending')::boolean, false);
    st := public._ot_apply_ring_rotation(st, v_ring, v_dir);
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
    st := jsonb_set(st, '{revision}', to_jsonb((COALESCE((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF typ = 'lock' THEN
    v_ring := trim(COALESCE(p_action->>'ring', ''));
    IF v_ring = 'core' OR v_ring NOT IN ('outer', 'mid', 'inner') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'bad_ring');
    END IF;
    IF COALESCE((p->>'stunActive')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'stunned_no_lock');
    END IF;
    IF NOT COALESCE((p->>'lockToken')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'no_lock_token');
    END IF;
    had_trap := COALESCE((p->>'trapSlowPending')::boolean, false);
    had_boost := COALESCE((p->>'boostPending')::boolean, false);
    st := jsonb_set(st, ARRAY['players', p_seat::text, 'lockToken'], 'false'::jsonb, true);
    st := jsonb_set(st, '{ringLock}', jsonb_build_object('ring', v_ring, 'ownerSeat', p_seat), true);
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
    st := jsonb_set(st, '{revision}', to_jsonb((COALESCE((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF typ <> 'move' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_action');
  END IF;

  v_to_ring := trim(COALESCE(p_action->>'toRing', ''));
  v_to_slot := COALESCE((p_action->>'toSlot')::int, -1);
  IF v_to_ring NOT IN ('outer', 'mid', 'inner', 'core') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_ring');
  END IF;
  IF v_to_ring = 'core' AND v_to_slot IS DISTINCT FROM 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_core');
  END IF;
  IF v_to_ring <> 'core' AND (v_to_slot < 0 OR v_to_slot > 7) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_slot');
  END IF;

  budget := public._ot_effective_move_budget(p);
  occ_pre := public._ot_occupant_seat(st, v_to_ring, v_to_slot, p_seat);
  IF NOT public._ot_has_legal_path(st, p_seat, v_to_ring, v_to_slot, budget) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'no_legal_path');
  END IF;

  v_started_inner := COALESCE((st->>'startedTurnOnInner')::boolean, false);
  IF v_to_ring = 'core' THEN
    IF COALESCE((p->>'orbsHeld')::int, 0) < 2 OR NOT v_started_inner THEN
      RETURN jsonb_build_object('ok', false, 'code', 'core_entry_denied');
    END IF;
  END IF;

  had_trap := COALESCE((p->>'trapSlowPending')::boolean, false);
  had_boost := COALESCE((p->>'boostPending')::boolean, false);

  IF occ_pre >= 0 AND NOT public._ot_bump_push_valid(st, occ_pre) THEN
    def := st->'players'->occ_pre;
    IF COALESCE((def->>'orbsHeld')::int, 0) > 0 THEN
      def := jsonb_set(def, '{orbsHeld}', to_jsonb((COALESCE((def->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        COALESCE(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('ring', def->>'ring', 'slot', (def->>'slot')::int)
        ),
        true
      );
    END IF;
    def := st->'players'->occ_pre;
    def := jsonb_set(def, '{stunActive}', 'true'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
    st := jsonb_set(st, '{revision}', to_jsonb((COALESCE((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF occ_pre >= 0 AND public._ot_bump_push_valid(st, occ_pre) THEN
    def := st->'players'->occ_pre;
    IF COALESCE((def->>'orbsHeld')::int, 0) > 0 THEN
      def := jsonb_set(def, '{orbsHeld}', to_jsonb((COALESCE((def->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        COALESCE(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(
          jsonb_build_object('ring', def->>'ring', 'slot', (def->>'slot')::int)
        ),
        true
      );
    END IF;
    def := st->'players'->occ_pre;
    def := jsonb_set(def, '{slot}', to_jsonb(((def->>'slot')::int + 1) % 8), true);
    st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
  END IF;

  atk := st->'players'->p_seat;
  atk := jsonb_set(atk, '{ring}', to_jsonb(v_to_ring), true);
  atk := jsonb_set(atk, '{slot}', to_jsonb(v_to_slot), true);
  st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);

  v_k := public._ot_key(v_to_ring, v_to_slot);
  atk := st->'players'->p_seat;
  SELECT count(*)::int
  INTO v_loose_on_cell
  FROM jsonb_array_elements(COALESCE(st->'looseOrbs', '[]'::jsonb)) e
  WHERE (e->>'ring') = v_to_ring AND (e->>'slot')::int = v_to_slot;

  v_add := least(
    COALESCE(v_loose_on_cell, 0),
    greatest(0, 2 - COALESCE((atk->>'orbsHeld')::int, 0))
  );
  IF v_add > 0 THEN
    atk := jsonb_set(atk, '{orbsHeld}', to_jsonb(COALESCE((atk->>'orbsHeld')::int, 0) + v_add), true);
  END IF;

  v_new_loose := '[]'::jsonb;
  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(st->'looseOrbs', '[]'::jsonb)) AS t(value)
  LOOP
    IF (v_elem->>'ring') = v_to_ring AND (v_elem->>'slot')::int = v_to_slot THEN
      CONTINUE;
    END IF;
    v_new_loose := v_new_loose || jsonb_build_array(v_elem);
  END LOOP;
  st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  st := jsonb_set(st, '{looseOrbs}', v_new_loose, true);

  atk := st->'players'->p_seat;
  IF COALESCE((atk->>'orbsHeld')::int, 0) < 2 THEN
    v_fixed := COALESCE(st->'fixedOrbKeys', '[]'::jsonb);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_fixed) fk WHERE fk = v_k) THEN
      atk := jsonb_set(atk, '{orbsHeld}', to_jsonb((COALESCE((atk->>'orbsHeld')::int, 0) + 1)), true);
      st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
      v_new_fixed := '[]'::jsonb;
      FOR v_fk IN
        SELECT value
        FROM jsonb_array_elements_text(v_fixed) AS t(value)
      LOOP
        IF v_fk IS DISTINCT FROM v_k THEN
          v_new_fixed := v_new_fixed || to_jsonb(v_fk);
        END IF;
      END LOOP;
      st := jsonb_set(st, '{fixedOrbKeys}', v_new_fixed, true);
    END IF;
  END IF;

  atk := st->'players'->p_seat;
  IF public._ot_cell_is_trap(v_k) THEN
    IF COALESCE((atk->>'orbsHeld')::int, 0) > 0 THEN
      atk := jsonb_set(atk, '{orbsHeld}', to_jsonb((COALESCE((atk->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        COALESCE(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ring', v_to_ring, 'slot', v_to_slot)),
        true
      );
    END IF;
    atk := st->'players'->p_seat;
    atk := jsonb_set(atk, '{trapSlowPending}', 'true'::jsonb, true);
    atk := jsonb_set(atk, '{boostPending}', 'false'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  ELSIF public._ot_cell_is_boost(v_k) THEN
    atk := st->'players'->p_seat;
    atk := jsonb_set(atk, '{boostPending}', 'true'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  END IF;

  atk := st->'players'->p_seat;
  IF public._ot_cell_is_lock_slot(v_k)
     AND NOT COALESCE((p_state->'players'->p_seat->>'lockToken')::boolean, false) THEN
    atk := jsonb_set(atk, '{lockToken}', 'true'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  END IF;

  atk := st->'players'->p_seat;
  v_won := v_to_ring = 'core' AND COALESCE((atk->>'orbsHeld')::int, 0) >= 2 AND v_started_inner;
  IF v_won THEN
    st := jsonb_set(st, '{phase}', '"finished"'::jsonb, true);
    st := jsonb_set(st, '{winnerSeat}', to_jsonb(p_seat), true);
  ELSE
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
  END IF;

  st := jsonb_set(st, '{revision}', to_jsonb((COALESCE((st->>'revision')::bigint, 0)) + 1), true);
  RETURN jsonb_build_object('ok', true, 'state', st);
END;
$$;

REVOKE ALL ON FUNCTION public._ot_key(text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_key(text, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_parse_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_parse_key(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_neighbor_keys(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_neighbor_keys(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_occupant_seat(jsonb, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_occupant_seat(jsonb, text, int, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_bump_push_valid(jsonb, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_bump_push_valid(jsonb, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_effective_move_budget(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_effective_move_budget(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_can_rotate(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_can_rotate(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_is_ring_locked(jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_is_ring_locked(jsonb, text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_cell_is_trap(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_cell_is_trap(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_cell_is_boost(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_cell_is_boost(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_cell_is_lock_slot(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_cell_is_lock_slot(text) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_bfs_distances(jsonb, int, int, int, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_bfs_distances(jsonb, int, int, int, boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_has_legal_path(jsonb, int, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_has_legal_path(jsonb, int, text, int, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_initial_state_jsonb() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_initial_state_jsonb() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_advance_turn(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_advance_turn(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_clear_consumed_move_modifiers(jsonb, int, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_clear_consumed_move_modifiers(jsonb, int, boolean, boolean) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_rotate_slot(text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_rotate_slot(text, int, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_apply_ring_rotation(jsonb, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_apply_ring_rotation(jsonb, text, int) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_try_apply_action(jsonb, int, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_try_apply_action(jsonb, int, jsonb) TO anon, authenticated, service_role;

COMMIT;
