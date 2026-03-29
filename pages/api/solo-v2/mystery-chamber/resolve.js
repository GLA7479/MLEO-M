import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildMysteryChamberSessionSnapshot,
  parseMysteryChamberActiveSummary,
} from "../../../../lib/solo-v2/server/mysteryChamberSnapshot";
import {
  buildMysteryChamberSettlementSummary,
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_CLEAR_MULTIPLIERS,
  MYSTERY_CHAMBER_MIN_WAGER,
  MYSTERY_CHAMBER_SIGIL_COUNT,
} from "../../../../lib/solo-v2/mysteryChamberConfig";
import { mysteryChamberDebugLog } from "../../../../lib/solo-v2/server/mysteryChamberDebug";
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
  return stake >= MYSTERY_CHAMBER_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function safeSigilSetRevealedFromSummary(summary) {
  if (Array.isArray(summary?.safeSigilSetRevealed) && summary.safeSigilSetRevealed.length >= 1) {
    const out = summary.safeSigilSetRevealed.map(x => Math.floor(Number(x)));
    if (out.every(n => Number.isFinite(n) && n >= 0 && n < MYSTERY_CHAMBER_SIGIL_COUNT)) return out;
  }
  if (summary?.safeSigilRevealed != null) {
    const x = Math.floor(Number(summary.safeSigilRevealed));
    if (Number.isFinite(x) && x >= 0 && x < MYSTERY_CHAMBER_SIGIL_COUNT) return [x];
  }
  return [];
}

function mergeMysteryChamberSafeSigilIndices(...lists) {
  const s = new Set();
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const x of list) {
      const n = Math.floor(Number(x));
      if (Number.isFinite(n) && n >= 0 && n < MYSTERY_CHAMBER_SIGIL_COUNT) s.add(n);
    }
  }
  return [...s].sort((a, b) => a - b);
}

