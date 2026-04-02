/**
 * OV2 21 Challenge — multi-seat table engine (server-only; called from Next API).
 * Uses the same card codes and hand math as solo 21 Challenge (lib/solo-v2).
 */

import { randomInt } from "crypto";
import {
  canSplitByRank,
  handTotal,
  isDealerUpAce,
  isDealerUpTenValue,
  isNatural21,
  splitRankKey,
} from "../../solo-v2/challenge21HandMath";
import { handPayoutReturn, insuranceWinReturn } from "../../solo-v2/server/challenge21Play";
import { buildFullDeckOrdered, runOpponentToStand } from "../../solo-v2/server/challenge21Engine";

export const OV2_C21_BETTING_MS = 15_000;
export const OV2_C21_BETWEEN_MS = 5_000;
export const OV2_C21_INSURANCE_MS = 12_000;
export const OV2_C21_TURN_MS = 15_000;

function clone(x) {
  return JSON.parse(JSON.stringify(x));
}

function defaultHandMeta(n) {
  return Array.from({ length: n }, () => ({
    stood: false,
    busted: false,
    doubled: false,
    splitAces: false,
    fromSplit: false,
    firstAction: true,
    surrendered: false,
  }));
}

function emptySeat(i) {
  return {
    seatIndex: i,
    participantKey: null,
    displayName: null,
    consecutiveMissRounds: 0,
    intendedBet: 0,
    roundBet: 0,
    inRound: false,
    hands: [],
    handStakes: [],
    handMeta: [],
    splitUsed: false,
    insuranceChoice: null,
    insuranceStake: 0,
    insurancePremiumCommitted: false,
    abandonedSettlementPk: null,
    abandonedDisplayName: null,
  };
}

function shuffleMultiDeck(decks = 4) {
  let shoe = [];
  for (let d = 0; d < decks; d++) shoe = shoe.concat(buildFullDeckOrdered());
  const a = [...shoe];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

export function buildFreshEngine(tableStakeUnits) {
  const now = Date.now();
  const stake = Math.max(100, Math.floor(Number(tableStakeUnits) || 100));
  return {
    v: 1,
    tableStakeUnits: stake,
    phase: "betting",
    phaseEndsAt: now + OV2_C21_BETTING_MS,
    roundSeq: 0,
    shoe: [],
    dealerHand: [],
    dealerHidden: true,
    dealerNatural: false,
    insuranceOpen: false,
    currentTurn: null,
    turnDeadline: null,
    lastRoundSummaries: null,
    seats: Array.from({ length: 6 }, (_, i) => emptySeat(i)),
  };
}

export function normalizeEngine(raw, tableStakeUnits) {
  const stake = Math.max(100, Math.floor(Number(tableStakeUnits) || 100));
  if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) {
    return buildFreshEngine(stake);
  }
  const e = clone(raw);
  e.tableStakeUnits = stake;
  e.v = 1;
  if (!Array.isArray(e.seats) || e.seats.length !== 6) {
    e.seats = Array.from({ length: 6 }, (_, i) => emptySeat(i));
  } else {
    e.seats = e.seats.map((s, i) => ({
      ...emptySeat(i),
      ...s,
      seatIndex: i,
    }));
  }
  return e;
}

function maxBetForTable(stake) {
  return Math.min(stake * 200, 10_000_000);
}

function settleOnePlayerHand(cards, stake, meta, dealerTotal, dealerBust, dealerTwoCardNatural) {
  const busted = meta.busted || handTotal(cards) > 21;
  const playerBlackjack = cards.length === 2 && isNatural21(cards) && !meta.fromSplit;
  const pt = handTotal(cards);
  if (busted) {
    return { outcomeKind: "lose", payoutReturn: 0, busted: true, playerTotal: pt };
  }
  if (dealerBust) {
    return { outcomeKind: "win", payoutReturn: handPayoutReturn(stake, "win"), busted: false, playerTotal: pt };
  }
  if (playerBlackjack) {
    if (dealerTwoCardNatural) {
      return {
        outcomeKind: "push",
        payoutReturn: handPayoutReturn(stake, "push"),
        busted: false,
        playerTotal: pt,
      };
    }
    return {
      outcomeKind: "blackjack_win",
      payoutReturn: handPayoutReturn(stake, "blackjack_win"),
      busted: false,
      playerTotal: pt,
    };
  }
  if (dealerTwoCardNatural) {
    return { outcomeKind: "lose", payoutReturn: 0, busted: false, playerTotal: pt };
  }
  if (pt > dealerTotal) {
    return { outcomeKind: "win", payoutReturn: handPayoutReturn(stake, "win"), busted: false, playerTotal: pt };
  }
  if (pt < dealerTotal) {
    return { outcomeKind: "lose", payoutReturn: 0, busted: false, playerTotal: pt };
  }
  return { outcomeKind: "push", payoutReturn: handPayoutReturn(stake, "push"), busted: false, playerTotal: pt };
}

