import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildHighLowCardsSessionSnapshot, normalizeHighLowGuess } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import {
  buildHighLowStreakSettlementSummary,
  HIGH_LOW_CARDS_MIN_WAGER,
  payoutFromEntryAndStreak,
} from "../../../../lib/solo-v2/highLowCardsConfig";
import { QUICK_FLIP_CONFIG } from "../../../../lib/solo-v2/quickFlipConfig";
import { drawServerCard, isGuessCorrect, multiplierFromStreak } from "../../../../lib/solo-v2/server/highLowCardsEngine";

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
    currentValue,
    currentRank: s.currentRank != null ? String(s.currentRank) : null,
    currentSuit: s.currentSuit != null ? String(s.currentSuit) : null,
    streak: Math.max(0, Math.floor(Number(s.streak) || 0)),
    lastProcessedGuessEventId: Math.max(0, Math.floor(Number(s.lastProcessedGuessEventId) || 0)),
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

function buildLossSummary(sessionRow, active, guess, nextCard, entryCost, fundingSource) {
  const payoutReturn = 0;
  const settlementSummary = buildHighLowStreakSettlementSummary({
    payoutReturn,
    entryCost,
    fundingSource,
  });
  return {
    phase: "high_low_cards_resolved",
    terminalKind: "loss",
    finalStreak: active.streak,
    lastGuess: guess,
    payoutReturn,
    lastNextCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
    resolvedAt: new Date().toISOString(),
    settlementSummary,
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

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "session_terminal",
        message: "Session is already finished.",
      });
    }

    if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: `Session state ${sessionRow.session_status} cannot resolve a turn.`,
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
        message: "Turn resolve is temporarily unavailable.",
      });
    }

    const snap0 = snapshotResult.snapshot;
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (!snap0.canResolveTurn || !snap0.pendingGuess) {
      const activeEarly = parseActiveSummary(sessionRow);
      const lt = activeEarly?.lastTurn;
      if (
        activeEarly &&
        lt &&
        lt.won &&
        Number(lt.processedGuessEventId) === Number(activeEarly.lastProcessedGuessEventId) &&
        Number(activeEarly.lastProcessedGuessEventId) > 0
      ) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "turn_complete",
          idempotent: true,
          result: {
            sessionId,
            sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            won: true,
            guess: normalizeHighLowGuess(lt.guess),
            nextCard: lt.nextCard || null,
            streak: Math.max(0, Math.floor(Number(lt.streakAfter) || 0)),
            multiplier: Number(lt.multiplier) || null,
            currentPayout: Math.floor(Number(lt.currentPayout) || 0),
            currentCard: lt.currentCardAfter || null,
          },
          authority: { outcomeTruth: "server", settlement: "deferred" },
        });
      }

      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "No pending guess to resolve for this session.",
      });
    }

    const pending = snap0.pendingGuess;
    const guess = pending.guess;
    const guessEventId = Number(pending.guessEventId);
    if (!Number.isFinite(guessEventId) || guessEventId <= 0) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "choice_required",
        message: "Invalid pending guess event.",
      });
    }

    const active = parseActiveSummary(sessionRow);
    if (!active) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_session_state",
        message: "Session has no active hi-lo state.",
      });
    }

    if (active.lastProcessedGuessEventId >= guessEventId && active.lastTurn && Number(active.lastTurn.processedGuessEventId) === guessEventId) {
      const lt = active.lastTurn;
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "turn_complete",
        idempotent: true,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          won: Boolean(lt.won),
          guess: normalizeHighLowGuess(lt.guess),
          nextCard: lt.nextCard || null,
          streak: Math.max(0, Math.floor(Number(lt.streakAfter) || 0)),
          multiplier: Number(lt.multiplier) || null,
          currentPayout: Math.floor(Number(lt.currentPayout) || 0),
          currentCard: lt.currentCardAfter || null,
        },
        authority: {
          outcomeTruth: "server",
          settlement: "deferred",
        },
      });
    }

    let nextCard = drawServerCard();
    let guard = 0;
    while (nextCard.value === active.currentValue && guard < 64) {
      nextCard = drawServerCard();
      guard += 1;
    }

    const won = isGuessCorrect(guess, active.currentValue, nextCard.value);
    const resolvedAt = new Date().toISOString();

    if (!won) {
      const lossSummary = buildLossSummary(sessionRow, active, guess, nextCard, entryCost, fundingSource);
      const sessionUpdate = await supabase
        .from("solo_v2_sessions")
        .update({
          session_status: SOLO_V2_SESSION_STATUS.RESOLVED,
          resolved_at: lossSummary.resolvedAt,
          server_outcome_summary: lossSummary,
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
          message: "Hi-Lo resolve is temporarily unavailable.",
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
            status: "session_lost",
            idempotent: true,
            result: {
              sessionId,
              sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
              won: false,
              terminalKind: "loss",
              streak: active.streak,
              guess,
              nextCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
              settlementSummary: row2.server_outcome_summary?.settlementSummary || lossSummary.settlementSummary,
            },
            authority: { outcomeTruth: "server", settlement: "deferred" },
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
          action: "turn_resolve",
          won: false,
          guessEventId,
          guess,
          nextCard,
        },
      });

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "session_lost",
        idempotent: false,
        result: {
          sessionId,
          sessionStatus: SOLO_V2_SESSION_STATUS.RESOLVED,
          won: false,
          terminalKind: "loss",
          streak: active.streak,
          guess,
          nextCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
          settlementSummary: lossSummary.settlementSummary,
        },
        authority: { outcomeTruth: "server", settlement: "deferred" },
      });
    }

    const newStreak = active.streak + 1;
    const mult = multiplierFromStreak(newStreak);
    const currentPayout = payoutFromEntryAndStreak(entryCost, newStreak);
    const lastTurn = {
      processedGuessEventId: guessEventId,
      guess,
      won: true,
      nextCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
      streakAfter: newStreak,
      multiplier: mult,
      currentPayout,
      currentCardAfter: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
    };

    const newActiveSummary = {
      phase: "high_low_cards_active",
      currentValue: nextCard.value,
      currentRank: nextCard.rank,
      currentSuit: nextCard.suit,
      streak: newStreak,
      lastProcessedGuessEventId: guessEventId,
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
      .eq("game_key", "high_low_cards")
      .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
      .select("id,session_status,server_outcome_summary")
      .maybeSingle();

    if (sessionUpdate.error || !sessionUpdate.data) {
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Hi-Lo turn update failed.",
      });
    }

    await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: "session_note",
      p_event_payload: {
        gameKey: "high_low_cards",
        action: "turn_resolve",
        won: true,
        guessEventId,
        guess,
        nextCard,
        newStreak,
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
        won: true,
        guess,
        nextCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
        streak: newStreak,
        multiplier: mult,
        currentPayout,
        currentCard: { rank: nextCard.rank, suit: nextCard.suit, value: nextCard.value },
      },
      authority: {
        outcomeTruth: "server",
        settlement: "deferred",
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
