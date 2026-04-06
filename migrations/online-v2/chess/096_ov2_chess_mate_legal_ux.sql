-- OV2 Chess: re-apply engine terminal + king-capture guard + RPC mate branch hardening + legal-tos helper.
-- Apply after 094. Idempotent CREATE OR REPLACE.

BEGIN;
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
    /* Standard chess: game ends at mate/stalemate Ã¢â‚¬â€ never capture the king as a normal move. */
    IF v_w_move AND v_tgt = 'k' THEN
      RETURN NULL;
    END IF;
    IF NOT v_w_move AND v_tgt = 'K' THEN
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
  /* Terminal: opponent king absent (e.g. corrupt board) - award win to mover; safety net if mate path missed. */
  IF public.ov2_ch_find_king(v_nb, NOT v_w) < 0 THEN
    v_turn_next := CASE WHEN v_ts = 0 THEN 1 ELSE 0 END;
    v_nb := jsonb_set(v_nb, '{turnSeat}', to_jsonb(v_turn_next), true);
    v_nb := jsonb_set(jsonb_set(v_nb, '{resultKind}', '"checkmate"'::jsonb, true), '{winner}', to_jsonb(v_ts), true);
    RETURN jsonb_build_object(
      'ok', true,
      'board', v_nb,
      'winner', to_jsonb(v_ts),
      'resultKind', '"checkmate"'::jsonb
    );
  END IF;
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

