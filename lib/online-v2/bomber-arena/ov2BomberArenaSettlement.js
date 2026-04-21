/**
 * OV2 Bomber Arena — settlement claim RPC wrapper.
 */

import { supabaseMP } from "../../supabaseClients";

/**
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<{ ok: boolean, idempotent?: boolean, lines: unknown[], total_amount?: number, code?: string, message?: string }>}
 */
export async function requestOv2BomberArenaClaimSettlement(roomId, participantKey) {
  const rid = roomId != null ? String(roomId).trim() : "";
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!rid || !pk) {
    return { ok: false, code: "INVALID", message: "room_id and participant_key required", lines: [] };
  }
  try {
    const { data, error } = await supabaseMP.rpc("ov2_bomber_arena_claim_settlement", {
      p_room_id: rid,
      p_participant_key: pk,
    });
    if (error) {
      return { ok: false, code: "RPC_ERROR", message: error.message || String(error), lines: [] };
    }
    if (!data || typeof data !== "object") {
      return { ok: false, code: "EMPTY", message: "Empty RPC response", lines: [] };
    }
    const d = /** @type {Record<string, unknown>} */ (data);
    if (d.ok !== true) {
      return {
        ok: false,
        code: typeof d.code === "string" ? d.code : "REJECTED",
        message: typeof d.message === "string" ? d.message : "Claim rejected",
        lines: [],
      };
    }
    return {
      ok: true,
      idempotent: d.idempotent === true,
      lines: Array.isArray(d.lines) ? d.lines : [],
      total_amount: typeof d.total_amount === "number" ? d.total_amount : Number(d.total_amount) || 0,
    };
  } catch (e) {
    return { ok: false, code: "ERROR", message: e instanceof Error ? e.message : String(e), lines: [] };
  }
}
