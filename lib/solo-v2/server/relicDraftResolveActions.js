import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildRelicDraftSettlementSummary,
  payoutForRelicDraftWin,
  RELIC_DRAFT_MIN_WAGER,
} from "../relicDraftConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  advanceRelicDraftRun,
  RELIC_DRAFT_PHASE_RESOLVED,
  normalizeRelicPickKey,
  parseRelicDraftActiveSummary,
} from "./relicDraftEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= RELIC_DRAFT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function relicDraftTerminalPayloadFromRow(sessionRow) {
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
    picks: Array.isArray(summary.picks) ? summary.picks : [],
    finalPayoutPercentBonus: Math.floor(Number(summary.finalPayoutPercentBonus) || 0),
    settlementSummary:
      summary.settlementSummary ||
      buildRelicDraftSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

async function patchRelicDraftActive(supabase, sessionId, playerRef, nextSummary) {
  const sessionUpdate = await supabase
    .from("solo_v2_sessions")
    .update({ server_outcome_summary: nextSummary })
    .eq("id", sessionId)
    .eq("player_ref", playerRef)
    .eq("game_key", "relic_draft")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
    .select("id,session_status,server_outcome_summary")
    .maybeSingle();

  if (sessionUpdate.error) return { ok: false, error: sessionUpdate.error };
  if (!sessionUpdate.data) return { ok: true, data: null };
  return { ok: true, data: sessionUpdate.data };
}

async function applyRelicDraftResolved(supabase, sessionId, playerRef, resolvedSummary, eventPayload) {
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
export async function relicDraftAdvance(supabase, sessionRow, playerRef, relicKeyRaw) {
  const active = parseRelicDraftActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active relic draft run." };
  }
  if (!active.awaitingPick) {
    return { ok: false, status: "conflict", message: "Not awaiting a relic pick." };
  }

  const offerKeys = active.offers.map(o => o.key).filter(Boolean);
  const relicKey = normalizeRelicPickKey(relicKeyRaw, offerKeys);
  if (!relicKey) {
    return { ok: false, status: "invalid_request", message: "relicKey must match one of the current offers." };
  }

  const sessionId = sessionRow.id;
  const out = advanceRelicDraftRun(sessionId, active, relicKey);
  if (out.kind === "error") {
    return { ok: false, status: "invalid_request", message: "Invalid relic." };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const resolvedAt = new Date().toISOString();

  if (out.kind === "lose") {
    const payoutReturn = 0;
    const settlementSummary = buildRelicDraftSettlementSummary({
      terminalKind: "lose",
      payoutReturn,
      entryCost,
      fundingSource,
    });
    const resolvedSummary = {
      phase: RELIC_DRAFT_PHASE_RESOLVED,
      terminalKind: "lose",
      payoutReturn,
      picks: out.picks,
      finalPayoutPercentBonus: out.payoutPercentBonus,
      lastEncounter: out.lastEncounter,
      resolvedAt,
      settlementSummary,
    };

    const applied = await applyRelicDraftResolved(supabase, sessionId, playerRef, resolvedSummary, {
      gameKey: "relic_draft",
      terminalKind: "lose",
      relicKey,
    });

    if (!applied.ok) {
      return { ok: false, status: "update_failed", message: "Could not resolve session.", error: applied.error };
    }
    if (!applied.data) {
      const reRead = await supabase.rpc("solo_v2_get_session", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
      });
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

  if (out.kind === "win") {
    const payoutReturn = payoutForRelicDraftWin(entryCost, out.payoutPercentBonus);
    const settlementSummary = buildRelicDraftSettlementSummary({
      terminalKind: "win",
      payoutReturn,
      entryCost,
      fundingSource,
    });
    const resolvedSummary = {
      phase: RELIC_DRAFT_PHASE_RESOLVED,
      terminalKind: "win",
      payoutReturn,
      picks: out.picks,
      finalPayoutPercentBonus: out.payoutPercentBonus,
      lastEncounter: out.lastEncounter,
      resolvedAt,
      settlementSummary,
    };

    const applied = await applyRelicDraftResolved(supabase, sessionId, playerRef, resolvedSummary, {
      gameKey: "relic_draft",
      terminalKind: "win",
      relicKey,
      payoutReturn,
    });

    if (!applied.ok) {
      return { ok: false, status: "update_failed", message: "Could not resolve session.", error: applied.error };
    }
    if (!applied.data) {
      const reRead = await supabase.rpc("solo_v2_get_session", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
      });
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

  const patched = await patchRelicDraftActive(supabase, sessionId, playerRef, out.nextSummary);

  if (!patched.ok) {
    return { ok: false, status: "update_failed", message: "Update failed.", error: patched.error };
  }
  if (!patched.data) {
    return { ok: false, status: "conflict", message: "State conflict." };
  }

  const nextRow = { ...sessionRow, server_outcome_summary: out.nextSummary };
  return { ok: true, outcome: "step", row: nextRow, lastEncounter: out.nextSummary.lastEncounter };
}
