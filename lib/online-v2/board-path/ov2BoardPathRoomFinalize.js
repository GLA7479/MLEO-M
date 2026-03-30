/**
 * OV2 Board Path Phase 6 — pure room finalization helpers (no I/O).
 */

import { ONLINE_V2_GAME_KINDS } from "../ov2Economy";

/**
 * @param {unknown} roomLike
 */
export function getBoardPathRoomSettlementStatus(roomLike) {
  const r = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!r) return "pending";
  const raw = r.settlement_status ?? r.settlementStatus;
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return t === "finalized" ? "finalized" : "pending";
}

/**
 * @param {Record<string, unknown>[]|null|undefined} settlementLineRows — `ov2_settlement_lines` rows for the room
 * @returns {{ participantKey: string, totalAmount: number }[]}
 */
export function buildBoardPathRoomSettlementSummary(settlementLineRows) {
  if (!Array.isArray(settlementLineRows) || settlementLineRows.length === 0) return [];
  /** @type {Record<string, number>} */
  const acc = {};
  for (const row of settlementLineRows) {
    if (!row || typeof row !== "object") continue;
    const pkRaw = /** @type {Record<string, unknown>} */ (row).recipient_participant_key;
    const pk = typeof pkRaw === "string" && pkRaw.trim() ? pkRaw.trim() : null;
    if (!pk) continue;
    const amt = Math.floor(Number(/** @type {Record<string, unknown>} */ (row).amount)) || 0;
    acc[pk] = (acc[pk] || 0) + amt;
  }
  return Object.keys(acc)
    .sort()
    .map(participantKey => ({ participantKey, totalAmount: acc[participantKey] }));
}

/**
 * @param {unknown} sessionRow
 */
function sessionPhase(sessionRow) {
  const s = sessionRow && typeof sessionRow === "object" ? /** @type {Record<string, unknown>} */ (sessionRow) : null;
  if (!s) return "";
  const p = s.phase ?? s.engine_phase;
  return typeof p === "string" ? p.trim().toLowerCase() : "";
}

/**
 * @param {unknown} sessionRow
 */
function sessionSettlementFinal(sessionRow) {
  const s = sessionRow && typeof sessionRow === "object" ? /** @type {Record<string, unknown>} */ (sessionRow) : null;
  if (!s) return false;
  const st = s.settlement_status ?? s.settlementStatus;
  return String(st || "").trim().toLowerCase() === "finalized";
}

/**
 * STRICT: all sessions ended; max(match_seq) row session settlement finalized; room not yet room-finalized.
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} sessionRows — board_path session rows for room (phase + match_seq + settlement_status)
 * @param {string|null|undefined} selfKey
 * @param {string|null|undefined} hostKey
 * @param {boolean} liveDbBoardPath
 */
export function canBoardPathFinalizeRoom(roomLike, sessionRows, selfKey, hostKey, liveDbBoardPath) {
  if (!liveDbBoardPath) return false;
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return false;
  if (String(room.product_game_id || "") !== ONLINE_V2_GAME_KINDS.BOARD_PATH) return false;
  if (getBoardPathRoomSettlementStatus(room) === "finalized") return false;
  const sk = selfKey?.trim() || null;
  const hk = hostKey?.trim() || null;
  if (!sk || !hk || sk !== hk) return false;

  const sessions = Array.isArray(sessionRows) ? sessionRows : [];
  if (sessions.length === 0) return false;

  for (const s of sessions) {
    if (sessionPhase(s) !== "ended") return false;
  }

  let maxSeq = Number.NEGATIVE_INFINITY;
  for (const s of sessions) {
    const o = s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : null;
    const m = Math.floor(Number(o?.match_seq ?? o?.matchSeq)) || 0;
    if (m > maxSeq) maxSeq = m;
  }
  if (!Number.isFinite(maxSeq)) return false;

  const latest = sessions.find(s => {
    const o = s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : null;
    return (Math.floor(Number(o?.match_seq ?? o?.matchSeq)) || 0) === maxSeq;
  });
  if (!latest || !sessionSettlementFinal(latest)) return false;

  return true;
}

/**
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} sessionRows
 */
export function getBoardPathRoomFinalizationLabel(roomLike, sessionRows) {
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return "";
  if (getBoardPathRoomSettlementStatus(room) === "finalized") return "Room finalized";
  const sessions = Array.isArray(sessionRows) ? sessionRows : [];
  if (sessions.some(s => sessionPhase(s) !== "ended")) return "Room: match in progress";
  let maxSeq = Number.NEGATIVE_INFINITY;
  for (const s of sessions) {
    const o = s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : null;
    const m = Math.floor(Number(o?.match_seq ?? o?.matchSeq)) || 0;
    if (m > maxSeq) maxSeq = m;
  }
  const latest = sessions.find(s => {
    const o = s && typeof s === "object" ? /** @type {Record<string, unknown>} */ (s) : null;
    return (Math.floor(Number(o?.match_seq ?? o?.matchSeq)) || 0) === maxSeq;
  });
  if (!latest || !sessionSettlementFinal(latest)) return "Room: finalize match first";
  return "Room: ready to finalize";
}
