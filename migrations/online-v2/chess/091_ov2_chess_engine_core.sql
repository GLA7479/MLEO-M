-- OV2 Chess engine (part 1): board helpers, ray attacks, square attacked, initial position.
-- Indexing: a1=0 … h1=7, a8=56 … h8=63. seat0=white (uppercase), seat1=black (lowercase).

BEGIN;

CREATE OR REPLACE FUNCTION public.ov2_ch_sq(p_squares jsonb, p_i int)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_elem jsonb;
BEGIN
  IF p_squares IS NULL OR jsonb_typeof(p_squares) <> 'array' OR p_i < 0 OR p_i > 63 OR p_i >= jsonb_array_length(p_squares) THEN
    RETURN '.';
  END IF;
  v_elem := p_squares -> p_i;
  IF v_elem IS NULL OR jsonb_typeof(v_elem) = 'null' THEN
    RETURN '.';
  END IF;
  RETURN trim(both '"' from v_elem::text);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_set_sq(p_squares jsonb, p_i int, p_ch text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_c text := left(trim(COALESCE(p_ch, '.')), 1);
BEGIN
  IF p_squares IS NULL OR jsonb_typeof(p_squares) <> 'array' OR p_i < 0 OR p_i > 63 THEN
    RETURN p_squares;
  END IF;
  IF v_c = '' THEN
    v_c := '.';
  END IF;
  RETURN jsonb_set(p_squares, ARRAY[p_i::text], to_jsonb(v_c), true);
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_is_white_sq(p_ch text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(trim(COALESCE(p_ch, '')), 1) IN ('P','N','B','R','Q','K');
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_is_black_sq(p_ch text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT left(trim(COALESCE(p_ch, '')), 1) IN ('p','n','b','r','q','k');
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_initial_board_json()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'squares',
    to_jsonb(ARRAY[
      'R','N','B','Q','K','B','N','R',
      'P','P','P','P','P','P','P','P',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      '.','.','.','.','.','.','.','.',
      'p','p','p','p','p','p','p','p',
      'r','n','b','q','k','b','n','r'
    ]::text[]),
    'turnSeat', 0,
    'castling', jsonb_build_object('wK', true, 'wQ', true, 'bK', true, 'bQ', true),
    'ep', NULL,
    'halfmove', 0,
    'fullmove', 1,
    'winner', NULL,
    'resultKind', NULL
  );
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_sliding_attack(
  p_squares jsonb,
  p_fr int,
  p_to int,
  p_dr int,
  p_dc int,
  p_block_same_color boolean
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_r int;
  v_c int;
  v_tr int := p_to / 8;
  v_tc int := p_to % 8;
  v_rr int;
  v_cc int;
  v_p text;
  v_fr int := p_fr / 8;
  v_fc int := p_fr % 8;
BEGIN
  v_rr := v_fr + p_dr;
  v_cc := v_fc + p_dc;
  WHILE v_rr >= 0 AND v_rr <= 7 AND v_cc >= 0 AND v_cc <= 7 LOOP
    v_r := v_rr;
    v_c := v_cc;
    IF v_r = v_tr AND v_c = v_tc THEN
      RETURN true;
    END IF;
    v_p := public.ov2_ch_sq(p_squares, v_r * 8 + v_c);
    IF v_p IS DISTINCT FROM '.' THEN
      IF p_block_same_color THEN
        RETURN false;
      END IF;
      RETURN false;
    END IF;
    v_rr := v_rr + p_dr;
    v_cc := v_cc + p_dc;
  END LOOP;
  RETURN false;
END;
$$;

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
  v_step int;
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
    FOREACH v_step IN ARRAY ARRAY[-17, -15, -10, -6, 6, 10, 15, 17]
    LOOP
      IF p_fr + v_step = p_to THEN
        RETURN true;
      END IF;
    END LOOP;
    RETURN false;
  END IF;

  IF v_k = 'k' THEN
    IF abs(v_dr) <= 1 AND abs(v_dc) <= 1 AND (abs(v_dr) + abs(v_dc) > 0) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  IF v_k = 'p' THEN
    IF p_white_piece THEN
      IF v_dc = 0 AND v_dr = 1 AND v_tr > v_fr THEN
        RETURN false;
      END IF;
      IF v_dr = 1 AND abs(v_dc) = 1 THEN
        RETURN true;
      END IF;
    ELSE
      IF v_dc = 0 AND v_dr = -1 AND v_tr < v_fr THEN
        RETURN false;
      END IF;
      IF v_dr = -1 AND abs(v_dc) = 1 THEN
        RETURN true;
      END IF;
    END IF;
    RETURN false;
  END IF;

  IF v_k = 'r' THEN
    IF v_fr IS DISTINCT FROM v_tr AND v_fc IS DISTINCT FROM v_tc THEN
      RETURN false;
    END IF;
    IF v_fr = v_tr THEN
      v_dir := sign(v_dc);
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, 0, v_dir, true);
    END IF;
    v_dir := sign(v_dr);
    RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, v_dir, 0, true);
  END IF;

  IF v_k = 'b' THEN
    IF abs(v_dr) IS DISTINCT FROM abs(v_dc) OR v_dr = 0 THEN
      RETURN false;
    END IF;
    RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, sign(v_dr), sign(v_dc), true);
  END IF;

  IF v_k = 'q' THEN
    IF v_fr = v_tr OR v_fc = v_tc THEN
      IF v_fr = v_tr THEN
        RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, 0, sign(v_dc), true);
      END IF;
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, sign(v_dr), 0, true);
    END IF;
    IF abs(v_dr) = abs(v_dc) AND v_dr <> 0 THEN
      RETURN public.ov2_ch_sliding_attack(p_squares, p_fr, p_to, sign(v_dr), sign(v_dc), true);
    END IF;
    RETURN false;
  END IF;

  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_is_square_attacked(p_board jsonb, p_idx int, p_by_white boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_sq jsonb;
  v_i int;
  v_p text;
BEGIN
  v_sq := p_board -> 'squares';
  IF v_sq IS NULL OR jsonb_typeof(v_sq) <> 'array' THEN
    RETURN false;
  END IF;
  FOR v_i IN 0..63 LOOP
    v_p := public.ov2_ch_sq(v_sq, v_i);
    IF v_p = '.' THEN
      CONTINUE;
    END IF;
    IF p_by_white AND NOT public.ov2_ch_is_white_sq(v_p) THEN
      CONTINUE;
    END IF;
    IF NOT p_by_white AND NOT public.ov2_ch_is_black_sq(v_p) THEN
      CONTINUE;
    END IF;
    IF public.ov2_ch_piece_attacks_square(v_sq, v_i, p_idx, p_by_white) THEN
      RETURN true;
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_find_king(p_board jsonb, p_white_king boolean)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_sq jsonb;
  v_i int;
  v_p text;
BEGIN
  v_sq := p_board -> 'squares';
  IF v_sq IS NULL THEN
    RETURN -1;
  END IF;
  FOR v_i IN 0..63 LOOP
    v_p := public.ov2_ch_sq(v_sq, v_i);
    IF p_white_king AND v_p = 'K' THEN
      RETURN v_i;
    END IF;
    IF NOT p_white_king AND v_p = 'k' THEN
      RETURN v_i;
    END IF;
  END LOOP;
  RETURN -1;
END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_ch_in_check(p_board jsonb, p_white_to_move boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_ki int;
BEGIN
  v_ki := public.ov2_ch_find_king(p_board, p_white_to_move);
  IF v_ki < 0 THEN
    RETURN true;
  END IF;
  RETURN public.ov2_ch_is_square_attacked(p_board, v_ki, NOT p_white_to_move);
END;
$$;

REVOKE ALL ON FUNCTION public.ov2_ch_sq(jsonb, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_ch_sq(jsonb, integer) TO anon, authenticated, service_role;

COMMIT;