function safeSigilSetsFromSummaryForClient(summary) {
  if (!Array.isArray(summary?.safeSigilSets) || summary.safeSigilSets.length !== MYSTERY_CHAMBER_CHAMBER_COUNT) {
    return null;
  }
  return summary.safeSigilSets.map(row =>
    Array.isArray(row)
      ? row.map(x => Math.floor(Number(x))).filter(n => n >= 0 && n < MYSTERY_CHAMBER_SIGIL_COUNT)
      : [],
  );
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
        : "fail";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  const fromReveal = safeSigilSetRevealedFromSummary(summary);
  const safeSigilSets = safeSigilSetsFromSummaryForClient(summary);
  let fi = null;
  if (summary.finalChamberIndex != null) {
    const n = Math.floor(Number(summary.finalChamberIndex));
    if (Number.isFinite(n) && n >= 0 && n < MYSTERY_CHAMBER_CHAMBER_COUNT) fi = n;
  }
  const rowFromGrid = safeSigilSets && fi != null ? safeSigilSets[fi] : [];
  const safeSigilSet = mergeMysteryChamberSafeSigilIndices(fromReveal, rowFromGrid);
  const lastChosen =
    summary.lastChosenSigil != null ? Math.floor(Number(summary.lastChosenSigil)) : null;
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "fail" && payoutReturn > 0,
    chambersCleared: Math.max(0, Math.floor(Number(summary.chambersCleared) || 0)),
    finalChamberIndex: fi,
    chosenSigil: lastChosen,
    lastChosenSigil: lastChosen,
    safeSigilSet,
    safeSigilSets,
    safeSigilRevealed: safeSigilSet.length ? safeSigilSet[0] : null,
    safeSigils: Array.isArray(summary.safeSigils) ? summary.safeSigils.map(x => Math.floor(Number(x))) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildMysteryChamberSettlementSummary({
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
          message: "Solo V2 Mystery Chamber resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Mystery Chamber resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "mystery_chamber") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be mystery_chamber",
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

    const snapshotResult = await buildMysteryChamberSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Mystery Chamber resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Mystery Chamber resolve is temporarily unavailable.",
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
          message: "Exit is not available until you clear at least one chamber.",
        });
      }

      const activeCash = parseMysteryChamberActiveSummary(sessionRow);
      if (!activeCash) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Session has no active Mystery Chamber state.",
        });
      }

      const payoutReturn = Math.max(0, Math.floor(Number(activeCash.securedReturn) || 0));
      const resolvedAt = new Date().toISOString();
      const cleared = Math.max(0, Math.floor(Number(activeCash.chambersCleared) || 0));

      const resolvedSummary = {
        phase: "mystery_chamber_resolved",
        terminalKind: "cashout",
        payoutReturn,
        chambersCleared: cleared,
        finalChamberIndex: activeCash.currentChamberIndex,
        lastChosenSigil: null,
        safeSigilSetRevealed: null,
        safeSigilRevealed: null,
        safeSigilSets: activeCash.safeSigilSets,
        safeSigils: null,
        resolvedAt,
        settlementSummary: buildMysteryChamberSettlementSummary({
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
          message: "Mystery Chamber cash out update failed.",
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
          gameKey: "mystery_chamber",
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

    const activeEarly = parseMysteryChamberActiveSummary(sessionRow);
    const ltEarly = activeEarly?.lastTurn;
    if (
      (!snap0.canResolveTurn || !snap0.pendingPick) &&
      activeEarly &&
      ltEarly &&
      String(ltEarly.outcome || "") === "success" &&
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
          outcome: "success",
          chamberIndex: ltEarly.chamberIndex != null ? Math.floor(Number(ltEarly.chamberIndex)) : null,
          sigilIndex: ltEarly.sigilIndex != null ? Math.floor(Number(ltEarly.sigilIndex)) : null,
          pickEventId: Number(ltEarly.pickEventId),
          securedReturn: Math.floor(Number(ltEarly.securedReturn) || 0),
          chambersCleared: Math.max(0, Math.floor(Number(ltEarly.chambersCleared) || 0)),
          currentChamberIndex: activeEarly.currentChamberIndex,
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
        message: "No pending sigil pick to resolve for this session.",
      });
    }

    const pending = snap0.pendingPick;
    const pickEventId = Number(pending.pickEventId);
    const sigilIndex = Math.floor(Number(pending.sigilIndex));
    if (
      !Number.isFinite(pickEventId) ||
      pickEventId <= 0 ||
      sigilIndex < 0 ||
      sigilIndex >= MYSTERY_CHAMBER_SIGIL_COUNT
    ) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "Invalid pending pick.",
      });
    }

    const active = parseMysteryChamberActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Mystery Chamber state.",
      });
    }

    const chamberIndex = active.currentChamberIndex;
    if (chamberIndex < 0 || chamberIndex >= MYSTERY_CHAMBER_CHAMBER_COUNT) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid chamber index.",
      });
    }

    const safeSet = active.safeSigilSets[chamberIndex];
    const resolvedAt = new Date().toISOString();
    const isCorrect = Array.isArray(safeSet) && safeSet.includes(sigilIndex);

    mysteryChamberDebugLog("pick_resolve", {
      sessionId,
      chamberIndex,
      playerPickSigilIndex: sigilIndex,
      serverSafeSigilSet: safeSet,
      isCorrect,
      pickEventId,
      safeSigilSetsLayout: active.safeSigilSets,
    });

    if (!isCorrect) {
      const payoutReturn = 0;
      const resolvedSummary = {
        phase: "mystery_chamber_resolved",
        terminalKind: "fail",
        payoutReturn,
        chambersCleared: Math.max(0, Math.floor(Number(active.chambersCleared) || 0)),
        finalChamberIndex: chamberIndex,
        lastChosenSigil: sigilIndex,
        safeSigilSetRevealed: [...safeSet],
        safeSigilRevealed: safeSet[0],
        safeSigilSets: active.safeSigilSets,
        safeSigils: null,
        resolvedAt,
        settlementSummary: buildMysteryChamberSettlementSummary({
          terminalKind: "fail",
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
          message: "Mystery Chamber resolve is temporarily unavailable.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "mystery_chamber",
          action: "pick_resolve",
          outcome: "fail",
          chamberIndex,
          sigilIndex,
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
          terminalKind: "fail",
          outcome: "fail",
          isWin: false,
          chamberIndex,
          finalChamberIndex: chamberIndex,
          chambersCleared: resolvedSummary.chambersCleared,
          chosenSigil: sigilIndex,
          lastChosenSigil: sigilIndex,
          safeSigilSet: [...safeSet],
          safeSigilSets: active.safeSigilSets,
          safeSigil: safeSet[0],
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const mult = MYSTERY_CHAMBER_CLEAR_MULTIPLIERS[chamberIndex];
    const nextSecured = Math.max(0, Math.floor(Number(active.securedReturn) * mult));
    const nextCleared = Math.max(0, Math.floor(Number(active.chambersCleared) || 0) + 1);
    const priorHistory = Array.isArray(active.sigilHistory) ? active.sigilHistory : [];
    const nextHistory = [
      ...priorHistory,
      { chamberIndex, sigilIndex, outcome: "success", pickEventId, securedReturn: nextSecured },
    ];

    const lastTurn = {
      outcome: "success",
      chamberIndex,
      sigilIndex,
      pickEventId,
      securedReturn: nextSecured,
      chambersCleared: nextCleared,
      resolvedAt,
    };

    const isFinalChamber = chamberIndex >= MYSTERY_CHAMBER_CHAMBER_COUNT - 1;
    if (isFinalChamber) {
      const payoutReturn = nextSecured;
      const resolvedSummary = {
        phase: "mystery_chamber_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        chambersCleared: nextCleared,
        finalChamberIndex: chamberIndex,
        lastChosenSigil: sigilIndex,
        safeSigilSetRevealed: [...safeSet],
        safeSigilRevealed: safeSet[0],
        safeSigilSets: active.safeSigilSets,
        safeSigils: null,
        resolvedAt,
        settlementSummary: buildMysteryChamberSettlementSummary({
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
          message: "Mystery Chamber full clear update failed.",
        });
      }

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "mystery_chamber",
          action: "pick_resolve",
          outcome: "full_clear",
          chamberIndex,
          sigilIndex,
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
          outcome: "success",
          isWin: true,
          chamberIndex,
          finalChamberIndex: chamberIndex,
          chambersCleared: nextCleared,
          chosenSigil: sigilIndex,
          safeSigilSet: [...safeSet],
          safeSigil: safeSet[0],
          payoutReturn,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const newActiveSummary = {
      phase: "mystery_chamber_active",
      mysteryChamber: true,
      chamberCount: MYSTERY_CHAMBER_CHAMBER_COUNT,
      sigilCount: 4,
      safeSigilSets: active.safeSigilSets,
      currentChamberIndex: chamberIndex + 1,
      chambersCleared: nextCleared,
      securedReturn: nextSecured,
      lastProcessedPickEventId: pickEventId,
      lastTurn,
      sigilHistory: nextHistory,
    };

    const sessionUpdate = await supabase
      .from("solo_v2_sessions")
      .update({
        session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        server_outcome_summary: newActiveSummary,
      })
      .eq("id", sessionId)
      .eq("player_ref", playerRef)
      .eq("game_key", "mystery_chamber")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Mystery Chamber turn update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "mystery_chamber",
        action: "pick_resolve",
        outcome: "success",
        chamberIndex,
        sigilIndex,
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
        outcome: "success",
        chamberIndex,
        sigilIndex,
        pickEventId,
        securedReturn: nextSecured,
        chambersCleared: nextCleared,
        currentChamberIndex: newActiveSummary.currentChamberIndex,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/mystery-chamber/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Mystery Chamber resolve failed",
    });
  }
}
