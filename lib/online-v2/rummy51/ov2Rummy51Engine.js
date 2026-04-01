/**
 * Pure Rummy51 rules helpers for OV2 (no React, Supabase, or browser APIs).
 */

import { ov2MakeRng, ov2Shuffle } from "../shared/ov2DeterministicRng.js";

export const RUMMY51_MAX_PLAYERS = 4;
export const RUMMY51_MIN_PLAYERS = 2;
export const RUMMY51_HAND_SIZE = 14;
export const RUMMY51_ELIMINATION_SCORE = 251;
export const RUMMY51_OPEN_TARGET = 51;
export const RUMMY51_JOKER_HAND_PENALTY = 20;
export const RUMMY51_NEVER_OPENED_FULL_HAND_PENALTY = 100;

/** Minimum cards in a run or set meld. */
const RUMMY51_MIN_MELD_SIZE = 3;

const SUITS = /** @type {const} */ (["S", "H", "D", "C"]);
const RANK_LOW = 1;
const RANK_HIGH = 13;

/**
 * @typedef {import("../shared/ov2DeterministicRng.js").ov2MakeRng} Ov2RngFactory
 */

/**
 * @typedef {Object} Rummy51Card
 * @property {string} id
 * @property {number} rank 1..13, Ace = 1
 * @property {"S"|"H"|"D"|"C"|null} suit
 * @property {boolean} isJoker
 * @property {0|1} deckIndex
 * @property {number} [sortKey]
 */

/**
 * @typedef {"run"|"set"|"invalid"} Rummy51MeldKind
 */

/**
 * @typedef {Object} Rummy51TurnState
 * @property {boolean} hasDrawn
 * @property {boolean} hasDiscarded
 * @property {boolean} hasOpenedBefore — opened on a prior turn this hand (or match, per caller).
 * @property {boolean} [drewFromDiscard]
 * @property {string|null} [pickedDiscardCardId] — exact card taken from discard when `drewFromDiscard`.
 */

/**
 * @param {number} deckIndex
 * @param {string} suit
 * @param {number} rank
 * @returns {string}
 */
function makeNaturalId(deckIndex, suit, rank) {
  return `d${deckIndex}:${suit}:${rank}`;
}

/**
 * @param {number} jokerIndex 0 or 1 (exactly two jokers in the full shoe)
 * @returns {string}
 */
function makeJokerId(jokerIndex) {
  return `J:${jokerIndex}`;
}

/**
 * @returns {Rummy51Card[]}
 */
export function buildRummy51Deck() {
  /** @type {Rummy51Card[]} */
  const out = [];
  for (let d = 0; d < 2; d++) {
    for (const suit of SUITS) {
      for (let rank = RANK_LOW; rank <= RANK_HIGH; rank++) {
        const id = makeNaturalId(d, suit, rank);
        out.push({
          id,
          rank,
          suit,
          isJoker: false,
          deckIndex: /** @type {0|1} */ (d),
          sortKey: computeSortKey(false, suit, rank),
        });
      }
    }
  }
  out.push({
    id: makeJokerId(0),
    rank: 0,
    suit: null,
    isJoker: true,
    deckIndex: 0,
    sortKey: 8000,
  });
  out.push({
    id: makeJokerId(1),
    rank: 0,
    suit: null,
    isJoker: true,
    deckIndex: 1,
    sortKey: 8010,
  });
  return out;
}

/**
 * @param {boolean} isJoker
 * @param {string|null} suit
 * @param {number} rank
 */
function computeSortKey(isJoker, suit, rank) {
  if (isJoker) return 9000;
  const si = suit ? SUITS.indexOf(suit) : 0;
  const r = rank === 1 ? 14 : rank;
  return si * 32 + r;
}

/**
 * @param {string} seedStr
 * @param {Rummy51Card[]} [deck]
 * @returns {Rummy51Card[]}
 */
export function shuffleRummy51Deck(seedStr, deck = buildRummy51Deck()) {
  const rng = ov2MakeRng(String(seedStr ?? ""));
  return ov2Shuffle(deck, rng);
}

/**
 * @param {Rummy51Card} card
 * @returns {Record<string, unknown>}
 */
