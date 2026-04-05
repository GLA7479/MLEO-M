/**
 * OV2 room access — shared-schema reads use `ov2_shared_get_room_canonical_ledger` when `viewerParticipantKey` is passed (migration 074);
 * legacy rows still use PostgREST `select`. Mutations via lifecycle RPCs; stake commit via `007_ov2_stake_commit.sql`. Client debits vault after stake RPC (see `onlineV2VaultBridge`).
 */

import { supabaseMP as supabase } from "../supabaseClients";
import { leaveOv2Room as leaveOv2SharedRoom } from "./room-api/ov2SharedRoomsApi";

/** Public list/detail — never includes `passcode`. */
export const OV2_ROOM_PUBLIC_FIELDS =
  "id,created_at,updated_at,product_game_id,title,lifecycle_phase,stake_per_seat,host_participant_key,is_private,max_seats,match_seq,pot_locked,active_session_id,closed_reason,settlement_status,settlement_revision,finalized_at,finalized_match_seq,meta,shared_schema_version,status";

const OV2_MEMBER_LIST_FIELDS =
  "id,room_id,participant_key,display_name,seat_index,wallet_state,amount_locked,is_ready,created_at,updated_at,meta";

/**
 * @param {unknown} raw
 * @returns {{ room: object, members: object[] }}
 */
function assertOv2SharedLedgerRpcSuccess(raw) {
  let d = raw;
  if (typeof d === "string") {
    try {
      d = JSON.parse(d);
    } catch {
      throw new Ov2RoomRpcError("UNKNOWN", "Invalid ledger response from server.");
    }
  }
  if (d == null || typeof d !== "object") {
    throw new Ov2RoomRpcError("UNKNOWN", "Invalid ledger response from server.");
  }
  const o = /** @type {Record<string, unknown>} */ (d);
  if (o.ok !== true) {
    const code = typeof o.code === "string" ? o.code : "FORBIDDEN";
    const message = typeof o.message === "string" ? o.message : "Room not found or invalid credentials.";
    throw new Ov2RoomRpcError(code, message);
  }
  const room = o.room && typeof o.room === "object" ? /** @type {object} */ (o.room) : null;
  const members = Array.isArray(o.members) ? /** @type {object[]} */ (o.members) : [];
  if (!room) {
    throw new Ov2RoomRpcError("UNKNOWN", "Missing room in ledger response.");
  }
  return { room, members };
}

/**
 * Shared-schema canonical room row + economy member fields (authorized like `ov2_shared_get_room_snapshot`).
 * Required for private/hidden shared rooms after RLS tightening (migration 074).
 *
 * @param {string} roomId
 * @param {{ viewer_participant_key: string, password_plaintext?: string | null }} params
 * @returns {Promise<{ room: object, members: object[] }>}
 */
export async function fetchOv2RoomLedgerForViewer(roomId, params) {
  const vk = String(params.viewer_participant_key || "").trim();
  if (!vk) {
    throw new Ov2RoomRpcError("INVALID_ARGUMENT", "viewer_participant_key is required for shared-room ledger fetch.");
  }
  const { data, error } = await supabase.rpc("ov2_shared_get_room_canonical_ledger", {
    p_room_id: roomId,
    p_viewer_participant_key: vk,
    p_password_plaintext:
      params.password_plaintext == null || params.password_plaintext === ""
        ? null
        : String(params.password_plaintext),
  });
  if (error) throw translateSupabaseRpcError(error);
  return assertOv2SharedLedgerRpcSuccess(data);
}

/**
 * After a seat RPC, reload canonical row + members. Uses ledger RPC for shared v1; falls back to PostgREST for legacy rows only.
 * @param {string} room_id
 * @param {string} participant_key
 * @returns {Promise<{ room: object, members: object[] }>}
 */
async function reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key) {
  try {
    return await fetchOv2RoomLedgerForViewer(room_id, { viewer_participant_key: participant_key });
  } catch (e) {
    if (e instanceof Ov2RoomRpcError && e.code === "room_not_found_or_invalid_credentials") {
      const room = await fetchOv2RoomById(room_id);
      const members = await fetchOv2RoomMembers(room_id);
      if (!room) throw e;
      return { room, members: members || [] };
    }
    throw e;
  }
}

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
 * @param {{ viewerParticipantKey?: string | null, passwordPlaintext?: string | null }} [options]
 * When `viewerParticipantKey` is set, uses `ov2_shared_get_room_canonical_ledger` (required for shared private/hidden rooms under migration 074).
 */
