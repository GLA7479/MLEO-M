import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildSurgeCashoutSettlementSummary,
  payoutForSurgeCashout,
  SURGE_CASHOUT_MIN_WAGER,
} from "../surgeCashoutConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  computeRawMultiplierAt,
  isSurgePastCrash,
  parseSurgeCashoutLiveSummary,
  parseSurgeCashoutPreSummary,
  SURGE_PHASE_RESOLVED,
  sampleCrashMultiplierHundredths,
  buildSurgeCashoutLiveSummary,
} from "./surgeCashoutEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SURGE_CASHOUT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function fetchSessionRow(supabase, sessionId, playerRef) {
  const sessionRead = await supabase.rpc("solo_v2_get_session", {
    p_session_id: sessionId,
    p_player_ref: playerRef,
  });
  if (sessionRead.error) return { ok: false, error: sessionRead.error };
  const row = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
  return { ok: true, row };
}

function buildCrashPayload(sessionRow, live, resolvedAt) {
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const payoutReturn = 0;
  const resolvedSummary = {
    phase: SURGE_PHASE_RESOLVED,
    terminalKind: "bust",
    payoutReturn,
    crashMultiplier: live.crashMultiplier,
    cashMultiplier: null,
    resolvedAt,
    settlementSummary: buildSurgeCashoutSettlementSummary({
      terminalKind: "bust",
      payoutReturn,
      entryCost,
      fundingSource,
    }),
    stats: "deferred",
  };
  return { resolvedSummary, entryCost, fundingSource };
}

function buildCashoutPayload(sessionRow, live, mult, resolvedAt) {
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const payoutReturn = payoutForSurgeCashout(entryCost, mult);
  const resolvedSummary = {
    phase: SURGE_PHASE_RESOLVED,
    terminalKind: "cashout",
    payoutReturn,
    crashMultiplier: live.crashMultiplier,
    cashMultiplier: mult,
    resolvedAt,
    settlementSummary: buildSurgeCashoutSettlementSummary({
      terminalKind: "cashout",
      payoutReturn,
      entryCost,
      fundingSource,
    }),
    stats: "deferred",
  };
  return { resolvedSummary, payoutReturn };
}

async function applyResolvedSummary(supabase, sessionId, playerRef, resolvedSummary, eventPayload) {
  const resolvedAt = resolvedSummary.resolvedAt;
  const sessionUpdate = await supabase
    .from("solo_v2_sessions")
    .update({
      session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
      resolved_at: resolvedAt,
      server_outcome_summary: resolvedSummary,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .neq("session_status", SOLO_V2_SESSION_STATUS.RESOLVED)
    .select("id,session_status,resolved_at,server_outcome_summary,entry_amount,session_mode,game_key")
    .maybeSingle();

  if (sessionUpdate.error) {
    return { ok: false, error: sessionUpdate.error, data: null };
  }
  if (!sessionUpdate.data) {
    return { ok: true, data: null };
  }

  await supabase.rpc("solo_v2_append_session_event", {
    p_session_id: sessionId,
    p_player_ref: playerRef,
    p_event_type: "session_note",
    p_event_payload: eventPayload,
  });

  return { ok: true, data: sessionUpdate.data };
}

/**
 * If the live curve has reached the crash threshold, resolve as a loss. Returns fresh row when updated.
 */
export async function surgeCashoutTryAutoCrash(supabase, sessionRow, playerRef) {
  if (!sessionRow || sessionRow.game_key !== "surge_cashout") {
    return { updatedRow: null };
  }
  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    return { updatedRow: null };
  }

  const live = parseSurgeCashoutLiveSummary(sessionRow.server_outcome_summary);
  if (!live) return { updatedRow: null };

  const now = Date.now();
  if (!isSurgePastCrash(live, now)) {
    return { updatedRow: null };
  }

  const sessionId = sessionRow.id;
  const resolvedAt = new Date().toISOString();
  const { resolvedSummary } = buildCrashPayload(sessionRow, live, resolvedAt);

  const applied = await applyResolvedSummary(supabase, sessionId, playerRef, resolvedSummary, {
    gameKey: "surge_cashout",
    action: "auto_crash",
    crashMultiplier: live.crashMultiplier,
    settlement: "deferred",
  });

  if (!applied.ok) {
    return { updatedRow: null, error: applied.error };
  }
  if (!applied.data) {
    const again = await fetchSessionRow(supabase, sessionId, playerRef);
    if (again.ok && again.row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { updatedRow: again.row };
    }
    return { updatedRow: null };
  }

  const fresh = await fetchSessionRow(supabase, sessionId, playerRef);
  return { updatedRow: fresh.ok ? fresh.row : applied.data };
}

export async function surgeCashoutLaunchRound(supabase, sessionRow, playerRef) {
  const pre = parseSurgeCashoutPreSummary(sessionRow.server_outcome_summary);
  if (!pre) {
    return { ok: false, status: "invalid_state", message: "Surge is not waiting to launch." };
  }

  const crashHundredths = sampleCrashMultiplierHundredths();
  const startedAtMs = Date.now();
  const liveSummary = buildSurgeCashoutLiveSummary(crashHundredths, startedAtMs);

  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: liveSummary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionRow.id)
    .eq("player_ref", playerRef)
    .eq("game_key", "surge_cashout")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    return { ok: false, status: "unavailable", message: "Launch update failed." };
  }

  await supabase.rpc("solo_v2_append_session_event", {
    p_session_id: sessionRow.id,
    p_player_ref: playerRef,
    p_event_type: "session_note",
    p_event_payload: {
      gameKey: "surge_cashout",
      action: "launch",
      settlement: "deferred",
    },
  });

  return { ok: true };
}

