/**
 * Pure 21 Challenge hand math (client + server safe; no crypto).
 */

/**
 * @param {string} code
 * @returns {{ rank: string; suit: string }}
 */
export function splitCardCode(code) {
  const s = String(code || "");
  if (s.length >= 3 && s.startsWith("10")) {
    return { rank: "10", suit: s.slice(2) };
  }
  return { rank: s.slice(0, 1).toUpperCase(), suit: s.slice(1) };
}

const SUIT_SYMBOL = { h: "♥", d: "♦", c: "♣", s: "♠" };

export function formatCardShort(code) {
  const { rank, suit } = splitCardCode(code);
  const sym = SUIT_SYMBOL[String(suit).toLowerCase()] || suit;
  return `${rank}${sym}`;
}

/**
 * @param {string[]} cards
 */
export function handTotal(cards) {
  const arr = Array.isArray(cards) ? cards : [];
  let total = 0;
  let aces = 0;
  for (const c of arr) {
    const { rank } = splitCardCode(c);
    if (rank === "A") {
      aces += 1;
      total += 11;
    } else if (rank === "J" || rank === "Q" || rank === "K" || rank === "10") {
      total += 10;
    } else {
      const n = parseInt(rank, 10);
      total += Number.isFinite(n) ? n : 0;
    }
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

/** Two-card 21 (authentic natural). */
export function isNatural21(hand) {
  const h = Array.isArray(hand) ? hand : [];
  return h.length === 2 && handTotal(h) === 21;
}

/** Visible total for opponent's up card only. */
export function upCardShowValue(cards) {
  const arr = Array.isArray(cards) ? cards : [];
  if (!arr.length) return 0;
  return handTotal([arr[0]]);
}

/** Rank identity for split rule (same rank only — 10 ≠ K). */
export function splitRankKey(code) {
  const { rank } = splitCardCode(code);
  return rank;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function canSplitByRank(a, b) {
  return splitRankKey(a) === splitRankKey(b);
}

/** Dealer up card is ace (for insurance). */
export function isDealerUpAce(opponentHand) {
  const arr = Array.isArray(opponentHand) ? opponentHand : [];
  if (!arr.length) return false;
  return splitRankKey(arr[0]) === "A";
}

/** Dealer up card is ten-value (10/J/Q/K) for peek. */
export function isDealerUpTenValue(opponentHand) {
  const arr = Array.isArray(opponentHand) ? opponentHand : [];
  if (!arr.length) return false;
  const r = splitRankKey(arr[0]);
  return r === "10" || r === "J" || r === "Q" || r === "K";
}
