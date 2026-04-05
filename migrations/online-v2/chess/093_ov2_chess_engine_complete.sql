-- OV2 Chess: complete authoritative move engine (replaces 092 stubs via CREATE OR REPLACE).
-- Fixes knight ray bug from index-offset model by using rank/file deltas.
-- Apply after 091_ov2_chess_engine_core.sql. Does NOT edit files 090–092.

BEGIN;

-- Correct attacks (esp. knight) for ov2_ch_is_square_attacked / ov2_ch_in_check.
CREATE OR REPLACE FUNCTION public.ov2_ch_piece_attacks_square(
  p_squares jsonb,
  p_fr int,
  p_to int,
  p_white_piece boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ch text;
  v_k text;
  v_fr int;
  v_fc int;
  v_tr int;
  v_tc int;
  v_dr int;
  v_dc int;
  v_dir int;
BEGIN
  v_ch := public.ov2_ch_sq(p_squares, p_fr);
  IF v_ch = '.' THEN
    RETURN false;
  END IF;
  v_k := lower(v_ch);
  v_fr := p_fr / 8;
  v_fc := p_fr % 8;
  v_tr := p_to / 8;
  v_tc := p_to % 8;
  v_dr := v_tr - v_fr;
  v_dc := v_tc - v_fc;

  IF v_k = 'n' THEN
    RETURN (abs(v_dr) = 2 AND abs(v_dc) = 1) OR (abs(v_dr) = 1 AND abs(v_dc) = 2);
  END IF;

  IF v_k = 'k' THEN
    RETURN abs(v_dr) <= 1 AND abs(v_dc) <= 1 AND (abs(v_dr) + abs(v_dc) > 0);
  END IF;

  IF v_k = 'p' THEN
    IF p_white_piece THEN
      RETURN v_dr = 1 AND abs(v_dc) = 1;
    ELSE
      RETURN v_dr = -1 AND abs(v_dc) = 1;
    END IF;
  END IF;

  IF v_k = 'r' THEN
    IF NOT (v_fr = v_tr OR v_fc = v_tc) THEN
      RETURN false;
    END IF;
    IF v_fr = v_tr THEN
      v_dir := CASE WHEN v_dc > 0 THEN 1 WHEN v_dc < 0 THEN -1 ELSE 0 END;
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, 0, v_dir, true);
    END IF;
    v_dir := CASE WHEN v_dr > 0 THEN 1 WHEN v_dr < 0 THEN -1 ELSE 0 END;
    RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, v_dir, 0, true);
  END IF;

  IF v_k = 'b' THEN
    IF abs(v_dr) IS DISTINCT FROM abs(v_dc) OR v_dr = 0 THEN
      RETURN false;
    END IF;
    RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to,
      CASE WHEN v_dr > 0 THEN 1 ELSE -1 END,
      CASE WHEN v_dc > 0 THEN 1 ELSE -1 END,
      true);
  END IF;

  IF v_k = 'q' THEN
    IF v_fr = v_tr OR v_fc = v_tc THEN
      IF v_fr = v_tr THEN
        v_dir := CASE WHEN v_dc > 0 THEN 1 WHEN v_dc < 0 THEN -1 ELSE 0 END;
        RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, 0, v_dir, true);
      END IF;
      v_dir := CASE WHEN v_dr > 0 THEN 1 WHEN v_dr < 0 THEN -1 ELSE 0 END;
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, v_dir, 0, true);
    END IF;
    IF abs(v_dr) = abs(v_dc) AND v_dr <> 0 THEN
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to,
        CASE WHEN v_dr > 0 THEN 1 ELSE -1 END,
        CASE WHEN v_dc > 0 THEN 1 ELSE -1 END,
        true);
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_ch_seg_clear(p_squares jsonb, p_fr int, p_to int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_fr int := p_fr / 8;
  v_fc int := p_fr % 8;
  v_tr int := p_to / 8;
  v_tc int := p_to % 8;
  v_dr int;
  v_dc int;
  v_steps int;
  v_i int;
  v_r int;
  v_c int;
BEGIN
  v_dr := v_tr - v_fr;
  v_dc := v_tc - v_fc;
  IF v_dr = 0 AND v_dc = 0 THEN
    RETURN true;
  END IF;
  IF v_dr <> 0 AND v_dc <> 0 AND abs(v_dr) <> abs(v_dc) THEN
    RETURN false;
  END IF;
  IF v_dr = 0 THEN
    v_steps := abs(v_dc);
    v_dc := CASE WHEN v_dc > 0 THEN 1 WHEN v_dc < 0 THEN -1 ELSE 0 END;
    v_dr := 0;
  ELSIF v_dc = 0 THEN
    v_steps := abs(v_dr);
    v_dr := CASE WHEN v_dr > 0 THEN 1 WHEN v_dr < 0 THEN -1 ELSE 0 END;
    v_dc := 0;
  ELSE
    v_steps := abs(v_dr);
    v_dr := CASE WHEN v_tr > v_fr THEN 1 ELSE -1 END;
    v_dc := CASE WHEN v_tc > v_fc THEN 1 ELSE -1 END;
  END IF;
  FOR v_i IN 1..(v_steps - 1) LOOP
    v_r := (p_fr / 8) + v_dr * v_i;
    v_c := (p_fr % 8) + v_dc * v_i;
    IF public.ov2_ch_sq(p_squares, v_r * 8 + v_c) IS DISTINCT FROM '.' THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_ch_sq_attacked_after(
  p_squares jsonb,
  p_idx int,
  p_by_white boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_b jsonb := jsonb_build_object('squares', p_squares);
BEGIN
  RETURN public.ov2_ch_is_square_attacked(v_b, p_idx, p_by_white);
END;
$$;

-- Pseudo-legal move only (may leave own king in check). Returns partial board patch or NULL.
CREATE OR REPLACE FUNCTION public._ov2_ch_pseudo_apply(
  p_board jsonb,
  p_from int,
  p_to int,
  p_promo text
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_sq jsonb;
  v_ts int;
  v_cas jsonb;
  v_ep jsonb;
  v_half int;
  v_full int;
  v_ch text;
  v_tgt text;
  v_w_move boolean;
  v_fr int;
  v_fc int;
  v_tr int;
  v_tc int;
  v_dr int;
  v_dc int;
  v_ns jsonb;
  v_pr text;
  v_cap_sq int;
  v_ep_cap int;
  v_clr text;
  v_ok boolean;
BEGIN
  IF p_board IS NULL OR jsonb_typeof(p_board) <> 'object' OR p_from IS NULL OR p_to IS NULL THEN
    RETURN NULL;
  END IF;
  IF p_from < 0 OR p_from > 63 OR p_to < 0 OR p_to > 63 OR p_from = p_to THEN
    RETURN NULL;
  END IF;
  v_sq := p_board -> 'squares';
  IF v_sq IS NULL OR jsonb_typeof(v_sq) <> 'array' OR jsonb_array_length(v_sq) <> 64 THEN
    RETURN NULL;
  END IF;
  BEGIN
    v_ts := (p_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN NULL;
  END;
  IF v_ts NOT IN (0, 1) THEN
    RETURN NULL;
  END IF;
  v_w_move := (v_ts = 0);
  v_ch := public.ov2_ch_sq(v_sq, p_from);
  IF v_ch = '.' THEN
    RETURN NULL;
  END IF;
  IF v_w_move AND NOT public.ov2_ch_is_white_sq(v_ch) THEN
    RETURN NULL;
  END IF;
  IF NOT v_w_move AND NOT public.ov2_ch_is_black_sq(v_ch) THEN
    RETURN NULL;
  END IF;
  v_tgt := public.ov2_ch_sq(v_sq, p_to);
  IF v_tgt <> '.' THEN
    IF v_w_move AND public.ov2_ch_is_white_sq(v_tgt) THEN
      RETURN NULL;
    END IF;
    IF NOT v_w_move AND public.ov2_ch_is_black_sq(v_tgt) THEN
      RETURN NULL;
    END IF;
  END IF;
  v_fr := p_from / 8;
  v_fc := p_from % 8;
  v_tr := p_to / 8;
  v_tc := p_to % 8;
  v_dr := v_tr - v_fr;
  v_dc := v_tc - v_fc;
  v_cas := COALESCE(p_board -> 'castling', jsonb_build_object('wK', true, 'wQ', true, 'bK', true, 'bQ', true));
  v_ep := p_board -> 'ep';
  BEGIN
    v_half := COALESCE((p_board ->> 'halfmove')::int, 0);
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_half := 0;
  END;
  BEGIN
    v_full := greatest(1, COALESCE((p_board ->> 'fullmove')::int, 1));
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_full := 1;
  END;

  v_ns := v_sq;
  v_cap_sq := NULL;
  v_ep_cap := NULL;

  -- King (incl. castling)
  IF lower(v_ch) = 'k' THEN
    IF abs(v_dr) <= 1 AND abs(v_dc) <= 1 THEN
      v_ns := public.ov2_ch_set_sq(v_ns, p_to, v_ch);
      v_ns := public.ov2_ch_set_sq(v_ns, p_from, '.');
      IF v_w_move THEN
        v_cas := jsonb_set(jsonb_set(v_cas, '{wK}', 'false'::jsonb, true), '{wQ}', 'false'::jsonb, true);
      ELSE
        v_cas := jsonb_set(jsonb_set(v_cas, '{bK}', 'false'::jsonb, true), '{bQ}', 'false'::jsonb, true);
      END IF;
      v_half := v_half + 1;
      RETURN jsonb_build_object(
        'squares', v_ns,
        'castling', v_cas,
        'ep', 'null'::jsonb,
        'halfmove', v_half,
        'fullmove', v_full,
        'capture', CASE WHEN v_tgt <> '.' THEN true ELSE false END,
        'pawn_move', false
      );
    END IF;
    IF v_w_move AND v_fr = 0 AND v_fc = 4 AND v_dr = 0 AND v_tr = 0 THEN
      IF v_dc = 2 AND coalesce((v_cas ->> 'wK')::boolean, false)
         AND public.ov2_ch_sq(v_sq, 5) = '.' AND public.ov2_ch_sq(v_sq, 6) = '.'
         AND public.ov2_ch_sq(v_sq, 7) = 'R'
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 4, false)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 5, false)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 6, false) THEN
        v_ns := public.ov2_ch_set_sq(v_ns, 4, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 7, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 6, 'K');
        v_ns := public.ov2_ch_set_sq(v_ns, 5, 'R');
        v_cas := jsonb_set(jsonb_set(v_cas, '{wK}', 'false'::jsonb, true), '{wQ}', 'false'::jsonb, true);
        v_half := v_half + 1;
        RETURN jsonb_build_object(
          'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
          'halfmove', v_half, 'fullmove', v_full, 'capture', false, 'pawn_move', false
        );
      END IF;
      IF v_dc = -2 AND coalesce((v_cas ->> 'wQ')::boolean, false)
         AND public.ov2_ch_sq(v_sq, 1) = '.' AND public.ov2_ch_sq(v_sq, 2) = '.' AND public.ov2_ch_sq(v_sq, 3) = '.'
         AND public.ov2_ch_sq(v_sq, 0) = 'R'
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 4, false)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 3, false)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 2, false) THEN
        v_ns := public.ov2_ch_set_sq(v_ns, 4, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 0, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 2, 'K');
        v_ns := public.ov2_ch_set_sq(v_ns, 3, 'R');
        v_cas := jsonb_set(jsonb_set(v_cas, '{wK}', 'false'::jsonb, true), '{wQ}', 'false'::jsonb, true);
        v_half := v_half + 1;
        RETURN jsonb_build_object(
          'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
          'halfmove', v_half, 'fullmove', v_full, 'capture', false, 'pawn_move', false
        );
      END IF;
    END IF;
    IF NOT v_w_move AND v_fr = 7 AND v_fc = 4 AND v_dr = 0 AND v_tr = 7 THEN
      IF v_dc = 2 AND coalesce((v_cas ->> 'bK')::boolean, false)
         AND public.ov2_ch_sq(v_sq, 61) = '.' AND public.ov2_ch_sq(v_sq, 62) = '.'
         AND public.ov2_ch_sq(v_sq, 63) = 'r'
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 60, true)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 61, true)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 62, true) THEN
        v_ns := public.ov2_ch_set_sq(v_ns, 60, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 63, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 62, 'k');
        v_ns := public.ov2_ch_set_sq(v_ns, 61, 'r');
        v_cas := jsonb_set(jsonb_set(v_cas, '{bK}', 'false'::jsonb, true), '{bQ}', 'false'::jsonb, true);
        v_half := v_half + 1;
        RETURN jsonb_build_object(
          'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
          'halfmove', v_half, 'fullmove', v_full, 'capture', false, 'pawn_move', false
        );
      END IF;
      IF v_dc = -2 AND coalesce((v_cas ->> 'bQ')::boolean, false)
         AND public.ov2_ch_sq(v_sq, 57) = '.' AND public.ov2_ch_sq(v_sq, 58) = '.' AND public.ov2_ch_sq(v_sq, 59) = '.'
         AND public.ov2_ch_sq(v_sq, 56) = 'r'
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 60, true)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 59, true)
         AND NOT public._ov2_ch_sq_attacked_after(v_sq, 58, true) THEN
        v_ns := public.ov2_ch_set_sq(v_ns, 60, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 56, '.');
        v_ns := public.ov2_ch_set_sq(v_ns, 58, 'k');
        v_ns := public.ov2_ch_set_sq(v_ns, 59, 'r');
        v_cas := jsonb_set(jsonb_set(v_cas, '{bK}', 'false'::jsonb, true), '{bQ}', 'false'::jsonb, true);
        v_half := v_half + 1;
        RETURN jsonb_build_object(
          'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
          'halfmove', v_half, 'fullmove', v_full, 'capture', false, 'pawn_move', false
        );
      END IF;
    END IF;
    RETURN NULL;
  END IF;

  -- Knight
  IF lower(v_ch) = 'n' THEN
    IF NOT ((abs(v_dr) = 2 AND abs(v_dc) = 1) OR (abs(v_dr) = 1 AND abs(v_dc) = 2)) THEN
      RETURN NULL;
    END IF;
    v_ns := public.ov2_ch_set_sq(v_ns, p_to, v_ch);
    v_ns := public.ov2_ch_set_sq(v_ns, p_from, '.');
    IF p_from = 0 OR p_to = 0 THEN v_cas := jsonb_set(v_cas, '{wQ}', 'false'::jsonb, true); END IF;
    IF p_from = 7 OR p_to = 7 THEN v_cas := jsonb_set(v_cas, '{wK}', 'false'::jsonb, true); END IF;
    IF p_from = 56 OR p_to = 56 THEN v_cas := jsonb_set(v_cas, '{bQ}', 'false'::jsonb, true); END IF;
    IF p_from = 63 OR p_to = 63 THEN v_cas := jsonb_set(v_cas, '{bK}', 'false'::jsonb, true); END IF;
    v_half := CASE WHEN v_tgt = '.' THEN v_half + 1 ELSE 0 END;
    RETURN jsonb_build_object(
      'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
      'halfmove', v_half, 'fullmove', v_full,
      'capture', CASE WHEN v_tgt <> '.' THEN true ELSE false END,
      'pawn_move', false
    );
  END IF;

  -- Sliding: bishop / rook / queen
  IF lower(v_ch) IN ('b', 'r', 'q') THEN
    v_ok := false;
    IF lower(v_ch) IN ('r', 'q') AND (v_fr = v_tr OR v_fc = v_tc) THEN
      v_ok := public._ov2_ch_seg_clear(v_sq, p_from, p_to);
    END IF;
    IF NOT v_ok AND lower(v_ch) IN ('b', 'q') AND abs(v_dr) = abs(v_dc) AND v_dr <> 0 THEN
      v_ok := public._ov2_ch_seg_clear(v_sq, p_from, p_to);
    END IF;
    IF NOT v_ok THEN
      RETURN NULL;
    END IF;
    v_ns := public.ov2_ch_set_sq(v_ns, p_to, v_ch);
    v_ns := public.ov2_ch_set_sq(v_ns, p_from, '.');
    IF p_from IN (0, 7, 56, 63) OR p_to IN (0, 7, 56, 63) THEN
      IF p_from = 0 OR p_to = 0 THEN v_cas := jsonb_set(v_cas, '{wQ}', 'false'::jsonb, true); END IF;
      IF p_from = 7 OR p_to = 7 THEN v_cas := jsonb_set(v_cas, '{wK}', 'false'::jsonb, true); END IF;
      IF p_from = 56 OR p_to = 56 THEN v_cas := jsonb_set(v_cas, '{bQ}', 'false'::jsonb, true); END IF;
      IF p_from = 63 OR p_to = 63 THEN v_cas := jsonb_set(v_cas, '{bK}', 'false'::jsonb, true); END IF;
    END IF;
    v_half := CASE WHEN v_tgt = '.' THEN v_half + 1 ELSE 0 END;
    RETURN jsonb_build_object(
      'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
      'halfmove', v_half, 'fullmove', v_full,
      'capture', CASE WHEN v_tgt <> '.' THEN true ELSE false END,
      'pawn_move', false
    );
  END IF;

  -- Pawn
  IF lower(v_ch) = 'p' THEN
    v_ep_cap := NULL;
    IF v_w_move THEN
      IF v_dc = 0 AND v_tgt = '.' THEN
        IF v_dr = 1 THEN
          NULL;
        ELSIF v_dr = 2 AND v_fr = 1 AND public.ov2_ch_sq(v_sq, p_from + 8) = '.' THEN
          NULL;
        ELSE
          RETURN NULL;
        END IF;
      ELSIF abs(v_dc) = 1 AND v_dr = 1 AND v_tgt <> '.' AND public.ov2_ch_is_black_sq(v_tgt) THEN
        NULL;
      ELSIF abs(v_dc) = 1 AND v_dr = 1 AND v_tgt = '.' AND v_ep IS NOT NULL AND jsonb_typeof(v_ep) <> 'null' THEN
        BEGIN
          IF p_to = (trim(both '"' from v_ep::text))::int THEN
            v_ep_cap := p_to + 8;
          END IF;
        EXCEPTION
          WHEN invalid_text_representation THEN
            v_ep_cap := NULL;
        END;
        IF v_ep_cap IS NULL OR public.ov2_ch_sq(v_sq, v_ep_cap) NOT IN ('p') THEN
          RETURN NULL;
        END IF;
      ELSE
        RETURN NULL;
      END IF;
      v_ns := public.ov2_ch_set_sq(v_ns, p_from, '.');
      IF v_ep_cap IS NOT NULL THEN
        v_ns := public.ov2_ch_set_sq(v_ns, v_ep_cap, '.');
      END IF;
      IF v_tr = 7 THEN
        v_pr := upper(left(trim(COALESCE(p_promo, 'Q')), 1));
        IF v_pr NOT IN ('Q', 'R', 'B', 'N') THEN
          v_pr := 'Q';
        END IF;
        v_ns := public.ov2_ch_set_sq(v_ns, p_to, v_pr);
      ELSE
        v_ns := public.ov2_ch_set_sq(v_ns, p_to, 'P');
      END IF;
      v_cas := jsonb_set(jsonb_set(v_cas, '{wK}', 'false'::jsonb, true), '{wQ}', 'false'::jsonb, true);
      v_half := 0;
      RETURN jsonb_build_object(
        'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
        'halfmove', v_half,
        'fullmove', v_full,
        'capture', CASE WHEN v_tgt <> '.' OR v_ep_cap IS NOT NULL THEN true ELSE false END,
        'pawn_move', true,
        'ep_next', CASE WHEN v_dr = 2 THEN to_jsonb(p_from + 8) ELSE 'null'::jsonb END
      );
    ELSE
      IF v_dc = 0 AND v_tgt = '.' THEN
        IF v_dr = -1 THEN
          NULL;
        ELSIF v_dr = -2 AND v_fr = 6 AND public.ov2_ch_sq(v_sq, p_from - 8) = '.' THEN
          NULL;
        ELSE
          RETURN NULL;
        END IF;
      ELSIF abs(v_dc) = 1 AND v_dr = -1 AND v_tgt <> '.' AND public.ov2_ch_is_white_sq(v_tgt) THEN
        NULL;
      ELSIF abs(v_dc) = 1 AND v_dr = -1 AND v_tgt = '.' AND v_ep IS NOT NULL AND jsonb_typeof(v_ep) <> 'null' THEN
        BEGIN
          IF p_to = (trim(both '"' from v_ep::text))::int THEN
            v_ep_cap := p_to - 8;
          END IF;
        EXCEPTION
          WHEN invalid_text_representation THEN
            v_ep_cap := NULL;
        END;
        IF v_ep_cap IS NULL OR public.ov2_ch_sq(v_sq, v_ep_cap) NOT IN ('P') THEN
          RETURN NULL;
        END IF;
      ELSE
        RETURN NULL;
      END IF;
      v_ns := public.ov2_ch_set_sq(v_ns, p_from, '.');
      IF v_ep_cap IS NOT NULL THEN
        v_ns := public.ov2_ch_set_sq(v_ns, v_ep_cap, '.');
      END IF;
      IF v_tr = 0 THEN
        v_pr := lower(left(trim(COALESCE(p_promo, 'q')), 1));
        IF v_pr NOT IN ('q', 'r', 'b', 'n') THEN
          v_pr := 'q';
        END IF;
        v_ns := public.ov2_ch_set_sq(v_ns, p_to, v_pr);
      ELSE
        v_ns := public.ov2_ch_set_sq(v_ns, p_to, 'p');
      END IF;
      v_cas := jsonb_set(jsonb_set(v_cas, '{bK}', 'false'::jsonb, true), '{bQ}', 'false'::jsonb, true);
      v_half := 0;
      RETURN jsonb_build_object(
        'squares', v_ns, 'castling', v_cas, 'ep', 'null'::jsonb,
        'halfmove', v_half,
        'fullmove', v_full,
        'capture', CASE WHEN v_tgt <> '.' OR v_ep_cap IS NOT NULL THEN true ELSE false END,
        'pawn_move', true,
        'ep_next', CASE WHEN v_dr = -2 THEN to_jsonb(p_from - 8) ELSE 'null'::jsonb END
      );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_ch_merge_pseudo_patch(p_board jsonb, v_pa jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_nb jsonb;
  v_epn jsonb;
BEGIN
  v_nb := jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          p_board,
          '{squares}', v_pa -> 'squares', true
        ),
        '{castling}', COALESCE(v_pa -> 'castling', p_board -> 'castling'), true
      ),
      '{halfmove}', v_pa -> 'halfmove', true
    ),
    '{fullmove}', COALESCE(v_pa -> 'fullmove', p_board -> 'fullmove'), true
  );
  v_epn := v_pa -> 'ep_next';
  IF v_epn IS NOT NULL AND jsonb_typeof(v_epn) <> 'null' THEN
    v_nb := jsonb_set(v_nb, '{ep}', v_epn, true);
  ELSE
    v_nb := jsonb_set(v_nb, '{ep}', 'null'::jsonb, true);
  END IF;
  RETURN v_nb;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_has_legal_move(p_board jsonb, p_turn_seat int)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_i int;
  v_j int;
  v_sq jsonb;
  v_ch text;
  v_w boolean;
  v_pa jsonb;
  v_nb jsonb;
  v_mw boolean;
  v_px text;
