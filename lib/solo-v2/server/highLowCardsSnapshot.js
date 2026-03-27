import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import { buildHighLowStreakSettlementSummary, HIGH_LOW_CARDS_MIN_WAGER, payoutFromEntryAndStreak } from "../highLowCardsConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { multiplierFromStreak } from "./highLowCardsEngine";

export function normalizeHighLowGuess(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const s = String(value).trim().toLowerCase();
  if (s === "high" || s === "higher" || s === "h") return "high";
  if (s === "low" || s === "lower" || s === "l") return "low";
  return null;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= HIGH_LOW_CARDS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readLatestHighLowGuessEvent(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_type,event_payload,created_at")
    .eq("session_id", sessionId)
    .order("id", { ascending: false })
    .limit(80);

  if (query.error) {
    return { ok: false, error: query.error };
  }

  const rows = Array.isArray(query.data) ? query.data : [];
  const row =
    rows.find(
      r =>
        String(r?.event_type || "") === "client_action" &&
        String(r?.event_payload?.action || "") === "high_low_cards_guess",
    ) || null;

  const normalizedGuess = normalizeHighLowGuess(row?.event_payload?.guess);
  return { ok: true, row, normalizedGuess };
}

function parseActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "high_low_cards_active") return null;
  const currentValue = Number(s.currentValue);
  if (!Number.isFinite(currentValue)) return null;
  return {
    currentValue,
    currentRank: s.currentRank != null ? String(s.currentRank) : null,
    currentSuit: s.currentSuit != null ? String(s.currentSuit) : null,
    streak: Math.max(0, Math.floor(Number(s.streak) || 0)),
    lastProcessedGuessEventId: Math.max(0, Math.floor(Number(s.lastProcessedGuessEventId) || 0)),
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

function buildPlayingPayload(sessionRow, active, entryCost) {
  const streak = active.streak;
  const mult = multiplierFromStreak(streak);
  const payout = payoutFromEntryAndStreak(entryCost, streak);
  const canCashOut = streak > 0;
  return {
    currentCard: {
      rank: active.currentRank,
      suit: active.currentSuit,
      value: active.currentValue,
    },
    streak,
    multiplier: mult,
    currentPayout: payout,
    canCashOut,
    lastTurn: active.lastTurn,
    entryAmount: entryCost,
  };
}

export async function buildHighLowCardsSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "high_low_cards") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_high_low_cards",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind = summary.terminalKind === "cashout" ? "cashout" : "loss";
    const streak = Math.max(0, Math.floor(Number(summary.finalStreak) || 0));
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildHighLowStreakSettlementSummary({
        payoutReturn: terminalKind === "cashout" ? payoutReturn : 0,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "high_low_cards",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        resolvedResult: {
          terminalKind,
          streak,
          finalStreak: streak,
          guess: normalizeHighLowGuess(summary.lastGuess) || null,
          lastNextCard: summary.lastNextCard || null,
          payoutReturn: terminalKind === "cashout" ? payoutReturn : 0,
          isWin: terminalKind === "cashout",
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
        gameKey: "high_low_cards",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
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
          gameKey: "high_low_cards",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingGuess: null,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "high_low_cards",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        resolvedResult: null,
      },
    };
  }

  const guessRead = await readLatestHighLowGuessEvent(supabase, sessionRow.id);
  if (!guessRead.ok) {
    return { ok: false, error: guessRead.error };
  }

  const lastEventId = guessRead.row?.id != null ? Number(guessRead.row.id) : 0;
  const lastGuess = guessRead.normalizedGuess;
  const processedThrough = active.lastProcessedGuessEventId;
  const hasPendingTurn =
    Number.isFinite(lastEventId) &&
    lastEventId > 0 &&
    lastEventId > processedThrough &&
    (lastGuess === "high" || lastGuess === "low");

  const playing = buildPlayingPayload(sessionRow, active, entryCost);

  const snapshot = {
    gameKey: "high_low_cards",
    readState: hasPendingTurn ? "choice_submitted" : "choice_required",
    canResolveTurn: hasPendingTurn,
    canCashOut: playing.canCashOut && !hasPendingTurn,
    playing,
    pendingGuess: hasPendingTurn
      ? {
          guess: lastGuess,
          guessEventId: lastEventId,
          guessSubmittedAt: guessRead.row?.created_at || null,
        }
      : null,
    resolvedResult: null,
  };

  return { ok: true, snapshot };
}
