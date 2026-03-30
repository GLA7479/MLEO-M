import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildRailLogicSettlementSummary,
  payoutForRailLogic,
  RAIL_LOGIC_MIN_WAGER,
} from "../railLogicConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import {
  parseRailLogicActiveSummary,
  railPathExists,
  RAIL_PHASE_RESOLVED,
  RAIL_PHASE_ACTIVE,
} from "./railLogicEngine";
import { RAIL_TILE_EMPTY } from "../railLogicConstants";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= RAIL_LOGIC_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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

export function railLogicTerminalPayloadFromRow(sessionRow) {
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
    settlementSummary:
      summary.settlementSummary ||
      buildRailLogicSettlementSummary({
        terminalKind: isWin ? "win" : "lose",
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
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

export async function railLogicRotateCell(supabase, sessionRow, playerRef, cellIndexRaw) {
  const active = parseRailLogicActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active rail puzzle." };
  }

  const cellIndex = Math.floor(Number(cellIndexRaw));
  const len = active.gridW * active.gridH;
  if (!Number.isFinite(cellIndex) || cellIndex < 0 || cellIndex >= len) {
    return { ok: false, status: "invalid_request", message: "Bad cell index." };
  }

  if (active.types[cellIndex] === RAIL_TILE_EMPTY) {
    return { ok: false, status: "invalid_request", message: "Empty cell cannot rotate." };
  }

  if (active.movesUsed >= active.maxMoves) {
    return { ok: false, status: "no_moves", message: "Move limit reached — submit or forfeit." };
  }

  const nextRot = [...active.rotations];
  nextRot[cellIndex] = (Math.floor(Number(nextRot[cellIndex]) || 0) + 1) % 4;
  const nextMoves = active.movesUsed + 1;

  const nextSummary = {
    ...sessionRow.server_outcome_summary,
    phase: RAIL_PHASE_ACTIVE,
    rotations: nextRot,
    movesUsed: nextMoves,
  };

  const { error } = await supabase
    .from("solo_v2_sessions")
    .update({
      server_outcome_summary: nextSummary,
      session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
    })
    .eq("id", sessionRow.id)
    .eq("player_ref", playerRef)
    .eq("game_key", "rail_logic")
    .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS]);

  if (error) {
    return { ok: false, status: "unavailable", message: "Rotate update failed." };
  }

  await supabase.rpc("solo_v2_append_session_event", {
    p_session_id: sessionRow.id,
    p_player_ref: playerRef,
    p_event_type: "session_note",
    p_event_payload: {
      gameKey: "rail_logic",
      action: "rotate",
      cellIndex,
      movesUsed: nextMoves,
    },
  });

  return { ok: true };
}

export async function railLogicSubmitRoute(supabase, sessionRow, playerRef) {
  const active = parseRailLogicActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active rail puzzle." };
  }

  const okPath = railPathExists(
    active.gridW,
    active.gridH,
    active.types,
    active.rotations,
    active.startIdx,
    active.endIdx,
    active.startGate,
    active.endGate,
  );

  if (!okPath) {
    return { ok: true, outcome: "not_solved" };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const payoutReturn = payoutForRailLogic(entryCost);
  const resolvedAt = new Date().toISOString();

  const resolvedSummary = {
    phase: RAIL_PHASE_RESOLVED,
    terminalKind: "win",
    payoutReturn,
    resolvedAt,
    settlementSummary: buildRailLogicSettlementSummary({
      terminalKind: "win",
      payoutReturn,
      entryCost,
      fundingSource,
    }),
    stats: "deferred",
  };

  const applied = await applyResolvedSummary(supabase, sessionRow.id, playerRef, resolvedSummary, {
    gameKey: "rail_logic",
    action: "submit_win",
    payoutReturn,
    settlement: "deferred",
  });

  if (!applied.ok) {
    return { ok: false, status: "unavailable", message: "Resolve update failed." };
  }

  if (!applied.data) {
    const again = await fetchSessionRow(supabase, sessionRow.id, playerRef);
    if (again.ok && again.row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { ok: true, outcome: "resolved", row: again.row };
    }
    return { ok: false, status: "conflict", message: "Session changed during submit." };
  }

  const fresh = await fetchSessionRow(supabase, sessionRow.id, playerRef);
  return { ok: true, outcome: "resolved", row: fresh.ok ? fresh.row : applied.data };
}

export async function railLogicForfeit(supabase, sessionRow, playerRef) {
  const active = parseRailLogicActiveSummary(sessionRow.server_outcome_summary);
  if (!active) {
    return { ok: false, status: "invalid_state", message: "No active rail puzzle." };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const payoutReturn = 0;
  const resolvedAt = new Date().toISOString();

  const resolvedSummary = {
    phase: RAIL_PHASE_RESOLVED,
    terminalKind: "lose",
    payoutReturn,
    resolvedAt,
    settlementSummary: buildRailLogicSettlementSummary({
      terminalKind: "lose",
      payoutReturn,
      entryCost,
      fundingSource,
    }),
    stats: "deferred",
  };

  const applied = await applyResolvedSummary(supabase, sessionRow.id, playerRef, resolvedSummary, {
    gameKey: "rail_logic",
    action: "forfeit",
    settlement: "deferred",
  });

  if (!applied.ok) {
    return { ok: false, status: "unavailable", message: "Forfeit update failed." };
  }

  if (!applied.data) {
    const again = await fetchSessionRow(supabase, sessionRow.id, playerRef);
    if (again.ok && again.row?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return { ok: true, row: again.row };
    }
    return { ok: false, status: "conflict", message: "Session changed during forfeit." };
  }

  const fresh = await fetchSessionRow(supabase, sessionRow.id, playerRef);
  return { ok: true, row: fresh.ok ? fresh.row : applied.data };
}
