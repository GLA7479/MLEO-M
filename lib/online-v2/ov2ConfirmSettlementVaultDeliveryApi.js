/**
 * Marks settlement lines delivered only after the browser has successfully applied vault credit/debit.
 * Pairs with `ov2_*_claim_settlement` (two-phase: claim returns rows without setting delivered).
 */

import { supabaseMP } from "../supabaseClients";

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @param {string[]} lineIds UUID strings from claim response `lines[].id`
 */
export async function requestOv2ConfirmSettlementVaultDelivery(roomId, participantKey, lineIds) {
  const rid = roomId != null ? String(roomId).trim() : "";
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const ids = Array.isArray(lineIds) ? lineIds.map(x => String(x).trim()).filter(Boolean) : [];
  if (!rid || !pk || ids.length === 0) {
    return {
      ok: false,
      code: "INVALID",
      message: "room_id, participant_key, and line_ids required",
      marked_count: 0,
    };
  }
  try {
    const { data, error } = await supabaseMP.rpc("ov2_confirm_settlement_vault_delivery", {
      p_room_id: rid,
      p_participant_key: pk,
      p_line_ids: ids,
    });
    if (error) {
      return {
        ok: false,
        code: "RPC_ERROR",
        message: error.message || String(error),
        marked_count: 0,
      };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, code: "EMPTY", message: "Empty RPC response", marked_count: 0 };
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok !== true) {
      return {
        ok: false,
        code: typeof d.code === "string" ? d.code : "REJECTED",
        message: typeof d.message === "string" ? d.message : "Confirm rejected",
        marked_count: Number(d.marked_count) || 0,
      };
    }
    return {
      ok: true,
      marked_count: Number(d.marked_count) || 0,
    };
  } catch (e) {
    return {
      ok: false,
      code: "EXCEPTION",
      message: e instanceof Error ? e.message : String(e),
      marked_count: 0,
    };
  }
}
