import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildSoloLadderSettlementSummary,
  payoutForSoloLadder,
  SOLO_LADDER_MIN_WAGER,
  SOLO_LADDER_MULTIPLIERS,
  SOLO_LADDER_STEP_COUNT,
  SOLO_LADDER_STEP_SUCCESS_PROB,
  soloLadderMultiplierAfterSuccesses,
} from "../soloLadderConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SOLO_LADDER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseSoloLadderActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "solo_ladder_active") return null;
  const successCount = Math.max(0, Math.floor(Number(s.successCount) || 0));
  if (successCount > SOLO_LADDER_STEP_COUNT) return null;
  const stepCount = Math.floor(Number(s.stepCount)) || SOLO_LADDER_STEP_COUNT;
  return { successCount, stepCount };
}

function buildPlayingPayload(active, entryCost) {
  const sc = active.successCount;
  const multNow = sc > 0 ? soloLadderMultiplierAfterSuccesses(sc) : 1;
  const nextStepIndex = sc;
  const canClimbMore = sc < SOLO_LADDER_STEP_COUNT;
  const nextP =
    canClimbMore && nextStepIndex < SOLO_LADDER_STEP_SUCCESS_PROB.length
      ? SOLO_LADDER_STEP_SUCCESS_PROB[nextStepIndex]
      : null;
  const multNext =
    canClimbMore && sc < SOLO_LADDER_STEP_COUNT
      ? SOLO_LADDER_MULTIPLIERS[sc]
      : null;
  const currentPayout =
    sc > 0 && multNow != null ? payoutForSoloLadder(entryCost, multNow) : 0;
  const nextPayout =
    multNext != null ? payoutForSoloLadder(entryCost, multNext) : currentPayout;

  return {
    stepCount: active.stepCount,
    successCount: sc,
    currentMultiplier: multNow ?? 1,
    nextMultiplier: multNext,
    nextStepSuccessChance: nextP,
    currentPayout,
    nextPayout,
    canClimbMore,
  };
}

export async function buildSoloLadderSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "solo_ladder") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_solo_ladder",
        canCashOut: false,
        canClimb: false,
        playing: null,
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
          : "bust";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildSoloLadderSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "solo_ladder",
        readState: "resolved",
        canCashOut: false,
        canClimb: false,
        playing: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "bust",
          successCount: summary.successCount != null ? Math.floor(Number(summary.successCount)) : null,
          failedAtStep: summary.failedAtStep != null ? Math.floor(Number(summary.failedAtStep)) : null,
          settlementSummary,
        },
      },
    };
  }

  const active = parseSoloLadderActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "solo_ladder",
        readState: "invalid",
        canCashOut: false,
        canClimb: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const playing = buildPlayingPayload(active, entryCost);
  const canCashOut = playing.successCount >= 1;
  const canClimb = playing.canClimbMore;

  return {
    ok: true,
    snapshot: {
      gameKey: "solo_ladder",
      readState: canClimb || canCashOut ? "choice_required" : "invalid",
      canCashOut,
      canClimb,
      playing,
      resolvedResult: null,
    },
  };
}
