import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildGoldRushDiggerSessionSnapshot,
  parseGoldRushDiggerActiveSummary,
} from "../../../../lib/solo-v2/server/goldRushDiggerSnapshot";
import { isBombAtRow } from "../../../../lib/solo-v2/server/goldRushDiggerEngine";
import {
  buildGoldRushDiggerSettlementSummary,
  GOLD_RUSH_DIGGER_MIN_WAGER,
  GOLD_RUSH_MULTIPLIER_LADDER,
  GOLD_RUSH_ROW_COUNT,
  payoutForMultiplier,
} from "../../../../lib/solo-v2/goldRushDiggerConfig";
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
  return stake >= GOLD_RUSH_DIGGER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
        : "bomb";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "bomb",
    finalRowIndex: summary.finalRowIndex != null ? Math.floor(Number(summary.finalRowIndex)) : null,
    lastPickColumn: summary.lastPickColumn != null ? Math.floor(Number(summary.lastPickColumn)) : null,
    bombColumn: summary.bombColumn != null ? Math.floor(Number(summary.bombColumn)) : null,
    bombColumns: Array.isArray(summary.bombColumns) ? summary.bombColumns : null,
    digHistory: Array.isArray(summary.digHistory) ? summary.digHistory : [],
    clearedRows: Array.isArray(summary.clearedRows) ? summary.clearedRows : [],
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildGoldRushDiggerSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

function topLadderMultiplier() {
  return GOLD_RUSH_MULTIPLIER_LADDER[GOLD_RUSH_MULTIPLIER_LADDER.length - 1];
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
          message: "Solo V2 Gold Rush resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Gold Rush resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "gold_rush_digger") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be gold_rush_digger",
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

    const snapshotResult = await buildGoldRushDiggerSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Gold Rush resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Gold Rush resolve is temporarily unavailable.",
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

      const activeCash = parseGoldRushDiggerActiveSummary(sessionRow);
      if (!activeCash) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no active Gold Rush state.",
        });
      }

      const clearedLen = activeCash.clearedRows.length;
      const securedMultiplier =
        clearedLen > 0 ? GOLD_RUSH_MULTIPLIER_LADDER[clearedLen - 1] : 1;
      const payoutReturn = payoutForMultiplier(entryCost, securedMultiplier);
      const resolvedAt = new Date().toISOString();
      const clearedSnapshot = [...activeCash.clearedRows.map(r => Math.floor(Number(r)))].filter(Number.isFinite);

      const resolvedSummary = {
        phase: "gold_rush_digger_resolved",
        terminalKind: "cashout",
        payoutReturn,
        finalRowIndex: activeCash.currentRowIndex,
        lastPickColumn: null,
        bombColumn: null,
        bombColumns: activeCash.bombColumns,
        clearedRows: clearedSnapshot,
        digHistory: Array.isArray(activeCash.digHistory) ? activeCash.digHistory : [],
        resolvedAt,
        settlementSummary: buildGoldRushDiggerSettlementSummary({
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
          message: "Gold Rush cash out update failed.",
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
          gameKey: "gold_rush_digger",
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

    const activeEarly = parseGoldRushDiggerActiveSummary(sessionRow);
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
          rowIndex: ltEarly.rowIndex != null ? Math.floor(Number(ltEarly.rowIndex)) : null,
          column: ltEarly.column != null ? Math.floor(Number(ltEarly.column)) : null,
          pickEventId: Number(ltEarly.pickEventId),
          securedMultiplier: Number(ltEarly.securedMultiplier) || null,
          securedPayout: Math.floor(Number(ltEarly.securedPayout) || 0),
          currentRowIndex: activeEarly.currentRowIndex,
          clearedRows: activeEarly.clearedRows,
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
        message: "No pending dig pick to resolve for this session.",
      });
    }

    const pending = snap0.pendingPick;
    const pickEventId = Number(pending.pickEventId);
    const rowIndex = Math.floor(Number(pending.rowIndex));
    const column = Math.floor(Number(pending.column));
    if (!Number.isFinite(pickEventId) || pickEventId <= 0 || rowIndex < 0 || rowIndex >= GOLD_RUSH_ROW_COUNT) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "Invalid pending pick.",
      });
    }

    const active = parseGoldRushDiggerActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Gold Rush state.",
      });
    }

    const bombHit = isBombAtRow(active.bombColumns, rowIndex, column);
    if (bombHit === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid bomb layout state.",
      });
    }

    const resolvedAt = new Date().toISOString();

    if (bombHit) {
      const payoutReturn = 0;
      const bombCol = active.bombColumns[rowIndex];
      const resolvedSummary = {
        phase: "gold_rush_digger_resolved",
        terminalKind: "bomb",
        payoutReturn,
        finalRowIndex: rowIndex,
        lastPickColumn: column,
        bombColumn: bombCol,
        bombColumns: active.bombColumns,
        clearedRows: active.clearedRows.map(r => Math.floor(Number(r))),
        digHistory: Array.isArray(active.digHistory) ? active.digHistory : [],
        resolvedAt,
        settlementSummary: buildGoldRushDiggerSettlementSummary({
          terminalKind: "bomb",
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
          message: "Gold Rush resolve is temporarily unavailable.",
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
          gameKey: "gold_rush_digger",
          action: "pick_resolve",
          outcome: "bomb",
          rowIndex,
          column,
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
          terminalKind: "bomb",
          outcome: "bomb",
          rowIndex,
          column,
          bombColumn: bombCol,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newCleared = [...active.clearedRows.map(r => Math.floor(Number(r))), rowIndex];
    const priorHistory = Array.isArray(active.digHistory) ? active.digHistory : [];
    const nextDigHistory = [...priorHistory, { rowIndex, column }];
    const securedMultiplier = GOLD_RUSH_MULTIPLIER_LADDER[rowIndex];
    const securedPayout = payoutForMultiplier(entryCost, securedMultiplier);
    const lastTurn = {
      outcome: "safe",
      rowIndex,
      column,
      pickEventId,
      resolvedAt,
      securedMultiplier,
      securedPayout,
    };

    const isFinalRow = rowIndex >= GOLD_RUSH_ROW_COUNT - 1;
    if (isFinalRow) {
      const payoutReturn = securedPayout;
      const resolvedSummary = {
        phase: "gold_rush_digger_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        finalRowIndex: rowIndex,
        lastPickColumn: column,
        bombColumn: null,
        bombColumns: active.bombColumns,
        clearedRows: newCleared,
        digHistory: nextDigHistory,
        resolvedAt,
        settlementSummary: buildGoldRushDiggerSettlementSummary({
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
          message: "Gold Rush full clear update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "gold_rush_digger",
          action: "pick_resolve",
          outcome: "full_clear",
          rowIndex,
          column,
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
          rowIndex,
          column,
          payoutReturn,
          multiplier: topLadderMultiplier(),
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newActiveSummary = {
      phase: "gold_rush_digger_active",
      rowCount: GOLD_RUSH_ROW_COUNT,
      columnCount: active.columnCount,
      bombColumns: active.bombColumns,
      currentRowIndex: rowIndex + 1,
      clearedRows: newCleared,
      digHistory: nextDigHistory,
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
      .eq("game_key", "gold_rush_digger")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Gold Rush turn update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "gold_rush_digger",
        action: "pick_resolve",
        outcome: "safe",
        rowIndex,
        column,
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
        rowIndex,
        column,
        pickEventId,
        securedMultiplier,
        securedPayout,
        currentRowIndex: newActiveSummary.currentRowIndex,
        clearedRows: newCleared,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/gold-rush-digger/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Gold Rush resolve failed",
    });
  }
}
