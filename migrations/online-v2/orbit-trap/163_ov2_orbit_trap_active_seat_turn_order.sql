-- OV2 Orbit Trap: turn order + collisions respect session active seats (2–4 players).
-- Apply after orbit-trap/161_ov2_orbit_trap_session_rpcs.sql.
-- Replaces engine helpers and open_session / apply_action wiring.

BEGIN;

CREATE OR REPLACE FUNCTION public._ot_active_roster_from_state(st jsonb)
RETURNS int[]
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  r int[];
BEGIN
  IF st IS NULL OR NOT (st ? 'activeSeats') THEN
    RETURN ARRAY[0, 1, 2, 3];
  END IF;
  SELECT coalesce(array_agg(value::int ORDER BY ord), ARRAY[]::int[])
  INTO r
  FROM jsonb_array_elements_text(coalesce(st->'activeSeats', '[]'::jsonb)) WITH ORDINALITY AS t(value, ord);
  IF r IS NULL OR cardinality(r) < 2 THEN
    RETURN ARRAY[0, 1, 2, 3];
  END IF;
  RETURN r;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_normalize_state_roster(st jsonb, p_active int[])
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  s int;
  pr jsonb;
  in_play boolean;
BEGIN
  IF p_active IS NULL OR cardinality(p_active) < 2 THEN
    RETURN st;
  END IF;
  FOR s IN 0..3 LOOP
    in_play := s = ANY (p_active);
    pr := coalesce(st->'players'->s, '{}'::jsonb);
    pr := jsonb_set(pr, '{inPlay}', to_jsonb(in_play), true);
    IF NOT in_play THEN
      pr := jsonb_set(pr, '{ring}', '"outer"'::jsonb, true);
      pr := jsonb_set(pr, '{slot}', to_jsonb(0), true);
      pr := jsonb_set(pr, '{orbsHeld}', to_jsonb(0), true);
      pr := jsonb_set(pr, '{lockToken}', 'false'::jsonb, true);
      pr := jsonb_set(pr, '{stunActive}', 'false'::jsonb, true);
      pr := jsonb_set(pr, '{trapSlowPending}', 'false'::jsonb, true);
      pr := jsonb_set(pr, '{boostPending}', 'false'::jsonb, true);
    END IF;
    st := jsonb_set(st, ARRAY['players', s::text], pr, true);
  END LOOP;
  st := jsonb_set(st, '{activeSeats}', to_jsonb(p_active), true);
  IF NOT ((st->>'turnSeat')::int = ANY (p_active)) THEN
    st := jsonb_set(st, '{turnSeat}', to_jsonb(p_active[1]), true);
  END IF;
  RETURN st;
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_initial_state_jsonb(p_active int[])
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  players jsonb := '[]'::jsonb;
  s int;
  in_play boolean;
  slot0 int;
  slot1 int;
  slot2 int;
  slot3 int;
  first_turn int;
