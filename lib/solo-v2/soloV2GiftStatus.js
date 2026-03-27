/**
 * Solo V2 gift / free-round status contract (not legacy arcade).
 * @typedef {Object} SoloV2GiftStatus
 * @property {number} tokens — current spendable gifts (same idea as legacy `tokens`)
 * @property {number} maxTokens — cap (5)
 * @property {number} regenMs — ms between regenerations (3_600_000)
 * @property {number | null} nextGiftAt — timestamp when next token accrues (null if at max)
 * @property {number} freeRoundStake — entry for one gift round (25)
 */

import {
  SOLO_V2_GIFT_MAX,
  SOLO_V2_GIFT_REGEN_MS,
  SOLO_V2_GIFT_ROUND_STAKE,
} from "./soloV2GiftStorage";

export const SOLO_V2_GIFT_STATUS_DEFAULTS = {
  maxTokens: SOLO_V2_GIFT_MAX,
  regenMs: SOLO_V2_GIFT_REGEN_MS,
  freeRoundStake: SOLO_V2_GIFT_ROUND_STAKE,
};

/**
 * @param {{ count: number, nextGiftAt: number | null }} synced From soloV2GiftSyncAndRead()
 * @returns {SoloV2GiftStatus & { tokens: number }}
 */
export function buildSoloV2GiftStatus(synced) {
  return {
    tokens: Math.max(0, Math.min(SOLO_V2_GIFT_MAX, Number(synced.count) || 0)),
    maxTokens: SOLO_V2_GIFT_MAX,
    regenMs: SOLO_V2_GIFT_REGEN_MS,
    nextGiftAt: synced.nextGiftAt != null ? Number(synced.nextGiftAt) : null,
    freeRoundStake: SOLO_V2_GIFT_ROUND_STAKE,
  };
}
