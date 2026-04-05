-- OV2 Chess engine helpers (standard rules). Apply after schema migration for chess.
-- Board: squares[0..63] a1=0..h1=7, a8=56..h8=63; turn 0=white 1=black.
-- ep: FEN-style target = square the pawn skipped over on a 2-step push (capture lands here; victim is behind from mover POV).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ch_initial_board_json()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'squares', jsonb_build_array(
      'R','N','B','Q','K','B','N','R',
      'P','P','P','P','P','P','P','P',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      'p','p','p','p','p','p','p','p',
      'r','n','b','q','k','b','n','r'
    ),
    'turn', 0,
    'castling', jsonb_build_object('wK', true, 'wQ', true, 'bK', true, 'bQ', true),
    'ep', NULL::jsonb,
    'halfmove', 0,
    'fullmove', 1
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_sq_get(p_board jsonb, p_idx int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_a jsonb;
  v_t text;
BEGIN
  IF p_board IS NULL OR p_idx < 0 OR p_idx > 63 THEN
    RETURN '.';
  END IF;
  v_a := p_board -> 'squares';
  IF v_a IS NULL OR jsonb_typeof(v_a) <> 'array' OR p_idx >= jsonb_array_length(v_a) THEN
    RETURN '.';
  END IF;
  v_t := v_a ->> p_idx::text;
  IF v_t IS NULL OR length(trim(v_t)) = 0 THEN
    RETURN '.';
  END IF;
  RETURN left(trim(v_t), 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_sq_set(p_board jsonb, p_idx int, p_ch text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_a jsonb;
BEGIN
  IF p_board IS NULL OR p_idx < 0 OR p_idx > 63 THEN
    RETURN p_board;
  END IF;
  v_a := p_board -> 'squares';
  IF v_a IS NULL OR jsonb_typeof(v_a) <> 'array' THEN
    RETURN p_board;
  END IF;
  IF p_idx >= jsonb_array_length(v_a) THEN
    RETURN p_board;
  END IF;
  RETURN jsonb_set(p_board, ARRAY['squares', p_idx::text], to_jsonb(COALESCE(NULLIF(trim(p_ch), ''), '.')), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_color_at(p_board jsonb, p_idx int)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c text;
  ac int;
BEGIN
  c := ov2_ch_sq_get(p_board, p_idx);
  IF c = '.' THEN
    RETURN NULL;
  END IF;
  ac := ascii(c);
  IF ac BETWEEN 65 AND 90 THEN
    RETURN 0;
  END IF;
  IF ac BETWEEN 97 AND 122 THEN
    RETURN 1;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_piece_type(p_board jsonb, p_idx int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c text;
BEGIN
  c := ov2_ch_sq_get(p_board, p_idx);
  IF c = '.' THEN
    RETURN NULL;
  END IF;
  RETURN upper(c);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_find_king(p_board jsonb, p_white boolean)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int;
  want text := CASE WHEN p_white THEN 'K' ELSE 'k' END;
BEGIN
  FOR i IN 0..63 LOOP
    IF ov2_ch_sq_get(p_board, i) = want THEN
      RETURN i;
    END IF;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_is_square_attacked(p_board jsonb, p_idx int, p_by_white boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  i int;
  pc text;
  pt text;
  fi int; ri int; ft int; rt int;
  df int; dr int; sf int; sr int;
  s int; j int; nf int; nr int; blk text;
BEGIN
  ft := p_idx % 8;
  rt := p_idx / 8;
  FOR i IN 0..63 LOOP
    pc := ov2_ch_sq_get(p_board, i);
    IF pc = '.' THEN
      CONTINUE;
    END IF;
    IF p_by_white THEN
      IF ascii(pc) < 65 OR ascii(pc) > 90 THEN
        CONTINUE;
      END IF;
    ELSE
      IF ascii(pc) < 97 OR ascii(pc) > 122 THEN
        CONTINUE;
      END IF;
    END IF;
    pt := upper(pc);
    fi := i % 8;
    ri := i / 8;
    df := ft - fi;
    dr := rt - ri;
    IF pt = 'N' THEN
      IF abs(df) * abs(dr) = 2 AND abs(df) + abs(dr) = 3 THEN
        RETURN true;
      END IF;
      CONTINUE;
    END IF;
    IF pt = 'P' THEN
      IF p_by_white THEN
        IF dr = 1 AND abs(df) = 1 THEN
          RETURN true;
        END IF;
      ELSE
        IF dr = -1 AND abs(df) = 1 THEN
          RETURN true;
        END IF;
      END IF;
      CONTINUE;
    END IF;
    IF pt = 'K' THEN
      IF abs(df) <= 1 AND abs(dr) <= 1 AND (df <> 0 OR dr <> 0) THEN
        RETURN true;
      END IF;
      CONTINUE;
    END IF;
    IF df <> 0 AND dr <> 0 AND abs(df) <> abs(dr) THEN
      CONTINUE;
    END IF;
    IF df = 0 AND dr = 0 THEN
      CONTINUE;
    END IF;
    IF pt = 'R' AND df <> 0 AND dr <> 0 THEN
      CONTINUE;
    END IF;
    IF pt = 'B' AND (df = 0 OR dr = 0) THEN
      CONTINUE;
    END IF;
    sf := CASE WHEN df <> 0 THEN sign(df) ELSE 0 END;
    sr := CASE WHEN dr <> 0 THEN sign(dr) ELSE 0 END;
    FOR j IN 1..7 LOOP
      nf := fi + j * sf;
      nr := ri + j * sr;
      IF nf < 0 OR nf > 7 OR nr < 0 OR nr > 7 THEN
        EXIT;
      END IF;
      s := nr * 8 + nf;
      IF s = p_idx THEN
        RETURN true;
      END IF;
      blk := ov2_ch_sq_get(p_board, s);
      IF blk <> '.' THEN
        EXIT;
      END IF;
    END LOOP;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_in_check(p_board jsonb, p_white_to_move boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k int;
BEGIN
  k := ov2_ch_find_king(p_board, p_white_to_move);
  IF k IS NULL THEN
    RETURN false;
  END IF;
  RETURN ov2_ch_is_square_attacked(p_board, k, NOT p_white_to_move);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_pseudo_legal_moves_from(p_board jsonb, p_from int)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_turn int;
  v_sq text;
  v_col int;
  v_pt text;
  v_moves jsonb := '[]'::jsonb;
  fi int; ri int;
  t int; tf int; tr int;
  dir int; s int; j int; c2 text; oc int;
  epv int;
  wk boolean; wq boolean; bk boolean; bq boolean;
  occ int;
BEGIN
  IF p_board IS NULL OR p_from < 0 OR p_from > 63 THEN
    RETURN '[]'::jsonb;
  END IF;
  v_turn := COALESCE(NULLIF(p_board ->> 'turn', '')::int, 0);
  IF v_turn NOT IN (0, 1) THEN
    v_turn := 0;
  END IF;
  v_sq := ov2_ch_sq_get(p_board, p_from);
  IF v_sq = '.' THEN
    RETURN '[]'::jsonb;
  END IF;
  v_col := ov2_ch_color_at(p_board, p_from);
  IF v_col IS NULL OR v_col <> v_turn THEN
    RETURN '[]'::jsonb;
  END IF;
  v_pt := upper(v_sq);
  fi := p_from % 8;
  ri := p_from / 8;
  wk := COALESCE((p_board #>> '{castling,wK}')::boolean, false);
  wq := COALESCE((p_board #>> '{castling,wQ}')::boolean, false);
  bk := COALESCE((p_board #>> '{castling,bK}')::boolean, false);
  bq := COALESCE((p_board #>> '{castling,bQ}')::boolean, false);
  IF (p_board -> 'ep') IS NOT NULL AND jsonb_typeof(p_board -> 'ep') <> 'null' THEN
    BEGIN
      epv := (p_board ->> 'ep')::int;
    EXCEPTION
      WHEN others THEN
        epv := NULL;
    END;
  ELSE
    epv := NULL;
  END IF;

  IF v_pt = 'P' THEN
    dir := CASE WHEN v_turn = 0 THEN 8 ELSE -8 END;
    t := p_from + dir;
    IF t BETWEEN 0 AND 63 AND ov2_ch_sq_get(p_board, t) = '.' THEN
      IF (v_turn = 0 AND ri = 6) OR (v_turn = 1 AND ri = 1) THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('Q'::text), 'flags', ''));
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('R'::text), 'flags', ''));
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('B'::text), 'flags', ''));
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('N'::text), 'flags', ''));
      ELSE
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', ''));
        IF (v_turn = 0 AND ri = 1) OR (v_turn = 1 AND ri = 6) THEN
          t := p_from + 2 * dir;
          IF t BETWEEN 0 AND 63 AND ov2_ch_sq_get(p_board, t) = '.' AND ov2_ch_sq_get(p_board, p_from + dir) = '.' THEN
            v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', ''));
          END IF;
        END IF;
      END IF;
    END IF;
    FOR j IN 0..1 LOOP
      t := p_from + dir + (CASE WHEN j = 0 THEN -1 ELSE 1 END);
      IF t < 0 OR t > 63 THEN
        CONTINUE;
      END IF;
      tf := t % 8;
      tr := t / 8;
      IF abs(tf - fi) <> 1 OR abs(tr - ri) <> 1 THEN
        CONTINUE;
      END IF;
      c2 := ov2_ch_sq_get(p_board, t);
      oc := ov2_ch_color_at(p_board, t);
      IF oc IS NOT NULL AND oc <> v_turn THEN
        IF (v_turn = 0 AND ri = 6) OR (v_turn = 1 AND ri = 1) THEN
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('Q'::text), 'flags', ''));
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('R'::text), 'flags', ''));
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('B'::text), 'flags', ''));
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', to_jsonb('N'::text), 'flags', ''));
        ELSE
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', ''));
        END IF;
      ELSIF epv IS NOT NULL AND t = epv AND c2 = '.' THEN
        occ := t - (CASE WHEN v_turn = 0 THEN 8 ELSE -8 END);
        IF occ BETWEEN 0 AND 63 AND ov2_ch_color_at(p_board, occ) = 1 - v_turn AND lower(ov2_ch_sq_get(p_board, occ)) = 'p' THEN
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', 'ep'));
        END IF;
      END IF;
    END LOOP;

  ELSIF v_pt = 'N' THEN
    FOR j IN 1..8 LOOP
      t := p_from + (ARRAY[17, 15, 10, 6, -6, -10, -15, -17])[j];
      IF t < 0 OR t > 63 THEN
        CONTINUE;
      END IF;
      tf := t % 8;
      tr := t / 8;
      IF abs(tf - fi) * abs(tr - ri) <> 2 OR abs(tf - fi) + abs(tr - ri) <> 3 THEN
        CONTINUE;
      END IF;
      oc := ov2_ch_color_at(p_board, t);
      IF oc IS NULL OR oc <> v_turn THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', ''));
      END IF;
    END LOOP;

  ELSIF v_pt = 'K' THEN
    FOR dr IN -1..1 LOOP
      FOR df IN -1..1 LOOP
        IF dr = 0 AND df = 0 THEN
          CONTINUE;
        END IF;
        t := p_from + dr * 8 + df;
        IF t < 0 OR t > 63 THEN
          CONTINUE;
        END IF;
        tf := t % 8;
        tr := t / 8;
        IF abs(tf - fi) > 1 OR abs(tr - ri) > 1 THEN
          CONTINUE;
        END IF;
        oc := ov2_ch_color_at(p_board, t);
        IF oc IS NULL OR oc <> v_turn THEN
          v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', t, 'promo', NULL::jsonb, 'flags', ''));
        END IF;
      END LOOP;
    END LOOP;
    IF v_turn = 0 AND p_from = 4 AND v_sq = 'K' THEN
      IF wk AND ov2_ch_sq_get(p_board, 5) = '.' AND ov2_ch_sq_get(p_board, 6) = '.' AND ov2_ch_sq_get(p_board, 7) = 'R'
         AND NOT ov2_ch_in_check(p_board, true)
         AND NOT ov2_ch_is_square_attacked(p_board, 5, false)
         AND NOT ov2_ch_is_square_attacked(p_board, 6, false) THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', 6, 'promo', NULL::jsonb, 'flags', 'ck'));
      END IF;
      IF wq AND ov2_ch_sq_get(p_board, 1) = '.' AND ov2_ch_sq_get(p_board, 2) = '.' AND ov2_ch_sq_get(p_board, 3) = '.'
         AND ov2_ch_sq_get(p_board, 0) = 'R'
         AND NOT ov2_ch_in_check(p_board, true)
         AND NOT ov2_ch_is_square_attacked(p_board, 3, false)
         AND NOT ov2_ch_is_square_attacked(p_board, 2, false) THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', 2, 'promo', NULL::jsonb, 'flags', 'cq'));
      END IF;
    ELSIF v_turn = 1 AND p_from = 60 AND v_sq = 'k' THEN
      IF bk AND ov2_ch_sq_get(p_board, 61) = '.' AND ov2_ch_sq_get(p_board, 62) = '.' AND ov2_ch_sq_get(p_board, 63) = 'r'
         AND NOT ov2_ch_in_check(p_board, false)
         AND NOT ov2_ch_is_square_attacked(p_board, 61, true)
         AND NOT ov2_ch_is_square_attacked(p_board, 62, true) THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', 62, 'promo', NULL::jsonb, 'flags', 'ck'));
      END IF;
      IF bq AND ov2_ch_sq_get(p_board, 57) = '.' AND ov2_ch_sq_get(p_board, 58) = '.' AND ov2_ch_sq_get(p_board, 59) = '.'
         AND ov2_ch_sq_get(p_board, 56) = 'r'
         AND NOT ov2_ch_in_check(p_board, false)
         AND NOT ov2_ch_is_square_attacked(p_board, 59, true)
         AND NOT ov2_ch_is_square_attacked(p_board, 58, true) THEN
        v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', 58, 'promo', NULL::jsonb, 'flags', 'cq'));
      END IF;
    END IF;

  ELSIF v_pt IN ('R','B','Q') THEN
    FOR dr IN -1..1 LOOP
      FOR df IN -1..1 LOOP
        IF dr = 0 AND df = 0 THEN
          CONTINUE;
        END IF;
        IF v_pt = 'R' AND dr <> 0 AND df <> 0 THEN
          CONTINUE;
        END IF;
        IF v_pt = 'B' AND (dr = 0 OR df = 0) THEN
          CONTINUE;
        END IF;
        FOR j IN 1..7 LOOP
          tf := fi + j * df;
          tr := ri + j * dr;
          IF tf < 0 OR tf > 7 OR tr < 0 OR tr > 7 THEN
            EXIT;
          END IF;
          s := tr * 8 + tf;
          c2 := ov2_ch_sq_get(p_board, s);
          IF c2 = '.' THEN
            v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', s, 'promo', NULL::jsonb, 'flags', ''));
          ELSE
            IF ov2_ch_color_at(p_board, s) IS NOT NULL AND ov2_ch_color_at(p_board, s) <> v_turn THEN
              v_moves := v_moves || jsonb_build_array(jsonb_build_object('to', s, 'promo', NULL::jsonb, 'flags', ''));
            END IF;
            EXIT;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  RETURN v_moves;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_apply_move(p_board jsonb, p_from int, p_to int, p_promo text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_turn int;
  v_nb jsonb;
  v_sq text;
  v_col int;
  v_pt text;
  v_moves jsonb;
  v_m jsonb;
  v_hit boolean := false;
  v_flags text := '';
  v_pr text;
  v_pr_want text;
  fi int; ri int;
  i int; j int; k int;
  v_k int;
  v_moving_white boolean;
  v_new_turn int;
  v_half int; v_full int;
  wk boolean; wq boolean; bk boolean; bq boolean;
  v_cap text;
  v_pawn_move boolean := false;
  v_capture boolean := false;
  v_ep_sq int;
  v_in_check boolean;
  v_any boolean := false;
  v_opp int;
  v_nb2 jsonb;
  v_sq2 text;
  v_pt2 text;
  v_col2 int;
  v_moves2 jsonb;
  v_m2 jsonb;
  v_f2 text;
  v_pr2 text;
  v_t2 int;
  v_k2 int;
  occ2 int;
BEGIN
  IF p_board IS NULL OR p_from < 0 OR p_from > 63 OR p_to < 0 OR p_to > 63 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'bounds', 'board', p_board, 'gameOver', false, 'winnerSeat', NULL::int, 'resultKind', 'ongoing');
  END IF;
  v_turn := COALESCE(NULLIF(p_board ->> 'turn', '')::int, 0);
  IF v_turn NOT IN (0, 1) THEN
    v_turn := 0;
  END IF;
  v_sq := ov2_ch_sq_get(p_board, p_from);
  IF v_sq = '.' OR ov2_ch_color_at(p_board, p_from) IS DISTINCT FROM v_turn THEN
    RETURN jsonb_build_object('ok', false, 'code', 'empty_or_turn', 'board', p_board, 'gameOver', false, 'winnerSeat', NULL::int, 'resultKind', 'ongoing');
  END IF;
  v_pt := upper(v_sq);
  v_moves := ov2_ch_pseudo_legal_moves_from(p_board, p_from);
  v_pr_want := upper(COALESCE(NULLIF(trim(p_promo), ''), 'Q'));
  IF v_pr_want NOT IN ('Q','R','B','N') THEN
    v_pr_want := 'Q';
  END IF;
  FOR i IN 0..GREATEST(jsonb_array_length(v_moves) - 1, -1) LOOP
    EXIT WHEN i > jsonb_array_length(v_moves) - 1;
    v_m := v_moves -> i;
    IF (v_m ->> 'to')::int IS DISTINCT FROM p_to THEN
      CONTINUE;
    END IF;
    v_flags := COALESCE(v_m ->> 'flags', '');
    IF v_m ? 'promo' AND jsonb_typeof(v_m -> 'promo') = 'null' THEN
      v_pr := NULL;
    ELSE
      v_pr := v_m ->> 'promo';
    END IF;
    IF v_pr IS NULL THEN
      IF v_pt = 'P' THEN
        ri := p_from / 8;
        IF (v_turn = 0 AND ri = 6) OR (v_turn = 1 AND ri = 1) THEN
          CONTINUE;
        END IF;
      END IF;
      IF v_pr_want IS DISTINCT FROM 'Q' THEN
        CONTINUE;
      END IF;
    ELSE
      IF upper(v_pr) IS DISTINCT FROM v_pr_want THEN
        CONTINUE;
      END IF;
    END IF;
    v_hit := true;
    EXIT;
  END LOOP;
  IF NOT v_hit THEN
    RETURN jsonb_build_object('ok', false, 'code', 'illegal_move', 'board', p_board, 'gameOver', false, 'winnerSeat', NULL::int, 'resultKind', 'ongoing');
  END IF;

  v_nb := p_board;
  v_cap := ov2_ch_sq_get(v_nb, p_to);
  v_capture := v_cap <> '.';
  v_nb := ov2_ch_sq_set(v_nb, p_to, v_sq);
  v_nb := ov2_ch_sq_set(v_nb, p_from, '.');

  IF v_flags = 'ep' THEN
    occ2 := p_to - (CASE WHEN v_turn = 0 THEN 8 ELSE -8 END);
    v_nb := ov2_ch_sq_set(v_nb, occ2, '.');
    v_capture := true;
  END IF;

  IF v_pt = 'K' AND abs(p_to - p_from) = 2 AND (p_from IN (4, 60)) THEN
    IF p_to > p_from THEN
      v_nb := ov2_ch_sq_set(v_nb, p_from + 1, ov2_ch_sq_get(v_nb, p_from + 3));
      v_nb := ov2_ch_sq_set(v_nb, p_from + 3, '.');
    ELSE
      v_nb := ov2_ch_sq_set(v_nb, p_from - 1, ov2_ch_sq_get(v_nb, p_from - 4));
      v_nb := ov2_ch_sq_set(v_nb, p_from - 4, '.');
    END IF;
  END IF;

  IF v_pt = 'P' THEN
    v_pawn_move := true;
    IF v_pr IS NOT NULL THEN
      v_nb := ov2_ch_sq_set(v_nb, p_to, CASE WHEN v_turn = 0 THEN v_pr_want ELSE lower(v_pr_want) END);
    ELSIF abs(p_to - p_from) = 16 THEN
      v_ep_sq := (p_from + p_to) / 2;
    END IF;
  END IF;

  v_moving_white := (v_turn = 0);
  v_k := ov2_ch_find_king(v_nb, v_moving_white);
  IF v_k IS NULL OR ov2_ch_is_square_attacked(v_nb, v_k, NOT v_moving_white) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'into_check', 'board', p_board, 'gameOver', false, 'winnerSeat', NULL::int, 'resultKind', 'ongoing');
  END IF;

  v_new_turn := 1 - v_turn;
  v_half := COALESCE(NULLIF(v_nb ->> 'halfmove', '')::int, 0);
  v_full := COALESCE(NULLIF(v_nb ->> 'fullmove', '')::int, 1);
  IF v_pawn_move OR v_capture THEN
    v_half := 0;
  ELSE
    v_half := v_half + 1;
  END IF;
  IF v_turn = 1 THEN
    v_full := v_full + 1;
  END IF;

  wk := COALESCE((p_board #>> '{castling,wK}')::boolean, false);
  wq := COALESCE((p_board #>> '{castling,wQ}')::boolean, false);
  bk := COALESCE((p_board #>> '{castling,bK}')::boolean, false);
  bq := COALESCE((p_board #>> '{castling,bQ}')::boolean, false);
  IF v_pt = 'K' AND v_moving_white THEN
    wk := false;
    wq := false;
  ELSIF v_pt = 'K' AND NOT v_moving_white THEN
    bk := false;
    bq := false;
  END IF;
  IF p_from = 0 OR p_to = 0 OR ov2_ch_sq_get(v_nb, 0) <> 'R' THEN
    wq := false;
  END IF;
  IF p_from = 7 OR p_to = 7 OR ov2_ch_sq_get(v_nb, 7) <> 'R' THEN
    wk := false;
  END IF;
  IF p_from = 56 OR p_to = 56 OR ov2_ch_sq_get(v_nb, 56) <> 'r' THEN
    bq := false;
  END IF;
  IF p_from = 63 OR p_to = 63 OR ov2_ch_sq_get(v_nb, 63) <> 'r' THEN
    bk := false;
  END IF;
  IF ov2_ch_sq_get(v_nb, 4) <> 'K' THEN
    wk := false;
    wq := false;
  END IF;
  IF ov2_ch_sq_get(v_nb, 60) <> 'k' THEN
    bk := false;
    bq := false;
  END IF;

  v_nb := jsonb_set(v_nb, '{turn}', to_jsonb(v_new_turn), true);
  v_nb := jsonb_set(v_nb, '{halfmove}', to_jsonb(v_half), true);
  v_nb := jsonb_set(v_nb, '{fullmove}', to_jsonb(v_full), true);
  v_nb := jsonb_set(v_nb, '{castling}', jsonb_build_object('wK', wk, 'wQ', wq, 'bK', bk, 'bQ', bq), true);
  IF v_ep_sq IS NULL THEN
    v_nb := jsonb_set(v_nb, '{ep}', 'null'::jsonb, true);
  ELSE
    v_nb := jsonb_set(v_nb, '{ep}', to_jsonb(v_ep_sq), true);
  END IF;

  v_opp := v_new_turn;
  v_in_check := ov2_ch_in_check(v_nb, v_opp = 0);
  FOR k IN 0..63 LOOP
    v_sq2 := ov2_ch_sq_get(v_nb, k);
    IF v_sq2 = '.' THEN
      CONTINUE;
    END IF;
    v_col2 := ov2_ch_color_at(v_nb, k);
    IF v_col2 IS DISTINCT FROM v_opp THEN
      CONTINUE;
    END IF;
    v_moves2 := ov2_ch_pseudo_legal_moves_from(v_nb, k);
    FOR j IN 0..GREATEST(jsonb_array_length(v_moves2) - 1, -1) LOOP
      EXIT WHEN j > jsonb_array_length(v_moves2) - 1;
      v_m2 := v_moves2 -> j;
      v_t2 := (v_m2 ->> 'to')::int;
      v_f2 := COALESCE(v_m2 ->> 'flags', '');
      IF v_m2 ? 'promo' AND jsonb_typeof(v_m2 -> 'promo') = 'null' THEN
        v_pr2 := NULL;
      ELSE
        v_pr2 := v_m2 ->> 'promo';
      END IF;
      v_nb2 := v_nb;
      v_sq2 := ov2_ch_sq_get(v_nb2, k);
      v_pt2 := upper(v_sq2);
      v_nb2 := ov2_ch_sq_set(v_nb2, v_t2, v_sq2);
      v_nb2 := ov2_ch_sq_set(v_nb2, k, '.');
      IF v_f2 = 'ep' THEN
        occ2 := v_t2 - (CASE WHEN v_opp = 0 THEN 8 ELSE -8 END);
        v_nb2 := ov2_ch_sq_set(v_nb2, occ2, '.');
      END IF;
      IF v_pt2 = 'K' AND abs(v_t2 - k) = 2 AND (k IN (4, 60)) THEN
        IF v_t2 > k THEN
          v_nb2 := ov2_ch_sq_set(v_nb2, k + 1, ov2_ch_sq_get(v_nb2, k + 3));
          v_nb2 := ov2_ch_sq_set(v_nb2, k + 3, '.');
        ELSE
          v_nb2 := ov2_ch_sq_set(v_nb2, k - 1, ov2_ch_sq_get(v_nb2, k - 4));
          v_nb2 := ov2_ch_sq_set(v_nb2, k - 4, '.');
        END IF;
      END IF;
      IF v_pt2 = 'P' THEN
        IF v_pr2 IS NOT NULL THEN
          v_nb2 := ov2_ch_sq_set(v_nb2, v_t2, CASE WHEN v_opp = 0 THEN upper(v_pr2) ELSE lower(v_pr2) END);
        END IF;
      END IF;
      v_k2 := ov2_ch_find_king(v_nb2, v_opp = 0);
      IF v_k2 IS NOT NULL AND NOT ov2_ch_is_square_attacked(v_nb2, v_k2, v_opp = 1) THEN
        v_any := true;
        EXIT;
      END IF;
    END LOOP;
    IF v_any THEN
      EXIT;
    END IF;
  END LOOP;

  IF v_any THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ok', 'board', v_nb, 'gameOver', false, 'winnerSeat', NULL::int, 'resultKind', 'ongoing');
  ELSIF v_in_check THEN
    RETURN jsonb_build_object('ok', true, 'code', 'ok', 'board', v_nb, 'gameOver', true, 'winnerSeat', 1 - v_opp, 'resultKind', 'checkmate');
  ELSE
    RETURN jsonb_build_object('ok', true, 'code', 'ok', 'board', v_nb, 'gameOver', true, 'winnerSeat', NULL::int, 'resultKind', 'stalemate');
  END IF;
END;
$$;

COMMIT;
