import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildEchoSequenceSessionSnapshot,
  parseEchoSequenceActiveSummary,
} from "../../../../lib/solo-v2/server/echoSequenceSnapshot";
import {
  buildEchoSequenceSettlementSummary,
  ECHO_SEQUENCE_MIN_WAGER,
  ECHO_SEQUENCE_TOTAL_ROUNDS,
  multiplierAfterRound,
  payoutForMultiplier,
} from "../../../../lib/solo-v2/echoSequenceConfig";
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
  return stake >= ECHO_SEQUENCE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
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
  const isCashOut = String(req.body?.action || "").toLowerCase() === "cashout";
  const playerRef = resolvePlayerRef(req);
  try {
    const supabase = getSupabaseAdmin();
    const sessionRead = await supabase.rpc("solo_v2_get_session", { p_session_id: sessionId, p_player_ref: playerRef });
    if (sessionRead.error) {
      if (isMissingTable(sessionRead.error)) {
        return res.status(503).json({ ok: false, category: "pending_migration", status: "pending_migration", message: "Echo Sequence resolve is not migrated yet." });
      }
      return res.status(503).json({ ok: false, category: "unavailable", status: "unavailable", message: "Echo Sequence resolve unavailable." });
    }
    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    if (sessionRow.game_key !== "echo_sequence") {
      return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_game", message: "Session game must be echo_sequence" });
    }
    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      const summary = sessionRow.server_outcome_summary || {};
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: true, result: summary });
    }
    const snapResult = await buildEchoSequenceSessionSnapshot(supabase, sessionRow);
    if (!snapResult.ok) return res.status(503).json({ ok: false, category: "unavailable", status: "unavailable", message: "Echo snapshot unavailable." });
    const snap = snapResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);
    const active = parseEchoSequenceActiveSummary(sessionRow);
    if (!active) return res.status(409).json({ ok: false, category: "conflict", status: "invalid_session_state", message: "Missing active state." });

    if (isCashOut) {
      if (!snap.canCashOut) return res.status(409).json({ ok: false, category: "conflict", status: "cashout_not_allowed", message: "Cashout unavailable." });
      const clearedLen = active.clearedRounds.length;
      const securedMult = clearedLen > 0 ? multiplierAfterRound(clearedLen - 1) : 1;
      const payoutReturn = payoutForMultiplier(entryCost, securedMult);
      const resolvedAt = new Date().toISOString();
      const resolvedSummary = {
        phase: "echo_sequence_resolved",
        terminalKind: "cashout",
        payoutReturn,
        finalRoundIndex: active.currentRoundIndex,
        chosenOptionKey: null,
        correctOptionKey: null,
        clearedRounds: active.clearedRounds,
        resolvedAt,
        settlementSummary: buildEchoSequenceSettlementSummary({ terminalKind: "cashout", payoutReturn, entryCost, fundingSource }),
      };
      await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.RESOLVED, resolved_at: resolvedAt, server_outcome_summary: resolvedSummary }).eq("id", sessionId).eq("player_ref", playerRef);
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: false, result: resolvedSummary });
    }

    if (!snap.canResolveTurn || !snap.pendingChoice) {
      return res.status(409).json({ ok: false, category: "conflict", status: "choice_required", message: "No pending choice to resolve." });
    }
    const pending = snap.pendingChoice;
    const round = active.rounds[active.currentRoundIndex];
    if (!round) return res.status(409).json({ ok: false, category: "conflict", status: "invalid_round", message: "Round state invalid." });
    const chosen = String(pending.optionKey || "");
    const correct = String(round.correctOptionKey || "");
    const isCorrect = chosen === correct;
    const resolvedAt = new Date().toISOString();
    if (!isCorrect) {
      const resolvedSummary = {
        phase: "echo_sequence_resolved",
        terminalKind: "wrong",
        payoutReturn: 0,
        finalRoundIndex: active.currentRoundIndex,
        chosenOptionKey: chosen,
        correctOptionKey: correct,
        clearedRounds: active.clearedRounds,
        resolvedAt,
        settlementSummary: buildEchoSequenceSettlementSummary({ terminalKind: "wrong", payoutReturn: 0, entryCost, fundingSource }),
      };
      await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.RESOLVED, resolved_at: resolvedAt, server_outcome_summary: resolvedSummary }).eq("id", sessionId).eq("player_ref", playerRef);
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: false, result: resolvedSummary });
    }

    const newCleared = [...active.clearedRounds, active.currentRoundIndex];
    const finalRound = active.currentRoundIndex >= ECHO_SEQUENCE_TOTAL_ROUNDS - 1;
    if (finalRound) {
      const mult = multiplierAfterRound(ECHO_SEQUENCE_TOTAL_ROUNDS - 1);
      const payoutReturn = payoutForMultiplier(entryCost, mult);
      const resolvedSummary = {
        phase: "echo_sequence_resolved",
        terminalKind: "full_clear",
        payoutReturn,
        finalRoundIndex: active.currentRoundIndex,
        chosenOptionKey: chosen,
        correctOptionKey: correct,
        clearedRounds: newCleared,
        resolvedAt,
        settlementSummary: buildEchoSequenceSettlementSummary({ terminalKind: "full_clear", payoutReturn, entryCost, fundingSource }),
      };
      await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.RESOLVED, resolved_at: resolvedAt, server_outcome_summary: resolvedSummary }).eq("id", sessionId).eq("player_ref", playerRef);
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: false, result: resolvedSummary });
    }

    const newActive = {
      ...active,
      phase: "echo_sequence_active",
      currentRoundIndex: active.currentRoundIndex + 1,
      clearedRounds: newCleared,
      lastProcessedChoiceEventId: Number(pending.choiceEventId) || active.lastProcessedChoiceEventId,
      lastTurn: {
        outcome: "correct",
        roundIndex: active.currentRoundIndex,
        chosenOptionKey: chosen,
        correctOptionKey: correct,
        resolvedAt,
      },
    };
    await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS, server_outcome_summary: newActive }).eq("id", sessionId).eq("player_ref", playerRef);
    return res.status(200).json({
      ok: true,
      category: "success",
      status: "turn_complete",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        outcome: "correct",
        roundIndex: active.currentRoundIndex,
        chosenOptionKey: chosen,
        correctOptionKey: correct,
        currentRoundIndex: newActive.currentRoundIndex,
        clearedRounds: newCleared,
      },
    });
  } catch (error) {
    console.error("solo-v2/echo-sequence/resolve failed", error);
    return res.status(500).json({ ok: false, category: "unexpected_error", status: "server_error", message: "Echo Sequence resolve failed" });
  }
}
