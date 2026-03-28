import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { buildQuickFlipSessionSnapshot } from "../../../../lib/solo-v2/server/quickFlipSnapshot";
import { buildMysteryBoxSessionSnapshot } from "../../../../lib/solo-v2/server/mysteryBoxSnapshot";
import { buildHighLowCardsSessionSnapshot } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import { buildDicePickSessionSnapshot } from "../../../../lib/solo-v2/server/dicePickSnapshot";
import { buildGoldRushDiggerSessionSnapshot } from "../../../../lib/solo-v2/server/goldRushDiggerSnapshot";
import { buildTreasureDoorsSessionSnapshot } from "../../../../lib/solo-v2/server/treasureDoorsSnapshot";
import { buildSpeedTrackSessionSnapshot } from "../../../../lib/solo-v2/server/speedTrackSnapshot";
import { buildLimitRunSessionSnapshot } from "../../../../lib/solo-v2/server/limitRunSnapshot";
import {
  buildNumberHuntSessionSnapshot,
  stripNumberHuntSecretFromSummary,
} from "../../../../lib/solo-v2/server/numberHuntSnapshot";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";

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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  const sessionId = parseSessionId(req.query?.sessionId);
  if (!sessionId) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const playerRef = resolvePlayerRef(req);

    const { data, error } = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
    });

    if (error) {
      if (isMissingTable(error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 session persistence is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Session read is temporarily unavailable.",
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    let sessionReadState = "ready";
    let quickFlipPayload = null;
    let mysteryBoxPayload = null;
    let highLowCardsPayload = null;
    let dicePickPayload = null;
    let goldRushDiggerPayload = null;
    let treasureDoorsPayload = null;
    let speedTrackPayload = null;
    let limitRunPayload = null;
    let numberHuntPayload = null;

    if (row.game_key === "quick_flip") {
      const quickFlipSnapshotResult = await buildQuickFlipSessionSnapshot(supabase, row);
      if (!quickFlipSnapshotResult.ok) {
        if (isMissingTable(quickFlipSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const quickFlipSnapshot = quickFlipSnapshotResult.snapshot;
      sessionReadState = quickFlipSnapshot.readState;
      quickFlipPayload = {
        choice: quickFlipSnapshot.choice,
        choiceEventId: quickFlipSnapshot.choiceEventId,
        choiceSubmittedAt: quickFlipSnapshot.choiceSubmittedAt,
        canResolve: quickFlipSnapshot.canResolve,
        resolvedResult: quickFlipSnapshot.resolvedResult,
      };
    } else if (row.game_key === "mystery_box") {
      const mysterySnapshotResult = await buildMysteryBoxSessionSnapshot(supabase, row);
      if (!mysterySnapshotResult.ok) {
        if (isMissingTable(mysterySnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const mysterySnapshot = mysterySnapshotResult.snapshot;
      sessionReadState = mysterySnapshot.readState;
      mysteryBoxPayload = {
        boxChoice: mysterySnapshot.boxChoice,
        pickEventId: mysterySnapshot.pickEventId,
        pickSubmittedAt: mysterySnapshot.pickSubmittedAt,
        canResolve: mysterySnapshot.canResolve,
        resolvedResult: mysterySnapshot.resolvedResult,
      };
    } else if (row.game_key === "high_low_cards") {
      const highLowSnapshotResult = await buildHighLowCardsSessionSnapshot(supabase, row);
      if (!highLowSnapshotResult.ok) {
        if (isMissingTable(highLowSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const highLowSnapshot = highLowSnapshotResult.snapshot;
      sessionReadState = highLowSnapshot.readState;
      highLowCardsPayload = {
        playing: highLowSnapshot.playing,
        pendingGuess: highLowSnapshot.pendingGuess,
        canResolveTurn: highLowSnapshot.canResolveTurn,
        canCashOut: highLowSnapshot.canCashOut,
        resolvedResult: highLowSnapshot.resolvedResult,
      };
    } else if (row.game_key === "dice_pick") {
      const dicePickSnapshotResult = await buildDicePickSessionSnapshot(supabase, row);
      if (!dicePickSnapshotResult.ok) {
        if (isMissingTable(dicePickSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const dicePickSnapshot = dicePickSnapshotResult.snapshot;
      sessionReadState = dicePickSnapshot.readState;
      dicePickPayload = {
        zone: dicePickSnapshot.zone,
        submitEventId: dicePickSnapshot.submitEventId,
        submitSubmittedAt: dicePickSnapshot.submitSubmittedAt,
        canResolve: dicePickSnapshot.canResolve,
        resolvedResult: dicePickSnapshot.resolvedResult,
      };
    } else if (row.game_key === "gold_rush_digger") {
      const grSnapshotResult = await buildGoldRushDiggerSessionSnapshot(supabase, row);
      if (!grSnapshotResult.ok) {
        if (isMissingTable(grSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const grSnapshot = grSnapshotResult.snapshot;
      sessionReadState = grSnapshot.readState;
      goldRushDiggerPayload = {
        readState: grSnapshot.readState,
        playing: grSnapshot.playing,
        pendingPick: grSnapshot.pendingPick,
        pickConflict: grSnapshot.pickConflict,
        canResolveTurn: grSnapshot.canResolveTurn,
        canCashOut: grSnapshot.canCashOut,
        resolvedResult: grSnapshot.resolvedResult,
      };
    } else if (row.game_key === "treasure_doors") {
      const tdSnapshotResult = await buildTreasureDoorsSessionSnapshot(supabase, row);
      if (!tdSnapshotResult.ok) {
        if (isMissingTable(tdSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const tdSnapshot = tdSnapshotResult.snapshot;
      sessionReadState = tdSnapshot.readState;
      treasureDoorsPayload = {
        readState: tdSnapshot.readState,
        playing: tdSnapshot.playing,
        pendingPick: tdSnapshot.pendingPick,
        pickConflict: tdSnapshot.pickConflict,
        canResolveTurn: tdSnapshot.canResolveTurn,
        canCashOut: tdSnapshot.canCashOut,
        resolvedResult: tdSnapshot.resolvedResult,
      };
    } else if (row.game_key === "speed_track") {
      const stSnapshotResult = await buildSpeedTrackSessionSnapshot(supabase, row);
      if (!stSnapshotResult.ok) {
        if (isMissingTable(stSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const stSnapshot = stSnapshotResult.snapshot;
      sessionReadState = stSnapshot.readState;
      speedTrackPayload = {
        readState: stSnapshot.readState,
        playing: stSnapshot.playing,
        pendingPick: stSnapshot.pendingPick,
        pickConflict: stSnapshot.pickConflict,
        canResolveTurn: stSnapshot.canResolveTurn,
        canCashOut: stSnapshot.canCashOut,
        resolvedResult: stSnapshot.resolvedResult,
      };
    } else if (row.game_key === "limit_run") {
      const lrSnapshotResult = await buildLimitRunSessionSnapshot(supabase, row);
      if (!lrSnapshotResult.ok) {
        if (isMissingTable(lrSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const lrSnapshot = lrSnapshotResult.snapshot;
      sessionReadState = lrSnapshot.readState;
      limitRunPayload = {
        readState: lrSnapshot.readState,
        playing: lrSnapshot.playing,
        pendingLock: lrSnapshot.pendingLock,
        pendingRoll: lrSnapshot.pendingRoll,
        lockConflict: lrSnapshot.lockConflict,
        rollConflict: lrSnapshot.rollConflict,
        canResolveTurn: lrSnapshot.canResolveTurn,
        canCashOut: lrSnapshot.canCashOut,
        resolvedResult: lrSnapshot.resolvedResult,
      };
    } else if (row.game_key === "number_hunt") {
      const nhSnapshotResult = await buildNumberHuntSessionSnapshot(supabase, row);
      if (!nhSnapshotResult.ok) {
        if (isMissingTable(nhSnapshotResult.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 session persistence is not migrated yet.",
          });
        }
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Session read is temporarily unavailable.",
        });
      }
      const nhSnapshot = nhSnapshotResult.snapshot;
      sessionReadState = nhSnapshot.readState;
      numberHuntPayload = {
        readState: nhSnapshot.readState,
        playing: nhSnapshot.playing,
        pendingGuess: nhSnapshot.pendingGuess,
        guessConflict: nhSnapshot.guessConflict,
        canResolveTurn: nhSnapshot.canResolveTurn,
        canCashOut: nhSnapshot.canCashOut,
        resolvedResult: nhSnapshot.resolvedResult,
      };
    }

    const rawSummary = row.server_outcome_summary || {};
    const serverOutcomeSummary =
      row.game_key === "number_hunt" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
        ? stripNumberHuntSecretFromSummary(rawSummary)
        : rawSummary;

    return res.status(200).json({
      ok: true,
      category: "success",
      status: sessionReadState,
      session: {
        id: row.id,
        gameKey: row.game_key,
        playerRef: row.player_ref,
        sessionStatus: row.session_status,
        sessionMode: row.session_mode,
        entryAmount: Number(row.entry_amount || 0),
        rewardAmount: Number(row.reward_amount || 0),
        netAmount: Number(row.net_amount || 0),
        serverOutcomeSummary: serverOutcomeSummary,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null,
        expiresAt: row.expires_at || null,
        resolvedAt: row.resolved_at || null,
        readState: sessionReadState,
        quickFlip: quickFlipPayload,
        mysteryBox: mysteryBoxPayload,
        highLowCards: highLowCardsPayload,
        dicePick: dicePickPayload,
        goldRushDigger: goldRushDiggerPayload,
        treasureDoors: treasureDoorsPayload,
        speedTrack: speedTrackPayload,
        limitRun: limitRunPayload,
        numberHunt: numberHuntPayload,
      },
      authority: {
        sessionTruth: "server",
        outcomeTruth: "deferred",
        rewardTruth: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/sessions/[sessionId] failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Read session failed",
    });
  }
}
