import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildHighLowCardsSessionSnapshot } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import {
  buildHighLowStreakSettlementSummary,
  HIGH_LOW_CARDS_MIN_WAGER,
  payoutFromEntryAndStreak,
} from "../../../../lib/solo-v2/highLowCardsConfig";
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
  return stake >= HIGH_LOW_CARDS_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function parseActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "high_low_cards_active") return null;
  const currentValue = Number(s.currentValue);
  if (!Number.isFinite(currentValue)) return null;
  return {
    streak: Math.max(0, Math.floor(Number(s.streak) || 0)),
  };
}

function createCashoutPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind: "cashout",
    streak: Math.max(0, Math.floor(Number(summary.finalStreak) || 0)),
    payoutReturn: Math.max(0, Math.floor(Number(summary.payoutReturn) || 0)),
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary: summary.settlementSummary || null,
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
          message: "Solo V2 Hi-Lo cash-out is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Hi-Lo cash-out is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "high_low_cards") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be high_low_cards",
      });
    }

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      const summary = sessionRow.server_outcome_summary || {};
      if (summary.terminalKind === "cashout") {
        const entryCost = entryCostFromSessionRow(sessionRow);
        const fundingSource = fundingSourceFromSessionRow(sessionRow);
        const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "cashed_out",
          idempotent: true,
          result: {
            ...createCashoutPayload(sessionRow),
            settlementSummary:
              summary.settlementSummary ||
              buildHighLowStreakSettlementSummary({
                payoutReturn,
                entryCost,
                fundingSource,
              }),
          },
          authority: { outcomeTruth: "server", settlement: "deferred" },
        });
      }
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "session_terminal",
        message: "Session already ended without cash-out.",
      });
    }

    const snapshotResult = await buildHighLowCardsSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Session read failed.",
      });
    }

    const snap = snapshotResult.snapshot;
    if (snap.readState === "choice_submitted" || snap.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "turn_pending",
        message: "Resolve or clear the current guess before cashing out.",
      });
    }

    if (!snap.canCashOut) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "cashout_not_allowed",
        message: "Cash-out requires at least one successful guess.",
      });
    }

    const active = parseActiveSummary(sessionRow);
    if (!active || active.streak <= 0) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "cashout_not_allowed",
        message: "Nothing to cash out.",
      });
    }

    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);
    const payoutReturn = payoutFromEntryAndStreak(entryCost, active.streak);
    const settlementSummary = buildHighLowStreakSettlementSummary({
      payoutReturn,
      entryCost,
      fundingSource,
    });
    const resolvedAt = new Date().toISOString();
    const resolvedSummary = {
      phase: "high_low_cards_resolved",
      terminalKind: "cashout",
      finalStreak: active.streak,
      payoutReturn,
      resolvedAt,
      settlementSummary,
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
        message: "Cash-out update failed.",
      });
    }

    if (!sessionUpdate.data) {
      const again = await supabase.rpc("solo_v2_get_session", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
      });
      const row2 = Array.isArray(again.data) ? again.data[0] : again.data;
      if (row2?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED && row2?.server_outcome_summary?.terminalKind === "cashout") {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "cashed_out",
          idempotent: true,
          result: {
            ...createCashoutPayload(row2),
            settlementSummary: row2.server_outcome_summary?.settlementSummary || settlementSummary,
          },
          authority: { outcomeTruth: "server", settlement: "deferred" },
        });
      }
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "resolve_conflict",
        message: "Session changed during cash-out",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "high_low_cards",
        action: "cash_out",
        streak: active.streak,
        payoutReturn,
      },
    });

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "cashed_out",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
        terminalKind: "cashout",
        streak: active.streak,
        payoutReturn,
        resolvedAt,
        settlementSummary,
      },
      authority: { outcomeTruth: "server", settlement: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/high-low-cards/cash-out failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Hi-Lo cash-out failed",
    });
  }
}
