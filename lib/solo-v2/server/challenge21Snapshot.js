import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildChallenge21SettlementSummary,
  CHALLENGE_21_MIN_WAGER,
  normalizeChallenge21Decision,
} from "../challenge21Config";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { canSplitByRank, handTotal, upCardShowValue } from "../challenge21HandMath";
import { parseChallenge21ActiveSummary } from "./challenge21Engine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= CHALLENGE_21_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readChallenge21ActionEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(40);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const actions = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "challenge_21_action" &&
      String(r?.event_payload?.gameKey || "") === "challenge_21",
  );
  return { ok: true, rows: actions };
}

export function computeAllowedChallenge21Decisions(active) {
  const phase = String(active.playPhase || "player_turn");
  if (phase === "insurance_offer") {
    return ["insurance_accept", "insurance_decline"];
  }
  const hands =
    Array.isArray(active.playerHands) && active.playerHands.length > 0
      ? active.playerHands
      : [[...active.playerHand]];
  const idx = Math.max(0, Math.min(hands.length - 1, Math.floor(Number(active.activeHandIndex) || 0)));
  const cards = Array.isArray(hands[idx]) ? hands[idx] : [];
  const metaArr = Array.isArray(active.handMeta) ? active.handMeta : [];
  const rawMeta = metaArr[idx] || {};
  const stood = Boolean(rawMeta.stood);
  const busted = Boolean(rawMeta.busted);
  const splitAces = Boolean(rawMeta.splitAces);
  let firstAction = rawMeta.firstAction !== false;
  if (metaArr.length === 0) {
    firstAction = cards.length === 2;
  }
  if (stood || busted) return [];
  const tot = handTotal(cards);
  if (tot > 21) return [];
  if (tot === 21) return ["stand"];
  const out = ["hit", "stand"];
  if (firstAction && cards.length === 2 && !splitAces) out.push("double");
  if (
    !active.splitUsed &&
    hands.length === 1 &&
    cards.length === 2 &&
    canSplitByRank(cards[0], cards[1])
  ) {
    out.push("split");
  }
  return out;
}

function buildPlayingPublic(sessionRow, active) {
  const entry = entryCostFromSessionRow(sessionRow);
  if (!active) return null;
  const opp = active.opponentHand;
  const up = Array.isArray(opp) && opp.length ? [opp[0]] : [];
  const hands =
    Array.isArray(active.playerHands) && active.playerHands.length > 0
      ? active.playerHands.map(h => [...h])
      : [[...active.playerHand]];
  const idx = Number.isFinite(active.activeHandIndex) ? active.activeHandIndex : 0;
  const ai = Math.max(0, Math.min(hands.length - 1, idx));
  const activeCards = hands[ai] || [];
  const allowedDecisions = computeAllowedChallenge21Decisions(active);
  const playPhase = String(active.playPhase || "player_turn");
  return {
    challenge21: true,
    entryAmount: entry,
    playerHand: [...activeCards],
    playerHands: hands,
    activeHandIndex: ai,
    handStakes: Array.isArray(active.handStakes) ? [...active.handStakes] : [],
    playPhase,
    insurancePending: playPhase === "insurance_offer",
    allowedDecisions,
    opponentVisibleHand: up,
    playerTotal: handTotal(activeCards),
    opponentUpTotal: upCardShowValue(opp),
    holeHidden: true,
  };
}

/**
 * Strip secrets from server_outcome_summary for client GET (active rounds only).
 * @param {Record<string, unknown>} summary
 */
export function stripChallenge21SecretsFromSummary(summary) {
  if (!summary || typeof summary !== "object") return summary;
  if (summary.phase !== "challenge_21_active") return summary;
  const opp = Array.isArray(summary.opponentHand) ? summary.opponentHand : [];
  const visible = opp[0] != null ? [opp[0]] : [];
  const { deck: _d, ...rest } = summary;
  return {
    ...rest,
    opponentHand: visible,
    opponentHoleHidden: true,
  };
}

