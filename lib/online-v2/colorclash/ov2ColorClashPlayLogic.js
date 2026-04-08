/**
 * Color Clash — client hints aligned with `ov2_cc_is_playable_on` and friendly RPC copy.
 */

import { ccCardColorIndex, ccCardNum, ccCardType, ccCardsEqual } from "./ov2ColorClashCards";

/** @type {Record<string, string>} */
const CC_PLAYER_ERROR_MSG = {
  REVISION_MISMATCH: "The table just updated — try again.",
  ILLEGAL_CARD: "That card isn't legal now. Match color or symbol, play a wild, or draw.",
  NOT_YOUR_TURN: "It's not your turn.",
  BAD_PHASE: "That action isn't available at this step.",
  STOCK_EMPTY: "No cards left to draw.",
  MUST_PLAY_DRAWN: "Play one of the cards you drew, or tap Pass.",
  COLOR_REQUIRED: "Pick a color for your wild card.",
  CARD_NOT_IN_HAND: "That card isn't in your hand.",
  SURGE_BAD_PHASE: "Surge is only for your main play — not after you draw.",
  SURGE_USED: "You already used Surge this match.",
  SURGE_NUMBERS_ONLY: "Surge needs two number cards.",
  SURGE_INCOMPLETE: "Surge needs two valid number plays.",
  NO_SEAT: "You're not seated in this match.",
  GAME_NOT_PLAYING: "This round isn't active.",
  NO_SESSION: "No active game session.",
  NO_ACTIVE_SESSION: "No active game session.",
  SESSION_NOT_FOUND: "Session not found — try leaving and re-entering the room.",
  ROOM_NOT_FOUND: "Room not found.",
  WRONG_PRODUCT: "This isn't a Color Clash table.",
  NOT_MEMBER: "You must be in the room to do that.",
  NOT_HOST: "Only the host can do that.",
  STAKES_NOT_COMMITTED: "Everyone at the table must commit stakes first.",
  ROOM_NOT_STARTED: "The room hasn't started yet.",
  ROOM_NOT_ACTIVE: "The room isn't active right now.",
  BAD_SEAT_COUNT: "Color Clash needs 2–4 seated players.",
  REMATCH_NOT_ALLOWED: "Rematch isn't available yet.",
  STALE_SESSION: "Session changed — try again.",
  STALE_MATCH_SEQ: "This table started a new match — go back to the lobby.",
  NOT_ELIGIBLE: "You need a seat with committed stake.",
  NOT_IN_MATCH: "You're not in this match.",
  NOT_ALL_REMATCH_READY: "Not everyone is ready to rematch yet.",
  NOT_ENOUGH_PLAYERS: "Need at least two committed players.",
  INVALID_ARGUMENT: "That request wasn't valid.",
  NO_NEXT: "Turn order error — try again.",
};

/**
 * @param {string|undefined} code
 * @param {string|undefined} message
 * @returns {string}
 */
export function humanizeOv2ColorClashError(code, message) {
  const c = code != null && code !== "" ? String(code).trim() : "";
  if (c && CC_PLAYER_ERROR_MSG[c]) return CC_PLAYER_ERROR_MSG[c];
  if (typeof message === "string" && message.trim() !== "") return message.trim();
  return "Something went wrong — try again.";
}

/**
 * Mirrors `public.ov2_cc_is_playable_on` for standard (non-Surge) plays.
 * @param {unknown} card
 * @param {unknown} topDiscard
 * @param {number|null|undefined} currentColor use 0..3; null/undefined treated like server coalesce → 0
 * @param {number|null|undefined} wildLockColor lock color for this seat's turn, or null
 * @returns {boolean}
 */
export function ccIsPlayableOn(card, topDiscard, currentColor, wildLockColor) {
  if (!card || typeof card !== "object" || !topDiscard || typeof topDiscard !== "object") return false;
  const tt = ccCardType(topDiscard);
  const ct = ccCardType(card);
  const wlock =
    wildLockColor != null && wildLockColor !== "" && Number.isFinite(Number(wildLockColor))
      ? Math.floor(Number(wildLockColor))
      : null;
  if (wlock != null && wlock >= 0 && wlock <= 3 && ct !== "w" && ct !== "f") {
    const cardCi = ccCardColorIndex(card);
    if (cardCi == null || cardCi !== wlock) return false;
  }
  if (ct === "w" || ct === "f") return true;
  const cc = ccCardColorIndex(card);
  if (cc == null || cc < 0 || cc > 3) return false;
  const ccEff =
    currentColor != null && currentColor !== "" && Number.isFinite(Number(currentColor))
      ? Math.max(0, Math.min(3, Math.floor(Number(currentColor))))
      : 0;
  if (tt === "w" || tt === "f") {
    return cc === ccEff;
  }
  if (tt === "n") {
    const tv = ccCardNum(topDiscard);
    const nv = ccCardNum(card);
    if (nv != null && tv != null && nv === tv) return true;
    const tc = ccCardColorIndex(topDiscard);
    if (tc != null && cc === tc) return true;
    return false;
  }
  const tc = ccCardColorIndex(topDiscard);
  return tc != null && cc === tc;
}

/**
 * Second card in Surge: playable on the first card after it would be played (server order).
 * @param {unknown} secondCard
 * @param {unknown} firstCard
 * @param {unknown} topBefore
 * @param {number|null|undefined} currentColorBefore
 * @param {number|null|undefined} wildLockColor
 * @returns {boolean}
 */
export function ccSurgeSecondPlayable(secondCard, firstCard, topBefore, currentColorBefore, wildLockColor) {
  if (!secondCard || !firstCard || !topBefore) return false;
  if (ccCardType(firstCard) !== "n" || ccCardType(secondCard) !== "n") return false;
  if (ccCardsEqual(firstCard, secondCard)) return false;
  const cc0 =
    currentColorBefore != null && Number.isFinite(Number(currentColorBefore))
      ? Math.max(0, Math.min(3, Math.floor(Number(currentColorBefore))))
      : 0;
  if (!ccIsPlayableOn(firstCard, topBefore, cc0, wildLockColor)) return false;
  const newCc = ccCardColorIndex(firstCard);
  if (newCc == null) return false;
  return ccIsPlayableOn(secondCard, firstCard, newCc, wildLockColor);
}
