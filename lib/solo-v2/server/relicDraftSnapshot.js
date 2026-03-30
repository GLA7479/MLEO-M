import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildRelicDraftSettlementSummary,
  payoutForRelicDraftWin,
  RELIC_DRAFT_MIN_WAGER,
} from "../relicDraftConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseRelicDraftActiveSummary } from "./relicDraftEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= RELIC_DRAFT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function formatModifiersLine(thresholdShift, payoutPct, saves) {
  const ts = Math.floor(Number(thresholdShift) || 0);
  const p = Math.floor(Number(payoutPct) || 0);
  const s = Math.max(0, Math.floor(Number(saves) || 0));
  const sign = p >= 0 ? "+" : "";
  return `Enc ${ts >= 0 ? "+" : ""}${ts} · Pay ${sign}${p}% · Saves ${s}`;
}

export function buildRelicDraftPlayingView(active, entryCost) {
  const entry = Math.max(RELIC_DRAFT_MIN_WAGER, Math.floor(Number(entryCost) || 0));
  return {
    round: active.round,
    maxRounds: active.maxRounds,
    awaitingPick: active.awaitingPick,
    offers: active.awaitingPick ? active.offers : [],
    lastEncounter: active.lastEncounter,
    picks: active.picks,
    modifiersLine: formatModifiersLine(active.thresholdShift, active.payoutPercentBonus, active.freeMistakes),
    potentialWinReturn: payoutForRelicDraftWin(entry, active.payoutPercentBonus),
  };
}

export async function buildRelicDraftSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "relic_draft") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_relic_draft",
        canAdvance: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const isWin = summary.terminalKind === "win";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildRelicDraftSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "relic_draft",
        readState: "resolved",
        canAdvance: false,
        playing: null,
        resolvedResult: {
          terminalKind: isWin ? "win" : "lose",
          payoutReturn,
          isWin,
          settlementSummary,
          picks: Array.isArray(summary.picks) ? summary.picks : [],
          finalPayoutPercentBonus: Math.floor(Number(summary.finalPayoutPercentBonus) || 0),
        },
      },
    };
  }

  const active = parseRelicDraftActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "relic_draft",
        readState: "invalid",
        canAdvance: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      gameKey: "relic_draft",
      readState: "draft_run_active",
      canAdvance: active.awaitingPick,
      playing: buildRelicDraftPlayingView(active, entryCost),
      resolvedResult: null,
    },
  };
}