BEGIN
  IF p_turn_seat NOT IN (0, 1) THEN
    RETURN false;
  END IF;
  v_sq := p_board -> 'squares';
  IF v_sq IS NULL OR jsonb_typeof(v_sq) <> 'array' THEN
    RETURN false;
  END IF;
  v_w := (p_turn_seat = 0);
  FOR v_i IN 0..63 LOOP
    v_ch := public.ov2_ch_sq(v_sq, v_i);
    IF v_ch = '.' THEN
      CONTINUE;
    END IF;
    IF v_w AND NOT public.ov2_ch_is_white_sq(v_ch) THEN
      CONTINUE;
    END IF;
    IF NOT v_w AND NOT public.ov2_ch_is_black_sq(v_ch) THEN
      CONTINUE;
    END IF;
    FOR v_j IN 0..63 LOOP
      IF v_i = v_j THEN
        CONTINUE;
      END IF;
      IF lower(v_ch) = 'p' AND v_w AND (v_j / 8) = 7 THEN
        FOREACH v_px IN ARRAY ARRAY['Q', 'R', 'B', 'N'] LOOP
          v_pa := public._ov2_ch_pseudo_apply(p_board, v_i, v_j, v_px);
          IF v_pa IS NULL THEN
            CONTINUE;
          END IF;
          v_nb := public._ov2_ch_merge_pseudo_patch(p_board, v_pa);
          v_mw := v_w;
          IF public.ov2_ch_in_check(v_nb, v_mw) THEN
            CONTINUE;
          END IF;
          RETURN true;
        END LOOP;
      ELSIF lower(v_ch) = 'p' AND NOT v_w AND (v_j / 8) = 0 THEN
        FOREACH v_px IN ARRAY ARRAY['q', 'r', 'b', 'n'] LOOP
          v_pa := public._ov2_ch_pseudo_apply(p_board, v_i, v_j, v_px);
          IF v_pa IS NULL THEN
            CONTINUE;
          END IF;
          v_nb := public._ov2_ch_merge_pseudo_patch(p_board, v_pa);
          v_mw := v_w;
          IF public.ov2_ch_in_check(v_nb, v_mw) THEN
            CONTINUE;
          END IF;
          RETURN true;
        END LOOP;
      ELSE
        v_pa := public._ov2_ch_pseudo_apply(p_board, v_i, v_j, 'Q');
        IF v_pa IS NULL THEN
          CONTINUE;
        END IF;
        v_nb := public._ov2_ch_merge_pseudo_patch(p_board, v_pa);
        v_mw := v_w;
        IF public.ov2_ch_in_check(v_nb, v_mw) THEN
          CONTINUE;
        END IF;
        RETURN true;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_apply_move(p_board jsonb, p_from int, p_to int, p_promo text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ts int;
  v_w boolean;
  v_pa jsonb;
  v_nb jsonb;
  v_turn_next int;
  v_opp_w boolean;
  v_mate boolean := false;
  v_stale boolean := false;
  v_winner int;
  v_fm_int int;
BEGIN
  IF p_board IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'No board');
  END IF;
  BEGIN
    v_ts := (p_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN', 'message', 'Bad turn');
  END;
  IF v_ts NOT IN (0, 1) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_TURN', 'message', 'Bad turn');
  END IF;
  v_w := (v_ts = 0);
  v_pa := public._ov2_ch_pseudo_apply(p_board, p_from, p_to, p_promo);
  IF v_pa IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ILLEGAL_MOVE', 'message', 'Illegal move');
  END IF;
  v_nb := public._ov2_ch_merge_pseudo_patch(p_board, v_pa);
  BEGIN
    v_fm_int := greatest(1, COALESCE((p_board ->> 'fullmove')::int, 1));
  EXCEPTION
    WHEN invalid_text_representation THEN
      v_fm_int := 1;
  END;
  IF v_ts = 1 THEN
    v_fm_int := v_fm_int + 1;
  END IF;
  v_nb := jsonb_set(v_nb, '{fullmove}', to_jsonb(v_fm_int), true);
  IF public.ov2_ch_in_check(v_nb, v_w) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'IN_CHECK', 'message', 'King in check');
  END IF;
  v_turn_next := CASE WHEN v_ts = 0 THEN 1 ELSE 0 END;
  v_nb := jsonb_set(v_nb, '{turnSeat}', to_jsonb(v_turn_next), true);
  v_opp_w := (v_turn_next = 0);
  IF NOT public.ov2_ch_has_legal_move(v_nb, v_turn_next) THEN
    IF public.ov2_ch_in_check(v_nb, v_opp_w) THEN
      v_mate := true;
      v_winner := v_ts;
    ELSE
      v_stale := true;
      v_winner := NULL;
    END IF;
  END IF;
  IF v_mate THEN
    v_nb := jsonb_set(jsonb_set(v_nb, '{resultKind}', '"checkmate"'::jsonb, true), '{winner}', to_jsonb(v_ts), true);
  ELSIF v_stale THEN
    v_nb := jsonb_set(jsonb_set(v_nb, '{resultKind}', '"stalemate"'::jsonb, true), '{winner}', 'null'::jsonb, true);
  ELSE
    v_nb := jsonb_set(jsonb_set(v_nb, '{resultKind}', 'null'::jsonb, true), '{winner}', 'null'::jsonb, true);
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'board', v_nb,
    'winner', CASE WHEN v_mate THEN to_jsonb(v_ts) ELSE 'null'::jsonb END,
    'resultKind',
    CASE
      WHEN v_mate THEN '"checkmate"'::jsonb
      WHEN v_stale THEN '"stalemate"'::jsonb
      ELSE 'null'::jsonb
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_move_is_legal(p_board jsonb, p_from int, p_to int, p_promo text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ts int;
  v_w boolean;
  v_pa jsonb;
  v_nb jsonb;
BEGIN
  IF p_board IS NULL THEN
    RETURN false;
  END IF;
  BEGIN
    v_ts := (p_board ->> 'turnSeat')::int;
  EXCEPTION
    WHEN invalid_text_representation THEN
      RETURN false;
  END;
  IF v_ts NOT IN (0, 1) THEN
    RETURN false;
  END IF;
  v_w := (v_ts = 0);
  v_pa := public._ov2_ch_pseudo_apply(p_board, p_from, p_to, p_promo);
  IF v_pa IS NULL THEN
    RETURN false;
  END IF;
  v_nb := public._ov2_ch_merge_pseudo_patch(p_board, v_pa);
  IF public.ov2_ch_in_check(v_nb, v_w) THEN
    RETURN false;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public._ov2_ch_seg_clear(jsonb, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_ch_sq_attacked_after(jsonb, integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_ch_pseudo_apply(jsonb, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._ov2_ch_merge_pseudo_patch(jsonb, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.ov2_ch_piece_attacks_square(jsonb, integer, integer, boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_ch_has_legal_move(jsonb, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_ch_apply_move(jsonb, integer, integer, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ov2_ch_move_is_legal(jsonb, integer, integer, text) TO anon, authenticated, service_role;

COMMIT;