function settleSeatAgainstDealer(seat, dealerFinal, dealerOpeningBlackjack) {
  const ot = handTotal(dealerFinal);
  const dealerBust = ot > 21;
  const dealerTwoCardNatural = dealerFinal.length === 2 && isNatural21(dealerFinal);
  const rows = [];
  let totalReturn = 0;
  for (let i = 0; i < seat.hands.length; i++) {
    const cards = seat.hands[i] || [];
    const stake = Math.max(0, Math.floor(Number(seat.handStakes[i]) || 0));
    const meta = seat.handMeta[i] || {};
    if (meta.surrendered) {
      rows.push({
        handIndex: i,
        outcomeKind: "surrender",
        payoutReturn: 0,
        busted: false,
        playerTotal: handTotal(cards),
      });
      continue;
    }
    let row;
    if (dealerOpeningBlackjack) {
      row = settleOnePlayerHand(cards, stake, meta, ot, dealerBust, dealerTwoCardNatural);
    } else {
      row = settleOnePlayerHand(cards, stake, meta, ot, dealerBust, dealerTwoCardNatural);
    }
    rows.push({ handIndex: i, ...row });
    totalReturn += row.payoutReturn;
  }
  let insReturn = 0;
  if (seat.insuranceChoice === "accept" && seat.insuranceStake > 0) {
    insReturn = dealerOpeningBlackjack ? insuranceWinReturn(seat.insuranceStake) : 0;
    totalReturn += insReturn;
  }
  const mainRisked = seat.handStakes.reduce((a, s) => a + Math.max(0, Math.floor(Number(s) || 0)), 0);
  const insRisked = seat.insuranceChoice === "accept" ? seat.insuranceStake : 0;
  const totalRisked = mainRisked + insRisked;
  const vaultDelta = totalReturn - totalRisked;
  return { rows, totalReturn, totalRisked, vaultDelta, insuranceReturn: insReturn };
}

function shortResultFromRows(rows) {
  const r = Array.isArray(rows) ? rows : [];
  if (!r.length) return "—";
  const kinds = r.map(x => String(x?.outcomeKind || ""));
  if (kinds.length === 1) return kinds[0].replace(/_/g, " ");
  const uniq = [...new Set(kinds)];
  return uniq.length === 1 ? uniq[0].replace(/_/g, " ") : `${r.length} hands`;
}

function handOutcomeLine(row) {
  const busted = Boolean(row.busted);
  const k = String(row.outcomeKind || "");
  let label = k.replace(/_/g, " ");
  if (busted) label = "bust";
  else if (k === "blackjack_win") label = "natural win";
  else if (k === "push") label = "push";
  else if (k === "surrender") label = "yield half";
  const ret = Math.max(0, Math.floor(Number(row.payoutReturn) || 0));
  const retPart = ret > 0 ? ` · +${ret} to vault` : "";
  const pt = Math.floor(Number(row.playerTotal) || 0);
  return `Hand ${row.handIndex + 1}: ${pt} pts · ${label}${retPart}`;
}

