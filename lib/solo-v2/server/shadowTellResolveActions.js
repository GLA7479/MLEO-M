import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import { buildShadowTellSettlementSummary, SHADOW_TELL_MIN_WAGER } from "../shadowTellConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  computeShadowTellResolution,
  normalizeShadowTellChoice,
  parseShadowTellActiveSummary,
  SHADOW_TELL_PHASE_RESOLVED,
} from "./shadowTellEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SHADOW_TELL_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function shadowTellTerminalPayloadFromRow(sessionRow) {
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
    playerChoice: summary.playerChoice || null,
    revealedProfile: summary.revealedProfile || null,
    settlementSummary:
      summary.settlementSummary ||
      buildShadowTellSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

async function applyShadowTellResolved(supabase, sessionId, playerRef, resolvedSummary, eventPayload) {
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
export async function shadowTellDecide(supabase, sessionRow, playerRef, choiceRaw) {
  const active = parseShadowTellActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active shadow tell round." };
  }

  const choice = normalizeShadowTellChoice(choiceRaw);
  if (!choice) {
    return { ok: false, status: "invalid_request", message: "choice must be challenge, safe, or middle." };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const { payoutReturn, terminalKind } = computeShadowTellResolution(
    entryCost,
    active.opponentProfile,
    choice,
  );

  const resolvedAt = new Date().toISOString();
  const settlementSummary = buildShadowTellSettlementSummary({
    terminalKind,
    payoutReturn,
    entryCost,
    fundingSource,
  });

  const resolvedSummary = {
    phase: SHADOW_TELL_PHASE_RESOLVED,
    terminalKind,
    payoutReturn,
    playerChoice: choice,
    revealedProfile: active.opponentProfile,
    resolvedAt,
    settlementSummary,
  };

  const applied = await applyShadowTellResolved(supabase, sessionRow.id, playerRef, resolvedSummary, {
    gameKey: "shadow_tell",
    choice,
    revealedProfile: active.opponentProfile,
    terminalKind,
    payoutReturn,
  });

  if (!applied.ok) {
    return { ok: false, status: "update_failed", message: "Could not resolve session.", error: applied.error };
  }

  if (!applied.data) {
    const reRead = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionRow.id,
      p_player_ref: playerRef,
    });
    if (reRead.error) {
      return { ok: false, status: "unavailable", message: "Resolve raced; re-read failed." };
    }
    const row = Array.isArray(reRead.data) ? reRead.data[0] : reRead.data;
    if (row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { ok: true, row, idempotent: true };
    }
    return { ok: false, status: "conflict", message: "Decision already recorded." };
  }

  const nextRow = { ...sessionRow, session_status: SOLO_V2_SESSION_STATUS.RESOLVED, server_outcome_summary: resolvedSummary };
  return { ok: true, row: nextRow, idempotent: false };
}
