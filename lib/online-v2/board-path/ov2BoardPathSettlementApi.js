/**
 * Board Path settlement claim — Supabase RPC wrappers (Phase: vault delivery).
 *
 * Client sequence (details + reliability notes): see `ov2BoardPathSettlementDelivery.js` module banner
 * and `getBoardPathSettlementDeliveryFlowDescription()`.
 */

/** @typedef {import("@supabase/supabase-js").SupabaseClient} SupabaseClient */

/**
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<Record<string, unknown>|null>}
 */
export async function rpcOv2BoardPathClaimSettlement(supabase, roomId, participantKey) {
  const { data, error } = await supabase.rpc("ov2_board_path_claim_settlement", {
    p_room_id: roomId,
    p_participant_key: participantKey,
  });
  if (error) {
    return { ok: false, code: "RPC_ERROR", message: error.message };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, code: "EMPTY", message: "Empty RPC response" };
  }
  return /** @type {Record<string, unknown>} */ (data);
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {{
 *   ok: boolean,
 *   idempotent?: boolean,
 *   roomId: string|null,
 *   participantKey: string|null,
 *   lines: { id: string, amount: number, lineKind: string, idempotencyKey: string, matchSeq: number }[],
 *   totalAmount: number,
 *   code?: string,
 *   message?: string,
 * }}
 */
export function normalizeClaimSettlementRpcResult(raw) {
  const r = raw && typeof raw === "object" ? raw : null;
  if (!r) {
    return {
      ok: false,
      roomId: null,
      participantKey: null,
      lines: [],
      totalAmount: 0,
      code: "EMPTY",
      message: "Empty response",
    };
  }
  if (r.ok !== true) {
    return {
      ok: false,
      roomId: r.room_id != null ? String(r.room_id) : null,
      participantKey: r.participant_key != null ? String(r.participant_key) : null,
      lines: [],
      totalAmount: 0,
      code: typeof r.code === "string" ? r.code : "RPC_REJECTED",
      message: typeof r.message === "string" ? r.message : "Claim rejected",
    };
  }

  /** @type {Record<string, unknown>[]} */
  const rawLines = Array.isArray(r.lines) ? /** @type {Record<string, unknown>[]} */ (r.lines) : [];
  const lines = rawLines.map(row => {
    const id = row?.id != null ? String(row.id) : "";
    const amount = Math.floor(Number(row?.amount)) || 0;
    const lineKind =
      typeof row?.line_kind === "string"
        ? row.line_kind
        : typeof row?.lineKind === "string"
          ? row.lineKind
          : "";
    const idempotencyKey =
      typeof row?.idempotency_key === "string"
        ? row.idempotency_key
        : typeof row?.idempotencyKey === "string"
          ? row.idempotencyKey
          : "";
    const matchSeq = Math.floor(Number(row?.match_seq ?? row?.matchSeq)) || 0;
    return { id, amount, lineKind, idempotencyKey, matchSeq };
  });

  const totalAmount = Math.floor(Number(r.total_amount ?? r.totalAmount)) || 0;

  return {
    ok: true,
    idempotent: Boolean(r.idempotent),
    roomId: r.room_id != null ? String(r.room_id) : null,
    participantKey: r.participant_key != null ? String(r.participant_key) : null,
    lines,
    totalAmount,
  };
}