function buildSummaries(engine, resultsBySeat) {
  const settledRoundSeq = Math.max(0, Math.floor(Number(engine.roundSeq) || 0));
  const byPk = {};
  for (let s = 0; s < 6; s++) {
    const seat = engine.seats[s];
    if (!seat.inRound) continue;
    const pk = seat.participantKey || seat.abandonedSettlementPk;
    if (!pk) continue;
    const r = resultsBySeat[s];
    if (!r) continue;
    const headline =
      r.vaultDelta > 0 ? `You gained ${r.vaultDelta}` : r.vaultDelta < 0 ? `You lost ${-r.vaultDelta}` : "No vault change";
    const detailLines = r.rows.map(row => handOutcomeLine(row));
    const insStake = Math.max(0, Math.floor(Number(seat.insuranceStake) || 0));
    if (seat.insuranceChoice === "accept" && insStake > 0) {
      const ir = Math.max(0, Math.floor(Number(r.insuranceReturn) || 0));
      if (ir > 0) detailLines.push(`Side cover: +${ir} (house natural)`);
      else detailLines.push(`Side cover: no payout (stake ${insStake})`);
    }
    byPk[pk] = {
      seatIndex: s,
      settledRoundSeq,
      displayName: seat.displayName || seat.abandonedDisplayName || "Player",
      vaultDelta: r.vaultDelta,
      totalReturned: Math.max(0, Math.floor(Number(r.totalReturn) || 0)),
      totalRisked: Math.max(0, Math.floor(Number(r.totalRisked) || 0)),
      headline,
      detailLines,
      handRows: r.rows,
      resultShort: shortResultFromRows(r.rows),
      insuranceStake: seat.insuranceStake || 0,
      insuranceReturn: r.insuranceReturn || 0,
    };
  }
  for (const pk of Object.keys(byPk)) {
    const mine = byPk[pk];
    const rest = [];
    for (const pk2 of Object.keys(byPk)) {
      if (pk2 === pk) continue;
      const o = byPk[pk2];
      rest.push({
        seatIndex: o.seatIndex,
        name: o.displayName,
        headline: o.headline,
        vaultDelta: o.vaultDelta,
        resultShort: o.resultShort || shortResultFromRows(o.handRows),
        status:
          o.vaultDelta > 0 ? `+${o.vaultDelta}` : o.vaultDelta < 0 ? `${o.vaultDelta}` : "even",
      });
    }
    mine.othersCompact = rest;
  }
  return { byParticipantKey: byPk };
}

function insuranceAmountForBet(baseBet) {
  const w = Math.max(100, Math.floor(Number(baseBet) || 0));
  return Math.floor(w / 2);
}

function findNextHand(seat) {
  for (let h = 0; h < seat.hands.length; h++) {
    const m = seat.handMeta[h];
    if (!m.stood && !m.busted) return h;
  }
  return -1;
}

function buildGlobalActionQueue(engine) {
  const q = [];
  for (let s = 0; s < 6; s++) {
    const seat = engine.seats[s];
    if (!seat.inRound) continue;
    for (let h = 0; h < seat.hands.length; h++) {
      const m = seat.handMeta[h];
      if (m.stood || m.busted) continue;
      const cards = seat.hands[h];
      if (cards.length === 2 && isNatural21(cards) && !m.fromSplit) continue;
      q.push({ seatIndex: s, handIndex: h });
    }
  }
  return q;
}

function advanceCurrentTurn(engine, now) {
  const q = buildGlobalActionQueue(engine);
  if (!q.length) {
    engine.currentTurn = null;
    engine.turnDeadline = null;
    return "dealer";
  }
  engine.currentTurn = { seatIndex: q[0].seatIndex, handIndex: q[0].handIndex };
  engine.turnDeadline = now + OV2_C21_TURN_MS;
  return "acting";
}

function handComplete(m) {
  return Boolean(m && (m.stood || m.busted));
}

/**
 * Fix null/stale currentTurn, chain completed hands, or finish to dealer. Returns true if round ended (dealer/settle).
 */
function repairActingState(engine, t, economyOps) {
  for (;;) {
    const q = buildGlobalActionQueue(engine);
    if (!q.length) {
      finalizeDealerAndSettle(engine, t, economyOps);
      return true;
    }
    const ct = engine.currentTurn;
    if (ct) {
      const seat = engine.seats[ct.seatIndex];
      const m = seat?.handMeta?.[ct.handIndex];
      if (m && handComplete(m)) {
        const nxt = advanceCurrentTurn(engine, t);
        if (nxt === "dealer") {
          finalizeDealerAndSettle(engine, t, economyOps);
          return true;
        }
        continue;
      }
    }
    if (!ct || engine.turnDeadline == null) {
      const nxt = advanceCurrentTurn(engine, t);
      if (nxt === "dealer") {
        finalizeDealerAndSettle(engine, t, economyOps);
        return true;
      }
      continue;
    }
    break;
  }
  return false;
}

