/**
 * OV2 room access — reads via PostgREST `select`; all mutating paths use SECURITY DEFINER RPCs (see `005_ov2_room_rpcs.sql`).
 * Listing fields omit `passcode`. No client-side stake debit — commit will be a future `ov2_rpc_stake_commit`-style RPC + vault sync.
 */

import { supabaseMP as supabase } from "../supabaseClients";

/** Public list/detail — never includes `passcode`. */
export const OV2_ROOM_PUBLIC_FIELDS =
  "id,created_at,updated_at,product_game_id,title,lifecycle_phase,stake_per_seat,host_participant_key,is_private,match_seq,pot_locked,active_session_id,closed_reason,meta";

const OV2_MEMBER_LIST_FIELDS =
  "id,room_id,participant_key,display_name,seat_index,wallet_state,amount_locked,is_ready,created_at,updated_at,meta";

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
 * }} params
 * @returns {Promise<object>} room row (public fields subset in JSON from RPC)
 */
export async function createOv2Room(params) {
  const { product_game_id, title, stake_per_seat, host_participant_key, display_name } = params;
  const { data, error } = await supabase.rpc("ov2_rpc_room_create", {
    p_product_game_id: product_game_id,
    p_title: title.trim() || "Table",
    p_stake_per_seat: Math.floor(Number(stake_per_seat)),
    p_host_participant_key: host_participant_key,
    p_display_name: display_name.trim() || "",
  });
  if (error) throw error;
  return data;
}

/**
 * @param {{
 *   room_id: string,
 *   participant_key: string,
 *   display_name: string,
 * }} params
 */
export async function joinOv2Room(params) {
  const { room_id, participant_key, display_name } = params;
  const { error } = await supabase.rpc("ov2_rpc_room_join", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_display_name: display_name.trim() || "",
  });
  if (error) throw error;
}

/**
 * @param {{ room_id: string, participant_key: string }} params
 */
export async function leaveOv2Room(params) {
  const { room_id, participant_key } = params;
  const { error } = await supabase.rpc("ov2_rpc_room_leave", {
    p_room_id: room_id,
    p_participant_key: participant_key,
  });
  if (error) throw error;
}

/**
 * @param {{ room_id: string, participant_key: string, is_ready: boolean }} params
 */
export async function setOv2MemberReady(params) {
  const { room_id, participant_key, is_ready } = params;
  const { error } = await supabase.rpc("ov2_rpc_room_set_ready", {
    p_room_id: room_id,
    p_participant_key: participant_key,
    p_is_ready: Boolean(is_ready),
  });
  if (error) throw error;
}

/**
 * Host-only; server validates phase, membership counts, ready flags.
 * @param {{ room_id: string, host_participant_key: string }} params
 * @returns {Promise<object>}
 */
export async function startOv2RoomIntent(params) {
  const { room_id, host_participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_rpc_room_start", {
    p_room_id: room_id,
    p_host_participant_key: host_participant_key,
  });
  if (error) throw error;
  return data;
}
