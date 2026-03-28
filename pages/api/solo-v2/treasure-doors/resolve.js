import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildTreasureDoorsSessionSnapshot,
  parseTreasureDoorsActiveSummary,
} from "../../../../lib/solo-v2/server/treasureDoorsSnapshot";
import { isTrapAtChamber } from "../../../../lib/solo-v2/server/treasureDoorsEngine";
import {
  buildTreasureDoorsSettlementSummary,
  TREASURE_DOORS_CHAMBER_COUNT,
  TREASURE_DOORS_MIN_WAGER,
  TREASURE_DOORS_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../../../../lib/solo-v2/treasureDoorsConfig";
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
  return stake >= TREASURE_DOORS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
        : "trap";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "trap",
    finalChamberIndex:
      summary.finalChamberIndex != null ? Math.floor(Number(summary.finalChamberIndex)) : null,
    lastPickDoor: summary.lastPickDoor != null ? Math.floor(Number(summary.lastPickDoor)) : null,
    trapDoor: summary.trapDoor != null ? Math.floor(Number(summary.trapDoor)) : null,
    trapDoors: Array.isArray(summary.trapDoors) ? summary.trapDoors : null,
    doorHistory: Array.isArray(summary.doorHistory) ? summary.doorHistory : [],
    clearedChambers: Array.isArray(summary.clearedChambers) ? summary.clearedChambers : [],
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildTreasureDoorsSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      }),
  };
}