const CASHOUT_EPS = 1e-7;

export async function surgeCashoutCashOut(supabase, sessionRow, playerRef) {
  const live = parseSurgeCashoutLiveSummary(sessionRow.server_outcome_summary);
  if (!live) {
    return { ok: false, status: "invalid_state", message: "Surge is not live." };
  }

  const now = Date.now();
  if (isSurgePastCrash(live, now)) {
    return { ok: false, status: "too_late", message: "Already crashed." };
  }

  const rawMult = computeRawMultiplierAt(live.startedAtMs, now, live.risePerSecond);
  if (rawMult + CASHOUT_EPS >= live.crashMultiplier) {
    return { ok: false, status: "too_late", message: "Crash reached." };
  }

  const resolvedAt = new Date().toISOString();
  const { resolvedSummary, payoutReturn } = buildCashoutPayload(sessionRow, live, rawMult, resolvedAt);

  const applied = await applyResolvedSummary(supabase, sessionRow.id, playerRef, resolvedSummary, {
    gameKey: "surge_cashout",
    action: "cashout",
    cashMultiplier: rawMult,
    payoutReturn,
    settlement: "deferred",
  });

  if (!applied.ok) {
    return { ok: false, status: "unavailable", message: "Cash out update failed." };
  }

  if (!applied.data) {
    const again = await fetchSessionRow(supabase, sessionRow.id, playerRef);
    if (again.ok && again.row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { ok: true, idempotent: true, row: again.row };
    }
    return { ok: false, status: "conflict", message: "Session changed during cash out." };
  }

  const fresh = await fetchSessionRow(supabase, sessionRow.id, playerRef);
  return { ok: true, idempotent: false, row: fresh.ok ? fresh.row : applied.data };
}

export function surgeCashoutTerminalPayloadFromRow(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const terminalKind = summary.terminalKind === "cashout" ? "cashout" : "bust";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "bust",
    cashMultiplier: summary.cashMultiplier != null ? Number(summary.cashMultiplier) : null,
    crashMultiplier: summary.crashMultiplier != null ? Number(summary.crashMultiplier) : null,
    settlementSummary:
      summary.settlementSummary ||
      buildSurgeCashoutSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}
