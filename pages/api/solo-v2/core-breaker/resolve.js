import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildCoreBreakerSessionSnapshot } from "../../../../lib/solo-v2/server/coreBreakerSnapshot";
import {
  applyMultForOutcome,
  parseCoreBreakerActiveSummary,
} from "../../../../lib/solo-v2/server/coreBreakerEngine";
import {
  buildCoreBreakerSettlementSummary,
  CORE_BREAKER_MIN_WAGER,
  CORE_BREAKER_STRIKE_STEPS,
  normalizeCoreBreakerColumn,
} from "../../../../lib/solo-v2/coreBreakerConfig";
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
  return stake >= CORE_BREAKER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function createTerminalResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const terminalKind = summary.terminalKind === "full_clear" ? "full_clear" : "overload";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind === "full_clear" && payoutReturn > 0,
    multBpsEnd: summary.multBpsEnd != null ? Number(summary.multBpsEnd) : null,
    gemsCollected: summary.gemsCollected != null ? Math.floor(Number(summary.gemsCollected)) : null,
    strikeHistory: Array.isArray(summary.strikeHistory) ? summary.strikeHistory : [],
    won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
    overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildCoreBreakerSettlementSummary({
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
          message: "Solo V2 Core Breaker resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Core Breaker resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "core_breaker") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be core_breaker",
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

    const snapshotResult = await buildCoreBreakerSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Core Breaker resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Core Breaker resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (snap0.pickConflict) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "strike_conflict",
        message: "Conflicting strike events — refresh session state.",
      });
    }

    if (!snap0.pendingPick) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "strike_required",
        message: "Submit a strike before resolving.",
      });
    }

    if (!snap0.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "strike_required",
        message: "No pending strike to resolve.",
      });
    }

    const active = parseCoreBreakerActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Core Breaker state.",
      });
    }

    const pending = snap0.pendingPick;
    const pickEventId = Number(pending.pickEventId);
    const column = normalizeCoreBreakerColumn(pending.column);

    if (!Number.isFinite(pickEventId) || pickEventId <= 0 || column === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid pending strike.",
      });
    }

    const step = active.currentStepIndex;
    if (step < 0 || step >= CORE_BREAKER_STRIKE_STEPS) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Strike step out of range.",
      });
    }

    const rowTypes = active.strikePlan[step];
    const outcome = String(rowTypes[column] || "");

    if (outcome === "unstable") {
      const payoutReturn = 0;
      const terminalKind = "overload";
      const resolvedAt = new Date().toISOString();
      const prevHistory = Array.isArray(active.strikeHistory) ? [...active.strikeHistory] : [];
      const resolvedSummary = {
        phase: "core_breaker_resolved",
        terminalKind,
        payoutReturn,
        multBpsEnd: active.multBps,
        gemsCollected: active.gemsCollected,
        strikeHistory: [...prevHistory, { column, outcome: "unstable", stepIndex: step }],
        won: false,
        overloadReason: "core_shatter",
        resolvedAt,
        settlementSummary: buildCoreBreakerSettlementSummary({
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
          message: "Core Breaker resolve update failed.",
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
          column,
          outcome: "unstable",
          stepIndex: step,
          won: false,
          isWin: false,
          payoutReturn,
          strikeHistory: resolvedSummary.strikeHistory,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    let nextMultBps = applyMultForOutcome(active.multBps, outcome);
    let nextGems = active.gemsCollected;
    if (outcome === "gem") nextGems += 1;

    const prevHistory = Array.isArray(active.strikeHistory) ? [...active.strikeHistory] : [];
    const newHistory = [...prevHistory, { column, outcome, stepIndex: step }];
    const nextStep = step + 1;

    if (nextStep >= CORE_BREAKER_STRIKE_STEPS) {
      const payoutReturn = Math.max(0, Math.floor((entryCost * nextMultBps) / 10000));
      const terminalKind = "full_clear";
      const resolvedAt = new Date().toISOString();

      const resolvedSummary = {
        phase: "core_breaker_resolved",
        terminalKind,
        payoutReturn,
        multBpsEnd: nextMultBps,
        gemsCollected: nextGems,
        strikeHistory: newHistory,
        won: true,
        overloadReason: null,
        resolvedAt,
        settlementSummary: buildCoreBreakerSettlementSummary({
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
          message: "Core Breaker win update failed.",
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
          column,
          outcome,
          stepIndex: step,
          won: true,
          isWin: true,
          payoutReturn,
          multBpsEnd: nextMultBps,
          gemsCollected: nextGems,
          strikeHistory: newHistory,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const continuingSummary = {
      phase: "core_breaker_active",
      strikePlan: active.strikePlan,
      currentStepIndex: nextStep,
      multBps: nextMultBps,
      gemsCollected: nextGems,
      strikeHistory: newHistory,
      lastProcessedPickEventId: pickEventId,
    };

    const contUpdate = await supabase
      .from("solo_v2_sessions")
      .update({
        server_outcome_summary: continuingSummary,
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
      })
      .eq("id", sessionId)
      .eq("player_ref", playerRef)
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (contUpdate.error) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Core Breaker continue update failed.",
      });
    }

    if (!contUpdate.data) {
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
      status: "in_progress",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        column,
        outcome,
        stepIndex: step,
        currentStepIndex: nextStep,
        multBps: nextMultBps,
        gemsCollected: nextGems,
        strikeHistory: newHistory,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/core-breaker/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Core Breaker resolve failed",
    });
  }
}
