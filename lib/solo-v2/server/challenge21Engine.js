import { randomInt } from "crypto";
import { CHALLENGE_21_MIN_WAGER } from "../challenge21Config";
import { handTotal, isNatural21 } from "../challenge21HandMath";

export { handTotal, isNatural21, splitCardCode, upCardShowValue } from "../challenge21HandMath";

const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS = ["h", "d", "c", "s"];

/** @returns {string[]} 52 card codes e.g. Ah, 10s */
export function buildFullDeckOrdered() {
  const deck = [];
  for (const s of SUITS) {
    for (const r of RANKS) {
      deck.push(`${r}${s}`);
    }
  }
  return deck;
}

/** Fisher–Yates with crypto.randomInt */
export function shuffleDeck(deck) {
  const a = [...deck];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

/** @deprecated Use buildChallenge21DealState(entry, funding) for full rules. */
export function buildChallenge21InitialActiveSummary() {
  const shoe = shuffleDeck(buildFullDeckOrdered());
  const playerHand = [shoe[0], shoe[2]];
  const opponentHand = [shoe[1], shoe[3]];
  const deck = shoe.slice(4);
  return {
    phase: "challenge_21_active",
    challenge21: true,
    lastProcessedActionEventId: 0,
    playerHand,
    opponentHand,
    deck,
    playerHands: [[shoe[0], shoe[2]]],
    handStakes: [],
    handMeta: [],
    activeHandIndex: 0,
    playPhase: "player_turn",
    insuranceOffered: false,
    insuranceDecision: null,
    insuranceStake: 0,
    dealerPeekedAfterInsurance: false,
    splitUsed: false,
  };
}

/**
 * @param {unknown} sessionRow
 * @returns {null | {
 *   playerHand: string[],
 *   opponentHand: string[],
 *   deck: string[],
 *   lastProcessedActionEventId: number,
 * }}
 */
export function parseChallenge21ActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "challenge_21_active" || s.challenge21 !== true) return null;
  const playerHand = Array.isArray(s.playerHand) ? s.playerHand.map(String) : [];
  const opponentHand = Array.isArray(s.opponentHand) ? s.opponentHand.map(String) : [];
  const deck = Array.isArray(s.deck) ? s.deck.map(String) : [];
  const lastProcessedActionEventId = Math.max(0, Math.floor(Number(s.lastProcessedActionEventId) || 0));
  if (playerHand.length < 2 || opponentHand.length < 2) return null;
  let playerHands = Array.isArray(s.playerHands)
    ? s.playerHands.map(h => (Array.isArray(h) ? h.map(String) : [])).filter(h => h.length > 0)
    : [];
  if (playerHands.length === 0) playerHands = [[...playerHand]];
  const activeHandIndex = Math.max(
    0,
    Math.min(playerHands.length - 1, Math.floor(Number(s.activeHandIndex) || 0)),
  );
  const entryAmt = Math.max(
    CHALLENGE_21_MIN_WAGER,
    Math.floor(Number(sessionRow?.entry_amount) || 0),
  );
  let handStakes = Array.isArray(s.handStakes)
    ? s.handStakes.map(x => Math.max(0, Math.floor(Number(x) || 0)))
    : [];
  if (handStakes.length !== playerHands.length) {
    handStakes = playerHands.map(() => entryAmt);
  }
  let handMeta = Array.isArray(s.handMeta) ? s.handMeta : [];
  const playPhase = String(s.playPhase || "player_turn");
  const insuranceOffered = Boolean(s.insuranceOffered);
  const insuranceDecision = s.insuranceDecision != null ? String(s.insuranceDecision) : null;
  const insuranceStake = Math.max(0, Math.floor(Number(s.insuranceStake) || 0));
  const dealerPeekedAfterInsurance = Boolean(s.dealerPeekedAfterInsurance);
  const splitUsed = Boolean(s.splitUsed);
  return {
    playerHand,
    opponentHand,
    deck,
    lastProcessedActionEventId,
    playerHands,
    handStakes,
    handMeta,
    activeHandIndex,
    playPhase,
    insuranceOffered,
    insuranceDecision,
    insuranceStake,
    dealerPeekedAfterInsurance,
    splitUsed,
  };
}

/**
 * House: draw until total is 17 or more (stand on all 17, including soft 17).
 * @param {string[]} startHand
 * @param {string[]} deck
 * @returns {{ hand: string[]; deck: string[] }}
 */
export function runOpponentToStand(startHand, deck) {
  let hand = [...(Array.isArray(startHand) ? startHand : [])];
  let d = [...(Array.isArray(deck) ? deck : [])];
  while (handTotal(hand) < 17 && d.length > 0) {
    hand = [...hand, d[0]];
    d = d.slice(1);
  }
  return { hand, deck: d };
}

/**
 * @param {number} playerTotal
 * @param {number} opponentTotal
 * @param {boolean} playerBust
 * @param {boolean} opponentBust
 * @returns {"win" | "lose" | "push"}
 */
export function resolveOutcome(playerTotal, opponentTotal, playerBust, opponentBust) {
  if (playerBust) return "lose";
  if (opponentBust) return "win";
  if (playerTotal > opponentTotal) return "win";
  if (opponentTotal > playerTotal) return "lose";
  return "push";
}