export function serializeCard(card) {
  return {
    id: card.id,
    rank: card.rank,
    suit: card.suit,
    isJoker: card.isJoker,
    deckIndex: card.deckIndex,
    ...(card.sortKey !== undefined ? { sortKey: card.sortKey } : {}),
  };
}

/**
 * @param {unknown} raw
 * @returns {Rummy51Card}
 */
export function deserializeCard(raw) {
  if (!raw || typeof raw !== "object") throw new TypeError("deserializeCard: expected object");
  const o = /** @type {Record<string, unknown>} */ (raw);
  const id = o.id;
  const rank = o.rank;
  const suit = o.suit;
  const isJoker = o.isJoker;
  const deckIndex = o.deckIndex;
  if (typeof id !== "string" || id.length === 0) throw new TypeError("deserializeCard: id");
  if (typeof isJoker !== "boolean") throw new TypeError("deserializeCard: isJoker");
  if (deckIndex !== 0 && deckIndex !== 1) throw new TypeError("deserializeCard: deckIndex");
  if (isJoker) {
    return {
      id,
      rank: typeof rank === "number" ? rank : 0,
      suit: null,
      isJoker: true,
      deckIndex: /** @type {0|1} */ (deckIndex),
      sortKey: typeof o.sortKey === "number" ? o.sortKey : 8000 + deckIndex,
    };
  }
  if (typeof rank !== "number" || rank < 1 || rank > 13) throw new TypeError("deserializeCard: rank");
  if (suit !== "S" && suit !== "H" && suit !== "D" && suit !== "C") throw new TypeError("deserializeCard: suit");
  return {
    id,
    rank,
    suit,
    isJoker: false,
    deckIndex: /** @type {0|1} */ (deckIndex),
    sortKey: typeof o.sortKey === "number" ? o.sortKey : computeSortKey(false, suit, rank),
  };
}

/**
 * @param {Rummy51Card} card
 * @returns {string}
 */
export function getCardDisplayLabel(card) {
  if (card.isJoker) return "Joker";
  const rankLabels = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suitSym = { S: "♠", H: "♥", D: "♦", C: "♣" };
  const r = rankLabels[card.rank] ?? "?";
  const s = card.suit ? suitSym[card.suit] ?? card.suit : "";
  return `${r}${s}`;
}

/**
 * End-of-hand penalty value for a single card held.
 * @param {Rummy51Card} card
 * @returns {number}
 */
export function getCardPointValue(card) {
  if (card.isJoker) return RUMMY51_JOKER_HAND_PENALTY;
  if (card.rank === 1) return 11;
  if (card.rank >= 11) return 10;
  return card.rank;
}

/**
 * Opening / meld valuation (Ace=11, face=10, 2–10 face, joker uses represented rank).
 * @param {Rummy51Card} card
 * @param {number} [assignedRank] 1..13 for a joker standing in for that rank
 * @returns {number}
 */
export function getMeldPointValueCard(card, assignedRank) {
  if (card.isJoker) {
    const r = assignedRank;
    if (typeof r !== "number" || r < 1 || r > 13) return 0;
    if (r === 1) return 11;
    if (r >= 11) return 10;
    return r;
  }
  if (card.rank === 1) return 11;
  if (card.rank >= 11) return 10;
  return card.rank;
}

/**
 * @param {Rummy51Card[]} cards
 * @returns {Rummy51Card[]}
 */
