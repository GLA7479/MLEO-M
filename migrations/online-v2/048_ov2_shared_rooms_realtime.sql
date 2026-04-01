-- OV2 shared rooms: realtime publication is already satisfied by 014_ov2_realtime_publication.sql
-- (public.ov2_rooms + public.ov2_room_members). New columns replicate automatically.
-- This file documents subscription filters for clients (no password_hash in payloads — use RPC JSON only).

COMMENT ON TABLE public.ov2_rooms IS
  'OV2 rooms: legacy lifecycle_phase + unified shared_schema_version/status/visibility. Realtime: subscribe to ov2_rooms and ov2_room_members; use shared RPC snapshots — never SELECT password_hash from clients.';