function topLadderMultiplier() {
  return TREASURE_DOORS_MULTIPLIER_LADDER[TREASURE_DOORS_MULTIPLIER_LADDER.length - 1];
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
          message: "Solo V2 Treasure Doors resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Treasure Doors resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "treasure_doors") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be treasure_doors",
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

    const snapshotResult = await buildTreasureDoorsSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Treasure Doors resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Treasure Doors resolve is temporarily unavailable.",
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

      const activeCash = parseTreasureDoorsActiveSummary(sessionRow);
      if (!activeCash) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no active Treasure Doors state.",
        });
      }

      const clearedLen = activeCash.clearedChambers.length;
      const securedMultiplier =
        clearedLen > 0 ? TREASURE_DOORS_MULTIPLIER_LADDER[clearedLen - 1] : 1;
      const payoutReturn = payoutForMultiplier(entryCost, securedMultiplier);
      const resolvedAt = new Date().toISOString();
      const clearedSnapshot = [...activeCash.clearedChambers.map(c => Math.floor(Number(c)))].filter(
        n => Number.isFinite(n) && n >= 0 && n < TREASURE_DOORS_CHAMBER_COUNT,
      );

      const resolvedSummary = {
        phase: "treasure_doors_resolved",
        terminalKind: "cashout",
        payoutReturn,
        finalChamberIndex: activeCash.currentChamberIndex,
        lastPickDoor: null,
        trapDoor: null,
        trapDoors: activeCash.trapDoors,
        clearedChambers: clearedSnapshot,
        doorHistory: Array.isArray(activeCash.doorHistory) ? activeCash.doorHistory : [],
        resolvedAt,
        settlementSummary: buildTreasureDoorsSettlementSummary({
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
          message: "Treasure Doors cash out update failed.",
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
          gameKey: "treasure_doors",
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

    const activeEarly = parseTreasureDoorsActiveSummary(sessionRow);
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
          chamberIndex: ltEarly.chamberIndex != null ? Math.floor(Number(ltEarly.chamberIndex)) : null,
          door: ltEarly.door != null ? Math.floor(Number(ltEarly.door)) : null,
          pickEventId: Number(ltEarly.pickEventId),
          securedMultiplier: Number(ltEarly.securedMultiplier) || null,
          securedPayout: Math.floor(Number(ltEarly.securedPayout) || 0),
          currentChamberIndex: activeEarly.currentChamberIndex,
          clearedChambers: activeEarly.clearedChambers,
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
        message: "No pending door pick to resolve for this session.",
      });
    }

    const pending = snap0.pendingPick;
    const pickEventId = Number(pending.pickEventId);
    const chamberIndex = Math.floor(Number(pending.chamberIndex));
    const door = Math.floor(Number(pending.door));
    if (
      !Number.isFinite(pickEventId) ||
      pickEventId <= 0 ||
      chamberIndex < 0 ||
      chamberIndex >= TREASURE_DOORS_CHAMBER_COUNT
    ) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "Invalid pending pick.",
      });
    }

    const active = parseTreasureDoorsActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Treasure Doors state.",
      });
    }

    const trapHit = isTrapAtChamber(active.trapDoors, chamberIndex, door);
    if (trapHit === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid trap layout state.",
      });
    }

    const resolvedAt = new Date().toISOString();

    if (trapHit) {
      const payoutReturn = 0;
      const trapCol = active.trapDoors[chamberIndex];
      const resolvedSummary = {
        phase: "treasure_doors_resolved",
        terminalKind: "trap",
        payoutReturn,
        finalChamberIndex: chamberIndex,
        lastPickDoor: door,
        trapDoor: trapCol,
        trapDoors: active.trapDoors,
        clearedChambers: active.clearedChambers.map(c => Math.floor(Number(c))),
        doorHistory: Array.isArray(active.doorHistory) ? active.doorHistory : [],
        resolvedAt,
        settlementSummary: buildTreasureDoorsSettlementSummary({
          terminalKind: "trap",
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
          message: "Treasure Doors resolve is temporarily unavailable.",
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
          gameKey: "treasure_doors",
          action: "pick_resolve",
          outcome: "trap",
          chamberIndex,
          door,
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
          terminalKind: "trap",
          outcome: "trap",
          isWin: false,
          chamberIndex,
          door,
          trapDoor: trapCol,
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const priorCleared = active.clearedChambers.map(c => Math.floor(Number(c))).filter(Number.isFinite);
    const newCleared = [...priorCleared, chamberIndex];
    const priorHistory = Array.isArray(active.doorHistory) ? active.doorHistory : [];
    const nextDoorHistory = [...priorHistory, { chamberIndex, door }];
    const securedMultiplier = TREASURE_DOORS_MULTIPLIER_LADDER[chamberIndex];
    const securedPayout = payoutForMultiplier(entryCost, securedMultiplier);
    const lastTurn = {
      outcome: "safe",
      chamberIndex,
      door,
      pickEventId,
      resolvedAt,
      securedMultiplier,
      securedPayout,
    };

    const isFinalChamber = chamberIndex >= TREASURE_DOORS_CHAMBER_COUNT - 1;
    if (isFinalChamber) {
      const payoutReturn = securedPayout;
      const resolvedSummary = {
        phase: "treasure_doors_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        finalChamberIndex: chamberIndex,
        lastPickDoor: door,
        trapDoor: null,
        trapDoors: active.trapDoors,
        clearedChambers: newCleared,
        doorHistory: nextDoorHistory,
        resolvedAt,
        settlementSummary: buildTreasureDoorsSettlementSummary({
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
          message: "Treasure Doors full clear update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "treasure_doors",
          action: "pick_resolve",
          outcome: "full_clear",
          chamberIndex,
          door,
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
          chamberIndex,
          door,
          payoutReturn,
          multiplier: topLadderMultiplier(),
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newActiveSummary = {
      phase: "treasure_doors_active",
      chamberCount: TREASURE_DOORS_CHAMBER_COUNT,
      doorCount: active.doorCount,
      trapDoors: active.trapDoors,
      currentChamberIndex: chamberIndex + 1,
      clearedChambers: newCleared,
      doorHistory: nextDoorHistory,
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
      .eq("game_key", "treasure_doors")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Treasure Doors turn update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "treasure_doors",
        action: "pick_resolve",
        outcome: "safe",
        chamberIndex,
        door,
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
        chamberIndex,
        door,
        pickEventId,
        securedMultiplier,
        securedPayout,
        currentChamberIndex: newActiveSummary.currentChamberIndex,
        clearedChambers: newCleared,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/treasure-doors/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Treasure Doors resolve failed",
    });
  }
}
