/**
 * OV2 room access — reads via PostgREST `select`; room mutations via `006_ov2_room_lifecycle_v2.sql`;
 * stake commit via `007_ov2_stake_commit.sql` (`ov2_stake_commit`). Client debits vault after successful RPC (see `onlineV2VaultBridge`).
 */

import { supabaseMP as supabase } from "../supabaseClients";

/** Public list/detail — never includes `passcode`. */
export const OV2_ROOM_PUBLIC_FIELDS =
  "id,created_at,updated_at,product_game_id,title,lifecycle_phase,stake_per_seat,host_participant_key,is_private,max_seats,match_seq,pot_locked,active_session_id,closed_reason,settlement_status,settlement_revision,finalized_at,finalized_match_seq,meta";

const OV2_MEMBER_LIST_FIELDS =
  "id,room_id,participant_key,display_name,seat_index,wallet_state,amount_locked,is_ready,created_at,updated_at,meta";

/**
 * Structured failure from `ov2_*` room RPCs (`ok: false` JSON body).
 * `message` is human-readable and safe to show in UI.
 */
export class Ov2RoomRpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "Ov2RoomRpcError";
    this.code = code;
  }
}

/**
 * @param {unknown} data
 * @returns {{ ok: true, room?: object, members?: object[], closed?: boolean }}
 */
function assertOv2RoomRpcSuccess(data) {
  if (data == null || typeof data !== "object") {
    throw new Ov2RoomRpcError("UNKNOWN", "Invalid response from server.");
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) {
    return /** @type {{ ok: true, room?: object, members?: object[], closed?: boolean }} */ (d);
  }
  const code = typeof d.code === "string" ? d.code : "UNKNOWN";
  const message = typeof d.message === "string" ? d.message : "Request failed.";
  throw new Ov2RoomRpcError(code, message);
}

/**
 * @param {string | null} productGameId
 * @param {number} [limit]
 * @returns {Promise<object[]>}
 */
