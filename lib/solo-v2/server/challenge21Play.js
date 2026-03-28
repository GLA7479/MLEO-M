/**
 * Authoritative 21 Challenge blackjack step logic (server).
 */

import {
  buildChallenge21SettlementSummaryFromTotals,
  CHALLENGE_21_MIN_WAGER,
} from "../challenge21Config";
import {
  canSplitByRank,
  handTotal,
  isDealerUpAce,
  isDealerUpTenValue,
  isNatural21,
  splitRankKey,
} from "../challenge21HandMath";
import { buildFullDeckOrdered, runOpponentToStand, shuffleDeck } from "./challenge21Engine";

const PLAY_PHASE = {
  INSURANCE_OFFER: "insurance_offer",
  PLAYER_TURN: "player_turn",
};

function cloneHandMeta(meta) {
  return (Array.isArray(meta) ? meta : []).map(m => ({
    stood: Boolean(m?.stood),
    busted: Boolean(m?.busted),
    doubled: Boolean(m?.doubled),
    splitAces: Boolean(m?.splitAces),
    fromSplit: Boolean(m?.fromSplit),
    firstAction: m?.firstAction !== false,
  }));
}

function defaultHandMeta(n) {
  return Array.from({ length: n }, () => ({
    stood: false,
    busted: false,
    doubled: false,
    splitAces: false,
    fromSplit: false,
    firstAction: true,
  }));
}

function insuranceStakeAmount(baseWager) {
  const w = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(baseWager) || 0));
  return Math.max(0, Math.floor(w / 2));
}

/** @param {number} stake @param {"blackjack_win" | "win" | "lose" | "push"} kind */
export function handPayoutReturn(stake, kind) {
  const s = Math.max(0, Math.floor(Number(stake) || 0));
  if (kind === "blackjack_win") return Math.floor(s * 2.5);
  if (kind === "win") return s * 2;
  if (kind === "push") return s;
  return 0;
}

export function insuranceWinReturn(insuranceStake) {
  const i = Math.max(0, Math.floor(Number(insuranceStake) || 0));
  return i * 3;
}

function buildActiveBase(patch) {
  return {
    phase: "challenge_21_active",
    challenge21: true,
    ...patch,
  };
}

function syncLegacyPlayerHand(state) {
  const hands = state.playerHands;
  const idx = state.activeHandIndex;
  state.playerHand = Array.isArray(hands?.[idx]) ? [...hands[idx]] : [];
}

function findNextHandIndex(handMeta, playerHands, fromIdx) {
  for (let j = fromIdx + 1; j < playerHands.length; j++) {
    const m = handMeta[j];
    if (!m.stood && !m.busted) return j;
  }
  return -1;
}

function settleOneHand(cards, stake, meta, dealerTotal, dealerBust, dealerTwoCardNatural) {
  const busted = meta.busted || handTotal(cards) > 21;
  const playerBlackjack = cards.length === 2 && isNatural21(cards) && !meta.fromSplit;
  const pt = handTotal(cards);

  if (busted) {
    return { outcomeKind: "lose", payoutReturn: 0, busted: true, playerTotal: pt };
  }
  if (dealerBust) {
    return {
      outcomeKind: "win",
      payoutReturn: handPayoutReturn(stake, "win"),
      busted: false,
      playerTotal: pt,
    };
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
    return {
      outcomeKind: "win",
      payoutReturn: handPayoutReturn(stake, "win"),
      busted: false,
      playerTotal: pt,
    };
  }
  if (pt < dealerTotal) {
    return { outcomeKind: "lose", payoutReturn: 0, busted: false, playerTotal: pt };
  }
  return {
    outcomeKind: "push",
    payoutReturn: handPayoutReturn(stake, "push"),
    busted: false,
    playerTotal: pt,
  };
}

