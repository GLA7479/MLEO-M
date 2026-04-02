/**
 * Minimal 7-card Texas Hold'em evaluator — best 5 of 7, for server settlement.
 * Card codes: rank + suit, e.g. "Ah", "Td", "2c" (ten = "T").
 */

const RANK_MAP = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

/** @param {string} code */
export function parseCardCode(code) {
  const s = String(code || "").trim();
  if (s.length < 2) return null;
  let rankCh;
  let suit;
  if (s.startsWith("10")) {
    rankCh = "T";
    suit = s[2];
  } else {
    rankCh = s[0];
    suit = s[1];
  }
  const r = RANK_MAP[rankCh];
  if (!r || !suit) return null;
  return { r, suit };
}

function combinations5(arr7) {
  const out = [];
  const n = arr7.length;
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      for (let c = b + 1; c < n; c++) {
        for (let d = c + 1; d < n; d++) {
          for (let e = d + 1; e < n; e++) {
            out.push([arr7[a], arr7[b], arr7[c], arr7[d], arr7[e]]);
          }
        }
      }
    }
  }
  return out;
}

/**
 * @param {{r:number,suit:string}[]} five
 * @returns {number[]}
 */
function scoreFive(five) {
  const ranks = five.map(x => x.r).sort((a, b) => b - a);
  const suits = five.map(x => x.suit);
  const flush = suits.every(s => s === suits[0]);
  const freq = {};
  for (const r of ranks) freq[r] = (freq[r] || 0) + 1;
  const byFreq = Object.entries(freq)
    .map(([k, v]) => [Number(k), v])
    .sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2) {
      straightHigh = 5;
    }
  }

  if (flush && straightHigh) {
    return [8, straightHigh];
  }
  if (byFreq[0][1] === 4) {
    const quad = byFreq[0][0];
    const kicker = byFreq.find(([r]) => r !== quad)?.[0] || 0;
    return [7, quad, kicker];
  }
  if (byFreq[0][1] === 3 && byFreq[1]?.[1] === 2) {
    return [6, byFreq[0][0], byFreq[1][0]];
  }
  if (flush) {
    return [5, ...ranks];
  }
  if (straightHigh) {
    return [4, straightHigh];
  }
  if (byFreq[0][1] === 3) {
    const t = byFreq[0][0];
    const kickers = byFreq.filter(([r]) => r !== t).map(([r]) => r).sort((a, b) => b - a);
    return [3, t, ...kickers.slice(0, 2)];
  }
  if (byFreq[0][1] === 2 && byFreq[1]?.[1] === 2) {
    const hi = Math.max(byFreq[0][0], byFreq[1][0]);
    const lo = Math.min(byFreq[0][0], byFreq[1][0]);
    const kicker = byFreq.find(([r]) => r !== hi && r !== lo)?.[0] || 0;
    return [2, hi, lo, kicker];
  }
  if (byFreq[0][1] === 2) {
    const p = byFreq[0][0];
    const kickers = byFreq.filter(([r]) => r !== p).map(([r]) => r).sort((a, b) => b - a);
    return [1, p, ...kickers.slice(0, 3)];
  }
  return [0, ...ranks];
}

function cmpScore(a, b) {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/**
 * @param {string[]} cards7
 * @returns {number[] | null}
 */
export function bestHandScoreFrom7(cards7) {
  const parsed = [];
  for (const c of cards7 || []) {
    const p = parseCardCode(c);
    if (p) parsed.push(p);
  }
  if (parsed.length < 5) return null;
  let best = null;
  for (const comb of combinations5(parsed)) {
    const sc = scoreFive(comb);
    if (!best || cmpScore(sc, best) > 0) best = sc;
  }
  return best;
}

/**
 * @param {string[]} cards7a
 * @param {string[]} cards7b
 * @returns {number} positive if a wins, negative if b wins, 0 chop
 */
export function compare7CardHands(cards7a, cards7b) {
  const sa = bestHandScoreFrom7(cards7a);
  const sb = bestHandScoreFrom7(cards7b);
  if (!sa && !sb) return 0;
  if (!sa) return -1;
  if (!sb) return 1;
  return cmpScore(sa, sb);
}
