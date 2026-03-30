import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { buildQuickFlipSessionSnapshot } from "../../../../lib/solo-v2/server/quickFlipSnapshot";
import { buildOddEvenSessionSnapshot } from "../../../../lib/solo-v2/server/oddEvenSnapshot";
import { buildMysteryBoxSessionSnapshot } from "../../../../lib/solo-v2/server/mysteryBoxSnapshot";
import { buildHighLowCardsSessionSnapshot } from "../../../../lib/solo-v2/server/highLowCardsSnapshot";
import { buildDicePickSessionSnapshot } from "../../../../lib/solo-v2/server/dicePickSnapshot";
import { buildGoldRushDiggerSessionSnapshot } from "../../../../lib/solo-v2/server/goldRushDiggerSnapshot";
import { buildTreasureDoorsSessionSnapshot } from "../../../../lib/solo-v2/server/treasureDoorsSnapshot";
import {
  buildVaultDoorsSessionSnapshot,
  stripVaultDoorsSecretsFromSummary,
} from "../../../../lib/solo-v2/server/vaultDoorsSnapshot";
import {
  buildCrystalPathSessionSnapshot,
  stripCrystalPathSecretsFromSummary,
} from "../../../../lib/solo-v2/server/crystalPathSnapshot";
import { buildSpeedTrackSessionSnapshot } from "../../../../lib/solo-v2/server/speedTrackSnapshot";
import { buildLimitRunSessionSnapshot } from "../../../../lib/solo-v2/server/limitRunSnapshot";
import {
  buildNumberHuntSessionSnapshot,
  stripNumberHuntSecretFromSummary,
} from "../../../../lib/solo-v2/server/numberHuntSnapshot";
import {
  buildCoreBreakerSessionSnapshot,
  stripCoreBreakerSecretsFromSummary,
} from "../../../../lib/solo-v2/server/coreBreakerSnapshot";
import {
  buildFlashVeinSessionSnapshot,
  stripFlashVeinSecretsFromSummary,
} from "../../../../lib/solo-v2/server/flashVeinSnapshot";
import { buildDropRunSessionSnapshot } from "../../../../lib/solo-v2/server/dropRunSnapshot";
import {
  buildMysteryChamberSessionSnapshot,
  stripMysteryChamberSecretsFromSummary,
} from "../../../../lib/solo-v2/server/mysteryChamberSnapshot";
import { buildTripleDiceSessionSnapshot } from "../../../../lib/solo-v2/server/tripleDiceSnapshot";
import {
  buildChallenge21SessionSnapshot,
  stripChallenge21SecretsFromSummary,
} from "../../../../lib/solo-v2/server/challenge21Snapshot";
import { buildDiamondsSessionSnapshot, stripDiamondsSecretsFromSummary } from "../../../../lib/solo-v2/server/diamondsSnapshot";
import { buildSoloLadderSessionSnapshot } from "../../../../lib/solo-v2/server/soloLadderSnapshot";
import { buildPulseLockSessionSnapshot } from "../../../../lib/solo-v2/server/pulseLockSnapshot";
import { buildEchoSequenceSessionSnapshot } from "../../../../lib/solo-v2/server/echoSequenceSnapshot";
import { buildSafeZoneSessionSnapshot } from "../../../../lib/solo-v2/server/safeZoneSnapshot";
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
    let oddEvenPayload = null;
    let mysteryBoxPayload = null;
    let highLowCardsPayload = null;
    let dicePickPayload = null;
    let goldRushDiggerPayload = null;
    let treasureDoorsPayload = null;
    let vaultDoorsPayload = null;
    let crystalPathPayload = null;
    let speedTrackPayload = null;
    let limitRunPayload = null;
    let numberHuntPayload = null;
    let coreBreakerPayload = null;
    let tripleDicePayload = null;
    let challenge21Payload = null;
    let dropRunPayload = null;
    let mysteryChamberPayload = null;
    let flashVeinPayload = null;
    let diamondsPayload = null;
    let soloLadderPayload = null;
    let pulseLockPayload = null;
    let echoSequencePayload = null;
    let safeZonePayload = null;

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
    } else if (row.game_key === "odd_even") {
      const oddEvenSnapshotResult = await buildOddEvenSessionSnapshot(supabase, row);
      if (!oddEvenSnapshotResult.ok) {
        if (isMissingTable(oddEvenSnapshotResult.error)) {
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
      const oddEvenSnapshot = oddEvenSnapshotResult.snapshot;
      sessionReadState = oddEvenSnapshot.readState;
      oddEvenPayload = {
        choice: oddEvenSnapshot.choice,
        choiceEventId: oddEvenSnapshot.choiceEventId,
        choiceSubmittedAt: oddEvenSnapshot.choiceSubmittedAt,
        canResolve: oddEvenSnapshot.canResolve,
        resolvedResult: oddEvenSnapshot.resolvedResult,
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
    } else if (row.game_key === "vault_doors") {
      const vdSnapshotResult = await buildVaultDoorsSessionSnapshot(supabase, row);
      if (!vdSnapshotResult.ok) {
        if (isMissingTable(vdSnapshotResult.error)) {
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
      const vdSnapshot = vdSnapshotResult.snapshot;
      sessionReadState = vdSnapshot.readState;
      vaultDoorsPayload = {
        readState: vdSnapshot.readState,
        playing: vdSnapshot.playing,
        pendingPick: vdSnapshot.pendingPick,
        pickConflict: vdSnapshot.pickConflict,
        canResolveTurn: vdSnapshot.canResolveTurn,
        canCashOut: vdSnapshot.canCashOut,
        resolvedResult: vdSnapshot.resolvedResult,
      };
    } else if (row.game_key === "crystal_path") {
      const cpSnapshotResult = await buildCrystalPathSessionSnapshot(supabase, row);
      if (!cpSnapshotResult.ok) {
        if (isMissingTable(cpSnapshotResult.error)) {
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
      const cpSnapshot = cpSnapshotResult.snapshot;
      sessionReadState = cpSnapshot.readState;
      crystalPathPayload = {
        readState: cpSnapshot.readState,
        playing: cpSnapshot.playing,
        pendingPick: cpSnapshot.pendingPick,
        pickConflict: cpSnapshot.pickConflict,
        canResolveTurn: cpSnapshot.canResolveTurn,
        canCashOut: cpSnapshot.canCashOut,
        resolvedResult: cpSnapshot.resolvedResult,
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
    } else if (row.game_key === "core_breaker") {
      const cbSnapshotResult = await buildCoreBreakerSessionSnapshot(supabase, row);
      if (!cbSnapshotResult.ok) {
        if (isMissingTable(cbSnapshotResult.error)) {
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
      const cbSnapshot = cbSnapshotResult.snapshot;
      sessionReadState = cbSnapshot.readState;
      coreBreakerPayload = {
        readState: cbSnapshot.readState,
        playing: cbSnapshot.playing,
        pendingPick: cbSnapshot.pendingPick,
        pickConflict: cbSnapshot.pickConflict,
        canResolveTurn: cbSnapshot.canResolveTurn,
        canCashOut: cbSnapshot.canCashOut,
        resolvedResult: cbSnapshot.resolvedResult,
      };
    } else if (row.game_key === "flash_vein") {
      const fvSnapshotResult = await buildFlashVeinSessionSnapshot(supabase, row);
      if (!fvSnapshotResult.ok) {
        if (isMissingTable(fvSnapshotResult.error)) {
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
      const fvSnapshot = fvSnapshotResult.snapshot;
      sessionReadState = fvSnapshot.readState;
      flashVeinPayload = {
        readState: fvSnapshot.readState,
        playing: fvSnapshot.playing,
        pendingPick: fvSnapshot.pendingPick,
        pickConflict: fvSnapshot.pickConflict,
        canResolveTurn: fvSnapshot.canResolveTurn,
        canCashOut: fvSnapshot.canCashOut,
        resolvedResult: fvSnapshot.resolvedResult,
      };
    } else if (row.game_key === "triple_dice") {
      const tdSnapshotResult = await buildTripleDiceSessionSnapshot(supabase, row);
      if (!tdSnapshotResult.ok) {
        if (isMissingTable(tdSnapshotResult.error)) {
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
      const tdSnapshot = tdSnapshotResult.snapshot;
      sessionReadState = tdSnapshot.readState;
      tripleDicePayload = {
        readState: tdSnapshot.readState,
        playing: tdSnapshot.playing,
        pendingRoll: tdSnapshot.pendingRoll,
        rollConflict: tdSnapshot.rollConflict,
        canResolveTurn: tdSnapshot.canResolveTurn,
        canCashOut: tdSnapshot.canCashOut,
        resolvedResult: tdSnapshot.resolvedResult,
      };
    } else if (row.game_key === "challenge_21") {
      const c21SnapshotResult = await buildChallenge21SessionSnapshot(supabase, row);
      if (!c21SnapshotResult.ok) {
        if (isMissingTable(c21SnapshotResult.error)) {
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
      const c21Snapshot = c21SnapshotResult.snapshot;
      sessionReadState = c21Snapshot.readState;
      challenge21Payload = {
        readState: c21Snapshot.readState,
        playing: c21Snapshot.playing,
        pendingAction: c21Snapshot.pendingAction,
        actionConflict: c21Snapshot.actionConflict,
        canResolveTurn: c21Snapshot.canResolveTurn,
        canCashOut: c21Snapshot.canCashOut,
        resolvedResult: c21Snapshot.resolvedResult,
      };
    } else if (row.game_key === "drop_run") {
      const drSnapshotResult = await buildDropRunSessionSnapshot(supabase, row);
      if (!drSnapshotResult.ok) {
        if (isMissingTable(drSnapshotResult.error)) {
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
      const drSnapshot = drSnapshotResult.snapshot;
      sessionReadState = drSnapshot.readState;
      dropRunPayload = {
        readState: drSnapshot.readState,
        playing: drSnapshot.playing,
        pendingGate: drSnapshot.pendingGate,
        gateConflict: drSnapshot.gateConflict,
        canResolveTurn: drSnapshot.canResolveTurn,
        canCashOut: drSnapshot.canCashOut,
        resolvedResult: drSnapshot.resolvedResult,
      };
    } else if (row.game_key === "mystery_chamber") {
      const mcSnapshotResult = await buildMysteryChamberSessionSnapshot(supabase, row);
      if (!mcSnapshotResult.ok) {
        if (isMissingTable(mcSnapshotResult.error)) {
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
      const mcSnapshot = mcSnapshotResult.snapshot;
      sessionReadState = mcSnapshot.readState;
      mysteryChamberPayload = {
        readState: mcSnapshot.readState,
        playing: mcSnapshot.playing,
        pendingPick: mcSnapshot.pendingPick,
        pickConflict: mcSnapshot.pickConflict,
        canResolveTurn: mcSnapshot.canResolveTurn,
        canCashOut: mcSnapshot.canCashOut,
        resolvedResult: mcSnapshot.resolvedResult,
      };
    } else if (row.game_key === "diamonds") {
      const dSnapshotResult = await buildDiamondsSessionSnapshot(supabase, row);
      if (!dSnapshotResult.ok) {
        if (isMissingTable(dSnapshotResult.error)) {
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
      const dSnapshot = dSnapshotResult.snapshot;
      sessionReadState = dSnapshot.readState;
      diamondsPayload = {
        readState: dSnapshot.readState,
        playing: dSnapshot.playing,
        canCashOut: dSnapshot.canCashOut,
        canReveal: dSnapshot.canReveal,
        resolvedResult: dSnapshot.resolvedResult,
      };
    } else if (row.game_key === "solo_ladder") {
      const slSnapshotResult = await buildSoloLadderSessionSnapshot(supabase, row);
      if (!slSnapshotResult.ok) {
        if (isMissingTable(slSnapshotResult.error)) {
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
      const slSnapshot = slSnapshotResult.snapshot;
      sessionReadState = slSnapshot.readState;
      soloLadderPayload = {
        readState: slSnapshot.readState,
        playing: slSnapshot.playing,
        canCashOut: slSnapshot.canCashOut,
        canClimb: slSnapshot.canClimb,
        resolvedResult: slSnapshot.resolvedResult,
      };
    } else if (row.game_key === "pulse_lock") {
      const plSnapshotResult = await buildPulseLockSessionSnapshot(supabase, row);
      if (!plSnapshotResult.ok) {
        if (isMissingTable(plSnapshotResult.error)) {
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
      const plSnapshot = plSnapshotResult.snapshot;
      sessionReadState = plSnapshot.readState;
      pulseLockPayload = {
        readState: plSnapshot.readState,
        playing: plSnapshot.playing,
        pendingLock: plSnapshot.readState === "pulse_sweeping",
        canResolve: plSnapshot.canResolve,
        resolvedResult: plSnapshot.resolvedResult,
      };
    } else if (row.game_key === "echo_sequence") {
      const esSnapshotResult = await buildEchoSequenceSessionSnapshot(supabase, row);
      if (!esSnapshotResult.ok) {
        if (isMissingTable(esSnapshotResult.error)) {
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
      const esSnapshot = esSnapshotResult.snapshot;
      sessionReadState = esSnapshot.readState;
      echoSequencePayload = {
        readState: esSnapshot.readState,
        playing: esSnapshot.playing,
        pendingChoice: esSnapshot.pendingChoice,
        choiceConflict: esSnapshot.choiceConflict,
        canResolveTurn: esSnapshot.canResolveTurn,
        canCashOut: esSnapshot.canCashOut,
        resolvedResult: esSnapshot.resolvedResult,
      };
    } else if (row.game_key === "safe_zone") {
      const szSnapshotResult = await buildSafeZoneSessionSnapshot(supabase, row);
      if (!szSnapshotResult.ok) {
        if (isMissingTable(szSnapshotResult.error)) {
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
      const szSnapshot = szSnapshotResult.snapshot;
      sessionReadState = szSnapshot.readState;
      safeZonePayload = {
        readState: szSnapshot.readState,
        playing: szSnapshot.playing,
        canResolve: szSnapshot.canResolve,
        canCashOut: szSnapshot.canCashOut,
        pendingState: szSnapshot.pendingState,
        resolvedResult: szSnapshot.resolvedResult,
      };
    }

    const rawSummary = row.server_outcome_summary || {};
    const serverOutcomeSummary =
      row.game_key === "number_hunt" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
        ? stripNumberHuntSecretFromSummary(rawSummary)
        : row.game_key === "core_breaker" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
          ? stripCoreBreakerSecretsFromSummary(rawSummary)
          : row.game_key === "flash_vein" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
            ? stripFlashVeinSecretsFromSummary(rawSummary)
        : row.game_key === "challenge_21" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
          ? stripChallenge21SecretsFromSummary(rawSummary)
          : row.game_key === "mystery_chamber" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
            ? stripMysteryChamberSecretsFromSummary(rawSummary)
            : row.game_key === "diamonds" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
              ? stripDiamondsSecretsFromSummary(rawSummary)
              : row.game_key === "vault_doors" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
                ? stripVaultDoorsSecretsFromSummary(rawSummary)
                : row.game_key === "crystal_path" && row.session_status !== SOLO_V2_SESSION_STATUS.RESOLVED
                  ? stripCrystalPathSecretsFromSummary(rawSummary)
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
        oddEven: oddEvenPayload,
        mysteryBox: mysteryBoxPayload,
        highLowCards: highLowCardsPayload,
        dicePick: dicePickPayload,
        goldRushDigger: goldRushDiggerPayload,
        treasureDoors: treasureDoorsPayload,
        vaultDoors: vaultDoorsPayload,
        crystalPath: crystalPathPayload,
        speedTrack: speedTrackPayload,
        limitRun: limitRunPayload,
        numberHunt: numberHuntPayload,
        coreBreaker: coreBreakerPayload,
        tripleDice: tripleDicePayload,
        challenge21: challenge21Payload,
        dropRun: dropRunPayload,
        mysteryChamber: mysteryChamberPayload,
        flashVein: flashVeinPayload,
        diamonds: diamondsPayload,
        soloLadder: soloLadderPayload,
        pulseLock: pulseLockPayload,
        echoSequence: echoSequencePayload,
        safeZone: safeZonePayload,
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