function forfeitIncompleteHands(seat) {
  const hands = seat.hands;
  const meta = seat.handMeta;
  if (!Array.isArray(hands) || !Array.isArray(meta)) return;
  for (let h = 0; h < hands.length; h++) {
    const m = meta[h];
    if (!m) continue;
    if (!m.stood || !m.busted) {
      m.stood = true;
      m.busted = true;
      m.firstAction = false;
    }
  }
}

function clearSeatLobby(seat) {
  seat.participantKey = null;
  seat.displayName = null;
  seat.intendedBet = 0;
  seat.consecutiveMissRounds = 0;
  seat.abandonedSettlementPk = null;
  seat.abandonedDisplayName = null;
  seat.inRound = false;
  seat.roundBet = 0;
  seat.hands = [];
  seat.handStakes = [];
  seat.handMeta = [];
  seat.splitUsed = false;
  seat.insuranceChoice = null;
  seat.insuranceStake = 0;
  seat.insurancePremiumCommitted = false;
}

function closeInsuranceIntoActing(engine, t, economyOps) {
  if (!allInsuranceAnswered(engine)) return false;
  if (isNatural21(engine.dealerHand)) {
    engine.dealerHidden = false;
    engine.dealerNatural = true;
    finalizeDealerAndSettle(engine, t, economyOps);
    return true;
  }
  engine.insuranceOpen = false;
  engine.dealerHidden = false;
  for (const s of engine.seats) {
    if (!s.inRound) continue;
    const h = s.hands[0];
    if (h && h.length === 2 && isNatural21(h) && !s.handMeta[0].fromSplit) {
      s.handMeta[0].stood = true;
    }
  }
  engine.phase = "acting";
  return repairActingState(engine, t, economyOps);
}

function afterPlayerHandFinished(engine, t, economyOps) {
  const nxt = advanceCurrentTurn(engine, t);
  if (nxt === "dealer") {
    finalizeDealerAndSettle(engine, t, economyOps);
  } else {
    engine.turnDeadline = t + OV2_C21_TURN_MS;
    repairActingState(engine, t, economyOps);
  }
}

function allInsuranceAnswered(engine) {
  for (const seat of engine.seats) {
    if (!seat.inRound || seat.roundBet <= 0) continue;
    if (seat.insuranceChoice == null) return false;
  }
  return true;
}

function applyAfkAndCollectCommits(engine, economyOps) {
  const minStake = engine.tableStakeUnits;
  const maxStake = maxBetForTable(minStake);
  const nextRid = Math.max(1, Math.floor(Number(engine.roundSeq) || 0) + 1);
  let anyValidBet = false;
  for (const seat of engine.seats) {
    if (!seat.participantKey) continue;
    const bet = Math.floor(Number(seat.intendedBet) || 0);
    const valid = bet >= minStake && bet <= maxStake;
    if (valid) {
      anyValidBet = true;
      seat.consecutiveMissRounds = 0;
      seat.roundBet = bet;
      seat.inRound = true;
      economyOps.push({
        type: "commit",
        participantKey: seat.participantKey,
        amount: bet,
        suffix: `main_r${nextRid}`,
      });
    } else {
      seat.roundBet = 0;
      seat.inRound = false;
      seat.consecutiveMissRounds = (seat.consecutiveMissRounds || 0) + 1;
      if (seat.consecutiveMissRounds >= 2) {
        seat.participantKey = null;
        seat.displayName = null;
        seat.consecutiveMissRounds = 0;
        seat.intendedBet = 0;
      }
    }
    seat.intendedBet = 0;
  }
  if (anyValidBet) {
    engine.roundSeq = nextRid;
  }
  return anyValidBet;
}