export function sortCardsForHand(cards) {
  return [...cards].sort((a, b) => {
    const ka = a.sortKey ?? computeSortKey(a.isJoker, a.suit, a.rank);
    const kb = b.sortKey ?? computeSortKey(b.isJoker, b.suit, b.rank);
    if (ka !== kb) return ka - kb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * @param {Rummy51Card} a
 * @param {Rummy51Card} b
 * @returns {boolean}
 */
export function sameCardId(a, b) {
  return a.id === b.id;
}

/**
 * @param {Rummy51Card[]} cards
 * @returns {boolean}
 */
function hasDuplicateNaturalRankSuit(cards) {
  const seen = new Set();
  for (const c of cards) {
    if (c.isJoker) continue;
    const k = `${c.deckIndex}:${c.suit}:${c.rank}`;
    if (seen.has(k)) return true;
    seen.add(k);
  }
  return false;
}

/**
 * @param {number} rank
 * @param {"low"|"high"} mode
 * @returns {number}
 */
function rankToRunValue(rank, mode) {
  if (mode === "low") return rank;
  return rank === 1 ? 14 : rank;
}

/**
 * @param {Rummy51Card[]} cards
 * @param {"low"|"high"} mode
 * @returns {number[]}
 */
function naturalRunValues(cards, mode) {
  return cards.filter(c => !c.isJoker).map(c => rankToRunValue(c.rank, mode));
}

/**
 * Legal run interval [L,R] in run-value space: length N, covers all naturals, jokers fill holes + extensions.
 * @param {Rummy51Card[]} cards
 * @param {"low"|"high"} mode
 * @returns {{ L: number, R: number } | null}
 */
function getRunValueInterval(cards, mode) {
  const jokers = cards.filter(c => c.isJoker);
  const J = jokers.length;
  const vals = naturalRunValues(cards, mode);
  if (vals.length !== new Set(vals).size) return null;

  const minBound = mode === "low" ? 1 : 2;
  const maxBound = mode === "low" ? 13 : 14;
  const N = cards.length;

  if (vals.length === 0) {
    if (J < RUMMY51_MIN_MELD_SIZE) return null;
    const L = minBound;
    const R = L + N - 1;
    if (R > maxBound) return null;
    return { L, R };
  }

  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const Vset = new Set(vals);
  let holesInside = 0;
  for (let v = minV; v <= maxV; v++) {
    if (!Vset.has(v)) holesInside++;
  }
  if (J < holesInside) return null;

  const L_lo = Math.max(minBound, maxV - N + 1);
  const L_hi = Math.min(minV, maxBound - N + 1);
  if (L_lo > L_hi) return null;
  const L = L_lo;
  return { L, R: L + N - 1 };
}

/**
 * @param {Rummy51Card[]} cards
 * @param {"low"|"high"} mode
 * @returns {boolean}
 */
function isConsecutiveRunWithJokers(cards, mode) {
  return getRunValueInterval(cards, mode) != null;
}

/**
 * @param {Rummy51Card[]} cards
 * @param {"low"|"high"} mode
 * @returns {boolean}
 */
function sameSuitForRun(cards, mode) {
  const naturals = cards.filter(c => !c.isJoker);
  if (naturals.length === 0) return true;
  const suit = naturals[0].suit;
  return naturals.every(c => c.suit === suit);
}

/**
 * @param {Rummy51Card[]} cards
 * @param {"low"|"high"} mode
 * @returns {boolean}
 */
function isRunInMode(cards, mode) {
  if (cards.length < RUMMY51_MIN_MELD_SIZE) return false;
  if (hasDuplicateNaturalRankSuit(cards)) return false;
  if (!sameSuitForRun(cards, mode)) return false;
  return isConsecutiveRunWithJokers(cards, mode);
}

/**
 * Ace as 1 adjacent to 2 (not K-A-2 high wrap).
 * @param {Rummy51Card[]} cards
 * @param {unknown} [_jokerAssignments]
 * @returns {boolean}
 */
export function isAceLowRun(cards, _jokerAssignments) {
  return isRunInMode(cards, "low");
}

/**
 * Ace as high adjacent to K (not K-A-2).
 * @param {Rummy51Card[]} cards
 * @param {unknown} [_jokerAssignments]
 * @returns {boolean}
 */
export function isAceHighRun(cards, _jokerAssignments) {
  return isRunInMode(cards, "high");
}

/**
 * @param {Rummy51Card[]} cards
 * @param {{ minSize?: number }} [options]
 * @returns {boolean}
 */
export function isLegalRun(cards, options = {}) {
  const minSize = options.minSize ?? RUMMY51_MIN_MELD_SIZE;
  if (cards.length < minSize) return false;
  return isRunInMode(cards, "low") || isRunInMode(cards, "high");
}

/**
 * @param {Rummy51Card[]} cards
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {boolean}
 */
export function isLegalSet(cards, options = {}) {
  const minSize = options.minSize ?? RUMMY51_MIN_MELD_SIZE;
  const maxSetSize = options.maxSetSize ?? 4;
  if (cards.length < minSize || cards.length > maxSetSize) return false;
  const naturals = cards.filter(c => !c.isJoker);
  const jokers = cards.filter(c => c.isJoker);
  if (hasDuplicateNaturalRankSuit(cards)) return false;
  const ranks = new Set(naturals.map(c => c.rank));
  if (ranks.size > 1) return false;
  const targetRank = naturals.length ? naturals[0].rank : null;
  if (targetRank !== null && (targetRank < 1 || targetRank > 13)) return false;
  const suits = new Set();
  for (const c of naturals) {
    if (c.suit == null) return false;
    if (suits.has(c.suit)) return false;
    suits.add(c.suit);
  }
  if (naturals.length + jokers.length > maxSetSize) return false;
  if (naturals.length + jokers.length < minSize) return false;
  const suitCount = naturals.length + jokers.length;
  return suitCount <= 4;
}

/**
 * @param {Rummy51Card[]} cards
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {Rummy51MeldKind}
 */
export function classifyMeld(cards, options = {}) {
  if (isLegalSet(cards, options)) return "set";
  if (isLegalRun(cards, options)) return "run";
  return "invalid";
}

/**
 * Best-effort meld score using minimal joker rank assignment (prefers lower contribution for jokers in sets).
 * @param {Rummy51Card[]} cards
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {number}
 */
export function scoreMeld(cards, options = {}) {
  const kind = classifyMeld(cards, options);
  if (kind === "invalid") return 0;
  if (kind === "set") {
    const naturals = cards.filter(c => !c.isJoker);
    const r = naturals.length ? naturals[0].rank : 1;
    let sum = 0;
    for (const c of cards) {
      sum += getMeldPointValueCard(c, r);
    }
    return sum;
  }
  let mode = /** @type {"low"|"high"} */ ("low");
  if (!getRunValueInterval(cards, "low")) {
    if (!getRunValueInterval(cards, "high")) return 0;
    mode = "high";
  }
  const interval = getRunValueInterval(cards, mode);
  if (!interval) return 0;
  const { L, R } = interval;
  const vals = naturalRunValues(cards, mode);
  const Vset = new Set(vals);
  /** @type {number[]} */
  const jokerRanks = [];
  for (let v = L; v <= R; v++) {
    if (!Vset.has(v)) jokerRanks.push(runValueToRank(v, mode));
  }
  const jokerCount = cards.filter(c => c.isJoker).length;
  if (jokerRanks.length !== jokerCount) return 0;
  let ji = 0;
  let sum = 0;
  for (const c of cards) {
    if (c.isJoker) {
      const ar = jokerRanks[ji++] ?? 1;
      sum += getMeldPointValueCard(c, ar);
    } else {
      sum += getMeldPointValueCard(c);
    }
  }
  return sum;
}

/**
 * @param {number} value
 * @param {"low"|"high"} mode
 */
function runValueToRank(value, mode) {
  if (mode === "low") return value;
  return value === 14 ? 1 : value;
}

/**
 * Sum scores of melds that count toward opening (caller passes only new melds from hand).
 * @param {Rummy51Card[][]} melds
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {number}
 */
export function scoreOpeningMelds(melds, options = {}) {
  let t = 0;
  for (const m of melds) {
    t += scoreMeld(m, options);
  }
  return t;
}

/**
 * @param {Rummy51Card[][]} melds
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {boolean}
 */
export function openingContainsRequiredRun(melds, options = {}) {
  return melds.some(m => classifyMeld(m, options) === "run");
}

/**
 * @param {Rummy51Card[][]} melds
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {boolean}
 */
export function isLegalInitialOpen(melds, options = {}) {
  if (!openingContainsRequiredRun(melds, options)) return false;
  if (scoreOpeningMelds(melds, options) < RUMMY51_OPEN_TARGET) return false;
  for (const m of melds) {
    if (classifyMeld(m, options) === "invalid") return false;
  }
  return true;
}

/**
 * @param {Rummy51Card} card
 * @param {Rummy51Card[]} meld
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {boolean}
 */
export function canAddCardToMeld(card, meld, options = {}) {
  const next = [...meld, card];
  const k = classifyMeld(next, options);
  return k !== "invalid";
}

/**
 * Returns a new meld array with the card appended (caller may sort for display).
 * @param {Rummy51Card} card
 * @param {Rummy51Card[]} meld
 * @param {{ minSize?: number, maxSetSize?: number }} [options]
 * @returns {Rummy51Card[]|null}
 */
export function applyCardToMeld(card, meld, options = {}) {
  const next = [...meld, card];
  if (classifyMeld(next, options) === "invalid") return null;
  return next;
}

/**
 * True when the turn still requires a discard before it is complete.
 * @param {Rummy51TurnState} turnState
 * @returns {boolean}
 */
export function isDiscardMandatory(turnState) {
  if (!turnState.hasDrawn) return false;
  return !turnState.hasDiscarded;
}

/**
 * @param {Rummy51Card[]} cards — cards left in hand at hand end (or full hand if applying flat penalty).
 * @param {{ hasEverOpened: boolean }} opts — laid any meld on the table this hand before it ended
 * @returns {number}
 */
export function computeHandPenalty(cards, opts) {
  if (!opts.hasEverOpened) return RUMMY51_NEVER_OPENED_FULL_HAND_PENALTY;
  let sum = 0;
  for (const c of cards) {
    sum += getCardPointValue(c);
  }
  return sum;
}

/**
 * @param {{ winnerParticipantKey: string, players: { participantKey: string, cards: Rummy51Card[], hasEverOpened: boolean }[] }} args
 * @returns {Record<string, number>}
 */
export function computeRoundScoreDelta({ winnerParticipantKey, players }) {
  /** @type {Record<string, number>} */
  const delta = {};
  for (const p of players) {
    delta[p.participantKey] = 0;
  }
  for (const p of players) {
    if (p.participantKey === winnerParticipantKey) continue;
    delta[p.participantKey] = computeHandPenalty(p.cards, { hasEverOpened: p.hasEverOpened });
  }
  return delta;
}

/**
 * @param {Record<string, number>} scoreboard — cumulative penalty totals
 * @returns {string[]} participant keys with score >= elimination threshold
 */
export function computeEliminations(scoreboard) {
  const out = [];
  for (const [k, v] of Object.entries(scoreboard)) {
    if (v >= RUMMY51_ELIMINATION_SCORE) out.push(k);
  }
  return out;
}

/**
 * @param {Record<string, number>} scoreboard
 * @returns {string[]}
 */
export function getRemainingActiveParticipants(scoreboard) {
  return Object.keys(scoreboard).filter(k => scoreboard[k] < RUMMY51_ELIMINATION_SCORE);
}

// --- Turn validation ---

/**
 * @param {{ source: "stock"|"discard", stockEmpty?: boolean, discardEmpty?: boolean, turn: Rummy51TurnState }} args
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateDrawAction(args) {
  const { source, stockEmpty, discardEmpty, turn } = args;
  if (turn.hasDrawn) {
    return { ok: false, code: "ALREADY_DREW", message: "Turn already drew a card." };
  }
  if (source === "stock") {
    if (stockEmpty) return { ok: false, code: "STOCK_EMPTY", message: "Stock pile is empty." };
    return { ok: true };
  }
  if (source === "discard") {
    if (discardEmpty) return { ok: false, code: "DISCARD_EMPTY", message: "Discard pile is empty." };
    return { ok: true };
  }
  return { ok: false, code: "INVALID_SOURCE", message: "Draw source must be stock or discard." };
}

/**
 * @param {{
 *   newMeldsFromHand: Rummy51Card[][],
 *   hadOpenedBefore: boolean,
 *   options?: { minSize?: number, maxSetSize?: number }
 * }} args
 */
export function validateInitialOpenAction(args) {
  const { newMeldsFromHand, hadOpenedBefore, options = {} } = args;
  if (hadOpenedBefore) {
    return { ok: false, code: "ALREADY_OPENED", message: "Initial open only when not yet opened." };
  }
  if (!newMeldsFromHand.length) {
    return { ok: false, code: "NO_MELDS", message: "Opening requires at least one meld from hand." };
  }
  for (const m of newMeldsFromHand) {
    if (classifyMeld(m, options) === "invalid") {
      return { ok: false, code: "INVALID_MELD", message: "Opening meld is not a legal run or set." };
    }
  }
  if (!openingContainsRequiredRun(newMeldsFromHand, options)) {
    return { ok: false, code: "NO_RUN", message: "Opening must include at least one run." };
  }
  if (scoreOpeningMelds(newMeldsFromHand, options) < RUMMY51_OPEN_TARGET) {
    return { ok: false, code: "BELOW_51", message: "Opening melds from hand must total at least 51 points." };
  }
  return { ok: true };
}

/**
 * Validates add-ons to existing table melds.
 * Allowed after the player has opened, or during the same turn they perform a legal initial open.
 * @param {{
 *   mayLayOnTable: boolean,
 *   adds: { meldId: string, existing: Rummy51Card[], cardsFromHand: Rummy51Card[] }[],
 *   options?: { minSize?: number, maxSetSize?: number }
 * }} args
 */
export function validateTableAddAction(args) {
  const { mayLayOnTable, adds, options = {} } = args;
  if (!mayLayOnTable) {
    return {
      ok: false,
      code: "NOT_ALLOWED_TABLE_ADD",
      message: "Cannot add to table melds before opening (except during the opening turn with a legal open).",
    };
  }
  for (const a of adds) {
    let cur = [...a.existing];
    for (const c of a.cardsFromHand) {
      const next = applyCardToMeld(c, cur, options);
      if (!next) {
        return {
          ok: false,
          code: "ILLEGAL_ADD",
          message: `Card ${c.id} cannot extend meld ${a.meldId}.`,
        };
      }
      cur = next;
    }
  }
  return { ok: true };
}

/**
 * @param {{
 *   discardCard: Rummy51Card,
 *   handAfterMelds: Rummy51Card[],
 *   turn: Rummy51TurnState,
 * }} args
 */
export function validateDiscardAction(args) {
  const { discardCard, handAfterMelds, turn } = args;
  if (!turn.hasDrawn) {
    return { ok: false, code: "NO_DRAW", message: "Must draw before discarding." };
  }
  if (turn.hasDiscarded) {
    return { ok: false, code: "ALREADY_DISCARDED", message: "Already discarded this turn." };
  }
  const stillInHand = handAfterMelds.some(c => c.id === discardCard.id);
  if (!stillInHand) {
    return { ok: false, code: "DISCARD_NOT_IN_HAND", message: "Discarded card must still be in hand." };
  }
  return { ok: true };
}

/**
 * Going out: hand must be exactly the one card being discarded (final discard ends the hand).
 * @param {{
 *   discardCard: Rummy51Card,
 *   handBeforeDiscard: Rummy51Card[],
 * }} args
 */
export function validateCloseAction(args) {
  const { discardCard, handBeforeDiscard } = args;
  if (handBeforeDiscard.length !== 1) {
    return { ok: false, code: "HAND_NOT_SINGLE", message: "Close requires exactly one card in hand before final discard." };
  }
  if (handBeforeDiscard[0].id !== discardCard.id) {
    return { ok: false, code: "DISCARD_MISMATCH", message: "Final discard must be the only remaining card." };
  }
  return { ok: true };
}

/**
 * @param {{
 *   turn: Rummy51TurnState,
 *   draw?: { source: "stock"|"discard", pickedCardId?: string|null },
 *   initialOpen?: { newMeldsFromHand: Rummy51Card[][], hadOpenedBefore: boolean },
 *   tableAdds?: { meldId: string, existing: Rummy51Card[], cardsFromHand: Rummy51Card[] }[],
 *   newMeldsAfterOpen?: Rummy51Card[][],
 *   discard: { card: Rummy51Card },
 *   handBeforeTurn: Rummy51Card[],
 *   handAfterMeldsBeforeDiscard: Rummy51Card[],
 *   closing?: boolean,
 *   stockEmpty?: boolean,
 *   discardEmpty?: boolean,
 *   options?: { minSize?: number, maxSetSize?: number },
 * }} args
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
export function validateFullTurnSubmission(args) {
  const {
    turn,
    draw,
    initialOpen,
    tableAdds = [],
    newMeldsAfterOpen = [],
    discard,
    handBeforeTurn,
    handAfterMeldsBeforeDiscard,
    closing,
    options = {},
  } = args;

  if (!draw) {
    return { ok: false, code: "MISSING_DRAW", message: "Turn must include a draw." };
  }

  const drawRes = validateDrawAction({
    source: draw.source,
    stockEmpty: args.stockEmpty,
    discardEmpty: args.discardEmpty,
    turn: { ...turn, hasDrawn: false },
  });
  if (!drawRes.ok) return drawRes;

  const nextTurn = {
    ...turn,
    hasDrawn: true,
    drewFromDiscard: draw.source === "discard",
    pickedDiscardCardId: draw.source === "discard" ? draw.pickedCardId ?? null : null,
  };

  const playedIds = collectPlayedCardIds({
    initialOpen,
    tableAdds,
    newMeldsAfterOpen,
  });

  const multisetHand = multisetFromCards(handBeforeTurn);

  if (!canRemovePlayedFromHand(multisetHand, playedIds)) {
    return { ok: false, code: "CARDS_NOT_FROM_HAND", message: "All melded cards must come from hand with correct multiplicity." };
  }

  const openingThisTurn = !!(initialOpen && initialOpen.newMeldsFromHand.length > 0);

  if (newMeldsAfterOpen.length > 0 && !turn.hasOpenedBefore) {
    return {
      ok: false,
      code: "NEW_MELDS_NEED_PRIOR_OPEN",
      message: "Laying new melds (other than the initial open) requires having opened on a prior turn.",
    };
  }

  if (initialOpen && initialOpen.newMeldsFromHand.length) {
    const io = validateInitialOpenAction({
      newMeldsFromHand: initialOpen.newMeldsFromHand,
      hadOpenedBefore: initialOpen.hadOpenedBefore,
      options,
    });
    if (!io.ok) return io;
  }

  const mayLayOnTable = turn.hasOpenedBefore || openingThisTurn;

  if (tableAdds.length) {
    const ta = validateTableAddAction({
      mayLayOnTable,
      adds: tableAdds,
      options,
    });
    if (!ta.ok) return ta;
  }

  for (const m of newMeldsAfterOpen) {
    if (classifyMeld(m, options) === "invalid") {
      return { ok: false, code: "INVALID_NEW_MELD", message: "New meld after open is not legal." };
    }
  }

  if (!turn.hasOpenedBefore && nextTurn.drewFromDiscard) {
    const pid = nextTurn.pickedDiscardCardId;
    if (pid == null || pid === "") {
      return {
        ok: false,
        code: "MISSING_PICKED_DISCARD_ID",
        message: "Discard draw must include the picked card id for validation.",
      };
    }
    const used = playedIds.includes(pid);
    if (!used) {
      return {
        ok: false,
        code: "PICKED_DISCARD_UNUSED",
        message: "Discard taken before open must be used in a table action this turn.",
      };
    }
  }

  const discardRes = validateDiscardAction({
    discardCard: discard.card,
    handAfterMelds: handAfterMeldsBeforeDiscard,
    turn: nextTurn,
  });
  if (!discardRes.ok) return discardRes;

  if (closing) {
    const closeRes = validateCloseAction({
      discardCard: discard.card,
      handBeforeDiscard: handAfterMeldsBeforeDiscard,
    });
    if (!closeRes.ok) return closeRes;
  }

  return { ok: true };
}

/**
 * @param {{
 *   initialOpen?: { newMeldsFromHand: Rummy51Card[][] },
 *   tableAdds?: { cardsFromHand: Rummy51Card[] }[],
 *   newMeldsAfterOpen?: Rummy51Card[][],
 * }} p
 */
function collectPlayedCardIds(p) {
  /** @type {string[]} */
  const ids = [];
  if (p.initialOpen) {
    for (const m of p.initialOpen.newMeldsFromHand) {
      for (const c of m) ids.push(c.id);
    }
  }
  if (p.tableAdds) {
    for (const a of p.tableAdds) {
      for (const c of a.cardsFromHand) ids.push(c.id);
    }
  }
  if (p.newMeldsAfterOpen) {
    for (const m of p.newMeldsAfterOpen) {
      for (const c of m) ids.push(c.id);
    }
  }
  return ids;
}

/**
 * @param {Rummy51Card[]} cards
 */
function multisetFromCards(cards) {
  const m = new Map();
  for (const c of cards) {
    m.set(c.id, (m.get(c.id) ?? 0) + 1);
  }
  return m;
}

/**
 * @param {Map<string, number>} handMultiset — includes drawn card if already in hand representation
 * @param {string[]} playedIds
 */
function canRemovePlayedFromHand(handMultiset, playedIds) {
  const tmp = new Map(handMultiset);
  for (const id of playedIds) {
    const n = tmp.get(id) ?? 0;
    if (n <= 0) return false;
    tmp.set(id, n - 1);
  }
  return true;
}
