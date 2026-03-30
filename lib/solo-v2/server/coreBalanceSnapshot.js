import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildCoreBalanceSettlementSummary,
  CORE_BALANCE_MIN_WAGER,
  payoutForCoreBalanceWin,
} from "../coreBalanceConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseCoreBalanceActiveSummary } from "./coreBalanceEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= CORE_BALANCE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function zoneForMeter(value, safeLow, safeHigh, criticalLow, criticalHigh) {
  const v = Number(value);
  if (v <= criticalLow || v >= criticalHigh) return "danger";
  if (v < safeLow || v > safeHigh) return "warn";
  return "ok";
}

export function buildCoreBalancePlayingView(active, entryCost) {
  return {
    tick: active.tick,
    maxTicks: active.maxTicks,
    heat: active.heat,
    pressure: active.pressure,
    charge: active.charge,
    criticalLow: active.criticalLow,
    criticalHigh: active.criticalHigh,
    safeLow: active.safeLow,
    safeHigh: active.safeHigh,
    zones: {
      heat: zoneForMeter(active.heat, active.safeLow, active.safeHigh, active.criticalLow, active.criticalHigh),
      pressure: zoneForMeter(
        active.pressure,
        active.safeLow,
        active.safeHigh,
        active.criticalLow,
        active.criticalHigh,
      ),
      charge: zoneForMeter(active.charge, active.safeLow, active.safeHigh, active.criticalLow, active.criticalHigh),
    },
    potentialWinReturn: payoutForCoreBalanceWin(entryCost),
  };
}

export async function buildCoreBalanceSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "core_balance") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_core_balance",
        canAct: false,
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
      buildCoreBalanceSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "core_balance",
        readState: "resolved",
        canAct: false,
        playing: null,
        resolvedResult: {
          terminalKind: isWin ? "win" : "lose",
          payoutReturn,
          isWin,
          settlementSummary,
          failMeter: summary.failMeter || null,
          survivedTicks: Math.floor(Number(summary.survivedTicks) || 0),
          maxTicks: Math.floor(Number(summary.maxTicks) || 0),
        },
      },
    };
  }

  const active = parseCoreBalanceActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "core_balance",
        readState: "invalid",
        canAct: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      gameKey: "core_balance",
      readState: "survival_active",
      canAct: true,
      playing: buildCoreBalancePlayingView(active, entryCost),
      resolvedResult: null,
    },
  };
}
