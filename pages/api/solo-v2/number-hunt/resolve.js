import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildNumberHuntSessionSnapshot } from "../../../../lib/solo-v2/server/numberHuntSnapshot";
import {
  NUMBER_HUNT_HIT_MULTIPLIERS,
  parseNumberHuntActiveSummary,
} from "../../../../lib/solo-v2/server/numberHuntEngine";
import {
  buildNumberHuntSettlementSummary,
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MIN_WAGER,
  normalizeNumberHuntGuess,
} from "../../../../lib/solo-v2/numberHuntConfig";
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
  return stake >= NUMBER_HUNT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
        : "overload";
  const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    terminalKind,
    payoutReturn,
    isWin: terminalKind !== "overload",
    secretTarget: summary.secretTarget != null ? Number(summary.secretTarget) : null,
    hitOnGuess: summary.hitOnGuess != null ? Number(summary.hitOnGuess) : null,
    rewardMultiplier: summary.rewardMultiplier != null ? Number(summary.rewardMultiplier) : null,
    guessHistory: Array.isArray(summary.guessHistory) ? summary.guessHistory : [],
    won: summary.won === true || (terminalKind === "full_clear" && payoutReturn > 0),
    overloadReason: summary.overloadReason != null ? String(summary.overloadReason) : null,
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildNumberHuntSettlementSummary({
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
          message: "Solo V2 Number Hunt resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Number Hunt resolve is temporarily unavailable.",
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

    if (sessionRow.game_key !== "number_hunt") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be number_hunt",
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

    const snapshotResult = await buildNumberHuntSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Number Hunt resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Number Hunt resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (snap0.guessConflict) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "guess_conflict",
        message: "Conflicting guess events — refresh session state.",
      });
    }

    if (!snap0.pendingGuess) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "guess_required",
        message: "Submit a guess before resolving.",
      });
    }

    if (!snap0.canResolveTurn) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "guess_required",
        message: "No pending guess to resolve.",
      });
    }

    const active = parseNumberHuntActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active Number Hunt state.",
      });
    }

    const pending = snap0.pendingGuess;
    const guessEventId = Number(pending.guessEventId);
    const guess = normalizeNumberHuntGuess(pending.guess);

    if (!Number.isFinite(guessEventId) || guessEventId <= 0 || guess === null) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Invalid pending guess.",
      });
    }

    const prevHistory = Array.isArray(active.guessHistory) ? [...active.guessHistory] : [];
    const usedGuesses = prevHistory.length;
    const secret = active.secretTarget;

    const alreadyGuessed = prevHistory.some(h => Math.floor(Number(h?.guess)) === guess);
    if (alreadyGuessed) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_guess",
        message: "That number was already guessed.",
      });
    }

    if (guess < active.lowBound || guess > active.highBound) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_guess",
        message: "Guess is outside the current range.",
      });
    }

    if (guess === secret) {
      const attemptIndex = usedGuesses;
      const mult = NUMBER_HUNT_HIT_MULTIPLIERS[attemptIndex] ?? NUMBER_HUNT_HIT_MULTIPLIERS[NUMBER_HUNT_HIT_MULTIPLIERS.length - 1];
      const payoutReturn = Math.max(0, Math.floor(entryCost * mult));
      const terminalKind = "full_clear";
      const resolvedAt = new Date().toISOString();
      const hitOnGuess = attemptIndex + 1;

      const resolvedSummary = {
        phase: "number_hunt_resolved",
        terminalKind,
        payoutReturn,
        secretTarget: secret,
        hitOnGuess,
        rewardMultiplier: mult,
        guessHistory: prevHistory,
        won: true,
        overloadReason: null,
        resolvedAt,
        settlementSummary: buildNumberHuntSettlementSummary({
          terminalKind,
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
          message: "Number Hunt resolve update failed.",
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

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: false,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
          terminalKind,
          secretTarget: secret,
          hitOnGuess,
          rewardMultiplier: mult,
          won: true,
          isWin: true,
          payoutReturn,
          guessHistory: prevHistory,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const clue = guess < secret ? `Higher than ${guess}` : `Lower than ${guess}`;
    let lowBound = active.lowBound;
    let highBound = active.highBound;
    if (guess < secret) {
      lowBound = Math.max(lowBound, guess + 1);
    } else {
      highBound = Math.min(highBound, guess - 1);
    }

    const newHistory = [...prevHistory, { guess, clue }];
    const nextUsed = newHistory.length;

    if (nextUsed >= NUMBER_HUNT_MAX_GUESSES) {
      const payoutReturn = 0;
      const terminalKind = "overload";
      const resolvedAt = new Date().toISOString();

      const resolvedSummary = {
        phase: "number_hunt_resolved",
        terminalKind,
        payoutReturn,
        secretTarget: secret,
        hitOnGuess: null,
        rewardMultiplier: null,
        guessHistory: newHistory,
        won: false,
        overloadReason: "number_hunt_miss",
        resolvedAt,
        settlementSummary: buildNumberHuntSettlementSummary({
          terminalKind,
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
          message: "Number Hunt resolve update failed.",
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

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: false,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
          terminalKind,
          secretTarget: secret,
          hitOnGuess: null,
          won: false,
          isWin: false,
          payoutReturn,
          guessHistory: newHistory,
          settlementSummary: resolvedSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    const continuingSummary = {
      phase: "number_hunt_active",
      secretTarget: secret,
      guessesUsed: nextUsed,
      maxGuesses: NUMBER_HUNT_MAX_GUESSES,
      guessHistory: newHistory,
      lastProcessedGuessEventId: guessEventId,
      lowBound,
      highBound,
    };

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
        message: "Number Hunt continue update failed.",
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

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "in_progress",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        guessesUsed: nextUsed,
        maxGuesses: NUMBER_HUNT_MAX_GUESSES,
        guessHistory: newHistory,
        lowBound,
        highBound,
        lastClue: clue,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/number-hunt/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Number Hunt resolve failed",
    });
  }
}
