import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildNumberHuntSettlementSummary,
  NUMBER_HUNT_MIN_WAGER,
  normalizeNumberHuntGuess,
} from "../numberHuntConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { parseNumberHuntActiveSummary } from "./numberHuntEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= NUMBER_HUNT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readNumberHuntGuessEventsAfter(supabase, sessionId, minIdExclusive) {
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
  const guesses = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "number_hunt_guess" &&
      String(r?.event_payload?.gameKey || "") === "number_hunt",
  );
  return { ok: true, rows: guesses };
}

function buildPlayingPublic(sessionRow) {
  const entry = entryCostFromSessionRow(sessionRow);
  const active = parseNumberHuntActiveSummary(sessionRow);
  if (!active) {
    return {
      entryAmount: entry,
      guessesUsed: 0,
      maxGuesses: 3,
      guessHistory: [],
      lowBound: 1,
      highBound: 20,
    };
  }
  const history = Array.isArray(active.guessHistory)
    ? active.guessHistory.map(h => ({
        guess: Math.floor(Number(h?.guess)),
        clue: String(h?.clue || ""),
      }))
    : [];
  return {
    entryAmount: entry,
    guessesUsed: history.length,
    maxGuesses: active.maxGuesses,
    guessHistory: history,
    lowBound: active.lowBound,
    highBound: active.highBound,
  };
}

export async function buildNumberHuntSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "number_hunt") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_number_hunt",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        guessConflict: false,
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
    const settlementSummary =
      summary.settlementSummary ||
      buildNumberHuntSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "number_hunt",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        guessConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "overload",
          secretTarget: summary.secretTarget != null ? Number(summary.secretTarget) : null,
          hitOnGuess: summary.hitOnGuess != null ? Number(summary.hitOnGuess) : null,
          rewardMultiplier: summary.rewardMultiplier != null ? Number(summary.rewardMultiplier) : null,
          guessHistory: Array.isArray(summary.guessHistory) ? summary.guessHistory : [],
          won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
          overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
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
        gameKey: "number_hunt",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        guessConflict: false,
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
          gameKey: "number_hunt",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingGuess: null,
          guessConflict: false,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseNumberHuntActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "number_hunt",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingGuess: null,
        guessConflict: false,
        resolvedResult: null,
      },
    };
  }

  const guessRead = await readNumberHuntGuessEventsAfter(supabase, sessionRow.id, active.lastProcessedGuessEventId);
  if (!guessRead.ok) {
    return { ok: false, error: guessRead.error };
  }

  const forGuess = guessRead.rows;
  const guessConflict = forGuess.length > 1;
  let pendingGuess = null;

  if (!guessConflict && forGuess.length === 1) {
    const row = forGuess[0];
    const eid = row?.id != null ? Number(row.id) : null;
    const guess = normalizeNumberHuntGuess(row?.event_payload?.guess);
    if (Number.isFinite(eid) && eid > 0 && guess !== null) {
      pendingGuess = {
        guessEventId: eid,
        guess,
        submittedAt: row?.created_at || null,
      };
    }
  }

  let readState = "ready";
  if (guessConflict) readState = "guess_conflict";
  else if (pendingGuess) readState = "guess_submitted";

  const canResolveTurn = !guessConflict && Boolean(pendingGuess);

  const playing = buildPlayingPublic(sessionRow);

  return {
    ok: true,
    snapshot: {
      gameKey: "number_hunt",
      readState,
      canResolveTurn,
      canCashOut: false,
      playing,
      pendingGuess,
      guessConflict,
      resolvedResult: null,
    },
  };
}

/** Strip secret target from API-visible summary while hunt is active. */
export function stripNumberHuntSecretFromSummary(summary) {
  if (!summary || typeof summary !== "object") return {};
  const { secretTarget: _omit, ...rest } = summary;
  return rest;
}
