-- OV2 Rummy51: allow jokers to extend a legal run beyond the natural min–max span
-- (e.g. Q-K-A + joker as J, or 5-6-7-8 + joker as 9). Keeps client engine and DB in sync.

CREATE OR REPLACE FUNCTION public._ov2_r51_run_ok_mode(p_cards jsonb, p_low boolean)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  n int;
  i int;
  c jsonb;
  nj int := 0;
  vals int[] := ARRAY[]::int[];
  v int;
  mn int;
  mx int;
  holes_inside int;
  vv int;
  l_lo int;
  l_hi int;
  min_bound int;
  max_bound int;
  suit0 text;
  su text;
BEGIN
  IF p_cards IS NULL OR jsonb_typeof(p_cards) <> 'array' THEN
    RETURN false;
  END IF;
  n := jsonb_array_length(p_cards);
  IF n < 3 THEN
    RETURN false;
  END IF;
  suit0 := NULL;
  FOR i IN 0..(n - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      nj := nj + 1;
      CONTINUE;
    END IF;
    su := c ->> 'suit';
    IF suit0 IS NULL THEN
      suit0 := su;
    ELSIF suit0 IS DISTINCT FROM su THEN
      RETURN false;
    END IF;
    v := (c ->> 'rank')::int;
    IF p_low THEN
      vals := array_append(vals, v);
    ELSE
      IF v = 1 THEN
        v := 14;
      END IF;
      vals := array_append(vals, v);
    END IF;
  END LOOP;
  IF nj = n THEN
    RETURN n >= 3;
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(vals) x GROUP BY x HAVING count(*) > 1) THEN
    RETURN false;
  END IF;
  SELECT min(x), max(x) INTO mn, mx FROM unnest(vals) x;
  holes_inside := 0;
  FOR vv IN mn..mx LOOP
    IF NOT vv = ANY (vals) THEN
      holes_inside := holes_inside + 1;
    END IF;
  END LOOP;
  IF nj < holes_inside THEN
    RETURN false;
  END IF;
  IF p_low THEN
    min_bound := 1;
    max_bound := 13;
  ELSE
    min_bound := 2;
    max_bound := 14;
  END IF;
  l_lo := GREATEST(min_bound, mx - n + 1);
  l_hi := LEAST(mn, max_bound - n + 1);
  RETURN l_lo <= l_hi;
END;
$$;

CREATE OR REPLACE FUNCTION public._ov2_r51_score_meld(p_cards jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  k text;
  tr int;
  i int;
  c jsonb;
  mode_low boolean;
  vals int[];
  nj int;
  n_tot int;
  mn int;
  mx int;
  mn_nat int;
  mx_nat int;
  l_start int;
  min_bound int;
  max_bound int;
  v int;
  jr int[];
  s int := 0;
  jix int;
BEGIN
  k := public._ov2_r51_classify_meld(p_cards);
  IF k = 'invalid' THEN
    RETURN 0;
  END IF;
  IF k = 'set' THEN
    tr := NULL;
    FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
      c := p_cards -> i;
      IF NOT coalesce((c ->> 'isJoker')::boolean, false) THEN
        tr := (c ->> 'rank')::int;
        EXIT;
      END IF;
    END LOOP;
    IF tr IS NULL THEN
      tr := 1;
    END IF;
    FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
      s := s + public._ov2_r51_meld_point_card(p_cards -> i, tr);
    END LOOP;
    RETURN s;
  END IF;
  mode_low := public._ov2_r51_run_ok_mode(p_cards, true);
  vals := ARRAY[]::int[];
  nj := 0;
  n_tot := jsonb_array_length(p_cards);
  FOR i IN 0..(n_tot - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      nj := nj + 1;
      CONTINUE;
    END IF;
    v := (c ->> 'rank')::int;
    IF mode_low THEN
      vals := array_append(vals, v);
    ELSE
      IF v = 1 THEN
        v := 14;
      END IF;
      vals := array_append(vals, v);
    END IF;
  END LOOP;
  IF cardinality(vals) = 0 THEN
    IF mode_low THEN
      mn := 1;
    ELSE
      mn := 2;
    END IF;
    mx := mn + n_tot - 1;
  ELSE
    SELECT min(x), max(x) INTO mn_nat, mx_nat FROM unnest(vals) x;
    IF mode_low THEN
      min_bound := 1;
      max_bound := 13;
    ELSE
      min_bound := 2;
      max_bound := 14;
    END IF;
    l_start := GREATEST(min_bound, mx_nat - n_tot + 1);
    mn := l_start;
    mx := l_start + n_tot - 1;
  END IF;
  jr := ARRAY[]::int[];
  FOR v IN mn..mx LOOP
    IF NOT v = ANY (vals) THEN
      IF mode_low THEN
        jr := array_append(jr, v);
      ELSE
        jr := array_append(jr, CASE WHEN v = 14 THEN 1 ELSE v END);
      END IF;
    END IF;
  END LOOP;
  jix := 1;
  FOR i IN 0..(jsonb_array_length(p_cards) - 1) LOOP
    c := p_cards -> i;
    IF coalesce((c ->> 'isJoker')::boolean, false) THEN
      s := s + public._ov2_r51_meld_point_card(c, jr[jix]);
      jix := jix + 1;
    ELSE
      s := s + public._ov2_r51_meld_point_card(c, NULL);
    END IF;
  END LOOP;
  RETURN s;
END;
$$;
