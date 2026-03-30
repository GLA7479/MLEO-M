import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildRailLogicSettlementSummary,
  payoutForRailLogic,
  RAIL_LOGIC_MIN_WAGER,
} from "../railLogicConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseRailLogicActiveSummary, railPathExists } from "./railLogicEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= RAIL_LOGIC_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export async function buildRailLogicSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "rail_logic") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_rail_logic",
        canRotate: false,
        canSubmit: false,
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
      buildRailLogicSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "rail_logic",
        readState: "resolved",
        canRotate: false,
        canSubmit: false,
        playing: null,
        resolvedResult: {
          terminalKind: isWin ? "win" : "lose",
          payoutReturn,
          isWin,
          settlementSummary,
        },
      },
    };
  }

  const active = parseRailLogicActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "rail_logic",
        readState: "invalid",
        canRotate: false,
        canSubmit: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const solved = railPathExists(
    active.gridW,
    active.gridH,
    active.types,
    active.rotations,
    active.startIdx,
    active.endIdx,
    active.startGate,
    active.endGate,
  );
  const movesLeft = Math.max(0, active.maxMoves - active.movesUsed);

  return {
    ok: true,
    snapshot: {
      gameKey: "rail_logic",
      readState: "puzzle_active",
      canRotate: movesLeft > 0,
      canSubmit: true,
      playing: {
        gridW: active.gridW,
        gridH: active.gridH,
        types: active.types,
        rotations: active.rotations,
        startIdx: active.startIdx,
        endIdx: active.endIdx,
        startGate: active.startGate,
        endGate: active.endGate,
        maxMoves: active.maxMoves,
        movesUsed: active.movesUsed,
        movesRemaining: movesLeft,
        routeComplete: solved,
        potentialPayout: payoutForRailLogic(entryCost),
      },
      resolvedResult: null,
    },
  };
}
