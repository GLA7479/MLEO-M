-- OV2 wave: global fixed-table seat registry + bcrypt helpers for private fixed rooms.
-- Apply after Community Cards / Color Wheel / C21 persistent migrations.
-- Does NOT run automatically.

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_wave_fixed_active_seat (
  participant_key text PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  product_game_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_wave_fixed_active_seat_pk_chk CHECK (char_length(trim(participant_key)) > 0),
  CONSTRAINT ov2_wave_fixed_active_seat_product_chk CHECK (char_length(trim(product_game_id)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_ov2_wave_fixed_active_seat_room
  ON public.ov2_wave_fixed_active_seat (room_id);

COMMENT ON TABLE public.ov2_wave_fixed_active_seat IS
  'At most one active fixed-table seat per participant_key across ov2_c21, ov2_color_wheel, ov2_community_cards.';

ALTER TABLE public.ov2_wave_fixed_active_seat ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ov2_wave_fixed_active_seat_select_deny ON public.ov2_wave_fixed_active_seat;
CREATE POLICY ov2_wave_fixed_active_seat_select_deny ON public.ov2_wave_fixed_active_seat
  FOR SELECT TO anon, authenticated USING (false);

DROP POLICY IF EXISTS ov2_wave_fixed_active_seat_write_deny ON public.ov2_wave_fixed_active_seat;
CREATE POLICY ov2_wave_fixed_active_seat_write_deny ON public.ov2_wave_fixed_active_seat
  FOR ALL TO anon, authenticated USING (false) WITH CHECK (false);

-- bcrypt hash for private fixed room passwords (server-only RPC)
CREATE OR REPLACE FUNCTION public.ov2_wave_hash_password(p_plain text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN length(trim(coalesce(p_plain, ''))) < 1 THEN NULL
    ELSE extensions.crypt(trim(p_plain)::text, extensions.gen_salt('bf'::text))
  END;
$$;

CREATE OR REPLACE FUNCTION public.ov2_wave_verify_password_against_hash(p_plain text, p_hash text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(p_hash, '') <> ''
    AND coalesce(trim(p_plain), '') <> ''
    AND extensions.crypt(trim(p_plain)::text, p_hash) = p_hash;
$$;

REVOKE ALL ON FUNCTION public.ov2_wave_hash_password(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_wave_hash_password(text) TO service_role;

REVOKE ALL ON FUNCTION public.ov2_wave_verify_password_against_hash(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ov2_wave_verify_password_against_hash(text, text) TO service_role;

COMMENT ON FUNCTION public.ov2_wave_hash_password(text) IS
  'OV2 wave: bcrypt hash for private fixed-table room passwords; service_role only.';

COMMENT ON FUNCTION public.ov2_wave_verify_password_against_hash(text, text) IS
  'OV2 wave: constant-time bcrypt compare; service_role only.';

COMMIT;
