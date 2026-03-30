import { randomInt } from "crypto";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildOddEvenSessionSnapshot } from "../../../../lib/solo-v2/server/oddEvenSnapshot";
import {
  buildOddEvenSettlementSummary,
  ODD_EVEN_CONFIG,
  ODD_EVEN_MIN_WAGER,
} from "../../../../lib/solo-v2/oddEvenConfig";

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
  return stake >= ODD_EVEN_MIN_WAGER ? stake : ODD_EVEN_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function parityFromValue(n) {
  return n % 2 === 0 ? "even" : "odd";
}

function createResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const rolledValue =
    summary.rolledValue != null && Number.isFinite(Math.floor(Number(summary.rolledValue)))
      ? Math.floor(Number(summary.rolledValue))
      : null;
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    choice: summary.choice || null,
    outcome: summary.outcome || null,
    rolledValue,
    isWin: Boolean(summary.isWin),
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildOddEvenSettlementSummary({
        choice: summary.choice || null,
        outcome: summary.outcome || null,
        isWin: Boolean(summary.isWin),
        entryCost,
        fundingSource,
      }),
  };
}

/** Uniform 1–100 inclusive; parity is authoritative outcome. */
function rollServerValue() {
  return randomInt(1, 101);
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
          message: "Solo V2 Odd/Even resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Odd/Even resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "odd_even") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be odd_even",
      });
    }

    if (
      ![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS, SOLO_V2_SESSION_STATUS.RESOLVED].includes(
        sessionRow.session_status,
      )
    ) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: `Session state ${sessionRow.session_status} is not resolvable`,
      });
    }

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: createResolvedPayload(sessionRow),
        authority: {
          outcomeTruth: "server",
          settlement: "deferred",
          stats: "deferred",
        },
      });
    }

    const snapshotResult = await buildOddEvenSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Odd/Even resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Choice lookup is temporarily unavailable.",
      });
    }

    const snapshot = snapshotResult.snapshot;
    const choice = snapshot.choice;
    if (!choice) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "No submitted odd/even choice found for this session.",
      });
    }

    const rolledValue = rollServerValue();
    const outcome = parityFromValue(rolledValue);
    const isWin = choice === outcome;
    const resolvedAt = new Date().toISOString();
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);
    const resolvedSummary = {
      phase: "odd_even_resolved",
      choice,
      outcome,
      rolledValue,
      isWin,
      resolvedAt,
      settlementSummary: buildOddEvenSettlementSummary({ choice, outcome, isWin, entryCost, fundingSource }),
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
      if (isMissingTable(sessionUpdate.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Odd/Even resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Odd/Even resolve is temporarily unavailable.",
      });
    }

    if (!sessionUpdate.data) {
      const existingRead = await supabase.rpc("solo_v2_get_session", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
      });
      if (existingRead.error) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "resolve_conflict",
          message: "Session resolve conflict detected",
        });
      }

      const existingRow = Array.isArray(existingRead.data) ? existingRead.data[0] : existingRead.data;
      if (existingRow?.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "resolved",
          idempotent: true,
          result: createResolvedPayload(existingRow),
          authority: {
            outcomeTruth: "server",
            settlement: "deferred",
            stats: "deferred",
          },
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
        gameKey: "odd_even",
        action: "resolve",
        outcome,
        rolledValue,
        isWin,
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
        choice,
        outcome,
        rolledValue,
        isWin,
        resolvedAt,
        settlementSummary: buildOddEvenSettlementSummary({ choice, outcome, isWin, entryCost, fundingSource }),
      },
      authority: {
        outcomeTruth: "server",
        settlement: "deferred",
        stats: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/odd-even/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Odd/Even resolve failed",
    });
  }
}
