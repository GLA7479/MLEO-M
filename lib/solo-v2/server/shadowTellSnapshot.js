import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildShadowTellSettlementSummary,
  SHADOW_TELL_MIN_WAGER,
  shadowTellBestCaseReturn,
} from "../shadowTellConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseShadowTellActiveSummary, SHADOW_TELL_PHASE_ACTIVE } from "./shadowTellEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SHADOW_TELL_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

/**
 * Strip hidden opponent profile from API responses while the round is open.
 */
export function stripShadowTellSecretsFromSummary(rawSummary) {
  const s = rawSummary || {};
  if (s.phase !== SHADOW_TELL_PHASE_ACTIVE) return rawSummary;
  const { opponentProfile: _op, ...rest } = s;
  return rest;
}

export async function buildShadowTellSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "shadow_tell") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_shadow_tell",
        canDecide: false,
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
      buildShadowTellSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "shadow_tell",
        readState: "resolved",
        canDecide: false,
        playing: null,
        resolvedResult: {
          terminalKind: isWin ? "win" : "lose",
          payoutReturn,
          isWin,
          settlementSummary,
          playerChoice: summary.playerChoice || null,
          revealedProfile: summary.revealedProfile || null,
        },
      },
    };
  }

  const active = parseShadowTellActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "shadow_tell",
        readState: "invalid",
        canDecide: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      gameKey: "shadow_tell",
      readState: "inference_active",
      canDecide: true,
      playing: {
        clues: active.clues,
        bestCaseReturn: shadowTellBestCaseReturn(entryCost),
        entryCost,
      },
      resolvedResult: null,
    },
  };
}
