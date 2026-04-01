/**
 * OV2 unified shared room API — RPC-only mutations; reads via RPC or guarded select.
 * Does not replace legacy `ov2RoomsApi.js` until migration; no per-game seat claim APIs here.
 */

import { supabaseMP as supabase } from "../../supabaseClients";

/** @typedef {import("../room-core/roomTypes").Ov2SharedPublicRoom} Ov2SharedPublicRoom */
/** @typedef {import("../room-core/roomTypes").Ov2SharedPublicMember} Ov2SharedPublicMember */
/** @typedef {import("../room-core/roomTypes").Ov2SharedRuntimeHandoff} Ov2SharedRuntimeHandoff */

export class Ov2SharedRoomRpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "Ov2SharedRoomRpcError";
    this.code = code;
  }
}

/**
 * @param {unknown} data
 * @returns {{ ok: true } & Record<string, unknown>}
 */
function assertSharedRpcSuccess(data) {
  if (data == null || typeof data !== "object") {
    throw new Ov2SharedRoomRpcError("UNKNOWN", "Invalid response from server.");
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) {
    return /** @type {{ ok: true } & Record<string, unknown>} */ (d);
  }
  const code = typeof d.code === "string" ? d.code : "UNKNOWN";
  const message = typeof d.message === "string" ? d.message : "Request failed.";
  throw new Ov2SharedRoomRpcError(code, message);
}

/**
 * @param {{ message?: string } | Error} error
 */
function translateSupabaseRpcError(error) {
  const msg = error?.message || String(error);
  if (/relation .* does not exist|function .* does not exist/i.test(msg)) {
    return new Ov2SharedRoomRpcError("MIGRATION_REQUIRED", "Apply OV2 shared room migrations (046–048).");
  }
  return error;
}

/**
 * @param {unknown} raw
 * @returns {Ov2SharedPublicRoom} room
 * @returns {Ov2SharedPublicMember[]} members
 */
export function normalizeOv2SharedRoomSnapshot(raw) {
  const o = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const room = /** @type {Ov2SharedPublicRoom} */ (o.room && typeof o.room === "object" ? o.room : {});
  const members = Array.isArray(o.members) ? /** @type {Ov2SharedPublicMember[]} */ (o.members) : [];
  return { room, members };
}

/**
 * @param {Record<string, unknown>} out
 */
export function normalizeHostStartResult(out) {
  const room = out.room && typeof out.room === "object" ? /** @type {Ov2SharedPublicRoom} */ (out.room) : {};
  const members = Array.isArray(out.members) ? /** @type {Ov2SharedPublicMember[]} */ (out.members) : [];
  const rh = out.runtime_handoff;
  const runtime_handoff =
    rh && typeof rh === "object" ? /** @type {Ov2SharedRuntimeHandoff} */ (rh) : null;
  return { room, members, runtime_handoff };
}

/**
 * @param {{
 *   product_game_id: string,
 *   title: string,
 *   stake_per_seat: number,
 *   min_players?: number | null,
 *   max_players?: number | null,
 *   visibility_mode: 'public' | 'private' | 'hidden',
 *   password_plaintext?: string | null,
 *   host_participant_key: string,
 *   display_name: string,
 * }} params
 */
