import { randomInt } from "crypto";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildDropRunSessionSnapshot } from "../../../../lib/solo-v2/server/dropRunSnapshot";
import { computeDropRunPath, parseDropRunActiveSummary } from "../../../../lib/solo-v2/server/dropRunEngine";
import {
  buildDropRunSettlementSummary,
  DROP_RUN_MIN_WAGER,
  DROP_RUN_RELEASE_COLUMN,
  dropRunMultiplierForBay,
  normalizeDropRunGate,
} from "../../../../lib/solo-v2/dropRunConfig";
import { QUICK_FLIP_CONFIG } from "../../../../lib/solo-v2/quickFlipConfig";

function isMissingTable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42P01" ||
    code === "42883" ||
    message.includes("relation") ||
    message.includes("does not exist") ||
    message.includes("function") ||
    message.includes("rpc")
  );
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= DROP_RUN_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function createTerminalResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const terminalKind =
    summary.terminalKind === "cashout"
      ? "cashout"
      : summary.terminalKind === "full_clear"
        ? "full_clear"
        : "overload";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "overload",
    selectedGate: summary.selectedGate != null ? Number(summary.selectedGate) : null,
    driftPath: Array.isArray(summary.driftPath) ? summary.driftPath : [],
    pathPositions: Array.isArray(summary.pathPositions) ? summary.pathPositions : [],
    finalBay: summary.finalBay != null ? Number(summary.finalBay) : null,
    resolvedMultiplier: summary.resolvedMultiplier != null ? Number(summary.resolvedMultiplier) : null,
    won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
    overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildDropRunSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  const sessionId = parseSessionId(req.body?.sessionId);
  if (!sessionId) {
    return res.status(400).json({
      ok: false,
      category: "validation_error",
      status: "invalid_request",
      message: "Invalid sessionId",
    });
  }

  const playerRef = resolvePlayerRef(req);

  try {
    const supabase = getSupabaseAdmin();

    const sessionRead = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
    });

    if (sessionRead.error) {
      if (isMissingTable(sessionRead.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Drop Run resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Drop Run resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({
        ok: false,
        category: "validation_error",
        status: "not_found",
        message: "Session not found",
      });
    }

    if (sessionRow.game_key !== "drop_run") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be drop_run",
      });
    }

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: createTerminalResolvedPayload(sessionRow),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: `Session state ${sessionRow.session_status} cannot resolve.`,
      });
    }

    const snapshotResult = await buildDropRunSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Drop Run resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Drop Run resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (snap0.gateConflict) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "gate_conflict",
        message: "Conflicting drop events — refresh session state.",
      });
    }

    if (!snap0.pendingGate) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "gate_required",
        message: "Nothing to resolve — start a drop first.",
      });
    }

    if (!snap0.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "gate_required",
        message: "No pending gate to resolve.",
      });
    }

    const pending = snap0.pendingGate;
    const gateEventId = Number(pending.gateEventId);
    const pendingGateOk = normalizeDropRunGate(pending.gate);

    if (!Number.isFinite(gateEventId) || gateEventId <= 0 || pendingGateOk === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid pending drop event.",
      });
    }

    const active = parseDropRunActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Drop Run state.",
      });
    }

    const releaseColumn = DROP_RUN_RELEASE_COLUMN;
    const { driftPath, pathPositions, finalBay } = computeDropRunPath(releaseColumn, randomInt);
    const selectedGate = releaseColumn;
    const mult = dropRunMultiplierForBay(finalBay);
    const payoutReturn = Math.max(0, Math.floor(entryCost * mult));
    const terminalKind = payoutReturn > 0 ? "full_clear" : "overload";
    const resolvedAt = new Date().toISOString();

    const resolvedSummary = {
      phase: "drop_run_resolved",
      terminalKind,
      payoutReturn,
      selectedGate,
      driftPath,
      pathPositions,
      finalBay,
      resolvedMultiplier: mult,
      won: payoutReturn > 0,
      overloadReason: payoutReturn > 0 ? null : "drop_run_dead_zone",
      resolvedAt,
      settlementSummary: buildDropRunSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
      stats: "deferred",
    };

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
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Drop Run resolve update failed.",
      });
    }

    if (!sessionUpdate.data) {
      const again = await supabase.rpc("solo_v2_get_session", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
      });
      const row2 = Array.isArray(again.data) ? again.data[0] : again.data;
      if (row2?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "resolved",
          idempotent: true,
          result: createTerminalResolvedPayload(row2),
          authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
        });
      }
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "resolve_conflict",
        message: "Session changed during resolve.",
      });
    }

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "resolved",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
        terminalKind,
        payoutReturn,
        isWin: terminalKind !== "overload",
        selectedGate,
        driftPath,
        pathPositions,
        finalBay,
        resolvedMultiplier: mult,
        won: payoutReturn > 0,
        settlementSummary: resolvedSummary.settlementSummary,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/drop-run/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Drop Run resolve failed",
    });
  }
}
