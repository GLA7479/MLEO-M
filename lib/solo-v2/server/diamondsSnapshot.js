import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildDiamondsSettlementSummary,
  DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY,
  DIAMONDS_CELL_COUNT,
  DIAMONDS_MIN_WAGER,
  diamondsMultiplierAfterReveals,
  payoutForDiamonds,
} from "../diamondsConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= DIAMONDS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseDiamondsActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "diamonds_active") return null;
  const bombCount = Math.floor(Number(s.bombCount));
  if (!Number.isFinite(bombCount) || bombCount < 1 || bombCount >= DIAMONDS_CELL_COUNT) return null;
  const bombIndices = Array.isArray(s.bombIndices) ? s.bombIndices.map(x => Math.floor(Number(x))) : [];
  if (bombIndices.length !== bombCount) return null;
  if (bombIndices.some(i => !Number.isFinite(i) || i < 0 || i >= DIAMONDS_CELL_COUNT)) return null;
  const revealedSafeIndices = Array.isArray(s.revealedSafeIndices)
    ? s.revealedSafeIndices.map(x => Math.floor(Number(x)))
    : [];
  if (revealedSafeIndices.some(i => !Number.isFinite(i) || i < 0 || i >= DIAMONDS_CELL_COUNT)) return null;

  return {
    gridSize: Math.floor(Number(s.gridSize)) || 5,
    cellCount: DIAMONDS_CELL_COUNT,
    bombCount,
    difficulty: String(s.difficulty || "medium"),
    bombIndices: [...bombIndices].sort((a, b) => a - b),
    revealedSafeIndices: [...revealedSafeIndices].sort((a, b) => a - b),
  };
}

export function stripDiamondsSecretsFromSummary(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (raw.phase !== "diamonds_active") return raw;
  const { bombIndices: _b, ...rest } = raw;
  return rest;
}

function buildPlayingPayload(active, entryCost) {
  const k = active.revealedSafeIndices.length;
  const multNow = k > 0 ? diamondsMultiplierAfterReveals(active.bombCount, k) : 1;
  const nextK = k + 1;
  const maxSafe = DIAMONDS_CELL_COUNT - active.bombCount;
  const multNext =
    nextK <= maxSafe ? diamondsMultiplierAfterReveals(active.bombCount, nextK) : null;
  const currentPayout = k > 0 && multNow != null ? payoutForDiamonds(entryCost, multNow) : 0;
  const nextPayout =
    multNext != null ? payoutForDiamonds(entryCost, multNext) : currentPayout;

  return {
    gridSize: active.gridSize,
    cellCount: active.cellCount,
    bombCount: active.bombCount,
    difficulty: active.difficulty,
    revealedSafeIndices: active.revealedSafeIndices,
    safeRevealedCount: k,
    maxSafeReveals: maxSafe,
    currentMultiplier: k > 0 ? multNow : 1,
    nextMultiplier: multNext,
    currentPayout,
    nextPayout,
  };
}

export async function buildDiamondsSessionSnapshot(_supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "diamonds") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_diamonds",
        canCashOut: false,
        canReveal: false,
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
          : "bomb";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildDiamondsSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "diamonds",
        readState: "resolved",
        canCashOut: false,
        canReveal: false,
        playing: null,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "bomb",
          bombIndices: Array.isArray(summary.bombIndices) ? summary.bombIndices : [],
          revealedSafeIndices: Array.isArray(summary.revealedSafeIndices) ? summary.revealedSafeIndices : [],
          lastCellIndex:
            summary.lastCellIndex != null ? Math.floor(Number(summary.lastCellIndex)) : null,
          settlementSummary,
        },
      },
    };
  }

  const active = parseDiamondsActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "diamonds",
        readState: "invalid",
        canCashOut: false,
        canReveal: false,
        playing: null,
        resolvedResult: null,
      },
    };
  }

  const playing = buildPlayingPayload(active, entryCost);
  const canCashOut = playing.safeRevealedCount >= 1;
  const canReveal = playing.safeRevealedCount < playing.maxSafeReveals;

  return {
    ok: true,
    snapshot: {
      gameKey: "diamonds",
      readState: canReveal ? "choice_required" : "invalid",
      canCashOut,
      canReveal,
      playing,
      resolvedResult: null,
    },
  };
}