function runDealerAndBuildTerminal({
  opponentHand,
  deck,
  playerHands,
  handStakes,
  handMeta,
  entryCost,
  fundingSource,
  insuranceDecision,
  insuranceStake,
  dealerOpeningBlackjack,
  resolvedAt,
  actionEventId,
}) {
  const { hand: oppFinal, deck: deckAfter } = runOpponentToStand(opponentHand, deck);
  const ot = handTotal(oppFinal);
  const opponentBust = ot > 21;
  const dealerTwoCardNatural = oppFinal.length === 2 && isNatural21(oppFinal);

  const perHand = [];
  let totalReturn = 0;

  for (let i = 0; i < playerHands.length; i++) {
    const cards = playerHands[i];
    const stake = handStakes[i];
    const meta = handMeta[i];
    let row;
    if (dealerOpeningBlackjack) {
      const busted = meta.busted || handTotal(cards) > 21;
      const playerBj = cards.length === 2 && isNatural21(cards) && !meta.fromSplit;
      if (busted) {
        row = { outcomeKind: "lose", payoutReturn: 0, busted: true, playerTotal: handTotal(cards) };
      } else if (playerBj && dealerTwoCardNatural) {
        row = {
          outcomeKind: "push",
          payoutReturn: handPayoutReturn(stake, "push"),
          busted: false,
          playerTotal: 21,
        };
      } else if (playerBj && !dealerTwoCardNatural) {
        row = {
          outcomeKind: "blackjack_win",
          payoutReturn: handPayoutReturn(stake, "blackjack_win"),
          busted: false,
          playerTotal: 21,
        };
      } else {
        row = { outcomeKind: "lose", payoutReturn: 0, busted: false, playerTotal: handTotal(cards) };
      }
    } else {
      row = settleOneHand(cards, stake, meta, ot, opponentBust, dealerTwoCardNatural);
    }
    perHand.push({
      index: i,
      cards: [...cards],
      stake,
      playerTotal: row.playerTotal,
      outcomeKind: row.outcomeKind,
      payoutReturn: row.payoutReturn,
      busted: Boolean(row.busted),
    });
    totalReturn += row.payoutReturn;
  }

  let insuranceReturn = 0;
  if (insuranceDecision === "accepted" && insuranceStake > 0) {
    insuranceReturn = dealerOpeningBlackjack ? insuranceWinReturn(insuranceStake) : 0;
    totalReturn += insuranceReturn;
  }

  const totalRisked =
    handStakes.reduce((a, s) => a + Math.max(0, Math.floor(Number(s) || 0)), 0) +
    (insuranceDecision === "accepted" ? insuranceStake : 0);

  const netDelta = fundingSource === "gift" ? totalReturn : totalReturn - totalRisked;
  const outcome = netDelta > 0 ? "win" : netDelta < 0 ? "lose" : "push";
  const terminalKind = outcome === "lose" ? "overload" : outcome === "push" ? "cashout" : "full_clear";
  const primaryHand = playerHands[0] || [];
  const settlementSummary = buildChallenge21SettlementSummaryFromTotals({
    totalRisked,
    totalReturn,
    payoutReturn: totalReturn,
    entryCost,
    fundingSource,
  });

  return {
    phase: "challenge_21_resolved",
    terminalKind,
    payoutReturn: totalReturn,
    outcome,
    isWin: outcome === "win",
    isPush: outcome === "push",
    netDelta,
    totalRisked,
    totalReturn,
    playerHands: playerHands.map(h => [...h]),
    handStakes: [...handStakes],
    handResults: perHand,
    playerHand: [...primaryHand],
    opponentHand: [...oppFinal],
    deck: deckAfter,
    playerTotal: handTotal(primaryHand),
    opponentTotal: ot,
    playerBust: perHand.every(h => h.busted),
    opponentBust,
    playerNatural21: primaryHand.length === 2 && isNatural21(primaryHand) && !handMeta[0]?.fromSplit,
    opponentNatural21: dealerTwoCardNatural,
    resolvedViaNatural21: dealerOpeningBlackjack || false,
    premiumNaturalWin: false,
    blackjackWin: perHand.some(h => h.outcomeKind === "blackjack_win"),
    insuranceDecision: insuranceDecision || null,
    insuranceStake: insuranceStake || 0,
    insuranceReturn,
    dealerHadBlackjack: dealerOpeningBlackjack,
    resolvedAt,
    settlementSummary,
    stats: "deferred",
    lastProcessedActionEventId: actionEventId,
  };
}

