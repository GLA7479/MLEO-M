import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildDiamondsSessionSnapshot,
  parseDiamondsActiveSummary,
} from "../../../../lib/solo-v2/server/diamondsSnapshot";
import {
  buildDiamondsSettlementSummary,
  DIAMONDS_CELL_COUNT,
  DIAMONDS_MIN_WAGER,
  diamondsMultiplierAfterReveals,
  payoutForDiamonds,
} from "../../../../lib/solo-v2/diamondsConfig";
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
  return stake >= DIAMONDS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function normalizeCellIndex(raw) {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0 || n >= DIAMONDS_CELL_COUNT) return null;
  return n;
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
    bombIndices: Array.isArray(summary.bombIndices) ? summary.bombIndices : [],
    revealedSafeIndices: Array.isArray(summary.revealedSafeIndices) ? summary.revealedSafeIndices : [],
    lastCellIndex: summary.lastCellIndex != null ? Math.floor(Number(summary.lastCellIndex)) : null,
    settlementSummary:
      summary.settlementSummary ||
      buildDiamondsSettlementSummary({
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
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  }

  const actionRaw = String(req.body?.action || "").trim().toLowerCase();
  const isCashOut = actionRaw === "cashout";
  const isReveal = actionRaw === "reveal";

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
          message: "Solo V2 Diamonds resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Diamonds resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "diamonds") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be diamonds",
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
      const snapResult = await buildDiamondsSessionSnapshot(supabase, sessionRow);
      if (!snapResult.ok) {
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Diamonds resolve is temporarily unavailable.",
        });
      }
      if (!snapResult.snapshot.canCashOut) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "cashout_not_allowed",
          message: "Cash out is not available until you reveal at least one safe cell.",
        });
      }

      const active = parseDiamondsActiveSummary(sessionRow);
      if (!active) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no active Diamonds state.",
        });
      }

      const k = active.revealedSafeIndices.length;
      const mult = diamondsMultiplierAfterReveals(active.bombCount, k);
      if (mult == null) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Invalid multiplier state.",
        });
      }
      const payoutReturn = payoutForDiamonds(entryCost, mult);
      const resolvedAt = new Date().toISOString();

      const resolvedSummary = {
        phase: "diamonds_resolved",
        terminalKind: "cashout",
        payoutReturn,
        bombIndices: active.bombIndices,
        revealedSafeIndices: active.revealedSafeIndices,
        lastCellIndex: null,
        resolvedAt,
        settlementSummary: buildDiamondsSettlementSummary({
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
          message: "Diamonds cash out update failed.",
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
          gameKey: "diamonds",
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

    if (!isReveal) {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: "action must be reveal or cashout",
      });
    }

    const cellIndex = normalizeCellIndex(req.body?.cellIndex);
    if (cellIndex === null) {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: "cellIndex must be 0–24",
      });
    }

    const active = parseDiamondsActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Diamonds state.",
      });
    }

    const bombSet = new Set(active.bombIndices);
    const revealedSet = new Set(active.revealedSafeIndices);
    if (revealedSet.has(cellIndex)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_pick",
        message: "Cell already revealed.",
      });
    }

    const maxSafe = DIAMONDS_CELL_COUNT - active.bombCount;
    if (active.revealedSafeIndices.length >= maxSafe) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Board complete.",
      });
    }

    const resolvedAt = new Date().toISOString();

    if (bombSet.has(cellIndex)) {
      const payoutReturn = 0;
      const resolvedSummary = {
        phase: "diamonds_resolved",
        terminalKind: "bomb",
        payoutReturn,
        bombIndices: active.bombIndices,
        revealedSafeIndices: active.revealedSafeIndices,
        lastCellIndex: cellIndex,
        resolvedAt,
        settlementSummary: buildDiamondsSettlementSummary({
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
          message: "Diamonds resolve failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "diamonds",
          action: "reveal_resolve",
          outcome: "bomb",
          cellIndex,
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
          cellIndex,
          bombIndices: active.bombIndices,
          revealedSafeIndices: active.revealedSafeIndices,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newRevealed = [...active.revealedSafeIndices, cellIndex].sort((a, b) => a - b);
    const k = newRevealed.length;
    const isFullClear = k >= maxSafe;

    if (isFullClear) {
      const mult = diamondsMultiplierAfterReveals(active.bombCount, k);
      const payoutReturn = mult != null ? payoutForDiamonds(entryCost, mult) : 0;
      const resolvedSummary = {
        phase: "diamonds_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        bombIndices: active.bombIndices,
        revealedSafeIndices: newRevealed,
        lastCellIndex: cellIndex,
        resolvedAt,
        settlementSummary: buildDiamondsSettlementSummary({
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
          message: "Diamonds full clear update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "diamonds",
          action: "reveal_resolve",
          outcome: "full_clear",
          cellIndex,
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
          cellIndex,
          bombIndices: active.bombIndices,
          revealedSafeIndices: newRevealed,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const mult = diamondsMultiplierAfterReveals(active.bombCount, k);
    const securedPayout = mult != null ? payoutForDiamonds(entryCost, mult) : 0;

    const newActiveSummary = {
      phase: "diamonds_active",
      gridSize: 5,
      cellCount: DIAMONDS_CELL_COUNT,
      bombCount: active.bombCount,
      difficulty: active.difficulty,
      bombIndices: active.bombIndices,
      revealedSafeIndices: newRevealed,
    };

    const sessionUpdate = await supabase
      .from("solo_v2_sessions")
      .update({
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        server_outcome_summary: newActiveSummary,
      })
      .eq("id", sessionId)
      .eq("player_ref", playerRef)
      .eq("game_key", "diamonds")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Diamonds reveal update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "diamonds",
        action: "reveal_resolve",
        outcome: "safe",
        cellIndex,
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
        cellIndex,
        securedMultiplier: mult,
        securedPayout,
        revealedSafeIndices: newRevealed,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/diamonds/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Diamonds resolve failed",
    });
  }
}
