/**
 * OV2 Board Path — pure settlement assembly (Phase 5). Mirrors server finalize rules; no I/O.
 */

import { ONLINE_V2_GAME_KINDS, ONLINE_V2_SETTLEMENT_LINE_KIND, buildOnlineV2SettlementKey } from "../ov2Economy";
import { getBoardPathSeatOrder } from "./ov2BoardPathEngine";

/**
 * @param {unknown} sessionLike
 */
function sessionPhase(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const p = s.phase ?? s.engine_phase ?? s.enginePhase;
  return typeof p === "string" ? p.trim().toLowerCase() : "";
}

/**
 * @param {unknown} sessionLike
 */
function settlementStatus(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const raw = s.settlement_status ?? s.settlementStatus;
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return t === "finalized" ? "finalized" : "pending";
}

/**
 * @param {unknown} roomLike
 */
function nStake(roomLike) {
  const r = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : {};
  const v = r.stake_per_seat ?? r.stakePerSeat;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * @param {unknown} roomLike
 */
function nPotLocked(roomLike) {
  const r = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : {};
  const v = r.pot_locked ?? r.potLocked;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * @param {unknown} sessionLike
 */
function winnerSeatIndex(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const w = s.winner_seat_index ?? s.winnerSeatIndex;
  if (w == null || w === "") return null;
  const n = typeof w === "number" ? w : Number(w);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * Gross pot for display / ledger (matches finalize RPC: pot_locked or seats * stake).
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 */
export function resolveBoardPathSettlementPot(roomLike, seats) {
  const pl = nPotLocked(roomLike);
  if (pl > 0) return pl;
  const n = Array.isArray(seats) ? seats.length : 0;
  return n * nStake(roomLike);
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} members
 * @param {Record<string, unknown>[]|null|undefined} settlementLineRows
 */
export function getBoardPathSettlementState(sessionLike, seats, roomLike, members, settlementLineRows) {
  const phase = sessionPhase(sessionLike);
  const fin = settlementStatus(sessionLike);
  const widx = winnerSeatIndex(sessionLike);
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const pot = resolveBoardPathSettlementPot(roomLike, seats);
  const winnerSeatIndexVal = widx;
  let winnerParticipantKey = /** @type {string|null} */ (null);
  if (widx != null) {
    const row = order.find(x => x.seatIndex === widx);
    winnerParticipantKey = row ? row.participantKey : null;
  }
  const linesFromDb = Array.isArray(settlementLineRows) ? settlementLineRows : [];
  const participantCount = order.length;
  let outcome = /** @type {"win_loss"|"draw"|"pending"} */ ("pending");
  if (phase === "ended") {
    if (widx != null && winnerParticipantKey) outcome = "win_loss";
    else outcome = "draw";
  }
  const settledAmount =
    fin === "finalized"
      ? linesFromDb
          .filter(
            l =>
              String(l.line_kind || l.lineKind || "") === ONLINE_V2_SETTLEMENT_LINE_KIND.BOARD_PATH_WIN
          )
          .reduce((a, l) => a + (Math.floor(Number(l.amount)) || 0), 0)
      : outcome === "win_loss"
        ? pot
        : 0;

  return {
    phase,
    settlementStatus: fin,
    outcome: phase === "ended" ? outcome : "pending",
    winnerSeatIndex: winnerSeatIndexVal,
    winnerParticipantKey,
    participantCount,
    settledAmount,
    pot,
    finalized: fin === "finalized",
    finalizedAt:
      sessionLike && typeof sessionLike === "object"
        ? /** @type {Record<string, unknown>} */ (sessionLike).finalized_at ??
          /** @type {Record<string, unknown>} */ (sessionLike).finalizedAt ??
          null
        : null,
    settlementRevision:
      sessionLike && typeof sessionLike === "object"
        ? Math.floor(
            Number(
              /** @type {Record<string, unknown>} */ (sessionLike).settlement_revision ??
                /** @type {Record<string, unknown>} */ (sessionLike).settlementRevision
            ) || 0
          )
        : 0,
  };
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {string|null|undefined} selfKey
 * @param {string|null|undefined} hostKey
 * @param {boolean} liveDbBoardPath
 */
export function canBoardPathFinalizeSession(sessionLike, roomLike, selfKey, hostKey, liveDbBoardPath) {
  if (!liveDbBoardPath) return false;
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return false;
  if (String(room.product_game_id || "") !== ONLINE_V2_GAME_KINDS.BOARD_PATH) return false;
  const sk = selfKey?.trim() || null;
  const hk = hostKey?.trim() || null;
  if (!sk || !hk || sk !== hk) return false;
  if (sessionPhase(sessionLike) !== "ended") return false;
  if (settlementStatus(sessionLike) === "finalized") return false;
  return true;
}

/**
 * Pure settlement line plan (for VM preview; server RPC is authoritative).
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown} roomLike
 */
export function buildBoardPathSettlementLines(sessionLike, seats, roomLike) {
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  const roomId = room?.id != null ? String(room.id) : "";
  const matchSeq = room ? Math.floor(Number(room.match_seq ?? room.matchSeq)) || 0 : 0;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const pot = resolveBoardPathSettlementPot(roomLike, seats);
  const widx = winnerSeatIndex(sessionLike);
  const gameId = ONLINE_V2_GAME_KINDS.BOARD_PATH;
  const sess = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const sessionId = sess.id != null ? String(sess.id) : "";
  const phase = sessionPhase(sessionLike);

  /** @type {Array<Record<string, unknown>>} */
  const lines = [];

  let outcome = /** @type {"win_loss"|"draw"} */ ("draw");
  let winnerParticipantKey = /** @type {string|null} */ (null);

  if (widx != null) {
    const winnerRow = order.find(x => x.seatIndex === widx);
    const loserRow = order.find(x => x.seatIndex !== widx);
    if (winnerRow && loserRow) {
      outcome = "win_loss";
      winnerParticipantKey = winnerRow.participantKey;
      lines.push({
        participantKey: winnerRow.participantKey,
        seatIndex: winnerRow.seatIndex,
        resultType: "win",
        grossAmount: pot,
        netAmount: pot,
        lineKind: ONLINE_V2_SETTLEMENT_LINE_KIND.BOARD_PATH_WIN,
        idempotencyKey: buildOnlineV2SettlementKey(roomId, matchSeq, winnerRow.participantKey, "board_path_win", ""),
        metadata: {
          roomId,
          sessionId,
          gameId,
          matchSeq,
          phase,
          winnerSeatIndex: widx,
          winnerParticipantKey,
        },
      });
      lines.push({
        participantKey: loserRow.participantKey,
        seatIndex: loserRow.seatIndex,
        resultType: "loss",
        grossAmount: 0,
        netAmount: 0,
        lineKind: ONLINE_V2_SETTLEMENT_LINE_KIND.BOARD_PATH_LOSS,
        idempotencyKey: buildOnlineV2SettlementKey(roomId, matchSeq, loserRow.participantKey, "board_path_loss", ""),
        metadata: {
          roomId,
          sessionId,
          gameId,
          matchSeq,
          phase,
          winnerSeatIndex: widx,
          winnerParticipantKey,
        },
      });
    }
  }

  if (lines.length === 0 && order.length > 0) {
    for (const row of order) {
      lines.push({
        participantKey: row.participantKey,
        seatIndex: row.seatIndex,
        resultType: "draw",
        grossAmount: 0,
        netAmount: 0,
        lineKind: ONLINE_V2_SETTLEMENT_LINE_KIND.BOARD_PATH_DRAW,
        idempotencyKey: buildOnlineV2SettlementKey(roomId, matchSeq, row.participantKey, "board_path_draw", ""),
        metadata: {
          roomId,
          sessionId,
          gameId,
          matchSeq,
          phase,
          winnerSeatIndex: widx,
          winnerParticipantKey: null,
        },
      });
    }
  }

  const summary = {
    outcome,
    winnerSeatIndex: widx,
    winnerParticipantKey,
    participantCount: order.length,
    settledAmount: outcome === "win_loss" ? pot : 0,
  };

  return { summary, lines };
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} members
 * @param {Record<string, unknown>[]|null|undefined} settlementLineRows
 */
export function getBoardPathFinalizationLabel(sessionLike, seats, roomLike, members, settlementLineRows) {
  const st = getBoardPathSettlementState(sessionLike, seats, roomLike, members, settlementLineRows);
  if (st.phase !== "ended") return "";
  if (st.finalized) return "Settled";
  return "Pending settlement";
}