export async function fetchOv2Rooms(productGameId, limit = 40) {
  let q = supabase
    .from("ov2_rooms")
    .select(OV2_ROOM_PUBLIC_FIELDS)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (productGameId) q = q.eq("product_game_id", productGameId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

/**
 * @param {string} roomId
 * @returns {Promise<object | null>}
 */
export async function fetchOv2RoomById(roomId) {
  const { data, error } = await supabase.from("ov2_rooms").select(OV2_ROOM_PUBLIC_FIELDS).eq("id", roomId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param {string} roomId
 * @returns {Promise<object[]>}
 */
export async function fetchOv2RoomMembers(roomId) {
  const { data, error } = await supabase
    .from("ov2_room_members")
    .select(OV2_MEMBER_LIST_FIELDS)
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * @param {string[]} roomIds
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchOv2MemberCounts(roomIds) {
  if (!roomIds.length) return {};
  const { data, error } = await supabase.from("ov2_room_members").select("room_id").in("room_id", roomIds);
  if (error) throw error;
  /** @type {Record<string, number>} */
  const counts = {};
  for (const row of data || []) {
    const id = row.room_id;
    counts[id] = (counts[id] || 0) + 1;
  }
  return counts;
}

/**
 * @param {{
 *   product_game_id: string,
 *   title: string,
 *   stake_per_seat: number,
 *   host_participant_key: string,
 *   display_name: string,
 *   is_private?: boolean,
 *   passcode?: string | null,
 *   max_seats?: number,
 * }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function createOv2Room(params) {
  const {
    product_game_id,
    title,
    stake_per_seat,
    host_participant_key,
    display_name,
    is_private = false,
    passcode = null,
    max_seats = 8,
  } = params;
  const { data, error } = await supabase.rpc("ov2_create_room", {
    p_product_game_id: product_game_id,
    p_title: title.trim() || "Table",
    p_stake_per_seat: Math.floor(Number(stake_per_seat)),
    p_host_participant_key: host_participant_key,
    p_display_name: display_name.trim() || "",
    p_is_private: Boolean(is_private),
    p_passcode: passcode == null || passcode === "" ? null : String(passcode),
    p_max_seats: Math.floor(Number(max_seats)) || 8,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertOv2RoomRpcSuccess(data);
  return { room: /** @type {object} */ (out.room), members: /** @type {object[]} */ (out.members || []) };
}

/**
 * @param {{
 *   room_id: string,
 *   participant_key: string,
 *   display_name: string,
 *   passcode?: string | null,
 * }} params
 */
export async function joinOv2Room(params) {
  const { room_id, participant_key, display_name, passcode = null } = params;
  const { data, error } = await supabase.rpc("ov2_join_room", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_display_name: display_name.trim() || "",
    p_passcode: passcode == null || passcode === "" ? null : String(passcode),
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 * @returns {Promise<{ closed: boolean }>}
 */
export async function leaveOv2Room(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_leave_room", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertOv2RoomRpcSuccess(data);
  return { closed: Boolean(out.closed) };
}

/**
 * @param {{ room_id: string, participant_key: string, is_ready: boolean }} params
 */
export async function setOv2MemberReady(params) {
  const { room_id, participant_key, is_ready } = params;
  const { data, error } = await supabase.rpc("ov2_set_ready", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_is_ready: Boolean(is_ready),
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
}

/**
 * Host-only; server validates phase, membership counts, ready flags.
 * @param {{ room_id: string, host_participant_key: string }} params
 * @returns {Promise<object>} updated public room row
 */
export async function startOv2RoomIntent(params) {
  const { room_id, host_participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_start_room_intent", {
    p_room_id: room_id,
    p_host_participant_key: host_participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertOv2RoomRpcSuccess(data);
  return out.room;
}

/**
 * Records stake commit server-side (economy row + member wallet_state). After success, call
 * `debitOnlineV2Vault` (Board Path / others). Ludo skips vault debit on commit — settlement RPC + claim applies winner/loser vault deltas.
 * @param {{ room_id: string, participant_key: string, idempotency_key: string }} params
 * @returns {Promise<{ room: object, members: object[], idempotent: boolean }>}
 */
export async function commitOv2RoomStake(params) {
  const { room_id, participant_key, idempotency_key } = params;
  const { data, error } = await supabase.rpc("ov2_stake_commit", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_idempotency_key: String(idempotency_key ?? "").trim(),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertOv2RoomRpcSuccess(data);
  return {
    room: /** @type {object} */ (out.room),
    members: /** @type {object[]} */ (out.members || []),
    idempotent: Boolean(out.idempotent),
  };
}

/**
 * OV2 Ludo seat claim parity (manual seat ownership, 0..3).
 * @param {{ room_id: string, participant_key: string, seat_index: number }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function claimOv2LudoSeat(params) {
  const { room_id, participant_key, seat_index } = params;
  const { data, error } = await supabase.rpc("ov2_ludo_claim_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_seat_index: Number(seat_index),
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  // Always round-trip from canonical tables so seat_index reflects persisted state.
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/**
 * OV2 Ludo seat leave parity (clear claimed seat).
 * @param {{ room_id: string, participant_key: string }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function leaveOv2LudoSeat(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_ludo_leave_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  // Always round-trip from canonical tables so seat_index reflects persisted state.
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/**
 * OV2 Bingo seat claim (0..7) — same storage as Ludo (`ov2_room_members.seat_index`).
 * @param {{ room_id: string, participant_key: string, seat_index: number }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function claimOv2BingoSeat(params) {
  const { room_id, participant_key, seat_index } = params;
  const { data, error } = await supabase.rpc("ov2_room_claim_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_seat_index: Number(seat_index),
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function leaveOv2BingoSeat(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_room_leave_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/**
 * OV2 Rummy51 — seats 0..3 (`ov2_rummy51_claim_seat`).
 * @param {{ room_id: string, participant_key: string, seat_index: number }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function claimOv2Rummy51Seat(params) {
  const { room_id, participant_key, seat_index } = params;
  const { data, error } = await supabase.rpc("ov2_rummy51_claim_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_seat_index: Number(seat_index),
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function leaveOv2Rummy51Seat(params) {
  const { room_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_rummy51_leave_seat", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw translateSupabaseRpcError(error);
  assertOv2RoomRpcSuccess(data);
  const [room, members] = await Promise.all([fetchOv2RoomById(room_id), fetchOv2RoomMembers(room_id)]);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/** @param {{ message?: string } | Error} error */
function translateSupabaseRpcError(error) {
  const msg = error?.message || String(error);
  if (/relation .* does not exist|function .* does not exist/i.test(msg)) {
    return new Ov2RoomRpcError("MIGRATION_REQUIRED", "Online V2 database is not up to date. Apply OV2 migrations.");
  }
  return error;
}
