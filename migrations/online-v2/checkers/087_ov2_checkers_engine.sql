-- OV2 Checkers: authoritative rules (8x8 dark squares, forced capture, multi-jump chain, flying kings).
-- Apply after 086_ov2_checkers_schema.sql.

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ck_cell_get(p_cells jsonb, p_i int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
  v_t text;
  v_n int;
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' OR p_i < 0 OR p_i > 63 THEN
    RETURN 0;
  END IF;
  IF p_i >= jsonb_array_length(p_cells) THEN
    RETURN 0;
  END IF;
  v_elem := p_cells -> p_i;
  IF v_elem IS NULL OR jsonb_typeof(v_elem) = 'null' THEN
    RETURN 0;
  END IF;
  v_t := v_elem #>> '{}';
  IF v_t IS NULL OR length(trim(v_t)) = 0 THEN
    RETURN 0;
  END IF;
  BEGIN
    v_n := v_t::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN 0;
  END;
  IF v_n < 0 OR v_n > 4 THEN
    RETURN 0;
  END IF;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_cell_set(p_cells jsonb, p_i int, p_val int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
BEGIN
  IF p_cells IS NULL OR jsonb_typeof(p_cells) <> 'array' OR p_i < 0 OR p_i > 63 THEN
    RETURN p_cells;
  END IF;
  RETURN jsonb_set(p_cells, ARRAY[p_i::text], to_jsonb(p_val), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_piece_owner(p_piece int)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_piece IS NULL OR p_piece = 0 THEN -1
    WHEN p_piece IN (1, 2) THEN 0
    WHEN p_piece IN (3, 4) THEN 1
    ELSE -1
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_is_king(p_piece int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_piece IN (2, 4);
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_is_dark_sq(p_r int, p_c int)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ((p_r + p_c) % 2) = 1;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_initial_board_json()
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cells jsonb := jsonb_build_array();
  v_i int;
  v_r int;
  v_c int;
  v_v int;
BEGIN
  FOR v_i IN 0..63 LOOP
    v_r := v_i / 8;
    v_c := v_i % 8;
    v_v := 0;
    IF public.ov2_ck_is_dark_sq(v_r, v_c) THEN
      IF v_r <= 2 THEN
        v_v := 1;
      ELSIF v_r >= 5 THEN
        v_v := 3;
      END IF;
    END IF;
    v_cells := v_cells || to_jsonb(v_v);
  END LOOP;
  RETURN jsonb_build_object(
    'cells', v_cells,
    'turnSeat', 0,
    'winner', NULL,
    'jumpChain', NULL
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_count_side(p_cells jsonb, p_seat int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_p int;
  v_n int := 0;
BEGIN
  FOR v_i IN 0..63 LOOP
    v_p := public.ov2_ck_cell_get(p_cells, v_i);
    IF public.ov2_ck_piece_owner(v_p) = p_seat THEN
      v_n := v_n + 1;
    END IF;
  END LOOP;
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_man_has_capture(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_turn int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_r2 int;
  v_c2 int;
  v_rm int;
  v_cm int;
  v_mid int;
  v_land int;
  v_opp int := CASE WHEN p_turn = 0 THEN 1 ELSE 0 END;
BEGIN
  FOR v_dr, v_dc IN
    SELECT x, y FROM (VALUES (-1, -1), (-1, 1), (1, -1), (1, 1)) AS t(x, y)
  LOOP
    v_rm := p_r + v_dr;
    v_cm := p_c + v_dc;
    v_r2 := p_r + 2 * v_dr;
    v_c2 := p_c + 2 * v_dc;
    IF v_r2 < 0 OR v_r2 > 7 OR v_c2 < 0 OR v_c2 > 7 THEN
      CONTINUE;
    END IF;
    IF NOT public.ov2_ck_is_dark_sq(v_r2, v_c2) THEN
      CONTINUE;
    END IF;
    v_mid := public.ov2_ck_cell_get(p_cells, v_rm * 8 + v_cm);
    v_land := public.ov2_ck_cell_get(p_cells, v_r2 * 8 + v_c2);
    IF v_land <> 0 THEN
      CONTINUE;
    END IF;
    IF public.ov2_ck_piece_owner(v_mid) = v_opp THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_king_has_capture(
  p_cells jsonb,
  p_r int,
  p_c int,
  p_turn int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_rr int;
  v_cc int;
  v_hit int;
  v_opp int := CASE WHEN p_turn = 0 THEN 1 ELSE 0 END;
  v_pr int;
  v_pc int;
  v_land int;
BEGIN
  FOR v_dr, v_dc IN
    SELECT x, y FROM (VALUES (-1, -1), (-1, 1), (1, -1), (1, 1)) AS t(x, y)
  LOOP
    v_rr := p_r;
    v_cc := p_c;
    v_hit := 0;
    LOOP
      v_rr := v_rr + v_dr;
      v_cc := v_cc + v_dc;
      IF v_rr < 0 OR v_rr > 7 OR v_cc < 0 OR v_cc > 7 THEN
        EXIT;
      END IF;
      v_pr := public.ov2_ck_cell_get(p_cells, v_rr * 8 + v_cc);
      IF v_pr = 0 THEN
        CONTINUE;
      END IF;
      IF public.ov2_ck_piece_owner(v_pr) = p_turn THEN
        EXIT;
      END IF;
      IF public.ov2_ck_piece_owner(v_pr) <> v_opp THEN
        EXIT;
      END IF;
      v_hit := 1;
      LOOP
        v_rr := v_rr + v_dr;
        v_cc := v_cc + v_dc;
        IF v_rr < 0 OR v_rr > 7 OR v_cc < 0 OR v_cc > 7 THEN
          EXIT;
        END IF;
        IF NOT public.ov2_ck_is_dark_sq(v_rr, v_cc) THEN
          EXIT;
        END IF;
        v_land := public.ov2_ck_cell_get(p_cells, v_rr * 8 + v_cc);
        IF v_land = 0 THEN
          RETURN true;
        END IF;
        EXIT;
      END LOOP;
      EXIT;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_cell_has_capture(
  p_cells jsonb,
  p_idx int,
  p_turn int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_r int;
  v_c int;
  v_p int;
BEGIN
  v_r := p_idx / 8;
  v_c := p_idx % 8;
  v_p := public.ov2_ck_cell_get(p_cells, p_idx);
  IF public.ov2_ck_piece_owner(v_p) IS DISTINCT FROM p_turn THEN
    RETURN false;
  END IF;
  IF public.ov2_ck_is_king(v_p) THEN
    RETURN public.ov2_ck_king_has_capture(p_cells, v_r, v_c, p_turn);
  END IF;
  RETURN public.ov2_ck_man_has_capture(p_cells, v_r, v_c, p_turn);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_side_has_capture(p_cells jsonb, p_turn int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
BEGIN
  FOR v_i IN 0..63 LOOP
    IF public.ov2_ck_cell_has_capture(p_cells, v_i, p_turn) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_try_slide_man(
  p_cells jsonb,
  p_fr int,
  p_fc int,
  p_tr int,
  p_tc int,
  p_turn int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_fwd int;
BEGIN
  IF p_tr < 0 OR p_tr > 7 OR p_tc < 0 OR p_tc > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB');
  END IF;
  IF NOT public.ov2_ck_is_dark_sq(p_tr, p_tc) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DARK');
  END IF;
  IF public.ov2_ck_cell_get(p_cells, p_tr * 8 + p_tc) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OCCUPIED');
  END IF;
  v_dr := p_tr - p_fr;
  v_dc := p_tc - p_fc;
  IF abs(v_dr) <> 1 OR abs(v_dc) <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAN_DISTANCE');
  END IF;
  v_fwd := CASE WHEN p_turn = 0 THEN 1 ELSE -1 END;
  IF v_dr IS DISTINCT FROM v_fwd THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MAN_FORWARD');
  END IF;
  RETURN jsonb_build_object('ok', true, 'capture', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_try_slide_king(
  p_cells jsonb,
  p_fr int,
  p_fc int,
  p_tr int,
  p_tc int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_steps int;
  v_i int;
  v_r int;
  v_c int;
  v_p int;
BEGIN
  IF p_tr < 0 OR p_tr > 7 OR p_tc < 0 OR p_tc > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB');
  END IF;
  IF NOT public.ov2_ck_is_dark_sq(p_tr, p_tc) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DARK');
  END IF;
  IF public.ov2_ck_cell_get(p_cells, p_tr * 8 + p_tc) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OCCUPIED');
  END IF;
  v_dr := p_tr - p_fr;
  v_dc := p_tc - p_fc;
  IF abs(v_dr) <> abs(v_dc) OR v_dr = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KING_DIAG');
  END IF;
  v_steps := abs(v_dr);
  v_dr := CASE WHEN (p_tr - p_fr) > 0 THEN 1 WHEN (p_tr - p_fr) < 0 THEN -1 ELSE 0 END;
  v_dc := CASE WHEN (p_tc - p_fc) > 0 THEN 1 WHEN (p_tc - p_fc) < 0 THEN -1 ELSE 0 END;
  FOR v_i IN 1..(v_steps - 1) LOOP
    v_r := p_fr + v_dr * v_i;
    v_c := p_fc + v_dc * v_i;
    v_p := public.ov2_ck_cell_get(p_cells, v_r * 8 + v_c);
    IF v_p <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'KING_BLOCKED');
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'capture', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_try_man_capture(
  p_cells jsonb,
  p_fr int,
  p_fc int,
  p_tr int,
  p_tc int,
  p_turn int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_rm int;
  v_cm int;
  v_mid int;
  v_opp int := CASE WHEN p_turn = 0 THEN 1 ELSE 0 END;
BEGIN
  IF p_tr < 0 OR p_tr > 7 OR p_tc < 0 OR p_tc > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB');
  END IF;
  IF NOT public.ov2_ck_is_dark_sq(p_tr, p_tc) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DARK');
  END IF;
  IF public.ov2_ck_cell_get(p_cells, p_tr * 8 + p_tc) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OCCUPIED');
  END IF;
  v_dr := p_tr - p_fr;
  v_dc := p_tc - p_fc;
  IF abs(v_dr) <> 2 OR abs(v_dc) <> 2 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CAP_DISTANCE');
  END IF;
  v_dr := CASE WHEN v_dr > 0 THEN 1 WHEN v_dr < 0 THEN -1 ELSE 0 END;
  v_dc := CASE WHEN v_dc > 0 THEN 1 WHEN v_dc < 0 THEN -1 ELSE 0 END;
  v_rm := p_fr + v_dr;
  v_cm := p_fc + v_dc;
  v_mid := public.ov2_ck_cell_get(p_cells, v_rm * 8 + v_cm);
  IF public.ov2_ck_piece_owner(v_mid) IS DISTINCT FROM v_opp THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_JUMP');
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'capture', true,
    'mid_idx', v_rm * 8 + v_cm
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_try_king_capture(
  p_cells jsonb,
  p_fr int,
  p_fc int,
  p_tr int,
  p_tc int,
  p_turn int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_dr int;
  v_dc int;
  v_steps int;
  v_i int;
  v_r int;
  v_c int;
  v_p int;
  v_seen int := 0;
  v_mid_idx int;
  v_opp int := CASE WHEN p_turn = 0 THEN 1 ELSE 0 END;
BEGIN
  IF p_tr < 0 OR p_tr > 7 OR p_tc < 0 OR p_tc > 7 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB');
  END IF;
  IF NOT public.ov2_ck_is_dark_sq(p_tr, p_tc) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_DARK');
  END IF;
  IF public.ov2_ck_cell_get(p_cells, p_tr * 8 + p_tc) <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OCCUPIED');
  END IF;
  v_dr := p_tr - p_fr;
  v_dc := p_tc - p_fc;
  IF abs(v_dr) <> abs(v_dc) OR v_dr = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KCAP_DIAG');
  END IF;
  v_steps := abs(v_dr);
  v_dr := CASE WHEN (p_tr - p_fr) > 0 THEN 1 WHEN (p_tr - p_fr) < 0 THEN -1 ELSE 0 END;
  v_dc := CASE WHEN (p_tc - p_fc) > 0 THEN 1 WHEN (p_tc - p_fc) < 0 THEN -1 ELSE 0 END;
  FOR v_i IN 1..(v_steps - 1) LOOP
    v_r := p_fr + v_dr * v_i;
    v_c := p_fc + v_dc * v_i;
    v_p := public.ov2_ck_cell_get(p_cells, v_r * 8 + v_c);
    IF v_p = 0 THEN
      CONTINUE;
    END IF;
    IF v_seen > 0 THEN
      RETURN jsonb_build_object('ok', false, 'code', 'KCAP_BLOCK');
    END IF;
    IF public.ov2_ck_piece_owner(v_p) = p_turn THEN
      RETURN jsonb_build_object('ok', false, 'code', 'KCAP_OWN');
    END IF;
    IF public.ov2_ck_piece_owner(v_p) IS DISTINCT FROM v_opp THEN
      RETURN jsonb_build_object('ok', false, 'code', 'KCAP_BAD');
    END IF;
    v_seen := 1;
    v_mid_idx := v_r * 8 + v_c;
  END LOOP;
  IF v_seen <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'KCAP_NOPIECE');
  END IF;
  RETURN jsonb_build_object('ok', true, 'capture', true, 'mid_idx', v_mid_idx);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_side_has_any_move(
  p_cells jsonb,
  p_turn int,
  p_chain_at int
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_from int;
  v_to int;
  v_fr int;
  v_fc int;
  v_tr int;
  v_tc int;
  v_p int;
  v_glob_cap boolean;
  v_mv jsonb;
  v_cells jsonb := p_cells;
BEGIN
  v_glob_cap := public.ov2_ck_side_has_capture(v_cells, p_turn);
  FOR v_from IN 0..63 LOOP
    IF p_chain_at IS NOT NULL AND v_from IS DISTINCT FROM p_chain_at THEN
      CONTINUE;
    END IF;
    v_p := public.ov2_ck_cell_get(v_cells, v_from);
    IF public.ov2_ck_piece_owner(v_p) IS DISTINCT FROM p_turn THEN
      CONTINUE;
    END IF;
    FOR v_to IN 0..63 LOOP
      IF v_from = v_to THEN
        CONTINUE;
      END IF;
      v_fr := v_from / 8;
      v_fc := v_from % 8;
      v_tr := v_to / 8;
      v_tc := v_to % 8;
      IF v_glob_cap THEN
        IF public.ov2_ck_is_king(v_p) THEN
          v_mv := public.ov2_ck_try_king_capture(v_cells, v_fr, v_fc, v_tr, v_tc, p_turn);
        ELSE
          v_mv := public.ov2_ck_try_man_capture(v_cells, v_fr, v_fc, v_tr, v_tc, p_turn);
        END IF;
        IF coalesce((v_mv ->> 'ok')::boolean, false) THEN
          RETURN true;
        END IF;
      ELSE
        IF public.ov2_ck_is_king(v_p) THEN
          v_mv := public.ov2_ck_try_slide_king(v_cells, v_fr, v_fc, v_tr, v_tc);
        ELSE
          v_mv := public.ov2_ck_try_slide_man(v_cells, v_fr, v_fc, v_tr, v_tc, p_turn);
        END IF;
        IF coalesce((v_mv ->> 'ok')::boolean, false) THEN
          RETURN true;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ck_apply_move(
  p_board jsonb,
  p_from int,
  p_to int
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cells jsonb;
  v_turn int;
  v_jc jsonb;
  v_chain_at int;
  v_fr int;
  v_fc int;
  v_tr int;
  v_tc int;
  v_p int;
  v_glob_cap boolean;
  v_mv jsonb;
  v_new_cells jsonb;
  v_promo int;
  v_next_turn int;
  v_winner int;
  v_more_cap boolean;
  v_opp int;
BEGIN
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD');
  END IF;
  v_cells := p_board -> 'cells';
  IF v_cells IS NULL OR jsonb_typeof(v_cells) <> 'array' OR jsonb_array_length(v_cells) <> 64 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_CELLS');
  END IF;
  BEGIN
    v_turn := (p_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN');
  END;
  IF v_turn NOT IN (0, 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN');
  END IF;
  IF p_board -> 'winner' IS NOT NULL AND jsonb_typeof(p_board -> 'winner') <> 'null'
     AND length(trim(p_board ->> 'winner')) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_OVER');
  END IF;
  v_jc := p_board -> 'jumpChain';
  v_chain_at := NULL;
  IF v_jc IS NOT NULL AND jsonb_typeof(v_jc) = 'object' AND (v_jc ? 'at') THEN
    BEGIN
      v_chain_at := (v_jc ->> 'at')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_chain_at := NULL;
    END;
  END IF;
  IF p_from < 0 OR p_from > 63 OR p_to < 0 OR p_to > 63 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'OOB');
  END IF;
  IF v_chain_at IS NOT NULL AND p_from IS DISTINCT FROM v_chain_at THEN
    RETURN jsonb_build_object('ok', false, 'code', 'CHAIN_LOCK');
  END IF;
  v_fr := p_from / 8;
  v_fc := p_from % 8;
  v_tr := p_to / 8;
  v_tc := p_to % 8;
  v_p := public.ov2_ck_cell_get(v_cells, p_from);
  IF public.ov2_ck_piece_owner(v_p) IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_PIECE');
  END IF;
  v_glob_cap := public.ov2_ck_side_has_capture(v_cells, v_turn);
  IF public.ov2_ck_is_king(v_p) THEN
    IF v_glob_cap THEN
      v_mv := public.ov2_ck_try_king_capture(v_cells, v_fr, v_fc, v_tr, v_tc, v_turn);
    ELSE
      v_mv := public.ov2_ck_try_slide_king(v_cells, v_fr, v_fc, v_tr, v_tc);
    END IF;
  ELSE
    IF v_glob_cap THEN
      v_mv := public.ov2_ck_try_man_capture(v_cells, v_fr, v_fc, v_tr, v_tc, v_turn);
    ELSE
      v_mv := public.ov2_ck_try_slide_man(v_cells, v_fr, v_fc, v_tr, v_tc, v_turn);
    END IF;
  END IF;
  IF NOT coalesce((v_mv ->> 'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok', false, 'code', COALESCE(v_mv ->> 'code', 'ILLEGAL'));
  END IF;
  v_new_cells := public.ov2_ck_cell_set(v_cells, p_from, 0);
  IF coalesce((v_mv ->> 'capture')::boolean, false) THEN
    v_new_cells := public.ov2_ck_cell_set(v_new_cells, (v_mv ->> 'mid_idx')::int, 0);
  END IF;
  v_promo := v_p;
  IF v_turn = 0 AND NOT public.ov2_ck_is_king(v_p) AND v_tr = 7 THEN
    v_promo := 2;
  ELSIF v_turn = 1 AND NOT public.ov2_ck_is_king(v_p) AND v_tr = 0 THEN
    v_promo := 4;
  END IF;
  v_new_cells := public.ov2_ck_cell_set(v_new_cells, p_to, v_promo);
  v_winner := NULL;
  v_opp := CASE WHEN v_turn = 0 THEN 1 ELSE 0 END;
  IF public.ov2_ck_count_side(v_new_cells, v_opp) = 0 THEN
    v_winner := v_turn;
  END IF;
  IF coalesce((v_mv ->> 'capture')::boolean, false) AND v_winner IS NULL THEN
    v_more_cap := public.ov2_ck_cell_has_capture(v_new_cells, p_to, v_turn);
    IF v_more_cap THEN
      RETURN jsonb_build_object(
        'ok', true,
        'board',
        jsonb_build_object(
          'cells', v_new_cells,
          'turnSeat', v_turn,
          'winner', NULL,
          'jumpChain', jsonb_build_object('at', p_to)
        ),
        'turn_complete', false,
        'winner', NULL
      );
    END IF;
  END IF;
  v_next_turn := v_opp;
  IF v_winner IS NULL THEN
    IF NOT public.ov2_ck_side_has_any_move(v_new_cells, v_next_turn, NULL) THEN
      v_winner := v_turn;
    END IF;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'board',
    jsonb_build_object(
      'cells', v_new_cells,
      'turnSeat', CASE WHEN v_winner IS NULL THEN v_next_turn ELSE v_turn END,
      'winner', CASE WHEN v_winner IS NULL THEN NULL ELSE to_jsonb(v_winner) END,
      'jumpChain', NULL
    ),
    'turn_complete', true,
    'winner', CASE WHEN v_winner IS NULL THEN NULL ELSE to_jsonb(v_winner) END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ck_cell_get(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ck_cell_get(jsonb, integer) TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ov2_ck_apply_move(jsonb, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ck_apply_move(jsonb, integer, integer) TO anon, authenticated, service_role;

COMMIT;
