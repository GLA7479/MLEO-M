/**
 * OV2 Quick Match — RPC-only (queue / offers / invited join / deadline auto-start tick).
 */

import { supabaseMP as supabase } from "../../supabaseClients";
import { isOv2QuickMatchAllowedStakeUnits } from "../shared-rooms/ov2QuickMatchStakes";

export class Ov2QuickMatchRpcError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "Ov2QuickMatchRpcError";
    this.code = code;
  }
}

/**
 * @param {unknown} data
 */
function assertQmSuccess(data) {
  if (data == null || typeof data !== "object") {
    throw new Ov2QuickMatchRpcError("UNKNOWN", "Invalid response from server.");
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) {
    return d;
  }
  const code = typeof d.code === "string" ? d.code : "UNKNOWN";
  const message = typeof d.message === "string" ? d.message : "Request failed.";
  throw new Ov2QuickMatchRpcError(code, message);
}

/**
 * @param {{ message?: string } | Error} error
 */
function translateQmError(error) {
  const msg = error?.message || String(error);
  const missingDbObject =
    /relation .* does not exist|function .* does not exist/i.test(msg) ||
    /could not find (the )?function/i.test(msg) ||
    (/schema cache/i.test(msg) && /function/i.test(msg));
  if (missingDbObject) {
    return new Ov2QuickMatchRpcError(
      "MIGRATION_REQUIRED",
      "Quick Match requires OV2 migrations through migrations/online-v2/073_ov2_quick_match_fill_pending_room.sql applied to your Supabase project."
    );
  }
  return error;
}

/**
 * @param {{
 *   participant_key: string,
 *   display_name: string,
 *   product_game_id: string,
 *   stake_per_seat: number,
 *   preferred_max_players?: number | null,
 * }} params
 */
export async function ov2QuickMatchEnqueue(params) {
  const { participant_key, display_name, product_game_id, stake_per_seat, preferred_max_players = null } = params;
  const stakeUnits = Math.floor(Number(stake_per_seat));
  if (!isOv2QuickMatchAllowedStakeUnits(stakeUnits)) {
    throw new Ov2QuickMatchRpcError(
      "INVALID_STAKE",
      "Quick match stake must be 100, 1K, 10K, or 100K (100 / 1000 / 10000 / 100000)."
    );
  }
  const { data, error } = await supabase.rpc("ov2_quick_match_enqueue", {
    p_participant_key: String(participant_key || "").trim(),
    p_display_name: String(display_name || "").trim() || "Player",
    p_product_game_id: String(product_game_id || "").trim(),
    p_stake_per_seat: stakeUnits,
    p_preferred_max_players:
      preferred_max_players == null || preferred_max_players === "" ? null : Math.floor(Number(preferred_max_players)),
  });
  if (error) throw translateQmError(error);
  return assertQmSuccess(data);
}

/**
 * @param {{ participant_key: string }} params
 */
export async function ov2QuickMatchLeaveQueue(params) {
  const { participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_quick_match_leave_queue", {
    p_participant_key: String(participant_key || "").trim(),
  });
  if (error) throw translateQmError(error);
  return assertQmSuccess(data);
}

/**
 * @param {{ offer_id: string, participant_key: string }} params
 */
export async function ov2QuickMatchConfirm(params) {
  const { offer_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_quick_match_confirm", {
    p_offer_id: offer_id,
    p_participant_key: String(participant_key || "").trim(),
  });
  if (error) throw translateQmError(error);
  return assertQmSuccess(data);
}

/**
 * @param {{ offer_id: string, participant_key: string }} params
 */
export async function ov2QuickMatchDecline(params) {
  const { offer_id, participant_key } = params;
  const { data, error } = await supabase.rpc("ov2_quick_match_decline", {
    p_offer_id: offer_id,
    p_participant_key: String(participant_key || "").trim(),
  });
  if (error) throw translateQmError(error);
  return assertQmSuccess(data);
}

/**
 * @param {{ participant_key: string, room_id?: string | null }} params
 */
export async function ov2QuickMatchTick(params) {
  const { participant_key, room_id = null } = params;
  const { data, error } = await supabase.rpc("ov2_quick_match_tick", {
    p_participant_key: String(participant_key || "").trim(),
    p_room_id: room_id && String(room_id).length >= 32 ? room_id : null,
  });
  if (error) throw translateQmError(error);
  return assertQmSuccess(data);
}

/**
 * @param {{
 *   room_id: string,
 *   participant_key: string,
 *   display_name: string,
 * }} params
 */
/**
 * @param {{ room_id: string, participant_key?: string | null }} params
 * @returns {Promise<Record<string, unknown>>}
 */
export async function ov2QuickMatchAutoStartDeadline(params) {
  const { room_id, participant_key = null } = params;
  const pk = participant_key == null || String(participant_key).trim() === "" ? null : String(participant_key).trim();
  const { data, error } = await supabase.rpc("ov2_quick_match_auto_start_deadline", {
    p_room_id: room_id,
    p_viewer_participant_key: pk,
  });
  if (error) throw translateQmError(error);
  if (data == null || typeof data !== "object") {
    return { ok: false, code: "UNKNOWN", message: "Invalid response." };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

export async function ov2QuickMatchJoinInvitedRoom(params) {
  const { room_id, participant_key, display_name } = params;
  const { data, error } = await supabase.rpc("ov2_quick_match_join_invited_room", {
    p_room_id: room_id,
    p_participant_key: String(participant_key || "").trim(),
    p_display_name: String(display_name || "").trim() || "Player",
  });
  if (error) throw translateQmError(error);
  const out = assertQmSuccess(data);
  const room = out.room && typeof out.room === "object" ? /** @type {Record<string, unknown>} */ (out.room) : {};
  const members = Array.isArray(out.members) ? out.members : [];
  return { room, members };
}
