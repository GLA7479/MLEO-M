import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildHighLowCardsSettlementSummary,
  HIGH_LOW_CARDS_MIN_WAGER,
} from "../highLowCardsConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeHighLowGuess(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const s = String(value).trim().toLowerCase();
  if (s === "high" || s === "h") return "high";
  if (s === "low" || s === "l") return "low";
  return null;
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

export async function buildHighLowCardsSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "high_low_cards") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_high_low_cards",
        canResolve: false,
        guess: null,
        guessEventId: null,
        guessSubmittedAt: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= HIGH_LOW_CARDS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const choiceG = normalizeHighLowGuess(summary.choice);
    const outcomeG = normalizeHighLowGuess(summary.outcome);
    return {
      ok: true,
      snapshot: {
        gameKey: "high_low_cards",
        readState: "resolved",
        canResolve: false,
        guess: choiceG,
        guessEventId: null,
        guessSubmittedAt: null,
        resolvedResult: {
          guess: choiceG,
          outcome: outcomeG,
          baseRank: summary.baseRank != null ? Number(summary.baseRank) : null,
          nextRank: summary.nextRank != null ? Number(summary.nextRank) : null,
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildHighLowCardsSettlementSummary({
              choice: choiceG,
              outcome: outcomeG,
              isWin: Boolean(summary.isWin),
              entryCost,
              fundingSource,
            }),
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
        canResolve: false,
        guess: null,
        guessEventId: null,
        guessSubmittedAt: null,
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
          canResolve: false,
          guess: null,
          guessEventId: null,
          guessSubmittedAt: null,
          resolvedResult: null,
        },
      };
    }
  }

  const guessRead = await readLatestHighLowGuessEvent(supabase, sessionRow.id);
  if (!guessRead.ok) {
    return { ok: false, error: guessRead.error };
  }

  const row = guessRead.row;
  const guess = guessRead.normalizedGuess;
  const hasGuess = guess !== null;

  const snapshot = {
    gameKey: "high_low_cards",
    readState: hasGuess ? "choice_submitted" : "choice_required",
    canResolve: hasGuess,
    guess,
    guessEventId: row?.id || null,
    guessSubmittedAt: row?.created_at || null,
    resolvedResult: null,
  };

  return {
    ok: true,
    snapshot,
  };
}
