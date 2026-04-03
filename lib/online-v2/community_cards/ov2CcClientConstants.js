/** Client-visible timing hints (mirror server engine). */

/**
 * True while a hand is in live betting streets (preflop–river).
 * Mirrors `isHandBettingActive` in `ov2CcMultiEngine.js` without importing Node-only code on the client.
 */
export function isOv2CcHandBettingLive(engine) {
  if (!engine || typeof engine !== "object") return false;
  const hs = Math.floor(Number(engine.handSeq) || 0);
  if (hs <= 0) return false;
  const ph = engine.phase;
  if (ph === "showdown" || ph === "between_hands" || ph === "idle") return false;
  if (ph === "post_blinds") return false;
  const st = engine.street;
  return st === "preflop" || st === "flop" || st === "turn" || st === "river";
}

export const OV2_CC_ACTION_MS = 15_000;
/** Server accepts actions until this long after actionDeadline (mobile / conflict safety). */
export const OV2_CC_ACTION_SERVER_GRACE_MS = 3_000;

/** Pause between hands (ms) — engine-driven; for UI hints only. */
export const OV2_CC_BETWEEN_HANDS_MS = 4_000;