BEGIN
  IF p_active IS NULL OR cardinality(p_active) < 2 OR cardinality(p_active) > 4 THEN
    RAISE EXCEPTION 'invalid active seat count';
  END IF;
  slot0 := 0;
  slot1 := 2;
  slot2 := 4;
  slot3 := 6;
  FOR s IN 0..3 LOOP
    in_play := s = ANY (p_active);
    players :=
      players
      || jsonb_build_array(
        jsonb_build_object(
          'ring',
          'outer',
          'slot',
          CASE
            WHEN in_play THEN
              CASE s
                WHEN 0 THEN slot0
                WHEN 1 THEN slot1
                WHEN 2 THEN slot2
                ELSE slot3
              END
            ELSE 0
          END,
          'orbsHeld',
          0,
          'lockToken',
          false,
          'stunActive',
          false,
          'trapSlowPending',
          false,
          'boostPending',
          false,
          'inPlay',
          in_play
        )
      );
  END LOOP;
  first_turn := p_active[1];
  RETURN jsonb_build_object(
    'revision',
    0,
    'phase',
    'playing',
    'turnSeat',
    first_turn,
    'winnerSeat',
    NULL,
    'players',
    players,
    'looseOrbs',
    '[]'::jsonb,
    'fixedOrbKeys',
    jsonb_build_array('outer:5', 'mid:2', 'inner:6'),
    'ringLock',
    NULL,
    'startedTurnOnInner',
    false,
    'activeSeats',
    to_jsonb(p_active)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public._ot_initial_state_jsonb()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public._ot_initial_state_jsonb(ARRAY[0, 1, 2, 3]::int[]);
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
    IF COALESCE((pr->>'inPlay')::boolean, true) IS NOT TRUE THEN
      CONTINUE;
    END IF;
    IF (pr->>'ring') = p_ring AND (pr->>'slot')::int = p_slot THEN
      RETURN i;
    END IF;
  END LOOP;
  RETURN -1;
END;
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
  roster int[];
  n int;
  j int;
  v_found boolean;
BEGIN
  roster := public._ot_active_roster_from_state(st);
  n := cardinality(roster);
  IF n < 1 THEN
    roster := ARRAY[0, 1, 2, 3];
    n := 4;
  END IF;

  v_prev := (st->>'turnSeat')::int;
  IF COALESCE((st->'players'->v_prev->>'stunActive')::boolean, false) THEN
    st := jsonb_set(st, ARRAY['players', v_prev::text, 'stunActive'], 'false'::jsonb, true);
  END IF;

  v_next := roster[1];
  v_found := false;
  FOR j IN 1..n LOOP
    IF roster[j] = v_prev THEN
      v_next := roster[ CASE WHEN j = n THEN 1 ELSE j + 1 END ];
      v_found := true;
      EXIT;
    END IF;
  END LOOP;
  IF NOT v_found THEN
    v_next := roster[1];
  END IF;

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
    IF COALESCE((pr->>'inPlay')::boolean, true) IS NOT TRUE THEN
      CONTINUE;
    END IF;
    IF (pr->>'ring') = p_ring THEN
      v_ns := public._ot_rotate_slot(p_ring, (pr->>'slot')::int, p_dir);
      pr := jsonb_set(pr, '{slot}', to_jsonb(v_ns), true);
      st := jsonb_set(st, ARRAY['players', i::text], pr, true);
    END IF;
  END LOOP;

  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(coalesce(st->'looseOrbs', '[]'::jsonb)) AS t(value)
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
    FROM jsonb_array_elements_text(coalesce(st->'fixedOrbKeys', '[]'::jsonb)) AS t(value)
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
  roster int[];
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
  typ := lower(trim(coalesce(p_action->>'type', '')));
  st := p_state;
  v_phase := coalesce(st->>'phase', 'playing');
  v_turn := (st->>'turnSeat')::int;
  roster := public._ot_active_roster_from_state(st);

  IF NOT (p_seat = ANY (roster)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'inactive_seat');
  END IF;

  IF v_phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_playing');
  END IF;

  IF p_seat IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_your_turn');
  END IF;

  p := st->'players'->p_seat;

  IF typ = 'rotate' THEN
    v_ring := trim(coalesce(p_action->>'ring', ''));
    v_dir := coalesce((p_action->>'dir')::int, 0);
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
    had_trap := coalesce((p->>'trapSlowPending')::boolean, false);
    had_boost := coalesce((p->>'boostPending')::boolean, false);
    st := public._ot_apply_ring_rotation(st, v_ring, v_dir);
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
    st := jsonb_set(st, '{revision}', to_jsonb((coalesce((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF typ = 'lock' THEN
    v_ring := trim(coalesce(p_action->>'ring', ''));
    IF v_ring = 'core' OR v_ring NOT IN ('outer', 'mid', 'inner') THEN
      RETURN jsonb_build_object('ok', false, 'code', 'bad_ring');
    END IF;
    IF coalesce((p->>'stunActive')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'stunned_no_lock');
    END IF;
    IF NOT coalesce((p->>'lockToken')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'no_lock_token');
    END IF;
    had_trap := coalesce((p->>'trapSlowPending')::boolean, false);
    had_boost := coalesce((p->>'boostPending')::boolean, false);
    st := jsonb_set(st, ARRAY['players', p_seat::text, 'lockToken'], 'false'::jsonb, true);
    st := jsonb_set(st, '{ringLock}', jsonb_build_object('ring', v_ring, 'ownerSeat', p_seat), true);
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
    st := jsonb_set(st, '{revision}', to_jsonb((coalesce((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF typ <> 'move' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bad_action');
  END IF;

  v_to_ring := trim(coalesce(p_action->>'toRing', ''));
  v_to_slot := coalesce((p_action->>'toSlot')::int, -1);
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

  v_started_inner := coalesce((st->>'startedTurnOnInner')::boolean, false);
  IF v_to_ring = 'core' THEN
    IF coalesce((p->>'orbsHeld')::int, 0) < 2 OR NOT v_started_inner THEN
      RETURN jsonb_build_object('ok', false, 'code', 'core_entry_denied');
    END IF;
  END IF;

  had_trap := coalesce((p->>'trapSlowPending')::boolean, false);
  had_boost := coalesce((p->>'boostPending')::boolean, false);

  IF occ_pre >= 0 AND NOT public._ot_bump_push_valid(st, occ_pre) THEN
    def := st->'players'->occ_pre;
    IF coalesce((def->>'orbsHeld')::int, 0) > 0 THEN
      def := jsonb_set(def, '{orbsHeld}', to_jsonb((coalesce((def->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        coalesce(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(
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
    st := jsonb_set(st, '{revision}', to_jsonb((coalesce((st->>'revision')::bigint, 0)) + 1), true);
    RETURN jsonb_build_object('ok', true, 'state', st);
  END IF;

  IF occ_pre >= 0 AND public._ot_bump_push_valid(st, occ_pre) THEN
    def := st->'players'->occ_pre;
    IF coalesce((def->>'orbsHeld')::int, 0) > 0 THEN
      def := jsonb_set(def, '{orbsHeld}', to_jsonb((coalesce((def->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', occ_pre::text], def, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        coalesce(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(
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
  FROM jsonb_array_elements(coalesce(st->'looseOrbs', '[]'::jsonb)) e
  WHERE (e->>'ring') = v_to_ring AND (e->>'slot')::int = v_to_slot;

  v_add := least(
    coalesce(v_loose_on_cell, 0),
    greatest(0, 2 - coalesce((atk->>'orbsHeld')::int, 0))
  );
  IF v_add > 0 THEN
    atk := jsonb_set(atk, '{orbsHeld}', to_jsonb(coalesce((atk->>'orbsHeld')::int, 0) + v_add), true);
  END IF;

  v_new_loose := '[]'::jsonb;
  FOR v_elem IN
    SELECT value
    FROM jsonb_array_elements(coalesce(st->'looseOrbs', '[]'::jsonb)) AS t(value)
  LOOP
    IF (v_elem->>'ring') = v_to_ring AND (v_elem->>'slot')::int = v_to_slot THEN
      CONTINUE;
    END IF;
    v_new_loose := v_new_loose || jsonb_build_array(v_elem);
  END LOOP;
  st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  st := jsonb_set(st, '{looseOrbs}', v_new_loose, true);

  atk := st->'players'->p_seat;
  IF coalesce((atk->>'orbsHeld')::int, 0) < 2 THEN
    v_fixed := coalesce(st->'fixedOrbKeys', '[]'::jsonb);
    IF EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_fixed) fk WHERE fk = v_k) THEN
      atk := jsonb_set(atk, '{orbsHeld}', to_jsonb((coalesce((atk->>'orbsHeld')::int, 0) + 1)), true);
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
    IF coalesce((atk->>'orbsHeld')::int, 0) > 0 THEN
      atk := jsonb_set(atk, '{orbsHeld}', to_jsonb((coalesce((atk->>'orbsHeld')::int, 0) - 1)), true);
      st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
      st := jsonb_set(
        st,
        '{looseOrbs}',
        coalesce(st->'looseOrbs', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('ring', v_to_ring, 'slot', v_to_slot)),
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
     AND NOT coalesce((p_state->'players'->p_seat->>'lockToken')::boolean, false) THEN
    atk := jsonb_set(atk, '{lockToken}', 'true'::jsonb, true);
    st := jsonb_set(st, ARRAY['players', p_seat::text], atk, true);
  END IF;

  atk := st->'players'->p_seat;
  v_won := v_to_ring = 'core' AND coalesce((atk->>'orbsHeld')::int, 0) >= 2 AND v_started_inner;
  IF v_won THEN
    st := jsonb_set(st, '{phase}', '"finished"'::jsonb, true);
    st := jsonb_set(st, '{winnerSeat}', to_jsonb(p_seat), true);
  ELSE
    st := public._ot_advance_turn(st);
    st := public._ot_clear_consumed_move_modifiers(st, p_seat, had_trap, had_boost);
  END IF;

  st := jsonb_set(st, '{revision}', to_jsonb((coalesce((st->>'revision')::bigint, 0)) + 1), true);
  RETURN jsonb_build_object('ok', true, 'state', st);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_open_session(
  p_room_id uuid,
  p_participant_key text,
  p_expected_room_match_seq integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_room_match_seq int;
  v_room_product text;
  v_host_pk text;
  v_room_ssv int;
  v_room_status text;
  v_existing uuid;
  v_seated_count int;
  v_active int[];
  v_sess_id uuid;
  v_snap jsonb;
  v_init jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id and participant_key required');
  END IF;
  IF p_expected_room_match_seq IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'p_expected_room_match_seq required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_match_seq := (SELECT r.match_seq FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_match_seq IS DISTINCT FROM p_expected_room_match_seq THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'MATCH_SEQ_MISMATCH',
      'message', 'Room match_seq does not match expected value; refresh the room and retry.'
    );
  END IF;

  v_room_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not an Orbit Trap room');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.participant_key = v_pk
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'Only room members can open a session');
  END IF;

  v_host_pk := (SELECT r.host_participant_key FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_host_pk IS DISTINCT FROM v_pk THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_HOST', 'message', 'Only room host can open a session');
  END IF;

  v_room_ssv := (SELECT r.shared_schema_version FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF coalesce(v_room_ssv, 0) IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Orbit Trap requires shared_schema_version = 1');
  END IF;

  v_room_status := (SELECT r.status FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF coalesce(v_room_status, '') IS DISTINCT FROM 'IN_GAME' THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'ROOM_NOT_STARTED',
      'message', 'Room must be started before opening a session.'
    );
  END IF;

  v_existing := (
    SELECT s.id
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.room_id = p_room_id
      AND s.status = 'live'
      AND s.phase = 'playing'
    ORDER BY s.created_at DESC
    LIMIT 1
  );

  IF v_existing IS NOT NULL THEN
    UPDATE public.ov2_rooms r
    SET active_session_id = v_existing,
        active_runtime_id = v_existing,
        updated_at = now()
    WHERE r.id = p_room_id
      AND r.active_session_id IS DISTINCT FROM v_existing;

    v_snap := (
      SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
      FROM public.ov2_orbit_trap_sessions s
      WHERE s.id = v_existing
      LIMIT 1
    );
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'snapshot', v_snap);
  END IF;

  v_seated_count := coalesce((
    SELECT count(*)::int FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ), 0);

  IF v_seated_count < 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_PLAYERS', 'message', 'Need at least two seated members');
  END IF;
  IF v_seated_count > 4 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'TOO_MANY_PLAYERS', 'message', 'Orbit Trap supports at most four seated members');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.seat_index IS NOT NULL
      AND m.wallet_state IS DISTINCT FROM 'committed'
  ) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'STAKES_NOT_COMMITTED',
      'message', 'All seated players must have committed stakes before starting'
    );
  END IF;

  v_active := ARRAY(
    SELECT m.seat_index
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
    ORDER BY m.seat_index ASC
  );

  v_init := public._ot_initial_state_jsonb(v_active);

  INSERT INTO public.ov2_orbit_trap_sessions (
    room_id,
    match_seq,
    status,
    phase,
    revision,
    state,
    winner_seat,
    active_seats
  ) VALUES (
    p_room_id,
    v_room_match_seq,
    'live',
    'playing',
    0,
    v_init,
    NULL,
    v_active
  )
  RETURNING id INTO v_sess_id;

  INSERT INTO public.ov2_orbit_trap_seats (session_id, seat_index, participant_key, room_member_id, meta)
  SELECT
    v_sess_id,
    m.seat_index,
    m.participant_key,
    m.id,
    '{}'::jsonb
  FROM public.ov2_room_members m
  WHERE m.room_id = p_room_id AND m.seat_index IS NOT NULL
  ORDER BY m.seat_index ASC;

  UPDATE public.ov2_rooms
  SET active_session_id = v_sess_id,
      active_runtime_id = v_sess_id,
      updated_at = now()
  WHERE id = p_room_id;

  v_snap := (
    SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.id = v_sess_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'snapshot', v_snap);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_orbit_trap_apply_action(
  p_room_id uuid,
  p_participant_key text,
  p_action jsonb,
  p_expected_revision bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pk text := trim(coalesce(p_participant_key, ''));
  v_room_product text;
  v_sess_id uuid;
  v_seat int;
  v_rev bigint;
  v_state jsonb;
  v_sess_active int[];
  v_out jsonb;
  v_new_state jsonb;
  v_new_rev bigint;
  v_snap jsonb;
BEGIN
  IF p_room_id IS NULL OR length(v_pk) = 0 OR p_action IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'room_id, participant_key, and action required');
  END IF;

  PERFORM 1 FROM public.ov2_rooms r WHERE r.id = p_room_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;

  v_room_product := (SELECT r.product_game_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_room_product IS DISTINCT FROM 'ov2_orbit_trap' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'WRONG_PRODUCT', 'message', 'Not an Orbit Trap room');
  END IF;

  v_sess_id := (SELECT r.active_session_id FROM public.ov2_rooms r WHERE r.id = p_room_id);
  IF v_sess_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SESSION', 'message', 'No active session');
  END IF;

  PERFORM 1 FROM public.ov2_orbit_trap_sessions s WHERE s.id = v_sess_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;

  v_seat := (
    SELECT s.seat_index
    FROM public.ov2_orbit_trap_seats s
    WHERE s.session_id = v_sess_id AND s.participant_key = v_pk
    LIMIT 1
  );
  IF v_seat IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_IN_MATCH', 'message', 'Not seated in this session');
  END IF;

  SELECT s.revision, s.state, s.active_seats
  INTO v_rev, v_state, v_sess_active
  FROM public.ov2_orbit_trap_sessions s
  WHERE s.id = v_sess_id;

  v_sess_active := coalesce(nullif(v_sess_active, ARRAY[]::int[]), ARRAY[0, 1, 2, 3]);
  v_state := public._ot_normalize_state_roster(coalesce(v_state, '{}'::jsonb), v_sess_active);

  IF p_expected_revision IS NOT NULL AND v_rev IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'REVISION_MISMATCH',
      'message', 'Stale revision; refetch snapshot and retry.',
      'revision', v_rev
    );
  END IF;

  v_out := public._ot_try_apply_action(v_state, v_seat, p_action);
  IF coalesce((v_out->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', coalesce(v_out->>'code', 'REJECTED'),
      'message', coalesce(v_out->>'code', 'Action rejected')
    );
  END IF;

  v_new_state := v_out->'state';
  v_new_rev := coalesce((v_new_state->>'revision')::bigint, v_rev + 1);

  UPDATE public.ov2_orbit_trap_sessions s
  SET
    state = v_new_state,
    revision = v_new_rev,
    phase = coalesce(v_new_state->>'phase', s.phase),
    winner_seat = CASE
      WHEN coalesce(v_new_state->>'phase', '') = 'finished'
        AND v_new_state ? 'winnerSeat'
        AND (v_new_state->'winnerSeat') IS NOT NULL
        AND jsonb_typeof(v_new_state->'winnerSeat') <> 'null'
        THEN (v_new_state->>'winnerSeat')::int
      ELSE s.winner_seat
    END,
    updated_at = now()
  WHERE s.id = v_sess_id;

  v_snap := (
    SELECT public.ov2_orbit_trap_build_client_snapshot(s, v_pk)
    FROM public.ov2_orbit_trap_sessions s
    WHERE s.id = v_sess_id
    LIMIT 1
  );

  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

REVOKE ALL ON FUNCTION public._ot_active_roster_from_state(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_active_roster_from_state(jsonb) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_normalize_state_roster(jsonb, int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_normalize_state_roster(jsonb, int[]) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._ot_initial_state_jsonb(int[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._ot_initial_state_jsonb(int[]) TO anon, authenticated, service_role;

COMMIT;