export function applyChallenge21Step(active, decision, actionEventId, entryCost, fundingSource) {
  const baseW = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  let opponentHand = [...(active.opponentHand || [])];
  let deck = [...(active.deck || [])];
  let playerHands = (active.playerHands || []).map(h => [...(Array.isArray(h) ? h : [])]);
  if (playerHands.length === 0 && Array.isArray(active.playerHand)) playerHands = [[...active.playerHand]];
  let handStakes = (Array.isArray(active.handStakes) ? active.handStakes : []).map(s =>
    Math.max(0, Math.floor(Number(s) || baseW)),
  );
  if (handStakes.length !== playerHands.length) {
    handStakes = playerHands.map(() => baseW);
  }
  let handMeta = cloneHandMeta(active.handMeta);
  if (handMeta.length !== playerHands.length) {
    handMeta = defaultHandMeta(playerHands.length);
  }
  let activeHandIndex = Math.max(
    0,
    Math.min(playerHands.length - 1, Math.floor(Number(active.activeHandIndex) || 0)),
  );
  const playPhase = String(active.playPhase || PLAY_PHASE.PLAYER_TURN);
  let insuranceOffered = Boolean(active.insuranceOffered);
  let insuranceDecision = active.insuranceDecision != null ? String(active.insuranceDecision) : null;
  let insuranceStake = Math.max(0, Math.floor(Number(active.insuranceStake) || 0));
  let dealerPeekedAfterInsurance = Boolean(active.dealerPeekedAfterInsurance);
  let splitUsed = Boolean(active.splitUsed);
  const resolvedAt = new Date().toISOString();

  const dec = String(decision || "").toLowerCase();

  if (playPhase === PLAY_PHASE.INSURANCE_OFFER) {
    if (dec !== "insurance_accept" && dec !== "insurance_decline") {
      return { ok: false, message: "Insurance decision required.", status: 400 };
    }
    if (!isDealerUpAce(opponentHand)) {
      return { ok: false, message: "Insurance not offered.", status: 400 };
    }
    const accepted = dec === "insurance_accept";
    insuranceDecision = accepted ? "accepted" : "declined";
    insuranceStake = accepted ? insuranceStakeAmount(baseW) : 0;
    dealerPeekedAfterInsurance = true;
    const dealerBj = isNatural21(opponentHand);

    if (dealerBj) {
      const terminal = runDealerAndBuildTerminal({
        opponentHand,
        deck,
        playerHands,
        handStakes,
        handMeta,
        entryCost: baseW,
        fundingSource,
        insuranceDecision,
        insuranceStake,
        dealerOpeningBlackjack: true,
        resolvedAt,
        actionEventId,
      });
      return { ok: true, terminal };
    }

    const p0 = playerHands[0] || [];
    if (p0.length === 2 && isNatural21(p0) && !handMeta[0]?.fromSplit) {
      const stake = handStakes[0];
      const mainReturn = handPayoutReturn(stake, "blackjack_win");
      const totalRisked = stake + (accepted ? insuranceStake : 0);
      const insuranceReturn = 0;
      const totalReturn = mainReturn + insuranceReturn;
      const netDelta = fundingSource === "gift" ? totalReturn : totalReturn - totalRisked;
      const outcome = netDelta > 0 ? "win" : netDelta < 0 ? "lose" : "push";
      const settlementSummary = buildChallenge21SettlementSummaryFromTotals({
        totalRisked,
        totalReturn,
        payoutReturn: totalReturn,
        entryCost: baseW,
        fundingSource,
      });
      const terminal = {
        phase: "challenge_21_resolved",
        terminalKind: outcome === "lose" ? "overload" : outcome === "push" ? "cashout" : "full_clear",
        payoutReturn: totalReturn,
        outcome,
        isWin: outcome === "win",
        isPush: outcome === "push",
        netDelta,
        totalRisked,
        totalReturn,
        playerHands: [[...p0]],
        handStakes: [stake],
        handResults: [
          {
            index: 0,
            cards: [...p0],
            stake,
            playerTotal: 21,
            outcomeKind: "blackjack_win",
            payoutReturn: mainReturn,
            busted: false,
          },
        ],
        playerHand: [...p0],
        opponentHand: [...opponentHand],
        deck,
        playerTotal: 21,
        opponentTotal: handTotal(opponentHand),
        playerBust: false,
        opponentBust: false,
        playerNatural21: true,
        opponentNatural21: false,
        resolvedViaNatural21: false,
        premiumNaturalWin: true,
        blackjackWin: true,
        insuranceDecision,
        insuranceStake: accepted ? insuranceStake : 0,
        insuranceReturn: 0,
        dealerHadBlackjack: false,
        resolvedAt,
        settlementSummary,
        stats: "deferred",
        lastProcessedActionEventId: actionEventId,
      };
      return { ok: true, terminal };
    }

    const cont = buildActiveBase({
      lastProcessedActionEventId: actionEventId,
      opponentHand,
      deck,
      playerHands,
      handStakes,
      handMeta,
      activeHandIndex: 0,
      playPhase: PLAY_PHASE.PLAYER_TURN,
      insuranceOffered,
      insuranceDecision,
      insuranceStake: accepted ? insuranceStake : 0,
      dealerPeekedAfterInsurance: true,
      splitUsed,
    });
    syncLegacyPlayerHand(cont);
    return { ok: true, continuing: cont };
  }

  if (playPhase !== PLAY_PHASE.PLAYER_TURN) {
    return { ok: false, message: "Invalid play phase.", status: 400 };
  }

  const i = activeHandIndex;
  if (i < 0 || i >= playerHands.length) {
    return { ok: false, message: "Invalid active hand.", status: 400 };
  }
  const meta = handMeta[i];
  if (meta.stood || meta.busted) {
    return { ok: false, message: "Hand is complete.", status: 400 };
  }

  function maybeDealerOrContinue(completedIdx) {
    const next = findNextHandIndex(handMeta, playerHands, completedIdx);
    if (next >= 0) {
      const cont = buildActiveBase({
        lastProcessedActionEventId: actionEventId,
        opponentHand,
        deck,
        playerHands,
        handStakes,
        handMeta,
        activeHandIndex: next,
        playPhase: PLAY_PHASE.PLAYER_TURN,
        insuranceOffered,
        insuranceDecision,
        insuranceStake,
        dealerPeekedAfterInsurance,
        splitUsed,
      });
      syncLegacyPlayerHand(cont);
      return { ok: true, continuing: cont };
    }
    const terminal = runDealerAndBuildTerminal({
      opponentHand,
      deck,
      playerHands,
      handStakes,
      handMeta,
      entryCost: baseW,
      fundingSource,
      insuranceDecision,
      insuranceStake,
      dealerOpeningBlackjack: false,
      resolvedAt,
      actionEventId,
    });
    return { ok: true, terminal };
  }

  if (dec === "hit") {
    if (meta.splitAces && playerHands[i].length >= 2) {
      return { ok: false, message: "Cannot hit split aces.", status: 400 };
    }
    if (deck.length < 1) return { ok: false, message: "Deck exhausted.", status: 503 };
    const card = deck[0];
    deck = deck.slice(1);
    playerHands[i] = [...playerHands[i], card];
    meta.firstAction = false;
    const pt = handTotal(playerHands[i]);
    if (pt > 21) {
      meta.busted = true;
      meta.stood = true;
      return maybeDealerOrContinue(i);
    }
    const cont = buildActiveBase({
      lastProcessedActionEventId: actionEventId,
      opponentHand,
      deck,
      playerHands,
      handStakes,
      handMeta,
      activeHandIndex: i,
      playPhase: PLAY_PHASE.PLAYER_TURN,
      insuranceOffered,
      insuranceDecision,
      insuranceStake,
      dealerPeekedAfterInsurance,
      splitUsed,
    });
    syncLegacyPlayerHand(cont);
    return { ok: true, continuing: cont };
  }

  if (dec === "stand") {
    meta.stood = true;
    meta.firstAction = false;
    return maybeDealerOrContinue(i);
  }

  if (dec === "double") {
    if (!meta.firstAction || playerHands[i].length !== 2 || meta.splitAces) {
      return { ok: false, message: "Double not allowed.", status: 400 };
    }
    if (deck.length < 1) return { ok: false, message: "Deck exhausted.", status: 503 };
    const add = handStakes[i];
    handStakes[i] = handStakes[i] + add;
    const card = deck[0];
    deck = deck.slice(1);
    playerHands[i] = [...playerHands[i], card];
    meta.doubled = true;
    meta.firstAction = false;
    meta.stood = true;
    const pt = handTotal(playerHands[i]);
    if (pt > 21) meta.busted = true;
    return maybeDealerOrContinue(i);
  }

  if (dec === "split") {
    if (splitUsed || playerHands.length !== 1 || playerHands[i].length !== 2) {
      return { ok: false, message: "Split not allowed.", status: 400 };
    }
    const c0 = playerHands[i][0];
    const c1 = playerHands[i][1];
    if (!canSplitByRank(c0, c1)) {
      return { ok: false, message: "Split not allowed.", status: 400 };
    }
    if (deck.length < 2) return { ok: false, message: "Deck exhausted.", status: 503 };
    const rankA = splitRankKey(c0) === "A";
    const stake = handStakes[i];
    const d0 = deck[0];
    const d1 = deck[1];
    deck = deck.slice(2);
    const h0 = [c0, d0];
    const h1 = [c1, d1];
    playerHands = [h0, h1];
    handStakes = [stake, stake];
    splitUsed = true;
    if (rankA) {
      handMeta = [
        { stood: true, busted: false, doubled: false, splitAces: true, fromSplit: true, firstAction: false },
        { stood: true, busted: false, doubled: false, splitAces: true, fromSplit: true, firstAction: false },
      ];
      const terminal = runDealerAndBuildTerminal({
        opponentHand,
        deck,
        playerHands,
        handStakes,
        handMeta,
        entryCost: baseW,
        fundingSource,
        insuranceDecision,
        insuranceStake,
        dealerOpeningBlackjack: false,
        resolvedAt,
        actionEventId,
      });
      return { ok: true, terminal };
    }
    handMeta = [
      { stood: false, busted: false, doubled: false, splitAces: false, fromSplit: true, firstAction: true },
      { stood: false, busted: false, doubled: false, splitAces: false, fromSplit: true, firstAction: true },
    ];
    activeHandIndex = 0;
    const cont = buildActiveBase({
      lastProcessedActionEventId: actionEventId,
      opponentHand,
      deck,
      playerHands,
      handStakes,
      handMeta,
      activeHandIndex: 0,
      playPhase: PLAY_PHASE.PLAYER_TURN,
      insuranceOffered,
      insuranceDecision,
      insuranceStake,
      dealerPeekedAfterInsurance,
      splitUsed,
    });
    syncLegacyPlayerHand(cont);
    return { ok: true, continuing: cont };
  }

  return { ok: false, message: "Unsupported decision.", status: 400 };
}