export async function createOv2Room(params) {
  const {
    product_game_id,
    title,
    stake_per_seat,
    min_players,
    max_players,
    visibility_mode,
    password_plaintext = null,
    host_participant_key,
    display_name,
  } = params;
  const { data, error } = await supabase.rpc("ov2_shared_create_room", {
    p_product_game_id: product_game_id,
    p_title: title.trim() || "Room",
    p_min_players: min_players == null ? null : Math.floor(Number(min_players)),
    p_max_players: max_players == null ? null : Math.floor(Number(max_players)),
    p_visibility_mode: visibility_mode,
    p_password_plaintext: password_plaintext == null || password_plaintext === "" ? null : String(password_plaintext),
    p_host_participant_key: host_participant_key,
    p_display_name: display_name.trim() || "Player",
    p_stake_per_seat: Math.floor(Number(stake_per_seat)),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{ product_game_id?: string | null, limit?: number }} [params]
 */
export async function listOv2Rooms(params = {}) {
  const { product_game_id = null, limit = 40 } = params;
  const { data, error } = await supabase.rpc("ov2_shared_list_rooms", {
    p_product_game_id: product_game_id,
    p_limit: Math.floor(Number(limit)) || 40,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  const rooms = Array.isArray(out.rooms) ? /** @type {Ov2SharedPublicRoom[]} */ (out.rooms) : [];
  return { rooms };
}

/**
 * @param {{
 *   room_id: string,
 *   viewer_participant_key?: string | null,
 *   password_plaintext?: string | null,
 * }} params
 */
export async function getOv2RoomSnapshot(params) {
  const { room_id, viewer_participant_key = null, password_plaintext = null } = params;
  const { data, error } = await supabase.rpc("ov2_shared_get_room_snapshot", {
    p_room_id: room_id,
    p_viewer_participant_key: viewer_participant_key == null || viewer_participant_key === "" ? null : String(viewer_participant_key),
    p_password_plaintext: password_plaintext == null || password_plaintext === "" ? null : String(password_plaintext),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{
 *   room_id: string,
 *   participant_key: string,
 *   display_name: string,
 *   password_plaintext?: string | null,
 * }} params
 */
export async function joinOv2Room(params) {
  const { room_id, participant_key, display_name, password_plaintext = null } = params;
  const { data, error } = await supabase.rpc("ov2_shared_join_room", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_display_name: display_name.trim() || "Player",
    p_password_plaintext: password_plaintext == null || password_plaintext === "" ? null : String(password_plaintext),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{
 *   join_code: string,
 *   participant_key: string,
 *   display_name: string,
 *   password_plaintext?: string | null,
 * }} params
 */
export async function joinOv2RoomByCode(params) {
  const { join_code, participant_key, display_name, password_plaintext = null } = params;
  const { data, error } = await supabase.rpc("ov2_shared_join_room_by_code", {
    p_join_code: String(join_code || "").trim().toUpperCase(),
    p_participant_key: participant_key,
    p_display_name: display_name.trim() || "Player",
    p_password_plaintext: password_plaintext == null || password_plaintext === "" ? null : String(password_plaintext),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 * @returns {Promise<{ closed: boolean } & ReturnType<typeof normalizeOv2SharedRoomSnapshot>>}
 */
export async function leaveOv2Room(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_shared_leave_room", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  const snap = normalizeOv2SharedRoomSnapshot(out);
  return { ...snap, closed: Boolean(out.closed) };
}

/**
 * @param {{ room_id: string, participant_key: string, seat_index: number }} params
 */
export async function claimOv2Seat(params) {
  const { room_id, participant_key, seat_index } = params;
  const { data, error } = await supabase.rpc("ov2_shared_claim_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_seat_index: Math.floor(Number(seat_index)),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 */
export async function releaseOv2Seat(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_shared_release_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * @param {{ room_id: string, host_participant_key: string }} params
 */
export async function hostStartOv2Room(params) {
  const { room_id, host_participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_shared_host_start", {
    p_room_id: room_id,
    p_host_participant_key: host_participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeHostStartResult(out);
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 */
export async function reconnectOv2RoomMember(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_shared_reconnect_member", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return normalizeOv2SharedRoomSnapshot(out);
}

/**
 * Server/cron only (service_role). Exposed for admin tooling or Edge Function.
 */
export async function hardCloseInactiveOv2Rooms() {
  const { data, error } = await supabase.rpc("ov2_shared_hard_close_inactive_rooms");
  if (error) throw translateSupabaseRpcError(error);
  const out = assertSharedRpcSuccess(data);
  return { closedCount: typeof out.closed_count === "number" ? out.closed_count : Number(out.closed_count) || 0 };
}
