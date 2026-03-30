import { randomInt } from "crypto";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildSoloLadderSessionSnapshot,
  parseSoloLadderActiveSummary,
} from "../../../../lib/solo-v2/server/soloLadderSnapshot";
import {
  buildSoloLadderSettlementSummary,
  payoutForSoloLadder,
  SOLO_LADDER_MIN_WAGER,
  SOLO_LADDER_STEP_COUNT,
  SOLO_LADDER_STEP_SUCCESS_PROB,
  soloLadderMultiplierAfterSuccesses,
} from "../../../../lib/solo-v2/soloLadderConfig";
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
  return stake >= SOLO_LADDER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
        : "bust";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "bust",
    successCount: summary.successCount != null ? Math.floor(Number(summary.successCount)) : null,
    failedAtStep: summary.failedAtStep != null ? Math.floor(Number(summary.failedAtStep)) : null,
    settlementSummary:
      summary.settlementSummary ||
      buildSoloLadderSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

function rollStepSuccess(stepIndex) {
  const idx = Math.floor(Number(stepIndex));
  if (idx < 0 || idx >= SOLO_LADDER_STEP_SUCCESS_PROB.length) return false;
  const p = SOLO_LADDER_STEP_SUCCESS_PROB[idx];
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return false;
  const threshold = Math.floor(p * 10_000);
  const draw = randomInt(0, 10_000);
  return draw < threshold;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  const sessionId = parseSessionId(req.body?.sessionId);
  if (!sessionId) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  }

  const actionRaw = String(req.body?.action || "").trim().toLowerCase();
  const isCashOut = actionRaw === "cashout";
  const isClimb = actionRaw === "climb";

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
          message: "Solo V2 Ladder resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Ladder resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "solo_ladder") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be solo_ladder",
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

    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (isCashOut) {
      const snapResult = await buildSoloLadderSessionSnapshot(supabase, sessionRow);
      if (!snapResult.snapshot.canCashOut) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "cashout_not_allowed",
          message: "Cash out is not available until you complete at least one successful step.",
        });
      }

      const active = parseSoloLadderActiveSummary(sessionRow);
      if (!active || active.successCount < 1) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no cashable ladder state.",
        });
      }

      const mult = soloLadderMultiplierAfterSuccesses(active.successCount);
      if (mult == null) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Invalid multiplier state.",
        });
      }

      const payoutReturn = payoutForSoloLadder(entryCost, mult);
      const resolvedAt = new Date().toISOString();

      const resolvedSummary = {
        phase: "solo_ladder_resolved",
        terminalKind: "cashout",
        payoutReturn,
        successCount: active.successCount,
        resolvedAt,
        settlementSummary: buildSoloLadderSettlementSummary({
          terminalKind: "cashout",
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
          message: "Ladder cash out update failed.",
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
          message: "Session changed during cash out.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "solo_ladder",
          action: "cashout",
          payoutReturn,
          settlement: "deferred",
        },
      });

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: false,
        result: createTerminalResolvedPayload({
          ...sessionRow,
          session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
          resolved_at: resolvedAt,
          server_outcome_summary: resolvedSummary,
        }),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (!isClimb) {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: "action must be climb or cashout",
      });
    }

    const active = parseSoloLadderActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Ladder state.",
      });
    }

    if (active.successCount >= SOLO_LADDER_STEP_COUNT) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Ladder already cleared.",
      });
    }

    const stepIdx = active.successCount;
    const success = rollStepSuccess(stepIdx);
    const resolvedAt = new Date().toISOString();

    if (!success) {
      const payoutReturn = 0;
      const resolvedSummary = {
        phase: "solo_ladder_resolved",
        terminalKind: "bust",
        payoutReturn,
        successCount: active.successCount,
        failedAtStep: stepIdx + 1,
        resolvedAt,
        settlementSummary: buildSoloLadderSettlementSummary({
          terminalKind: "bust",
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

      if (sessionUpdate.error || !sessionUpdate.data) {
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
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Ladder bust update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "solo_ladder",
          action: "climb_resolve",
          outcome: "bust",
          stepIndex: stepIdx,
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
          terminalKind: "bust",
          outcome: "bust",
          successCount: active.successCount,
          failedAtStep: resolvedSummary.failedAtStep,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newSuccess = active.successCount + 1;

    if (newSuccess >= SOLO_LADDER_STEP_COUNT) {
      const mult = soloLadderMultiplierAfterSuccesses(newSuccess);
      const payoutReturn = mult != null ? payoutForSoloLadder(entryCost, mult) : 0;
      const resolvedSummary = {
        phase: "solo_ladder_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        successCount: newSuccess,
        resolvedAt,
        settlementSummary: buildSoloLadderSettlementSummary({
          terminalKind: "full_clear",
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

      if (sessionUpdate.error || !sessionUpdate.data) {
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
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Ladder top update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "solo_ladder",
          action: "climb_resolve",
          outcome: "full_clear",
          successCount: newSuccess,
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
          terminalKind: "full_clear",
          outcome: "safe",
          successCount: newSuccess,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const mult = soloLadderMultiplierAfterSuccesses(newSuccess);
    const securedPayout = mult != null ? payoutForSoloLadder(entryCost, mult) : 0;

    const newActiveSummary = {
      phase: "solo_ladder_active",
      stepCount: SOLO_LADDER_STEP_COUNT,
      successCount: newSuccess,
    };

    const sessionUpdate = await supabase
      .from("solo_v2_sessions")
      .update({
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        server_outcome_summary: newActiveSummary,
      })
      .eq("id", sessionId)
      .eq("player_ref", playerRef)
      .eq("game_key", "solo_ladder")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Ladder step update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "solo_ladder",
        action: "climb_resolve",
        outcome: "safe",
        successCount: newSuccess,
        settlement: "deferred",
      },
    });

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "turn_complete",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        outcome: "safe",
        successCount: newSuccess,
        securedMultiplier: mult,
        securedPayout,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/solo-ladder/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Ladder resolve failed",
    });
  }
}
