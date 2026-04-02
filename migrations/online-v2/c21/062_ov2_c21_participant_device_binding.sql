-- C21: map OV2 participant_key → arcade device_id per room so service-role vault RPCs
-- can apply debits/credits to the correct wallet for every seat, including when the
-- HTTP caller is a spectator or another player (multi-recipient settlement).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ov2_c21_participant_devices (
  room_id uuid NOT NULL REFERENCES public.ov2_rooms (id) ON DELETE CASCADE,
  participant_key text NOT NULL,
  arcade_device_id text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ov2_c21_participant_devices_pk PRIMARY KEY (room_id, participant_key),
  CONSTRAINT ov2_c21_participant_devices_device_chk CHECK (
    length(trim(arcade_device_id)) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_ov2_c21_pd_room ON public.ov2_c21_participant_devices (room_id);

COMMENT ON TABLE public.ov2_c21_participant_devices IS
  '21 Challenge: last-known arcade device cookie id per participant in a room; used by /api/ov2-c21/operate to target sync_vault_delta for all economy ops.';

ALTER TABLE public.ov2_c21_participant_devices ENABLE ROW LEVEL SECURITY;

COMMIT;