function runDeal(engine) {
  const shoe = shuffleMultiDeck(4);
  const inSeatIndexes = engine.seats.map((s, i) => (s.inRound ? i : -1)).filter(i => i >= 0);

  for (const i of inSeatIndexes) {
    engine.seats[i].hands = [[shoe.shift()]];
  }
  engine.dealerHand = [shoe.shift()];
  for (const i of inSeatIndexes) {
    engine.seats[i].hands[0].push(shoe.shift());
  }
  engine.dealerHand.push(shoe.shift());

  for (const i of inSeatIndexes) {
    const seat = engine.seats[i];
    seat.handStakes = [seat.roundBet];
    seat.handMeta = defaultHandMeta(1);
    seat.splitUsed = false;
    seat.insuranceChoice = null;
    seat.insuranceStake = 0;
    seat.insurancePremiumCommitted = false;
  }

  engine.dealerHidden = true;
  engine.dealerNatural = false;
  engine.shoe = shoe;

  if (isDealerUpTenValue(engine.dealerHand) && isNatural21(engine.dealerHand)) {
    engine.dealerHidden = false;
    engine.dealerNatural = true;
    engine.insuranceOpen = false;
    return "settle_early";
  }

  if (isDealerUpAce(engine.dealerHand)) {
    engine.insuranceOpen = true;
    return "insurance";
  }

  for (const seat of engine.seats) {
    if (!seat.inRound) continue;
    const h = seat.hands[0];
    if (h.length === 2 && isNatural21(h) && !seat.handMeta[0].fromSplit) {
      seat.handMeta[0].stood = true;
    }
  }
  return "acting";
}

function finalizeDealerAndSettle(engine, now, economyOps) {
  if (engine.dealerHidden) engine.dealerHidden = false;
  let shoe = [...engine.shoe];
  let dh = [...engine.dealerHand];
  const openingBj = engine.dealerNatural;
  if (!openingBj) {
    const r = runOpponentToStand(dh, shoe);
    dh = r.hand;
    shoe = r.deck;
  }
  engine.dealerHand = dh;
  engine.shoe = shoe;

  const resultsBySeat = {};
  for (let s = 0; s < 6; s++) {
    const seat = engine.seats[s];
    if (!seat.inRound) continue;
    resultsBySeat[s] = settleSeatAgainstDealer(seat, dh, openingBj);
    const r = resultsBySeat[s];
    const pk = seat.participantKey || seat.abandonedSettlementPk;
    if (!pk) continue;
    // Credit gross return (principal + win). Client vault was debited on commits; vaultDelta is net (return − risked).
    const gross = Math.max(0, Math.floor(Number(r.totalReturn) || 0));
    if (gross > 0) {
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: gross,
        suffix: `payout_r${engine.roundSeq}_s${s}`,
        lineKind: "MATCH_PAYOUT",
      });
    }
  }

  engine.lastRoundSummaries = buildSummaries(engine, resultsBySeat);
  for (const seat of engine.seats) {
    if (!seat.participantKey && seat.abandonedSettlementPk) {
      seat.inRound = false;
      seat.roundBet = 0;
      seat.hands = [];
      seat.handStakes = [];
      seat.handMeta = [];
      seat.splitUsed = false;
      seat.insuranceChoice = null;
      seat.insuranceStake = 0;
      seat.insurancePremiumCommitted = false;
      seat.abandonedSettlementPk = null;
      seat.abandonedDisplayName = null;
    }
  }
  engine.phase = "between_rounds";
  engine.phaseEndsAt = now + OV2_C21_BETWEEN_MS;
  engine.currentTurn = null;
  engine.turnDeadline = null;
  engine.insuranceOpen = false;
}

function startNextBetting(engine, now) {
  engine.phase = "betting";
  engine.phaseEndsAt = now + OV2_C21_BETTING_MS;
  engine.dealerHand = [];
  engine.dealerHidden = true;
  engine.dealerNatural = false;
  engine.insuranceOpen = false;
  engine.currentTurn = null;
  engine.turnDeadline = null;
  engine.lastRoundSummaries = null;
  for (const seat of engine.seats) {
    seat.roundBet = 0;
    seat.inRound = false;
    seat.hands = [];
    seat.handStakes = [];
    seat.handMeta = [];
    seat.splitUsed = false;
    seat.insuranceChoice = null;
    seat.insuranceStake = 0;
    seat.intendedBet = 0;
    seat.abandonedSettlementPk = null;
    seat.abandonedDisplayName = null;
  }
}