/**
 * Initial deal: active session or immediate terminal (dealer hole peek, player BJ).
 */
export function buildChallenge21DealState(entryCost, fundingSource) {
  const shoe = shuffleDeck(buildFullDeckOrdered());
  const playerHand = [shoe[0], shoe[2]];
  const opponentHand = [shoe[1], shoe[3]];
  const deck = shoe.slice(4);
  const baseW = Math.max(CHALLENGE_21_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  const resolvedAt = new Date().toISOString();

  if (isDealerUpTenValue(opponentHand) && isNatural21(opponentHand)) {
    const pNat = isNatural21(playerHand);
    const outcomeKind = pNat ? "push" : "lose";
    const payout = pNat ? handPayoutReturn(baseW, "push") : 0;
    const totalRisked = baseW;
    const totalReturn = payout;
    const netDelta = fundingSource === "gift" ? totalReturn : totalReturn - totalRisked;
    const outcome = netDelta > 0 ? "win" : netDelta < 0 ? "lose" : "push";
    const settlementSummary = buildChallenge21SettlementSummaryFromTotals({
      totalRisked,
      totalReturn,
      payoutReturn: totalReturn,
      entryCost: baseW,
      fundingSource,
    });
    return {
      type: "resolved",
      summary: {
        phase: "challenge_21_resolved",
        terminalKind: outcome === "lose" ? "overload" : "cashout",
        payoutReturn: totalReturn,
        outcome,
        isWin: outcome === "win",
        isPush: outcome === "push",
        netDelta,
        totalRisked,
        totalReturn,
        playerHands: [[...playerHand]],
        handStakes: [baseW],
        handResults: [
          {
            index: 0,
            cards: [...playerHand],
            stake: baseW,
            playerTotal: handTotal(playerHand),
            outcomeKind,
            payoutReturn: payout,
            busted: false,
          },
        ],
        playerHand: [...playerHand],
        opponentHand: [...opponentHand],
        deck,
        playerTotal: handTotal(playerHand),
        opponentTotal: 21,
        playerBust: false,
        opponentBust: false,
        playerNatural21: pNat,
        opponentNatural21: true,
        resolvedViaNatural21: true,
        premiumNaturalWin: false,
        blackjackWin: false,
        insuranceDecision: null,
        insuranceStake: 0,
        insuranceReturn: 0,
        dealerHadBlackjack: true,
        resolvedAt,
        settlementSummary,
        stats: "deferred",
        lastProcessedActionEventId: 0,
      },
    };
  }

  if (isDealerUpAce(opponentHand)) {
    return {
      type: "active",
      summary: buildActiveBase({
        lastProcessedActionEventId: 0,
        opponentHand,
        deck,
        playerHands: [[...playerHand]],
        handStakes: [baseW],
        handMeta: defaultHandMeta(1),
        activeHandIndex: 0,
        playPhase: PLAY_PHASE.INSURANCE_OFFER,
        insuranceOffered: true,
        insuranceDecision: null,
        insuranceStake: 0,
        dealerPeekedAfterInsurance: false,
        splitUsed: false,
        playerHand: [...playerHand],
      }),
    };
  }

  if (isNatural21(playerHand)) {
    const totalReturn = handPayoutReturn(baseW, "blackjack_win");
    const totalRisked = baseW;
    const netDelta = fundingSource === "gift" ? totalReturn : totalReturn - totalRisked;
    const settlementSummary = buildChallenge21SettlementSummaryFromTotals({
      totalRisked,
      totalReturn,
      payoutReturn: totalReturn,
      entryCost: baseW,
      fundingSource,
    });
    return {
      type: "resolved",
      summary: {
        phase: "challenge_21_resolved",
        terminalKind: "full_clear",
        payoutReturn: totalReturn,
        outcome: "win",
        isWin: true,
        isPush: false,
        netDelta,
        totalRisked,
        totalReturn,
        playerHands: [[...playerHand]],
        handStakes: [baseW],
        handResults: [
          {
            index: 0,
            cards: [...playerHand],
            stake: baseW,
            playerTotal: 21,
            outcomeKind: "blackjack_win",
            payoutReturn: totalReturn,
            busted: false,
          },
        ],
        playerHand: [...playerHand],
        opponentHand: [...opponentHand],
        deck,
        playerTotal: 21,
        opponentTotal: handTotal(opponentHand),
        playerBust: false,
        opponentBust: false,
        playerNatural21: true,
        opponentNatural21: isNatural21(opponentHand),
        resolvedViaNatural21: true,
        premiumNaturalWin: true,
        blackjackWin: true,
        insuranceDecision: null,
        insuranceStake: 0,
        insuranceReturn: 0,
        dealerHadBlackjack: false,
        resolvedAt,
        settlementSummary,
        stats: "deferred",
        lastProcessedActionEventId: 0,
      },
    };
  }

  return {
    type: "active",
    summary: buildActiveBase({
      lastProcessedActionEventId: 0,
      opponentHand,
      deck,
      playerHands: [[...playerHand]],
      handStakes: [baseW],
      handMeta: defaultHandMeta(1),
      activeHandIndex: 0,
      playPhase: PLAY_PHASE.PLAYER_TURN,
      insuranceOffered: false,
      insuranceDecision: null,
      insuranceStake: 0,
      dealerPeekedAfterInsurance: false,
      splitUsed: false,
      playerHand: [...playerHand],
    }),
  };
}
