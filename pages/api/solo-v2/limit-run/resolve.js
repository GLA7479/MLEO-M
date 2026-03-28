import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildLimitRunSessionSnapshot,
  parseLimitRunActiveSummary,
} from "../../../../lib/solo-v2/server/limitRunSnapshot";
import { limboRollWins, rollLimboMultiplier } from "../../../../lib/solo-v2/server/limitRunEngine";
import {
  buildLimitRunSettlementSummary,
  LIMIT_RUN_MIN_WAGER,
  limboProjectedPayout,
} from "../../../../lib/solo-v2/limitRunConfig";
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
  return stake >= LIMIT_RUN_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
    rollMultiplier: summary.rollMultiplier != null ? Number(summary.rollMultiplier) : null,
    targetMultiplier: summary.targetMultiplier != null ? Number(summary.targetMultiplier) : null,
    won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
    overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildLimitRunSettlementSummary({
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

  const actionRaw = String(req.body?.action || "").trim().toLowerCase();
  if (actionRaw === "cashout") {
    return res.status(409).json({
      ok: false,
      category: "conflict",
      status: "cashout_not_allowed",
      message: "Cash out is not available for Limit Run.",
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
          message: "Solo V2 Limit Run resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Limit Run resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "limit_run") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be limit_run",
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

    const snapshotResult = await buildLimitRunSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Limit Run resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Limit Run resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (snap0.rollConflict) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "roll_conflict",
        message: "Conflicting roll events — refresh session state.",
      });
    }

    if (!snap0.pendingRoll) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "roll_required",
        message: "Submit a roll before resolving.",
      });
    }

    if (!snap0.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "roll_required",
        message: "No pending roll to resolve.",
      });
    }

    const active = parseLimitRunActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Limit Run state.",
      });
    }

    const pending = snap0.pendingRoll;
    const rollEventId = Number(pending.rollEventId);
    const targetMultiplier = Number(pending.targetMultiplier);

    if (!Number.isFinite(rollEventId) || rollEventId <= 0 || !Number.isFinite(targetMultiplier)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid pending roll.",
      });
    }

    const rollMultiplier = rollLimboMultiplier();
    const won = limboRollWins(rollMultiplier, targetMultiplier);
    const payoutReturn = won ? limboProjectedPayout(entryCost, targetMultiplier) : 0;
    const terminalKind = won ? "full_clear" : "overload";
    const resolvedAt = new Date().toISOString();

    const resolvedSummary = {
      phase: "limit_run_resolved",
      terminalKind,
      payoutReturn,
      rollMultiplier,
      targetMultiplier,
      won,
      overloadReason: won ? null : "limbo_miss",
      resolvedAt,
      settlementSummary: buildLimitRunSettlementSummary({
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
        message: "Limit Run resolve update failed.",
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

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "limit_run",
        action: "limbo_resolve",
        rollEventId,
        rollMultiplier,
        targetMultiplier,
        won,
        payoutReturn,
        settlement: "deferred",
      },
    });

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "resolved",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
        terminalKind,
        rollMultiplier,
        targetMultiplier,
        won,
        isWin: won,
        payoutReturn,
        settlementSummary: resolvedSummary.settlementSummary,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/limit-run/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Limit Run resolve failed",
    });
  }
}
