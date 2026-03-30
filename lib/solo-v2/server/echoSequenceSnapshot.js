import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildEchoSequenceSettlementSummary,
  ECHO_SEQUENCE_MIN_WAGER,
  ECHO_SEQUENCE_TOTAL_ROUNDS,
} from "../echoSequenceConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { buildEchoPlayingNumbers } from "./echoSequenceEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= ECHO_SEQUENCE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readEchoChoiceEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(120);
  if (query.error) return { ok: false, error: query.error };
  const rows = (Array.isArray(query.data) ? query.data : []).filter(
    r =>
      String(r?.event_payload?.action || "") === "echo_sequence_choose" &&
      String(r?.event_payload?.gameKey || "") === "echo_sequence",
  );
  return { ok: true, rows };
}

export function parseEchoSequenceActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "echo_sequence_active") return null;
  const rounds = Array.isArray(s.rounds) ? s.rounds : [];
  if (rounds.length !== ECHO_SEQUENCE_TOTAL_ROUNDS) return null;
  return {
    totalRounds: ECHO_SEQUENCE_TOTAL_ROUNDS,
    currentRoundIndex: Math.max(0, Math.floor(Number(s.currentRoundIndex) || 0)),
    rounds,
    clearedRounds: Array.isArray(s.clearedRounds) ? s.clearedRounds.map(n => Math.floor(Number(n))) : [],
    lastProcessedChoiceEventId: Math.max(0, Math.floor(Number(s.lastProcessedChoiceEventId) || 0)),
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

function publicRoundView(active) {
  const r = active.currentRoundIndex;
  const row = active.rounds[r] || null;
  if (!row) return null;
  return {
    roundIndex: r,
    revealMs: Math.floor(Number(row.revealMs) || 1500),
    correctSequence: Array.isArray(row.correctSequence) ? row.correctSequence : [],
    options: Array.isArray(row.options)
      ? row.options.map(o => ({ key: String(o.key || ""), seq: Array.isArray(o.seq) ? o.seq : [] }))
      : [],
  };
}

export async function buildEchoSequenceSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "echo_sequence") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_echo_sequence",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingChoice: null,
        choiceConflict: false,
        resolvedResult: null,
      },
    };
  }
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind =
      summary.terminalKind === "cashout" ? "cashout" : summary.terminalKind === "full_clear" ? "full_clear" : "wrong";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    return {
      ok: true,
      snapshot: {
        gameKey: "echo_sequence",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingChoice: null,
        choiceConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "wrong",
          finalRoundIndex: summary.finalRoundIndex != null ? Math.floor(Number(summary.finalRoundIndex)) : null,
          chosenOptionKey: summary.chosenOptionKey || null,
          correctOptionKey: summary.correctOptionKey || null,
          clearedRounds: Array.isArray(summary.clearedRounds) ? summary.clearedRounds : [],
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildEchoSequenceSettlementSummary({ terminalKind, payoutReturn, entryCost, fundingSource }),
        },
      },
    };
  }

  const active = parseEchoSequenceActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "echo_sequence",
        readState: "ready",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingChoice: null,
        choiceConflict: false,
        resolvedResult: null,
      },
    };
  }

  const choiceRead = await readEchoChoiceEventsAfter(supabase, sessionRow.id, active.lastProcessedChoiceEventId);
  if (!choiceRead.ok) return { ok: false, error: choiceRead.error };
  const forRound = choiceRead.rows.filter(
    r => Math.floor(Number(r?.event_payload?.roundIndex)) === active.currentRoundIndex,
  );
  const optionKeys = [...new Set(forRound.map(r => String(r?.event_payload?.optionKey || "")))].filter(Boolean);
  const choiceConflict = optionKeys.length > 1;
  let pendingChoice = null;
  if (!choiceConflict && optionKeys.length === 1) {
    const last = forRound[forRound.length - 1];
    pendingChoice = {
      roundIndex: active.currentRoundIndex,
      optionKey: optionKeys[0],
      choiceEventId: Number(last?.id || 0),
      choiceSubmittedAt: last?.created_at || null,
    };
  }
  const nums = buildEchoPlayingNumbers(entryCost, active.currentRoundIndex, active.clearedRounds.length);
  return {
    ok: true,
    snapshot: {
      gameKey: "echo_sequence",
      readState: choiceConflict ? "choice_conflict" : pendingChoice ? "choice_submitted" : "choice_required",
      canResolveTurn: Boolean(pendingChoice) && !choiceConflict,
      canCashOut: active.clearedRounds.length >= 1 && !pendingChoice && !choiceConflict,
      playing: {
        totalRounds: active.totalRounds,
        currentRoundIndex: active.currentRoundIndex,
        clearedRounds: active.clearedRounds,
        currentRound: publicRoundView(active),
        currentMultiplier: nums.currentMultiplier,
        nextMultiplier: nums.nextMultiplier,
        currentPayout: nums.currentPayout,
        nextPayout: nums.nextPayout,
        lastTurn: active.lastTurn,
      },
      pendingChoice,
      choiceConflict,
      resolvedResult: null,
    },
  };
}
