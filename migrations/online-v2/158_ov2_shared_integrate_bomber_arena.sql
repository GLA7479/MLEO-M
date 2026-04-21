-- Canonical shared OV2 integration for Bomber Arena (economy entry policy + leave-room forfeit dispatch).
-- Apply after bomber-arena/163_ov2_bomber_arena_settlement.sql (ov2_bomber_arena_leave_or_forfeit must exist).
-- Does not redefine ov2_qm_* (unchanged from prior migrations).
-- Neutral placement: migrations/online-v2/ root.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_shared_resolve_economy_entry_policy(p_product_game_id text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_product_game_id, ''))
    WHEN 'ov2_ludo' THEN 'ON_HOST_START'
    WHEN 'ov2_bingo' THEN 'ON_HOST_START'
    WHEN 'ov2_rummy51' THEN 'ON_HOST_START'
    WHEN 'ov2_backgammon' THEN 'ON_HOST_START'
    WHEN 'ov2_checkers' THEN 'ON_HOST_START'
    WHEN 'ov2_chess' THEN 'ON_HOST_START'
    WHEN 'ov2_dominoes' THEN 'ON_HOST_START'
    WHEN 'ov2_fourline' THEN 'ON_HOST_START'
    WHEN 'ov2_flipgrid' THEN 'ON_HOST_START'
    WHEN 'ov2_meldmatch' THEN 'ON_HOST_START'
    WHEN 'ov2_colorclash' THEN 'ON_HOST_START'
    WHEN 'ov2_fleet_hunt' THEN 'ON_HOST_START'
    WHEN 'ov2_goal_duel' THEN 'ON_HOST_START'
    WHEN 'ov2_snakes_and_ladders' THEN 'ON_HOST_START'
    WHEN 'ov2_bomber_arena' THEN 'ON_HOST_START'
    WHEN 'ov2_community_cards' THEN 'NONE'
    ELSE 'NONE'
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_allowed_product(p_game text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(COALESCE(p_game, '')) IN (
    'ov2_ludo',
    'ov2_rummy51',
    'ov2_bingo',
    'ov2_backgammon',
    'ov2_checkers',
    'ov2_chess',
    'ov2_dominoes',
    'ov2_fourline',
    'ov2_flipgrid',
    'ov2_meldmatch',
    'ov2_colorclash',
    'ov2_fleet_hunt',
    'ov2_goal_duel',
    'ov2_snakes_and_ladders'
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_qm_max_players_for_product(p_game text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE trim(COALESCE(p_game, ''))
    WHEN 'ov2_bingo' THEN 8
    WHEN 'ov2_backgammon' THEN 2
    WHEN 'ov2_checkers' THEN 2
    WHEN 'ov2_chess' THEN 2
    WHEN 'ov2_dominoes' THEN 2
    WHEN 'ov2_fourline' THEN 2
    WHEN 'ov2_flipgrid' THEN 2
    WHEN 'ov2_meldmatch' THEN 2
    WHEN 'ov2_fleet_hunt' THEN 2
    WHEN 'ov2_goal_duel' THEN 2
    WHEN 'ov2_colorclash' THEN 4
    WHEN 'ov2_snakes_and_ladders' THEN 4
    ELSE 4
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_shared_leave_room(
  p_room_id uuid,
  p_participant_key text,
  p_forfeit_game boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  x_pk text := trim(COALESCE(p_participant_key, ''));
  x_cnt int;
  x_new_host uuid;

  x_product_game_id text;
  x_shared_schema_version integer;
  x_status text;
  x_active_session_id uuid;
  x_host_participant_key text;

  x_in_ludo_match boolean := false;
  x_in_r51_match boolean := false;
  x_in_bg_match boolean := false;
  x_in_ck_match boolean := false;
  x_in_ch_match boolean := false;
  x_in_dom_match boolean := false;
  x_in_fl_match boolean := false;
  x_in_fg_match boolean := false;
  x_in_mm_match boolean := false;
  x_in_cc_match boolean := false;
  x_in_fh_match boolean := false;
  x_in_gd_match boolean := false;
  x_in_snakes_match boolean := false;
  x_in_bomber_match boolean := false;

  x_ff jsonb;
  x_refund jsonb;
  x_hint jsonb;
BEGIN
  IF p_room_id IS NULL OR length(x_pk) = 0 THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', 'INVALID_ARGUMENT',
      'message', 'room_id and participant_key are required.'
    );
  END IF;

  PERFORM 1
  FROM public.ov2_rooms r
  WHERE r.id = p_room_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  x_shared_schema_version := (
    SELECT r.shared_schema_version
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF x_shared_schema_version IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found.');
  END IF;

  x_status := COALESCE((
    SELECT r.status
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  ), '');

  IF x_status NOT IN ('OPEN', 'STARTING', 'IN_GAME') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Cannot leave in this room state.');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND m.participant_key = x_pk
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_MEMBER', 'message', 'You are not in this room.');
  END IF;

  x_product_game_id := (
    SELECT r.product_game_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  x_active_session_id := (
    SELECT r.active_session_id
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  x_host_participant_key := (
    SELECT r.host_participant_key
    FROM public.ov2_rooms r
    WHERE r.id = p_room_id
  );

  IF x_status = 'IN_GAME' THEN
    x_in_ludo_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_ludo'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_ludo_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_ludo_seats ls
        WHERE ls.session_id = x_active_session_id
          AND ls.participant_key = x_pk
      );

    x_in_r51_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_rummy51'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_rummy51_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND COALESCE(
        (SELECT (s.player_state -> x_pk ->> 'isEliminated')::boolean
         FROM public.ov2_rummy51_sessions s
         WHERE s.id = x_active_session_id),
        false
      ) IS NOT TRUE;

    x_in_bg_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_backgammon'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_backgammon_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_backgammon_seats bs
        WHERE bs.session_id = x_active_session_id
          AND bs.participant_key = x_pk
      );

    x_in_ck_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_checkers'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_checkers_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_checkers_seats cs
        WHERE cs.session_id = x_active_session_id
          AND cs.participant_key = x_pk
      );

    x_in_ch_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_chess'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_chess_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_chess_seats chs
        WHERE chs.session_id = x_active_session_id
          AND chs.participant_key = x_pk
      );

    x_in_dom_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_dominoes'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_dominoes_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_dominoes_seats ds
        WHERE ds.session_id = x_active_session_id
          AND ds.participant_key = x_pk
      );

    x_in_fl_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_fourline'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_fourline_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_fourline_seats fs
        WHERE fs.session_id = x_active_session_id
          AND fs.participant_key = x_pk
      );

    x_in_fg_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_flipgrid'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_flipgrid_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_flipgrid_seats fgs
        WHERE fgs.session_id = x_active_session_id
          AND fgs.participant_key = x_pk
      );

    x_in_mm_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_meldmatch'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_meldmatch_sessions s WHERE s.id = x_active_session_id), '') IN ('playing', 'layoff')
      AND EXISTS (
        SELECT 1
        FROM public.ov2_meldmatch_seats mms
        WHERE mms.session_id = x_active_session_id
          AND mms.participant_key = x_pk
      );

    x_in_cc_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_colorclash'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_colorclash_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_colorclash_seats ccs
        WHERE ccs.session_id = x_active_session_id
          AND ccs.participant_key = x_pk
      );

    x_in_fh_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_fleet_hunt'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_fleet_hunt_sessions s WHERE s.id = x_active_session_id), '') IN ('placement', 'battle')
      AND EXISTS (
        SELECT 1
        FROM public.ov2_fleet_hunt_seats fhs
        WHERE fhs.session_id = x_active_session_id
          AND fhs.participant_key = x_pk
      );

    x_in_gd_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_goal_duel'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_goal_duel_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_goal_duel_seats gds
        WHERE gds.session_id = x_active_session_id
          AND gds.participant_key = x_pk
      );

    x_in_bomber_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_bomber_arena'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_bomber_arena_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_bomber_arena_seats bs
        WHERE bs.session_id = x_active_session_id
          AND bs.participant_key = x_pk
          AND COALESCE(bs.is_alive, true)
      );

    x_in_snakes_match := x_product_game_id IS NOT DISTINCT FROM 'ov2_snakes_and_ladders'
      AND x_active_session_id IS NOT NULL
      AND COALESCE((SELECT s.phase FROM public.ov2_snakes_sessions s WHERE s.id = x_active_session_id), '') = 'playing'
      AND EXISTS (
        SELECT 1
        FROM public.ov2_snakes_seats ss
        WHERE ss.session_id = x_active_session_id
          AND ss.participant_key = x_pk
      );

    IF x_in_ludo_match OR x_in_r51_match OR x_in_bg_match OR x_in_ck_match OR x_in_ch_match
       OR x_in_dom_match OR x_in_fl_match OR x_in_fg_match OR x_in_mm_match
       OR x_in_cc_match OR x_in_fh_match OR x_in_gd_match OR x_in_snakes_match OR x_in_bomber_match THEN

      IF NOT COALESCE(p_forfeit_game, false) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'code', 'MUST_FORFEIT',
          'message', 'Leave during an active match requires forfeit. Call again with p_forfeit_game := true.'
        );
      END IF;

      IF x_in_ludo_match THEN
        x_ff := public.ov2_ludo_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_r51_match THEN
        x_ff := public.ov2_rummy51_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_bg_match THEN
        x_ff := public.ov2_backgammon_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_ck_match THEN
        x_ff := public.ov2_checkers_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_ch_match THEN
        x_ff := public.ov2_chess_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_dom_match THEN
        x_ff := public.ov2_dominoes_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_fl_match THEN
        x_ff := public.ov2_fourline_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_fg_match THEN
        x_ff := public.ov2_flipgrid_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_mm_match THEN
        x_ff := public.ov2_meldmatch_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_cc_match THEN
        x_ff := public.ov2_colorclash_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_fh_match THEN
        x_ff := public.ov2_fleet_hunt_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_gd_match THEN
        x_ff := public.ov2_goal_duel_voluntary_forfeit(p_room_id, x_pk);
      ELSIF x_in_bomber_match THEN
        x_ff := public.ov2_bomber_arena_leave_or_forfeit(p_room_id, x_pk, true);
      ELSIF x_in_snakes_match THEN
        x_ff := public.ov2_snakes_leave_game(p_room_id, x_pk);
      END IF;

      IF COALESCE((x_ff ->> 'ok')::boolean, false) IS NOT TRUE THEN
        RETURN x_ff;
      END IF;

      PERFORM 1
      FROM public.ov2_rooms r
      WHERE r.id = p_room_id
      FOR UPDATE;

      x_product_game_id := (
        SELECT r.product_game_id
        FROM public.ov2_rooms r
        WHERE r.id = p_room_id
      );

      x_status := COALESCE((
        SELECT r.status
        FROM public.ov2_rooms r
        WHERE r.id = p_room_id
      ), '');

      x_active_session_id := (
        SELECT r.active_session_id
        FROM public.ov2_rooms r
        WHERE r.id = p_room_id
      );

      x_host_participant_key := (
        SELECT r.host_participant_key
        FROM public.ov2_rooms r
        WHERE r.id = p_room_id
      );
    END IF;
  END IF;

  x_refund := public.ov2_shared_try_pre_ingame_stake_refund(p_room_id, x_pk, 'leave');
  x_hint := NULL;

  IF x_refund IS NOT NULL AND COALESCE((x_refund ->> 'refunded')::boolean, false) THEN
    x_hint := jsonb_build_object(
      'amount', x_refund -> 'amount',
      'idempotency_key', to_jsonb(x_refund ->> 'idempotency_key'),
      'product_game_id', to_jsonb(x_product_game_id)
    );
  END IF;

  UPDATE public.ov2_room_members
  SET
    seat_index = NULL,
    member_state = 'left',
    left_at = now(),
    updated_at = now()
  WHERE room_id = p_room_id
    AND participant_key = x_pk;

  x_cnt := COALESCE((
    SELECT count(*)::int
    FROM public.ov2_room_members m
    WHERE m.room_id = p_room_id
      AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
  ), 0);

  IF x_cnt <= 0 THEN
    IF COALESCE(upper(trim(x_status)), '') = 'OPEN' THEN
      UPDATE public.ov2_rooms
      SET
        host_member_id = NULL,
        host_participant_key = NULL,
        updated_at = now()
      WHERE id = p_room_id;

      PERFORM public.ov2_shared_touch_room_activity(p_room_id);

      RETURN jsonb_build_object(
        'ok', true,
        'closed', false,
        'stake_refund', x_hint,
        'room', public.ov2_shared_room_to_public_jsonb(
          (SELECT r FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1)
        ),
        'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
      );
    END IF;

    UPDATE public.ov2_rooms
    SET
      status = 'CLOSED',
      lifecycle_phase = 'closed',
      closed_reason = 'empty',
      ended_at = now(),
      updated_at = now()
    WHERE id = p_room_id;

    PERFORM public.ov2_shared_touch_room_activity(p_room_id);

    RETURN jsonb_build_object(
      'ok', true,
      'closed', true,
      'stake_refund', x_hint,
      'room', public.ov2_shared_room_to_public_jsonb(
        (SELECT r FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1)
      ),
      'members', '[]'::jsonb
    );
  END IF;

  IF x_host_participant_key IS NOT DISTINCT FROM x_pk THEN
    x_new_host := (
      SELECT m.id
      FROM public.ov2_room_members m
      WHERE m.room_id = p_room_id
        AND m.participant_key IS DISTINCT FROM x_pk
        AND COALESCE(m.member_state, 'joined') IN ('joined', 'disconnected')
      ORDER BY m.joined_at ASC NULLS LAST, m.id ASC
      LIMIT 1
    );

    IF x_new_host IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'code', 'INVALID_STATE', 'message', 'Could not transfer host.');
    END IF;

    UPDATE public.ov2_room_members
    SET role = 'member'
    WHERE room_id = p_room_id
      AND COALESCE(member_state, 'joined') IN ('joined', 'disconnected');

    UPDATE public.ov2_room_members
    SET role = 'host'
    WHERE id = x_new_host;

    UPDATE public.ov2_rooms r
    SET
      host_member_id = x_new_host,
      host_participant_key = (
        SELECT m.participant_key
        FROM public.ov2_room_members m
        WHERE m.id = x_new_host
      ),
      updated_at = now()
    WHERE r.id = p_room_id;
  END IF;

  PERFORM public.ov2_shared_touch_room_activity(p_room_id);

  RETURN jsonb_build_object(
    'ok', true,
    'closed', false,
    'stake_refund', x_hint,
    'room', public.ov2_shared_room_to_public_jsonb(
      (SELECT r FROM public.ov2_rooms r WHERE r.id = p_room_id LIMIT 1)
    ),
    'members', public.ov2_shared_members_to_public_jsonb(p_room_id)
  );
END;
$$;


COMMIT;
