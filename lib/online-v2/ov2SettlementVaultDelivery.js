/**
 * Neutral OV2: two-phase settlement delivery (claim lines → vault → DB confirm).
 * Delegates to the legacy Board Path module implementation; Snakes and new code should import from here.
 */

import { applyBoardPathSettlementClaimLinesToVaultAndConfirm as applyBoardPathSettlementImpl } from "./board-path/ov2BoardPathSettlementDelivery";

/**
 * @param {{ id?: unknown, amount?: unknown, idempotency_key?: unknown, idempotencyKey?: unknown }[]} claimedLines
 * @param {string} [gameId]
 * @param {string} roomId
 * @param {string} participantKey
 */
export async function applyOv2SettlementClaimLinesToVaultAndConfirm(claimedLines, gameId, roomId, participantKey) {
  return applyBoardPathSettlementImpl(claimedLines, gameId, roomId, participantKey);
}
