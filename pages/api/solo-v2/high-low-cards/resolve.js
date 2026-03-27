import { randomInt } from "crypto";
import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildHighLowCardsSessionSnapshot, normalizeHighLowGuess } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import {
  buildHighLowCardsSettlementSummary,
  HIGH_LOW_CARDS_MIN_WAGER,
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

function createResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const choiceG = normalizeHighLowGuess(summary.choice);
  const outcomeG = normalizeHighLowGuess(summary.outcome);
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    guess: choiceG,
    outcome: outcomeG,
    baseRank: summary.baseRank != null ? Number(summary.baseRank) : null,
    nextRank: summary.nextRank != null ? Number(summary.nextRank) : null,
    isWin: Boolean(summary.isWin),
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildHighLowCardsSettlementSummary({
        choice: choiceG,
        outcome: outcomeG,
        isWin: Boolean(summary.isWin),
        entryCost,
        fundingSource,
      }),
  };
}

function rollDistinctRanks() {
  let base = randomInt(1, 14);
  let next = randomInt(1, 14);
  let guard = 0;
  while (next === base && guard < 32) {
    next = randomInt(1, 14);
    guard += 1;
  }
  if (next === base) {
    next = base === 1 ? 2 : base - 1;
  }
  return { baseRank: base, nextRank: next };
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
          message: "Solo V2 Hi-Lo resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Hi-Lo resolve is temporarily unavailable.",
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

    const snapshotResult = await buildHighLowCardsSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Hi-Lo resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Guess lookup is temporarily unavailable.",
      });
    }

    const snapshot = snapshotResult.snapshot;
    const guess = snapshot.guess;
    if (guess !== "high" && guess !== "low") {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "No submitted hi-lo guess found for this session.",
      });
    }

    const { baseRank, nextRank } = rollDistinctRanks();
    const actualHigh = nextRank > baseRank;
    const outcomeLabel = actualHigh ? "high" : "low";
    const isWin = (guess === "high" && actualHigh) || (guess === "low" && !actualHigh);
    const resolvedAt = new Date().toISOString();
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);
    const resolvedSummary = {
      phase: "high_low_cards_resolved",
      choice: guess,
      outcome: outcomeLabel,
      baseRank,
      nextRank,
      isWin,
      resolvedAt,
      settlementSummary: buildHighLowCardsSettlementSummary({
        choice: guess,
        outcome: outcomeLabel,
        isWin,
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
      if (isMissingTable(sessionUpdate.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Hi-Lo resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Hi-Lo resolve is temporarily unavailable.",
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
        gameKey: "high_low_cards",
        action: "resolve",
        baseRank,
        nextRank,
        outcome: outcomeLabel,
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
        guess,
        outcome: outcomeLabel,
        baseRank,
        nextRank,
        isWin,
        resolvedAt,
        settlementSummary: buildHighLowCardsSettlementSummary({
          choice: guess,
          outcome: outcomeLabel,
          isWin,
          entryCost,
          fundingSource,
        }),
      },
      authority: {
        outcomeTruth: "server",
        settlement: "deferred",
        stats: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/high-low-cards/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Hi-Lo resolve failed",
    });
  }
}
