import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildChallenge21SessionSnapshot } from "../../../../lib/solo-v2/server/challenge21Snapshot";
import { parseChallenge21ActiveSummary } from "../../../../lib/solo-v2/server/challenge21Engine";
import { applyChallenge21Step } from "../../../../lib/solo-v2/server/challenge21Play";
import { buildChallenge21SettlementSummary, CHALLENGE_21_MIN_WAGER } from "../../../../lib/solo-v2/challenge21Config";
import { handTotal } from "../../../../lib/solo-v2/challenge21HandMath";
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
  return stake >= CHALLENGE_21_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function createTerminalResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const outcome = summary.outcome === "push" ? "push" : summary.outcome === "win" ? "win" : "lose";
  const terminalKind =
    summary.terminalKind === "cashout"
      ? "cashout"
      : summary.terminalKind === "full_clear"
        ? "full_clear"
        : "overload";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  const isWin = summary.isWin != null ? Boolean(summary.isWin) : outcome === "win";
  const isPush = summary.isPush != null ? Boolean(summary.isPush) : outcome === "push";
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin,
    isPush,
    outcome,
    playerHand: Array.isArray(summary.playerHand) ? summary.playerHand : [],
    playerHands: Array.isArray(summary.playerHands) ? summary.playerHands : [],
    handResults: Array.isArray(summary.handResults) ? summary.handResults : null,
    opponentHand: Array.isArray(summary.opponentHand) ? summary.opponentHand : [],
    playerTotal: summary.playerTotal != null ? Number(summary.playerTotal) : null,
    opponentTotal: summary.opponentTotal != null ? Number(summary.opponentTotal) : null,
    playerBust: summary.playerBust === true,
    opponentBust: summary.opponentBust === true,
    playerNatural21: summary.playerNatural21 === true,
    opponentNatural21: summary.opponentNatural21 === true,
    resolvedViaNatural21: summary.resolvedViaNatural21 === true,
    premiumNaturalWin: summary.premiumNaturalWin === true,
    blackjackWin: summary.blackjackWin === true,
    insuranceStake: summary.insuranceStake != null ? Number(summary.insuranceStake) : 0,
    insuranceReturn: summary.insuranceReturn != null ? Number(summary.insuranceReturn) : 0,
    insuranceDecision: summary.insuranceDecision ?? null,
    dealerHadBlackjack: summary.dealerHadBlackjack === true,
    totalRisked: summary.totalRisked != null ? Number(summary.totalRisked) : null,
    netDelta: summary.netDelta != null ? Number(summary.netDelta) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildChallenge21SettlementSummary({
        outcome,
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
          message: "Solo V2 21 Challenge resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "21 Challenge resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "challenge_21") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be challenge_21",
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

    const snapshotResult = await buildChallenge21SessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 21 Challenge resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "21 Challenge resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (snap0.actionConflict) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "action_conflict",
        message: "Conflicting actions — refresh session state.",
      });
    }

    if (!snap0.pendingAction) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "action_required",
        message: "Choose an action before resolving.",
      });
    }

    if (!snap0.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "action_required",
        message: "No pending action to resolve.",
      });
    }

    const active = parseChallenge21ActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active 21 Challenge state.",
      });
    }

    const pending = snap0.pendingAction;
    const actionEventId = Number(pending.actionEventId);
    const decision = String(pending.decision || "").toLowerCase();

    if (!Number.isFinite(actionEventId) || actionEventId <= 0) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid pending action.",
      });
    }

    const activePayload = {
      ...sessionRow.server_outcome_summary,
      playerHand: active.playerHand,
      opponentHand: active.opponentHand,
      deck: active.deck,
      playerHands: active.playerHands,
      handStakes: active.handStakes,
      handMeta: active.handMeta,
      activeHandIndex: active.activeHandIndex,
      playPhase: active.playPhase,
      insuranceOffered: active.insuranceOffered,
      insuranceDecision: active.insuranceDecision,
      insuranceStake: active.insuranceStake,
      dealerPeekedAfterInsurance: active.dealerPeekedAfterInsurance,
      splitUsed: active.splitUsed,
      lastProcessedActionEventId: active.lastProcessedActionEventId,
    };

    const step = applyChallenge21Step(activePayload, decision, actionEventId, entryCost, fundingSource);
    if (!step.ok) {
      return res.status(step.status || 400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: step.message || "Invalid action.",
      });
    }

    if (step.continuing) {
      const continuingSummary = step.continuing;
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
          message: "21 Challenge continue update failed.",
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

      await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: "session_note",
        p_event_payload: {
          gameKey: "challenge_21",
          action: "challenge_21_resolve",
          actionEventId,
          decision,
          outcome: "continue",
          settlement: "deferred",
        },
      });

      const ph = continuingSummary.playerHand || [];
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "in_progress",
        idempotent: false,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          playerHand: ph,
          playerTotal: ph.length ? handTotal(ph) : 0,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const resolvedSummary = step.terminal;
    const resolvedAt = resolvedSummary.resolvedAt || new Date().toISOString();

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
        message: "21 Challenge resolve update failed.",
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
        gameKey: "challenge_21",
        action: "challenge_21_resolve",
        actionEventId,
        decision,
        outcome: resolvedSummary.outcome,
        payoutReturn: resolvedSummary.payoutReturn,
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
        ...createTerminalResolvedPayload({ ...sessionRow, server_outcome_summary: resolvedSummary }),
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/challenge-21/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "21 Challenge resolve failed",
    });
  }
}