-- Hardened apply RPC (same body as 094 after mate/resultKind fix).
CREATE OR REPLACE FUNCTION public.ov2_chess_apply_move(
  p_room_id uuid,
  p_participant_key text,
  p_from integer,
  p_to integer,
  p_promo text DEFAULT 'Q',
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_chess_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_ap jsonb;
  v_w int;
  v_entry bigint;
  v_ps jsonb;
  v_new_board jsonb;
  v_snap jsonb;
  v_rk text;
BEGIN
  IF p_room_id IS NULL OR p_from IS NULL OR p_to IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id FOR UPDATE;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_chess' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_chess_sessions WHERE id = v_room.active_session_id FOR UPDATE;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not playing');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_chess_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  BEGIN
    v_ap := public.ov2_ch_apply_move(v_board, p_from, p_to, trim(COALESCE(p_promo, 'Q')));
  EXCEPTION
    WHEN OTHERS THEN
      RAISE LOG 'ov2_chess_apply_move engine err state=% msg=%', SQLSTATE, SQLERRM;
      RETURN jsonb_build_object('ok', false, 'code', 'ENGINE_ERROR', 'message', 'Move validation failed');
  END;

  IF coalesce((v_ap ->> 'ok')::boolean, false) IS NOT TRUE THEN
    RETURN jsonb_build_object(
      'ok', false,
      'code', COALESCE(v_ap ->> 'code', 'ILLEGAL_MOVE'),
      'message', 'Illegal move'
    );
  END IF;

  v_new_board := v_ap -> 'board';
  v_rk := COALESCE(v_ap ->> 'resultKind', v_new_board ->> 'resultKind');
  IF v_rk IS NOT NULL THEN
    v_rk := trim(both '"' from v_rk);
  END IF;
  v_w := NULL;
  IF v_ap ? 'winner' AND v_ap -> 'winner' IS NOT NULL AND jsonb_typeof(v_ap -> 'winner') <> 'null' THEN
    BEGIN
      v_w := (v_ap ->> 'winner')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_w := NULL;
    END;
  END IF;
  IF v_w IS NULL AND v_new_board ? 'winner' AND jsonb_typeof(v_new_board -> 'winner') = 'number' THEN
    BEGIN
      v_w := (v_new_board ->> 'winner')::int;
    EXCEPTION
      WHEN invalid_text_representation THEN
        v_w := NULL;
    END;
  END IF;

  IF v_rk = 'checkmate' AND v_w IS NOT NULL AND v_w IN (0, 1) THEN
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'winner', v_w,
        'prize', v_entry * 2,
        'lossPerSeat', v_entry,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_chess_sessions
    SET
      board = v_new_board,
      turn_seat = (v_new_board ->> 'turnSeat')::int,
      winner_seat = v_w,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    v_snap := public.ov2_chess_build_client_snapshot(v_sess, v_pk);
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
  END IF;

  IF v_rk = 'stalemate' THEN
    v_entry := COALESCE((v_sess.parity_state ->> '__entry__')::bigint, 0);
    v_ps := jsonb_set(
      COALESCE(v_sess.parity_state, '{}'::jsonb),
      '{__result__}',
      jsonb_build_object(
        'draw', true,
        'stalemate', true,
        'refundPerSeat', v_entry,
        'timestamp', (extract(epoch from now()) * 1000)::bigint
      ),
      true
    );
    UPDATE public.ov2_chess_sessions
    SET
      board = v_new_board,
      turn_seat = (v_new_board ->> 'turnSeat')::int,
      winner_seat = NULL,
      phase = 'finished',
      parity_state = v_ps,
      revision = v_sess.revision + 1,
      updated_at = now()
    WHERE id = v_sess.id
    RETURNING * INTO v_sess;
    v_snap := public.ov2_chess_build_client_snapshot(v_sess, v_pk);
    RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
  END IF;

  v_ps := public.ov2_chess_parity_bump_timer(
    v_sess.parity_state,
    (v_new_board ->> 'turnSeat')::int,
    v_seat
  );
  UPDATE public.ov2_chess_sessions
  SET
    board = v_new_board,
    turn_seat = (v_new_board ->> 'turnSeat')::int,
    parity_state = v_ps,
    revision = v_sess.revision + 1,
    updated_at = now()
  WHERE id = v_sess.id
  RETURNING * INTO v_sess;

  v_snap := public.ov2_chess_build_client_snapshot(v_sess, v_pk);
  RETURN jsonb_build_object('ok', true, 'snapshot', v_snap);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_legal_to_indices(p_board jsonb, p_from int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_out int[] := ARRAY[]::integer[];
  v_j int;
  v_pr text;
  v_hit boolean;
BEGIN
  IF p_board IS NULL OR p_from IS NULL OR p_from < 0 OR p_from > 63 THEN
    RETURN '[]'::jsonb;
  END IF;
  FOR v_j IN 0..63 LOOP
    IF v_j = p_from THEN
      CONTINUE;
    END IF;
    v_hit := false;
    FOREACH v_pr IN ARRAY ARRAY['Q','R','B','N','q','r','b','n'] LOOP
      IF public.ov2_ch_move_is_legal(p_board, p_from, v_j, v_pr) THEN
        v_out := array_append(v_out, v_j);
        v_hit := true;
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  IF coalesce(array_length(v_out, 1), 0) = 0 THEN
    RETURN '[]'::jsonb;
  END IF;
  RETURN to_jsonb(v_out);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_chess_legal_tos(
  p_room_id uuid,
  p_participant_key text,
  p_from integer,
  p_expected_revision bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_room public.ov2_rooms%ROWTYPE;
  v_pk text;
  v_sess public.ov2_chess_sessions%ROWTYPE;
  v_seat int;
  v_board jsonb;
  v_turn int;
  v_sq jsonb;
  v_ch text;
BEGIN
  IF p_room_id IS NULL OR p_from IS NULL OR p_from < 0 OR p_from > 63 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'Invalid arguments');
  END IF;
  v_pk := trim(COALESCE(p_participant_key, ''));
  IF length(v_pk) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_ARGUMENT', 'message', 'participant_key required');
  END IF;

  SELECT * INTO v_room FROM public.ov2_rooms WHERE id = p_room_id;
  IF NOT FOUND OR v_room.product_game_id IS DISTINCT FROM 'ov2_chess' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ROOM_NOT_FOUND', 'message', 'Room not found');
  END IF;
  IF v_room.active_session_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_ACTIVE_SESSION', 'message', 'No active session');
  END IF;

  SELECT * INTO v_sess FROM public.ov2_chess_sessions WHERE id = v_room.active_session_id;
  IF NOT FOUND OR v_sess.room_id IS DISTINCT FROM p_room_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'SESSION_NOT_FOUND', 'message', 'Session not found');
  END IF;
  IF p_expected_revision IS NOT NULL AND v_sess.revision IS DISTINCT FROM p_expected_revision THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REVISION_MISMATCH', 'message', 'Revision mismatch', 'revision', v_sess.revision);
  END IF;
  IF v_sess.status IS DISTINCT FROM 'live' OR v_sess.phase IS DISTINCT FROM 'playing' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'GAME_NOT_PLAYING', 'message', 'Session not playing');
  END IF;

  SELECT seat_index INTO v_seat FROM public.ov2_chess_seats WHERE session_id = v_sess.id AND participant_key = v_pk;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_SEAT', 'message', 'No seat for participant');
  END IF;

  v_board := v_sess.board;
  v_turn := (v_board ->> 'turnSeat')::int;
  IF v_turn IS DISTINCT FROM v_seat THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_TURN', 'message', 'Not your turn');
  END IF;

  v_sq := v_board -> 'squares';
  IF v_sq IS NULL OR jsonb_typeof(v_sq) <> 'array' OR jsonb_array_length(v_sq) <> 64 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BAD_BOARD', 'message', 'Bad board');
  END IF;
  v_ch := public.ov2_ch_sq(v_sq, p_from);
  IF v_ch = '.' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'EMPTY_FROM', 'message', 'No piece on square');
  END IF;
  IF v_turn = 0 AND NOT public.ov2_ch_is_white_sq(v_ch) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_PIECE', 'message', 'Not your piece');
  END IF;
  IF v_turn = 1 AND NOT public.ov2_ch_is_black_sq(v_ch) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_YOUR_PIECE', 'message', 'Not your piece');
  END IF;

  RETURN jsonb_build_object('ok', true, 'tos', public.ov2_ch_legal_to_indices(v_board, p_from));
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ch_legal_to_indices(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ch_legal_to_indices(jsonb, integer) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.ov2_chess_legal_tos(uuid, text, integer, bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_chess_legal_tos(uuid, text, integer, bigint) TO anon, authenticated, service_role;

COMMIT;