export async function buildChallenge21SessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "challenge_21") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_challenge_21",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        actionConflict: false,
        pendingAction: null,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind =
      summary.terminalKind === "cashout"
        ? "cashout"
        : summary.terminalKind === "full_clear"
          ? "full_clear"
          : "overload";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const outcome = summary.outcome === "push" ? "push" : summary.outcome === "win" ? "win" : "lose";
    const settlementSummary =
      summary.settlementSummary ||
      buildChallenge21SettlementSummary({
        outcome,
        payoutReturn,
        entryCost,
        fundingSource,
      });
    const isWin = summary.isWin != null ? Boolean(summary.isWin) : outcome === "win";
    const isPush = summary.isPush != null ? Boolean(summary.isPush) : outcome === "push";

    return {
      ok: true,
      snapshot: {
        gameKey: "challenge_21",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        actionConflict: false,
        pendingAction: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin,
          isPush,
          outcome,
          playerHand: Array.isArray(summary.playerHand) ? summary.playerHand : [],
          playerHands: Array.isArray(summary.playerHands) ? summary.playerHands : [],
          handResults: Array.isArray(summary.handResults) ? summary.handResults : null,
          opponentHand: Array.isArray(summary.opponentHand) ? summary.opponentHand : [],
          playerTotal: summary.playerTotal != null ? Number(summary.playerTotal) : null,
          opponentTotal: summary.opponentTotal != null ? Number(summary.opponentTotal) : null,
          playerBust: summary.playerBust === true,
          opponentBust: summary.opponentBust === true,
          playerNatural21: summary.playerNatural21 === true,
          opponentNatural21: summary.opponentNatural21 === true,
          resolvedViaNatural21: summary.resolvedViaNatural21 === true,
          premiumNaturalWin: summary.premiumNaturalWin === true,
          blackjackWin: summary.blackjackWin === true,
          insuranceStake: summary.insuranceStake != null ? Number(summary.insuranceStake) : 0,
          insuranceReturn: summary.insuranceReturn != null ? Number(summary.insuranceReturn) : 0,
          insuranceDecision: summary.insuranceDecision ?? null,
          dealerHadBlackjack: summary.dealerHadBlackjack === true,
          totalRisked: summary.totalRisked != null ? Number(summary.totalRisked) : null,
          netDelta: summary.netDelta != null ? Number(summary.netDelta) : null,
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary,
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "challenge_21",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        actionConflict: false,
        pendingAction: null,
        resolvedResult: null,
      },
    };
  }

  const expiresAtRaw = sessionRow.expires_at;
  if (expiresAtRaw) {
    const expiresMs = new Date(expiresAtRaw).getTime();
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return {
        ok: true,
        snapshot: {
          gameKey: "challenge_21",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          actionConflict: false,
          pendingAction: null,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseChallenge21ActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "challenge_21",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        actionConflict: false,
        pendingAction: null,
        resolvedResult: null,
      },
    };
  }

  const actionRead = await readChallenge21ActionEventsAfter(supabase, sessionRow.id, active.lastProcessedActionEventId);
  if (!actionRead.ok) {
    return { ok: false, error: actionRead.error };
  }

  const forAction = actionRead.rows;
  const actionConflict = forAction.length > 1;
  let pendingAction = null;

  if (!actionConflict && forAction.length === 1) {
    const row = forAction[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const decision = normalizeChallenge21Decision(row?.event_payload?.decision);
    const allowed = computeAllowedChallenge21Decisions(active);
    const okDec = Boolean(decision) && allowed.includes(decision);
    if (Number.isFinite(eid) && eid > 0 && okDec) {
      pendingAction = {
        actionEventId: eid,
        decision,
        submittedAt: row?.created_at || null,
      };
    }
  }

  const playing = buildPlayingPublic(sessionRow, active);

  let readState = "ready";
  if (actionConflict) readState = "action_conflict";
  else if (pendingAction) readState = "action_submitted";

  const canResolveTurn = !actionConflict && Boolean(pendingAction);

  return {
    ok: true,
    snapshot: {
      gameKey: "challenge_21",
      readState,
      canResolveTurn,
      canCashOut: false,
      playing,
      actionConflict,
      pendingAction,
      resolvedResult: null,
    },
  };
}