export async function fetchOv2RoomById(roomId, options = {}) {
  const vk =
    options.viewerParticipantKey != null && String(options.viewerParticipantKey).trim() !== ""
      ? String(options.viewerParticipantKey).trim()
      : "";
  if (vk) {
    const { room } = await fetchOv2RoomLedgerForViewer(roomId, {
      viewer_participant_key: vk,
      password_plaintext: options.passwordPlaintext ?? null,
    });
    return room;
  }
  const { data, error } = await supabase.from("ov2_rooms").select(OV2_ROOM_PUBLIC_FIELDS).eq("id", roomId).maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * @param {string} roomId
 * @param {{ viewerParticipantKey?: string | null, passwordPlaintext?: string | null }} [options]
 */
export async function fetchOv2RoomMembers(roomId, options = {}) {
  const vk =
    options.viewerParticipantKey != null && String(options.viewerParticipantKey).trim() !== ""
      ? String(options.viewerParticipantKey).trim()
      : "";
  if (vk) {
    const { members } = await fetchOv2RoomLedgerForViewer(roomId, {
      viewer_participant_key: vk,
      password_plaintext: options.passwordPlaintext ?? null,
    });
    return members;
  }
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
 * @param {{ room_id: string, participant_key: string, forfeit_game?: boolean }} params
 * @returns {Promise<{ closed: boolean }>}
 */
export async function leaveOv2Room(params) {
  const { room_id, participant_key, forfeit_game = false } = params;
  const { data, error } = await supabase.rpc("ov2_leave_room", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_forfeit_game: Boolean(forfeit_game),
  });
  if (error) throw translateSupabaseRpcError(error);
  const out = assertOv2RoomRpcSuccess(data);
  return { closed: Boolean(out.closed) };
}

/**
 * Shared vs legacy `leave` RPC: pick by `room.shared_schema_version === 1`.
 * @param {{ room?: object | null, room_id: string, participant_key: string, forfeit_game?: boolean }} params
 */
export async function leaveOv2RoomUnified(params) {
  const { room, room_id, participant_key, forfeit_game = false } = params;
  const shared = room != null && typeof room === "object" && Number(room.shared_schema_version) === 1;
  if (shared) {
    return leaveOv2SharedRoom({ room_id, participant_key, forfeit_game });
  }
  return leaveOv2Room({ room_id, participant_key, forfeit_game });
}

/** Heuristic: server requires forfeit when leaving mid-match (see migration 055). */
export function ov2RoomNeedsForfeitOnLeave(room) {
  if (!room || typeof room !== "object") return false;
  if (Number(room.shared_schema_version) === 1) {
    return String(room.status || "").toUpperCase() === "IN_GAME";
  }
  const life = String(room.lifecycle_phase || "").trim();
  return life === "active" && room.active_session_id != null;
}

/**
 * @param {unknown} e
 * @returns {boolean}
 */
function leaveRpcErrorSuggestsForfeit(e) {
  if (e == null || typeof e !== "object") return false;
  const o = /** @type {{ code?: unknown; message?: unknown }} */ (e);
  const code = String(o.code ?? "").trim();
  const message = String(o.message ?? "").trim();
  if (code.toUpperCase() === "MUST_FORFEIT" || /must_forfeit/i.test(code)) return true;
  if (/forfeit/i.test(message) && /requires forfeit|p_forfeit_game|call again/i.test(message)) return true;
  return false;
}

/**
 * Leave with one authoritative-forfeit retry when the server rejects the first attempt.
 * @param {{ room?: object | null, room_id: string, participant_key: string }} params
 */
export async function leaveOv2RoomWithForfeitRetry(params) {
  let { room, room_id, participant_key } = params;
  if (room_id) {
    try {
      const fetched = await fetchOv2RoomById(room_id, { viewerParticipantKey: participant_key });
      if (fetched && typeof fetched === "object") {
        room = fetched;
      }
    } catch {
      /* keep caller snapshot */
    }
  }
  let forfeit = ov2RoomNeedsForfeitOnLeave(room);
  try {
    await leaveOv2RoomUnified({ room, room_id, participant_key, forfeit_game: forfeit });
  } catch (e) {
    if (!forfeit && leaveRpcErrorSuggestsForfeit(e)) {
      try {
        if (room_id) {
          const fetched = await fetchOv2RoomById(room_id, { viewerParticipantKey: participant_key });
          if (fetched && typeof fetched === "object") {
            room = fetched;
          }
        }
      } catch {
        /* keep room snapshot */
      }
      await leaveOv2RoomUnified({ room, room_id, participant_key, forfeit_game: true });
      return;
    }
    throw e;
  }
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
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
  const { room, members } = await reloadOv2RoomAndMembersAfterSeatMutation(room_id, participant_key);
  return { room: /** @type {object} */ (room), members: /** @type {object[]} */ (members || []) };
}

/** @param {{ message?: string } | Error} error */
function translateSupabaseRpcError(error) {
  const msg = error?.message || String(error);
  if (/relation .* does not exist|function .* does not exist/i.test(msg)) {
    if (/ov2_shared_get_room_canonical_ledger/i.test(msg)) {
      return new Ov2RoomRpcError(
        "MIGRATION_REQUIRED",
        "Apply migrations/online-v2/074_ov2_shared_rls_canonical_ledger_rpc_host_start_stakes.sql (after 073)."
      );
    }
    return new Ov2RoomRpcError("MIGRATION_REQUIRED", "Online V2 database is not up to date. Apply OV2 migrations.");
  }
  return error;
}
