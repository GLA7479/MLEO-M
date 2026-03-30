import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildSurgeCashoutSettlementSummary,
  payoutForSurgeCashout,
  SURGE_CASHOUT_MIN_WAGER,
} from "../surgeCashoutConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  parseSurgeCashoutLiveSummary,
  parseSurgeCashoutPreSummary,
  surgeCashoutMultiplierNow,
} from "./surgeCashoutEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SURGE_CASHOUT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

/**
 * Strip secret crash value from stored summary for API responses while live.
 */
export function stripSurgeCashoutSecretsFromSummary(rawSummary) {
  const s = rawSummary || {};
  if (s.phase !== "surge_cashout_live") return rawSummary;
  const { crashMultiplier: _c, ...rest } = s;
  return rest;
}

export async function buildSurgeCashoutSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "surge_cashout") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_surge_cashout",
        canCashOut: false,
        canLaunch: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const nowMs = Date.now();

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind = summary.terminalKind === "cashout" ? "cashout" : "bust";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildSurgeCashoutSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "surge_cashout",
        readState: "resolved",
        canCashOut: false,
        canLaunch: false,
        playing: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "bust",
          cashMultiplier: summary.cashMultiplier != null ? Number(summary.cashMultiplier) : null,
          crashMultiplier: summary.crashMultiplier != null ? Number(summary.crashMultiplier) : null,
          settlementSummary,
        },
      },
    };
  }

  const pre = parseSurgeCashoutPreSummary(sessionRow.server_outcome_summary);
  if (pre) {
    return {
      ok: true,
      snapshot: {
        gameKey: "surge_cashout",
        readState: "pre_round",
        canCashOut: false,
        canLaunch: true,
        playing: {
          phase: "pre",
          multiplierNow: 1,
          serverNowMs: nowMs,
        },
        resolvedResult: null,
      },
    };
  }

  const live = parseSurgeCashoutLiveSummary(sessionRow.server_outcome_summary);
  if (!live) {
    return {
      ok: true,
      snapshot: {
        gameKey: "surge_cashout",
        readState: "invalid",
        canCashOut: false,
        canLaunch: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const multiplierNow = surgeCashoutMultiplierNow(live, nowMs);

  return {
    ok: true,
    snapshot: {
      gameKey: "surge_cashout",
      readState: "live",
      canCashOut: true,
      canLaunch: false,
      playing: {
        phase: "live",
        multiplierNow,
        serverNowMs: nowMs,
        risePerSecond: live.risePerSecond,
        startedAtMs: live.startedAtMs,
      },
      resolvedResult: null,
    },
  };
}
