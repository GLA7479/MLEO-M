import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildSpeedTrackSessionSnapshot,
  parseSpeedTrackActiveSummary,
} from "../../../../lib/solo-v2/server/speedTrackSnapshot";
import { isRouteBlockedAtCheckpoint } from "../../../../lib/solo-v2/server/speedTrackEngine";
import {
  buildSpeedTrackSettlementSummary,
  SPEED_TRACK_CHECKPOINT_COUNT,
  SPEED_TRACK_MIN_WAGER,
  SPEED_TRACK_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../../../../lib/solo-v2/speedTrackConfig";
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
  return stake >= SPEED_TRACK_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
        : "blocked";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "blocked",
    finalCheckpointIndex:
      summary.finalCheckpointIndex != null ? Math.floor(Number(summary.finalCheckpointIndex)) : null,
    lastPickRoute: summary.lastPickRoute != null ? Math.floor(Number(summary.lastPickRoute)) : null,
    blockedRoute: summary.blockedRoute != null ? Math.floor(Number(summary.blockedRoute)) : null,
    blockedRoutes: Array.isArray(summary.blockedRoutes) ? summary.blockedRoutes : null,
    routeHistory: Array.isArray(summary.routeHistory) ? summary.routeHistory : [],
    clearedCheckpoints: Array.isArray(summary.clearedCheckpoints) ? summary.clearedCheckpoints : [],
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildSpeedTrackSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

function topLadderMultiplier() {
  return SPEED_TRACK_MULTIPLIER_LADDER[SPEED_TRACK_MULTIPLIER_LADDER.length - 1];
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
  const isCashOut = actionRaw === "cashout";

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
          message: "Solo V2 Speed Track resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Speed Track resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "speed_track") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be speed_track",
      });
    }

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: createTerminalResolvedPayload(sessionRow),
        authority: {
          outcomeTruth: "server",
          settlement: "deferred",
          stats: "deferred",
        },
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

    const snapshotResult = await buildSpeedTrackSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Speed Track resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Speed Track resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (isCashOut) {
      if (!snap0.canCashOut) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "cashout_not_allowed",
          message: "Cash out is not available for this session state.",
        });
      }

      const activeCash = parseSpeedTrackActiveSummary(sessionRow);
      if (!activeCash) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no active Speed Track state.",
        });
      }

      const clearedLen = activeCash.clearedCheckpoints.length;
      const securedMultiplier =
        clearedLen > 0 ? SPEED_TRACK_MULTIPLIER_LADDER[clearedLen - 1] : 1;
      const payoutReturn = payoutForMultiplier(entryCost, securedMultiplier);
      const resolvedAt = new Date().toISOString();
      const clearedSnapshot = [...activeCash.clearedCheckpoints.map(c => Math.floor(Number(c)))].filter(
        n => Number.isFinite(n) && n >= 0 && n < SPEED_TRACK_CHECKPOINT_COUNT,
      );

      const resolvedSummary = {
        phase: "speed_track_resolved",
        terminalKind: "cashout",
        payoutReturn,
        finalCheckpointIndex: activeCash.currentCheckpointIndex,
        lastPickRoute: null,
        blockedRoute: null,
        blockedRoutes: activeCash.blockedRoutes,
        clearedCheckpoints: clearedSnapshot,
        routeHistory: Array.isArray(activeCash.routeHistory) ? activeCash.routeHistory : [],
        resolvedAt,
        settlementSummary: buildSpeedTrackSettlementSummary({
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
          message: "Speed Track cash out update failed.",
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
          gameKey: "speed_track",
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

    const activeEarly = parseSpeedTrackActiveSummary(sessionRow);
    const ltEarly = activeEarly?.lastTurn;
    if (
      (!snap0.canResolveTurn || !snap0.pendingPick) &&
      activeEarly &&
      ltEarly &&
      String(ltEarly.outcome || "") === "safe" &&
      Number(ltEarly.pickEventId) === Number(activeEarly.lastProcessedPickEventId) &&
      Number(activeEarly.lastProcessedPickEventId) > 0
    ) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "turn_complete",
        idempotent: true,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          outcome: "safe",
          checkpointIndex:
            ltEarly.checkpointIndex != null ? Math.floor(Number(ltEarly.checkpointIndex)) : null,
          routeIndex: ltEarly.routeIndex != null ? Math.floor(Number(ltEarly.routeIndex)) : null,
          pickEventId: Number(ltEarly.pickEventId),
          securedMultiplier: Number(ltEarly.securedMultiplier) || null,
          securedPayout: Math.floor(Number(ltEarly.securedPayout) || 0),
          currentCheckpointIndex: activeEarly.currentCheckpointIndex,
          clearedCheckpoints: activeEarly.clearedCheckpoints,
          terminalKind: null,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (!snap0.canResolveTurn || !snap0.pendingPick) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "No pending route pick to resolve for this session.",
      });
    }

    const pending = snap0.pendingPick;
    const pickEventId = Number(pending.pickEventId);
    const checkpointIndex = Math.floor(Number(pending.checkpointIndex));
    const routeIndex = Math.floor(Number(pending.routeIndex));
    if (
      !Number.isFinite(pickEventId) ||
      pickEventId <= 0 ||
      checkpointIndex < 0 ||
      checkpointIndex >= SPEED_TRACK_CHECKPOINT_COUNT
    ) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "Invalid pending pick.",
      });
    }

    const active = parseSpeedTrackActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Speed Track state.",
      });
    }

    const blockedHit = isRouteBlockedAtCheckpoint(active.blockedRoutes, checkpointIndex, routeIndex);
    if (blockedHit === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid blocked route state.",
      });
    }

    const resolvedAt = new Date().toISOString();

    if (blockedHit) {
      const payoutReturn = 0;
      const blockedCol = active.blockedRoutes[checkpointIndex];
      const resolvedSummary = {
        phase: "speed_track_resolved",
        terminalKind: "blocked",
        payoutReturn,
        finalCheckpointIndex: checkpointIndex,
        lastPickRoute: routeIndex,
        blockedRoute: blockedCol,
        blockedRoutes: active.blockedRoutes,
        clearedCheckpoints: active.clearedCheckpoints.map(c => Math.floor(Number(c))),
        routeHistory: Array.isArray(active.routeHistory) ? active.routeHistory : [],
        resolvedAt,
        settlementSummary: buildSpeedTrackSettlementSummary({
          terminalKind: "blocked",
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
          message: "Speed Track resolve is temporarily unavailable.",
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
          message: "Session changed during resolve",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "speed_track",
          action: "pick_resolve",
          outcome: "blocked",
          checkpointIndex,
          routeIndex,
          pickEventId,
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
          terminalKind: "blocked",
          outcome: "blocked",
          isWin: false,
          checkpointIndex,
          routeIndex,
          blockedRoute: blockedCol,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const priorCleared = active.clearedCheckpoints.map(c => Math.floor(Number(c))).filter(Number.isFinite);
    const newCleared = [...priorCleared, checkpointIndex];
    const priorHistory = Array.isArray(active.routeHistory) ? active.routeHistory : [];
    const nextRouteHistory = [...priorHistory, { checkpointIndex, route: routeIndex }];
    const securedMultiplier = SPEED_TRACK_MULTIPLIER_LADDER[checkpointIndex];
    const securedPayout = payoutForMultiplier(entryCost, securedMultiplier);
    const lastTurn = {
      outcome: "safe",
      checkpointIndex,
      routeIndex,
      pickEventId,
      resolvedAt,
      securedMultiplier,
      securedPayout,
    };

    const isFinalCheckpoint = checkpointIndex >= SPEED_TRACK_CHECKPOINT_COUNT - 1;
    if (isFinalCheckpoint) {
      const payoutReturn = securedPayout;
      const resolvedSummary = {
        phase: "speed_track_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        finalCheckpointIndex: checkpointIndex,
        lastPickRoute: routeIndex,
        blockedRoute: null,
        blockedRoutes: active.blockedRoutes,
        clearedCheckpoints: newCleared,
        routeHistory: nextRouteHistory,
        resolvedAt,
        settlementSummary: buildSpeedTrackSettlementSummary({
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
          message: "Speed Track finish line update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "speed_track",
          action: "pick_resolve",
          outcome: "full_clear",
          checkpointIndex,
          routeIndex,
          pickEventId,
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
          isWin: true,
          checkpointIndex,
          routeIndex,
          payoutReturn,
          multiplier: topLadderMultiplier(),
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newActiveSummary = {
      phase: "speed_track_active",
      checkpointCount: SPEED_TRACK_CHECKPOINT_COUNT,
      routeCount: active.routeCount,
      blockedRoutes: active.blockedRoutes,
      currentCheckpointIndex: checkpointIndex + 1,
      clearedCheckpoints: newCleared,
      routeHistory: nextRouteHistory,
      lastProcessedPickEventId: pickEventId,
      lastTurn,
    };

    const sessionUpdate = await supabase
      .from("solo_v2_sessions")
      .update({
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        server_outcome_summary: newActiveSummary,
      })
      .eq("id", sessionId)
      .eq("player_ref", playerRef)
      .eq("game_key", "speed_track")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Speed Track segment update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "speed_track",
        action: "pick_resolve",
        outcome: "safe",
        checkpointIndex,
        routeIndex,
        pickEventId,
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
        checkpointIndex,
        routeIndex,
        pickEventId,
        securedMultiplier,
        securedPayout,
        currentCheckpointIndex: newActiveSummary.currentCheckpointIndex,
        clearedCheckpoints: newCleared,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/speed-track/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Speed Track resolve failed",
    });
  }
}