/**
 * @returns {{ engine: object, economyOps: any[], error?: string, vaultHints?: any[] }}
 */
export function mutateEngine(prev, { op, participantKey, payload, now }) {
  const economyOps = [];
  let engine = clone(prev);
  const pk = String(participantKey || "").trim();
  const t = typeof now === "number" ? now : Date.now();

  if (op === "tick") {
    if (engine.phase === "betting" && t >= engine.phaseEndsAt) {
      const hasPlayers = applyAfkAndCollectCommits(engine, economyOps);
      if (!hasPlayers) {
        startNextBetting(engine, t);
        return { engine, economyOps };
      }
      const branch = runDeal(engine);
      if (branch === "settle_early") {
        finalizeDealerAndSettle(engine, t, economyOps);
        return { engine, economyOps };
      }
      if (branch === "insurance") {
        engine.phase = "insurance";
        engine.phaseEndsAt = t + OV2_C21_INSURANCE_MS;
        return { engine, economyOps };
      }
      engine.phase = "acting";
      const nxt = advanceCurrentTurn(engine, t);
      if (nxt === "dealer") {
        finalizeDealerAndSettle(engine, t, economyOps);
      } else {
        engine.turnDeadline = t + OV2_C21_TURN_MS;
        repairActingState(engine, t, economyOps);
      }
      return { engine, economyOps };
    }

    if (engine.phase === "insurance" && t >= engine.phaseEndsAt) {
      for (const seat of engine.seats) {
        if (seat.inRound && seat.roundBet > 0 && seat.insuranceChoice == null) {
          seat.insuranceChoice = "decline";
        }
      }
      for (const seat of engine.seats) {
        if (
          seat.insuranceChoice === "accept" &&
          seat.insuranceStake > 0 &&
          !seat.insurancePremiumCommitted
        ) {
          economyOps.push({
            type: "commit",
            participantKey: seat.participantKey,
            amount: seat.insuranceStake,
            suffix: `ins_r${engine.roundSeq}_s${seat.seatIndex}`,
          });
          seat.insurancePremiumCommitted = true;
        }
      }
      closeInsuranceIntoActing(engine, t, economyOps);
      return { engine, economyOps };
    }

    if (engine.phase === "acting") {
      if (repairActingState(engine, t, economyOps)) {
        return { engine, economyOps };
      }
      if (engine.turnDeadline != null && t >= engine.turnDeadline && engine.currentTurn) {
        const ct = engine.currentTurn;
        const seat = engine.seats[ct.seatIndex];
        const m = seat?.handMeta?.[ct.handIndex];
        if (m && !handComplete(m)) {
          m.stood = true;
          m.firstAction = false;
        }
        const nxt = advanceCurrentTurn(engine, t);
        if (nxt === "dealer") finalizeDealerAndSettle(engine, t, economyOps);
        else engine.turnDeadline = t + OV2_C21_TURN_MS;
        if (repairActingState(engine, t, economyOps)) {
          return { engine, economyOps };
        }
      }
      return { engine, economyOps };
    }

    if (engine.phase === "between_rounds" && t >= engine.phaseEndsAt) {
      startNextBetting(engine, t);
      return { engine, economyOps };
    }

    return { engine, economyOps };
  }

  if (op === "sit") {
    const seatIndex = Math.max(0, Math.min(5, Math.floor(Number(payload?.seatIndex))));
    const name = String(payload?.displayName || "").trim() || "Guest";
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    const target = engine.seats[seatIndex];
    if (target.participantKey && target.participantKey !== pk) {
      return { engine: prev, economyOps, error: "seat_taken" };
    }
    for (const s of engine.seats) {
      if (s.participantKey === pk && s.seatIndex !== seatIndex) {
        s.participantKey = null;
        s.displayName = null;
        s.intendedBet = 0;
      }
    }
    target.participantKey = pk;
    target.displayName = name;
    target.consecutiveMissRounds = 0;
    return { engine, economyOps };
  }

  if (op === "leave_seat") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    let idx = -1;
    for (let i = 0; i < 6; i++) {
      if (engine.seats[i].participantKey === pk) idx = i;
    }
    if (idx < 0) return { engine: prev, economyOps, error: "not_seated" };
    const seat = engine.seats[idx];

    if (engine.phase === "between_rounds") {
      clearSeatLobby(seat);
      return { engine, economyOps };
    }

    if (engine.phase === "betting") {
      seat.participantKey = null;
      seat.displayName = null;
      seat.intendedBet = 0;
      seat.consecutiveMissRounds = 0;
      return { engine, economyOps };
    }

    if (engine.phase === "insurance") {
      if (seat.inRound && seat.roundBet > 0 && seat.insuranceChoice == null) {
        seat.insuranceChoice = "decline";
        seat.insuranceStake = 0;
      }
      forfeitIncompleteHands(seat);
      seat.abandonedSettlementPk = pk;
      seat.abandonedDisplayName = seat.displayName || "Player";
      seat.participantKey = null;
      seat.displayName = null;
      seat.intendedBet = 0;
      seat.consecutiveMissRounds = 0;
      if (allInsuranceAnswered(engine)) {
        closeInsuranceIntoActing(engine, t, economyOps);
      }
      return { engine, economyOps };
    }

    if (engine.phase === "acting") {
      forfeitIncompleteHands(seat);
      seat.abandonedSettlementPk = pk;
      seat.abandonedDisplayName = seat.displayName || "Player";
      seat.participantKey = null;
      seat.displayName = null;
      seat.intendedBet = 0;
      seat.consecutiveMissRounds = 0;
      if (engine.currentTurn && engine.currentTurn.seatIndex === idx) {
        engine.currentTurn = null;
        engine.turnDeadline = null;
      }
      repairActingState(engine, t, economyOps);
      return { engine, economyOps };
    }

    seat.participantKey = null;
    seat.displayName = null;
    seat.intendedBet = 0;
    seat.consecutiveMissRounds = 0;
    return { engine, economyOps };
  }

  if (op === "set_bet") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "betting") return { engine: prev, economyOps, error: "not_betting" };
    const seat = engine.seats.find(s => s.participantKey === pk);
    if (!seat) return { engine: prev, economyOps, error: "not_seated" };
    const minStake = engine.tableStakeUnits;
    const maxStake = maxBetForTable(minStake);
    const amt = Math.floor(Number(payload?.amount) || 0);
    const clamped = Math.max(0, Math.min(maxStake, amt));
    seat.intendedBet = clamped;
    return { engine, economyOps };
  }

  if (op === "insurance_yes" || op === "insurance_no") {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "insurance") return { engine: prev, economyOps, error: "not_insurance" };
    const seat = engine.seats.find(s => s.participantKey === pk);
    if (!seat || !seat.inRound) return { engine: prev, economyOps, error: "not_in_round" };
    if (seat.insuranceChoice != null) return { engine: prev, economyOps, error: "already_answered" };
    if (op === "insurance_yes") {
      const ins = insuranceAmountForBet(seat.roundBet);
      seat.insuranceChoice = "accept";
      seat.insuranceStake = ins;
      if (ins > 0 && !seat.insurancePremiumCommitted) {
        economyOps.push({
          type: "commit",
          participantKey: seat.participantKey,
          amount: ins,
          suffix: `ins_r${engine.roundSeq}_s${seat.seatIndex}`,
        });
        seat.insurancePremiumCommitted = true;
      }
    } else {
      seat.insuranceChoice = "decline";
      seat.insuranceStake = 0;
    }
    if (allInsuranceAnswered(engine)) {
      closeInsuranceIntoActing(engine, t, economyOps);
    }
    return { engine, economyOps };
  }

  const actionOps = ["hit", "stand", "double", "split", "surrender"];
  if (actionOps.includes(op)) {
    if (!pk) return { engine: prev, economyOps, error: "participant_required" };
    if (engine.phase !== "acting") return { engine: prev, economyOps, error: "not_acting" };
    const ct = engine.currentTurn;
    if (!ct) return { engine: prev, economyOps, error: "no_turn" };
    const seat = engine.seats[ct.seatIndex];
    if (seat.participantKey !== pk) return { engine: prev, economyOps, error: "not_your_turn" };
    const hi = ct.handIndex;
    const m = seat.handMeta[hi];
    const cards = seat.hands[hi];
    if (!m || m.stood || m.busted) return { engine: prev, economyOps, error: "hand_done" };

    if (op === "surrender") {
      if (!m.firstAction || cards.length !== 2 || m.doubled) {
        return { engine: prev, economyOps, error: "surrender_illegal" };
      }
      if (isDealerUpAce(engine.dealerHand)) {
        return { engine: prev, economyOps, error: "surrender_illegal" };
      }
      const stake = seat.handStakes[hi];
      const refund = Math.floor(stake / 2);
      const kept = stake - refund;
      economyOps.push({
        type: "credit",
        participantKey: pk,
        amount: refund,
        suffix: `surrender_r${engine.roundSeq}_s${seat.seatIndex}_h${hi}`,
        lineKind: "REFUND",
      });
      seat.handStakes[hi] = kept;
      m.surrendered = true;
      m.stood = true;
      m.busted = false;
      m.firstAction = false;
      afterPlayerHandFinished(engine, t, economyOps);
      return { engine, economyOps };
    }

    if (op === "hit") {
      if (m.splitAces && cards.length >= 2) return { engine: prev, economyOps, error: "no_hit_split_ace" };
      if (!engine.shoe.length) return { engine: prev, economyOps, error: "shoe_empty" };
      const card = engine.shoe.shift();
      seat.hands[hi] = [...cards, card];
      m.firstAction = false;
      if (handTotal(seat.hands[hi]) > 21) {
        m.busted = true;
        m.stood = true;
        afterPlayerHandFinished(engine, t, economyOps);
      } else {
        engine.turnDeadline = t + OV2_C21_TURN_MS;
      }
      return { engine, economyOps };
    }

    if (op === "stand") {
      m.stood = true;
      m.firstAction = false;
      afterPlayerHandFinished(engine, t, economyOps);
      return { engine, economyOps };
    }

    if (op === "double") {
      if (!m.firstAction || cards.length !== 2 || m.splitAces) {
        return { engine: prev, economyOps, error: "double_illegal" };
      }
      const add = seat.handStakes[hi];
      economyOps.push({
        type: "commit",
        participantKey: pk,
        amount: add,
        suffix: `double_r${engine.roundSeq}_s${seat.seatIndex}_h${hi}`,
      });
      seat.handStakes[hi] = add + add;
      if (!engine.shoe.length) return { engine: prev, economyOps, error: "shoe_empty" };
      const card = engine.shoe.shift();
      seat.hands[hi] = [...cards, card];
      m.doubled = true;
      m.firstAction = false;
      m.stood = true;
      if (handTotal(seat.hands[hi]) > 21) m.busted = true;
      afterPlayerHandFinished(engine, t, economyOps);
      return { engine, economyOps };
    }

    if (op === "split") {
      if (seat.splitUsed || seat.hands.length !== 1 || cards.length !== 2) {
        return { engine: prev, economyOps, error: "split_illegal" };
      }
      const c0 = cards[0];
      const c1 = cards[1];
      if (!canSplitByRank(c0, c1)) return { engine: prev, economyOps, error: "split_illegal" };
      const stake = seat.handStakes[0];
      economyOps.push({
        type: "commit",
        participantKey: pk,
        amount: stake,
        suffix: `split_r${engine.roundSeq}_s${seat.seatIndex}`,
      });
      if (engine.shoe.length < 2) return { engine: prev, economyOps, error: "shoe_empty" };
      const d0 = engine.shoe.shift();
      const d1 = engine.shoe.shift();
      const rankA = splitRankKey(c0) === "A";
      seat.hands = [
        [c0, d0],
        [c1, d1],
      ];
      seat.handStakes = [stake, stake];
      seat.splitUsed = true;
      if (rankA) {
        seat.handMeta = [
          { stood: true, busted: false, doubled: false, splitAces: true, fromSplit: true, firstAction: false },
          { stood: true, busted: false, doubled: false, splitAces: true, fromSplit: true, firstAction: false },
        ];
      } else {
        seat.handMeta = defaultHandMeta(2);
      }
      afterPlayerHandFinished(engine, t, economyOps);
      return { engine, economyOps };
    }
  }

  return { engine: prev, economyOps, error: "unknown_op" };
}
