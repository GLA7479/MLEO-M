import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildCoreBalanceSettlementSummary,
  CORE_BALANCE_MIN_WAGER,
  payoutForCoreBalanceWin,
} from "../coreBalanceConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  advanceCoreBalanceTick,
  CORE_BALANCE_PHASE_ACTIVE,
  CORE_BALANCE_PHASE_RESOLVED,
  normalizeCoreBalanceAction,
  parseCoreBalanceActiveSummary,
} from "./coreBalanceEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= CORE_BALANCE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function coreBalanceTerminalPayloadFromRow(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const isWin = summary.terminalKind === "win";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind: isWin ? "win" : "lose",
    payoutReturn,
    isWin,
    failMeter: summary.failMeter || null,
    survivedTicks: Math.floor(Number(summary.survivedTicks) || 0),
    maxTicks: Math.floor(Number(summary.maxTicks) || 0),
    settlementSummary:
      summary.settlementSummary ||
      buildCoreBalanceSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

async function patchCoreBalanceActive(supabase, sessionId, playerRef, nextSummary) {
  const sessionUpdate = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: nextSummary,
    })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "core_balance")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
    .select("id,session_status,server_outcome_summary")
    .maybeSingle();

  if (sessionUpdate.error) return { ok: false, error: sessionUpdate.error };
  if (!sessionUpdate.data) return { ok: true, data: null };
  return { ok: true, data: sessionUpdate.data };
}

async function applyCoreBalanceResolved(supabase, sessionId, playerRef, resolvedSummary, eventPayload) {
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
    .select("id,session_status,resolved_at,server_outcome_summary")
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
 * @param {import("@supabase/supabase-js").SupabaseClient} supabase
 */
export async function coreBalanceStabilize(supabase, sessionRow, playerRef, actionRaw) {
  const active = parseCoreBalanceActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active core balance run." };
  }

  const action = normalizeCoreBalanceAction(actionRaw);
  if (!action) {
    return {
      ok: false,
      status: "invalid_request",
      message: "action must be vent, bleed, sink, or shunt.",
    };
  }

  const sessionId = sessionRow.id;
  const step = advanceCoreBalanceTick(sessionId, active, action);

  if (step.kind === "continue") {
    const nextSummary = {
      phase: CORE_BALANCE_PHASE_ACTIVE,
      tick: step.tick,
      maxTicks: active.maxTicks,
      heat: step.heat,
      pressure: step.pressure,
      charge: step.charge,
      criticalLow: active.criticalLow,
      criticalHigh: active.criticalHigh,
      safeLow: active.safeLow,
      safeHigh: active.safeHigh,
    };
    const patched = await patchCoreBalanceActive(supabase, sessionId, playerRef, nextSummary);
    if (!patched.ok) {
      return { ok: false, status: "update_failed", message: "Tick update failed.", error: patched.error };
    }
    if (!patched.data) {
      return { ok: false, status: "conflict", message: "State conflict; re-read session." };
    }
    const nextRow = {
      ...sessionRow,
      server_outcome_summary: nextSummary,
    };
    return { ok: true, outcome: "tick", row: nextRow, idempotent: false };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const isWin = step.kind === "win";
  const payoutReturn = isWin ? payoutForCoreBalanceWin(entryCost) : 0;
  const terminalKind = isWin ? "win" : "lose";
  const resolvedAt = new Date().toISOString();

  const settlementSummary = buildCoreBalanceSettlementSummary({
    terminalKind,
    payoutReturn,
    entryCost,
    fundingSource,
  });

  const resolvedSummary = {
    phase: CORE_BALANCE_PHASE_RESOLVED,
    terminalKind,
    payoutReturn,
    maxTicks: active.maxTicks,
    failMeter: step.failMeter || null,
    survivedTicks: step.tick,
    lastHeat: step.heat,
    lastPressure: step.pressure,
    lastCharge: step.charge,
    resolvedAt,
    settlementSummary,
  };

  const applied = await applyCoreBalanceResolved(supabase, sessionId, playerRef, resolvedSummary, {
    gameKey: "core_balance",
    action,
    terminalKind,
    payoutReturn,
    failMeter: step.failMeter,
  });

  if (!applied.ok) {
    return { ok: false, status: "update_failed", message: "Could not resolve session.", error: applied.error };
  }

  if (!applied.data) {
    const reRead = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
    });
    if (reRead.error) {
      return { ok: false, status: "unavailable", message: "Resolve raced; re-read failed." };
    }
    const row = Array.isArray(reRead.data) ? reRead.data[0] : reRead.data;
    if (row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { ok: true, outcome: "resolved", row, idempotent: true };
    }
    return { ok: false, status: "conflict", message: "Resolve conflict." };
  }

  const nextRow = {
    ...sessionRow,
    session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
    server_outcome_summary: resolvedSummary,
  };
  return { ok: true, outcome: "resolved", row: nextRow, idempotent: false };
}
