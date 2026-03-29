import { getSupabaseAdmin } from "../../../../../lib/server/supabaseAdmin";
import {
  parseSessionEventPayload,
  parseSessionId,
  resolvePlayerRef,
} from "../../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../../lib/solo-v2/server/sessionTypes";
import { buildQuickFlipSessionSnapshot, normalizeQuickFlipChoice } from "../../../../../lib/solo-v2/server/quickFlipSnapshot";
import { buildMysteryBoxSessionSnapshot, normalizeMysteryBoxIndex } from "../../../../../lib/solo-v2/server/mysteryBoxSnapshot";
import { buildHighLowCardsSessionSnapshot, normalizeHighLowGuess } from "../../../../../lib/solo-v2/server/highLowCardsSnapshot";
import { buildDicePickSessionSnapshot, normalizeDicePickZone } from "../../../../../lib/solo-v2/server/dicePickSnapshot";
import {
  buildGoldRushDiggerSessionSnapshot,
  normalizeGoldRushColumn,
  normalizeGoldRushRowIndex,
} from "../../../../../lib/solo-v2/server/goldRushDiggerSnapshot";
import {
  buildTreasureDoorsSessionSnapshot,
  normalizeTreasureChamberIndex,
  normalizeTreasureDoor,
} from "../../../../../lib/solo-v2/server/treasureDoorsSnapshot";
import {
  buildSpeedTrackSessionSnapshot,
  normalizeSpeedTrackCheckpointIndex,
  normalizeSpeedTrackRoute,
} from "../../../../../lib/solo-v2/server/speedTrackSnapshot";
import { buildLimitRunSessionSnapshot } from "../../../../../lib/solo-v2/server/limitRunSnapshot";
import { normalizeLimitRunTargetMultiplier } from "../../../../../lib/solo-v2/limitRunConfig";
import { buildTripleDiceSessionSnapshot } from "../../../../../lib/solo-v2/server/tripleDiceSnapshot";
import { normalizeTripleDiceZone } from "../../../../../lib/solo-v2/tripleDiceConfig";
import { buildNumberHuntSessionSnapshot } from "../../../../../lib/solo-v2/server/numberHuntSnapshot";
import { normalizeNumberHuntGuess } from "../../../../../lib/solo-v2/numberHuntConfig";
import { buildCoreBreakerSessionSnapshot } from "../../../../../lib/solo-v2/server/coreBreakerSnapshot";
import { normalizeCoreBreakerColumn } from "../../../../../lib/solo-v2/coreBreakerConfig";
import { buildFlashVeinSessionSnapshot } from "../../../../../lib/solo-v2/server/flashVeinSnapshot";
import { normalizeFlashVeinColumn } from "../../../../../lib/solo-v2/flashVeinConfig";
import { parseFlashVeinActiveSummary } from "../../../../../lib/solo-v2/server/flashVeinEngine";
import { buildDropRunSessionSnapshot } from "../../../../../lib/solo-v2/server/dropRunSnapshot";
import {
  buildMysteryChamberSessionSnapshot,
  normalizeMysteryChamberSigil,
} from "../../../../../lib/solo-v2/server/mysteryChamberSnapshot";
import {
  buildChallenge21SessionSnapshot,
  computeAllowedChallenge21Decisions,
} from "../../../../../lib/solo-v2/server/challenge21Snapshot";
import { normalizeChallenge21Decision } from "../../../../../lib/solo-v2/challenge21Config";
import { parseChallenge21ActiveSummary } from "../../../../../lib/solo-v2/server/challenge21Engine";
import {
  DROP_RUN_GATES,
  DROP_RUN_RELEASE_COLUMN,
  normalizeDropRunGate,
} from "../../../../../lib/solo-v2/dropRunConfig";

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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }

  const sessionId = parseSessionId(req.query?.sessionId);
  if (!sessionId) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  }

  const parsed = parseSessionEventPayload(req.body);
  if (!parsed.ok) {
    return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: parsed.message });
  }

  // Foundation replay/integrity placeholders:
  // - playerRef ownership is enforced through the scoped session read.
  // - nonce/signature verification is intentionally deferred to Deliverable 5.
  const playerRef = resolvePlayerRef(req);
  const { eventType, eventPayload } = parsed.value;

  try {
    const supabase = getSupabaseAdmin();

    const sessionLookup = await supabase.rpc("solo_v2_get_session", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
    });
    if (sessionLookup.error) {
      if (isMissingTable(sessionLookup.error)) {
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

    const sessionRow = Array.isArray(sessionLookup.data) ? sessionLookup.data[0] : sessionLookup.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    const isQuickFlipChoiceSubmit =
      sessionRow.game_key === "quick_flip" &&
      eventType === "client_action" &&
      eventPayload?.action === "choice_submit";

    if (isQuickFlipChoiceSubmit) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Quick Flip choice submit is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "quick_flip") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Quick Flip choice submit requires gameKey quick_flip.",
        });
      }

      const selectedSide = normalizeQuickFlipChoice(eventPayload?.side);
      if (!selectedSide) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Quick Flip side must be heads or tails.",
        });
      }

      const snapshotResult = await buildQuickFlipSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Choice submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      const priorChoice = normalizeQuickFlipChoice(snapshot.choice);
      if (priorChoice && priorChoice === selectedSide) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "accepted",
          idempotent: true,
          event: {
            id: snapshot.choiceEventId || null,
            eventType,
          },
          session: {
            id: sessionId,
            sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          },
          authority: {
            eventValidation: "server",
            gameplayResolution: "deferred",
          },
        });
      }

      if (priorChoice && priorChoice !== selectedSide) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "choice_already_submitted",
          message: "Quick Flip choice is already locked for this session.",
        });
      }
    }

    const isDicePickSubmit =
      sessionRow.game_key === "dice_pick" &&
      eventType === "client_action" &&
      eventPayload?.action === "dice_pick_submit";

    if (isDicePickSubmit) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Dice Pick submit is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "dice_pick") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Dice Pick submit requires gameKey dice_pick.",
        });
      }

      const selectedZone = normalizeDicePickZone(eventPayload?.zone);
      if (!selectedZone) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Dice Pick zone must be low or high.",
        });
      }

      const snapshotResult = await buildDicePickSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Dice Pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      const priorZone = normalizeDicePickZone(snapshot.zone);
      if (priorZone && priorZone === selectedZone) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "accepted",
          idempotent: true,
          event: {
            id: snapshot.submitEventId || null,
            eventType,
          },
          session: {
            id: sessionId,
            sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          },
          authority: {
            eventValidation: "server",
            gameplayResolution: "deferred",
          },
        });
      }

      if (priorZone && priorZone !== selectedZone) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "choice_already_submitted",
          message: "Dice Pick zone is already locked for this session.",
        });
      }
    }

    const isGoldRushPick =
      sessionRow.game_key === "gold_rush_digger" &&
      eventType === "client_action" &&
      eventPayload?.action === "gold_rush_pick";

    if (isGoldRushPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Gold Rush pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "gold_rush_digger") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Gold Rush pick requires gameKey gold_rush_digger.",
        });
      }

      const rowIndex = normalizeGoldRushRowIndex(eventPayload?.rowIndex);
      const column = normalizeGoldRushColumn(eventPayload?.column);
      if (rowIndex === null || column === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Gold Rush pick requires rowIndex 0..5 and column 0..2.",
        });
      }

      const snapshotResult = await buildGoldRushDiggerSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Gold Rush pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting dig picks for this row. Refresh session state.",
        });
      }

      const playing = snapshot.playing;
      const expectedRow = playing?.currentRowIndex;
      if (!Number.isFinite(Number(expectedRow)) || rowIndex !== expectedRow) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_row",
          message: "Pick must target the current dig row.",
        });
      }

      if (snapshot.pendingPick) {
        const pp = snapshot.pendingPick;
        const same = pp.rowIndex === rowIndex && pp.column === column;
        if (same) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pp.pickEventId || null,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "A different dig spot is already pending for this row.",
        });
      }
    }

    const isTreasureDoorsPick =
      sessionRow.game_key === "treasure_doors" &&
      eventType === "client_action" &&
      eventPayload?.action === "treasure_doors_pick";

    if (isTreasureDoorsPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Treasure Doors pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "treasure_doors") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Treasure Doors pick requires gameKey treasure_doors.",
        });
      }

      const chamberIndex = normalizeTreasureChamberIndex(eventPayload?.chamberIndex);
      const door = normalizeTreasureDoor(eventPayload?.door);
      if (chamberIndex === null || door === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Treasure Doors pick requires chamberIndex 0..4 and door 0..2.",
        });
      }

      const snapshotResult = await buildTreasureDoorsSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Treasure Doors pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting door picks for this chamber. Refresh session state.",
        });
      }

      const playing = snapshot.playing;
      const expectedChamber = playing?.currentChamberIndex;
      if (!Number.isFinite(Number(expectedChamber)) || chamberIndex !== expectedChamber) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_row",
          message: "Pick must target the current chamber.",
        });
      }

      if (snapshot.pendingPick) {
        const pp = snapshot.pendingPick;
        const same = pp.chamberIndex === chamberIndex && pp.door === door;
        if (same) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pp.pickEventId || null,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "A different door is already pending for this chamber.",
        });
      }
    }

    const isMysteryChamberPick =
      sessionRow.game_key === "mystery_chamber" &&
      eventType === "client_action" &&
      eventPayload?.action === "mystery_chamber_pick";

    if (isMysteryChamberPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Mystery Chamber pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "mystery_chamber") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Mystery Chamber pick requires gameKey mystery_chamber.",
        });
      }

      const sigilIndex = normalizeMysteryChamberSigil(eventPayload?.sigilIndex);
      if (sigilIndex === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Mystery Chamber pick requires sigilIndex 0..3.",
        });
      }

      const snapshotResult = await buildMysteryChamberSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Mystery Chamber pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting sigil picks. Refresh session state.",
        });
      }

      if (snapshot.readState !== "choice_required") {
        const rs = String(snapshot.readState || "");
        let detail = "This step is not accepting a new sigil pick right now.";
        if (rs === "choice_submitted") {
          detail =
            "Your last sigil is still resolving — wait for the result before choosing again (avoid double-tapping).";
        } else if (rs === "resolved") {
          detail = "This Mystery Chamber run has already finished — start a new run to play again.";
        } else if (rs === "invalid") {
          detail = "Session is not in a valid state for Mystery Chamber picks.";
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: detail,
        });
      }

      if (snapshot.pendingPick) {
        const pp = snapshot.pendingPick;
        const same = pp.sigilIndex === sigilIndex;
        if (same) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pp.pickEventId || null,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message:
            "A different sigil is already locked in for this chamber — refresh if the screen looks out of sync.",
        });
      }
    }

    const isSpeedTrackPick =
      sessionRow.game_key === "speed_track" &&
      eventType === "client_action" &&
      eventPayload?.action === "speed_track_pick";

    if (isSpeedTrackPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Speed Track pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "speed_track") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Speed Track pick requires gameKey speed_track.",
        });
      }

      const checkpointIndex = normalizeSpeedTrackCheckpointIndex(eventPayload?.checkpointIndex);
      const routeIndex = normalizeSpeedTrackRoute(eventPayload?.route);
      if (checkpointIndex === null || routeIndex === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Speed Track pick requires checkpointIndex 0..5 and route inside|center|outside.",
        });
      }

      const snapshotResult = await buildSpeedTrackSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Speed Track pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting route picks for this checkpoint. Refresh session state.",
        });
      }

      const playing = snapshot.playing;
      const expectedCp = playing?.currentCheckpointIndex;
      if (!Number.isFinite(Number(expectedCp)) || checkpointIndex !== expectedCp) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_row",
          message: "Pick must target the current checkpoint.",
        });
      }

      if (snapshot.pendingPick) {
        const pp = snapshot.pendingPick;
        const same = pp.checkpointIndex === checkpointIndex && pp.routeIndex === routeIndex;
        if (same) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pp.pickEventId || null,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "A different route is already pending for this checkpoint.",
        });
      }
    }

    const isLimitRunRoll =
      sessionRow.game_key === "limit_run" &&
      eventType === "client_action" &&
      eventPayload?.action === "limit_run_roll";

    if (isLimitRunRoll) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Limit Run roll is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "limit_run") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Limit Run requires gameKey limit_run.",
        });
      }

      const targetMultiplier = normalizeLimitRunTargetMultiplier(eventPayload?.targetMultiplier);
      if (targetMultiplier === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "limit_run_roll requires a valid targetMultiplier.",
        });
      }

      const snapshotResult = await buildLimitRunSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Limit Run roll submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.rollConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "roll_conflict",
          message: "Conflicting roll events. Refresh session state.",
        });
      }

      if (snapshot.pendingRoll) {
        const pr = snapshot.pendingRoll;
        const pendingId = pr.rollEventId != null ? Number(pr.rollEventId) : null;
        const sameTarget = Number(pr.targetMultiplier) === targetMultiplier;
        if (sameTarget && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current roll before submitting a new one.",
        });
      }
    }

    const isTripleDiceRoll =
      sessionRow.game_key === "triple_dice" &&
      eventType === "client_action" &&
      eventPayload?.action === "triple_dice_roll";

    if (isTripleDiceRoll) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Triple Dice roll is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "triple_dice") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Triple Dice requires gameKey triple_dice.",
        });
      }

      const zone = normalizeTripleDiceZone(eventPayload?.zone ?? eventPayload?.tripleDiceZone);
      if (zone === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "triple_dice_roll requires zone: low, mid, high, or triple.",
        });
      }

      const snapshotResult = await buildTripleDiceSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Triple Dice roll submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.rollConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "roll_conflict",
          message: "Conflicting roll events. Refresh session state.",
        });
      }

      if (snapshot.pendingRoll) {
        const pr = snapshot.pendingRoll;
        const pendingId = pr.rollEventId != null ? Number(pr.rollEventId) : null;
        const sameZone = String(pr.zone) === zone;
        if (sameZone && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current roll before submitting a new one.",
        });
      }
    }

    const isNumberHuntGuess =
      sessionRow.game_key === "number_hunt" &&
      eventType === "client_action" &&
      eventPayload?.action === "number_hunt_guess";

    if (isNumberHuntGuess) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Number Hunt guess is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "number_hunt") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Number Hunt requires gameKey number_hunt.",
        });
      }

      const guess = normalizeNumberHuntGuess(eventPayload?.guess);
      if (guess === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "number_hunt_guess requires an integer 1–20.",
        });
      }

      const snapshotResult = await buildNumberHuntSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Number Hunt guess submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.guessConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "guess_conflict",
          message: "Conflicting guess events. Refresh session state.",
        });
      }

      if (snapshot.pendingGuess) {
        const pg = snapshot.pendingGuess;
        const pendingId = pg.guessEventId != null ? Number(pg.guessEventId) : null;
        const same = Number(pg.guess) === guess;
        if (same && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current guess before submitting a new one.",
        });
      }

      const playing = snapshot.playing;
      if (playing) {
        const low = Number(playing.lowBound);
        const high = Number(playing.highBound);
        if (Number.isFinite(low) && Number.isFinite(high) && (guess < low || guess > high)) {
          return res.status(400).json({
            ok: false,
            category: "validation_error",
            status: "invalid_request",
            message: "Guess is outside the allowed range.",
          });
        }
        const hist = Array.isArray(playing.guessHistory) ? playing.guessHistory : [];
        if (hist.some(h => Number(h?.guess) === guess)) {
          return res.status(400).json({
            ok: false,
            category: "validation_error",
            status: "invalid_request",
            message: "That number was already guessed.",
          });
        }
      }
    }

    const isFlashVeinReveal =
      sessionRow.game_key === "flash_vein" &&
      eventType === "client_action" &&
      eventPayload?.action === "flash_vein_reveal";

    if (isFlashVeinReveal) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Flash Vein reveal is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "flash_vein") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Flash Vein requires gameKey flash_vein.",
        });
      }

      const activeFv = parseFlashVeinActiveSummary(sessionRow);
      if (!activeFv) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Flash Vein session state is missing or invalid.",
        });
      }

      const snapshotFv = await buildFlashVeinSessionSnapshot(supabase, sessionRow);
      if (!snapshotFv.ok) {
        if (isMissingTable(snapshotFv.error)) {
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
          message: "Flash Vein reveal is temporarily unavailable.",
        });
      }

      const snapFv = snapshotFv.snapshot;
      if (snapFv.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting picks — refresh session state.",
        });
      }

      if (snapFv.pendingPick) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current pick before revealing the next flash.",
        });
      }

      const rIdx = activeFv.currentRoundIndex;
      const lanesRow = activeFv.roundPlan[rIdx];
      const lanes = Array.isArray(lanesRow) ? [...lanesRow] : [];

      if (activeFv.revealedForRound === rIdx) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "reveal_ready",
          idempotent: true,
          reveal: { roundIndex: rIdx, lanes },
          session: {
            id: sessionId,
            sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          },
          authority: {
            eventValidation: "server",
            gameplayResolution: "deferred",
          },
        });
      }

      const rawSummary = sessionRow.server_outcome_summary || {};
      const nextSummary = { ...rawSummary, revealedForRound: rIdx };

      const sessionUpdate = await supabase
        .from("solo_v2_sessions")
        .update({
          server_outcome_summary: nextSummary,
          session_status: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        })
        .eq("id", sessionId)
        .eq("player_ref", playerRef)
        .in("session_status", [SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS])
        .select("id,session_status,server_outcome_summary")
        .maybeSingle();

      if (sessionUpdate.error) {
        return res.status(503).json({
          ok: false,
          category: "unavailable",
          status: "unavailable",
          message: "Flash Vein reveal update failed.",
        });
      }

      if (!sessionUpdate.data) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "reveal_conflict",
          message: "Session changed during reveal.",
        });
      }

      const revealPayload = { action: "flash_vein_reveal", gameKey: "flash_vein" };
      const appendReveal = await supabase.rpc("solo_v2_append_session_event", {
        p_session_id: sessionId,
        p_player_ref: playerRef,
        p_event_type: eventType,
        p_event_payload: revealPayload,
      });

      if (appendReveal.error) {
        if (isMissingTable(appendReveal.error)) {
          return res.status(503).json({
            ok: false,
            category: "pending_migration",
            status: "pending_migration",
            message: "Solo V2 event persistence is not migrated yet.",
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "event_rejected",
          message: appendReveal.error.message,
        });
      }

      const evRow = Array.isArray(appendReveal.data) ? appendReveal.data[0] : appendReveal.data;

      return res.status(200).json({
        ok: true,
        category: "success",
        status: "reveal_ready",
        idempotent: false,
        reveal: { roundIndex: rIdx, lanes },
        event: {
          id: evRow?.event_id || null,
          eventType,
        },
        session: {
          id: sessionId,
          sessionStatus: evRow?.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        },
        authority: {
          eventValidation: "server",
          gameplayResolution: "deferred",
        },
      });
    }

    const isCoreBreakerStrike =
      sessionRow.game_key === "core_breaker" &&
      eventType === "client_action" &&
      eventPayload?.action === "core_breaker_strike";

    if (isCoreBreakerStrike) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Core Breaker strike is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "core_breaker") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Core Breaker requires gameKey core_breaker.",
        });
      }

      const column = normalizeCoreBreakerColumn(eventPayload?.column);
      if (column === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "core_breaker_strike requires column 0, 1, or 2.",
        });
      }

      const snapshotResult = await buildCoreBreakerSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Core Breaker strike submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "strike_conflict",
          message: "Conflicting strike events. Refresh session state.",
        });
      }

      if (snapshot.pendingPick) {
        const pp = snapshot.pendingPick;
        const pendingId = pp.pickEventId != null ? Number(pp.pickEventId) : null;
        const same = Number(pp.column) === column;
        if (same && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current strike before submitting a new one.",
        });
      }

      if (String(snapshot.readState || "") !== "ready") {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Core Breaker is not accepting strikes right now.",
        });
      }
    }

    const isFlashVeinPick =
      sessionRow.game_key === "flash_vein" &&
      eventType === "client_action" &&
      eventPayload?.action === "flash_vein_pick";

    if (isFlashVeinPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Flash Vein pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKeyFv = String(eventPayload?.gameKey || "");
      if (declaredGameKeyFv !== "flash_vein") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Flash Vein requires gameKey flash_vein.",
        });
      }

      const columnFv = normalizeFlashVeinColumn(eventPayload?.column);
      if (columnFv === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "flash_vein_pick requires column 0, 1, or 2.",
        });
      }

      const snapshotResultFv = await buildFlashVeinSessionSnapshot(supabase, sessionRow);
      if (!snapshotResultFv.ok) {
        if (isMissingTable(snapshotResultFv.error)) {
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
          message: "Flash Vein pick submission is temporarily unavailable.",
        });
      }

      const snapshotFvPick = snapshotResultFv.snapshot;
      if (snapshotFvPick.pickConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "pick_conflict",
          message: "Conflicting pick events. Refresh session state.",
        });
      }

      if (snapshotFvPick.pendingPick) {
        const pp = snapshotFvPick.pendingPick;
        const pendingId = pp.pickEventId != null ? Number(pp.pickEventId) : null;
        const same = Number(pp.column) === columnFv;
        if (same && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current pick before submitting a new one.",
        });
      }

      if (String(snapshotFvPick.readState || "") !== "pick_pending") {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Flash Vein is not accepting picks right now.",
        });
      }
    }

    const isMysteryBoxPick =
      sessionRow.game_key === "mystery_box" &&
      eventType === "client_action" &&
      eventPayload?.action === "mystery_box_pick";

    if (isMysteryBoxPick) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Mystery Box pick is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "mystery_box") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Mystery Box pick requires gameKey mystery_box.",
        });
      }

      const selectedBox = normalizeMysteryBoxIndex(eventPayload?.boxIndex);
      if (selectedBox === null) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Mystery Box boxIndex must be 0, 1, or 2.",
        });
      }

      const snapshotResult = await buildMysteryBoxSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Pick submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      const priorPick = normalizeMysteryBoxIndex(snapshot.boxChoice);
      const priorPickEventId = snapshot.pickEventId != null ? Number(snapshot.pickEventId) : null;
      const hasPersistedPickRow =
        priorPick !== null &&
        Number.isFinite(priorPickEventId) &&
        priorPickEventId > 0;
      if (hasPersistedPickRow && priorPick === selectedBox) {
        return res.status(200).json({
          ok: true,
          category: "success",
          status: "accepted",
          idempotent: true,
          event: {
            id: priorPickEventId,
            eventType,
          },
          session: {
            id: sessionId,
            sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
          },
          authority: {
            eventValidation: "server",
            gameplayResolution: "deferred",
          },
        });
      }

      if (priorPick !== null && priorPick !== selectedBox) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "choice_already_submitted",
          message: "Mystery Box pick is already locked for this session.",
        });
      }
    }

    const isHighLowGuess =
      sessionRow.game_key === "high_low_cards" &&
      eventType === "client_action" &&
      eventPayload?.action === "high_low_cards_guess";

    if (isHighLowGuess) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Hi-Lo guess is only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "high_low_cards") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Hi-Lo guess requires gameKey high_low_cards.",
        });
      }

      const selectedGuess = normalizeHighLowGuess(eventPayload?.guess);
      if (selectedGuess !== "high" && selectedGuess !== "low") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Hi-Lo guess must be high or low.",
        });
      }

      const snapshotResult = await buildHighLowCardsSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Guess submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.readState === "choice_submitted" && snapshot.pendingGuess) {
        const pg = snapshot.pendingGuess;
        const pendingId = pg.guessEventId != null ? Number(pg.guessEventId) : null;
        if (pg.guess === selectedGuess && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current guess before submitting a new one.",
        });
      }
    }

    const dropRunAction = String(eventPayload?.action || "");
    const isDropRunClientAction =
      sessionRow.game_key === "drop_run" &&
      eventType === "client_action" &&
      (dropRunAction === "drop_run_play" || dropRunAction === "drop_run_select_gate");

    if (isDropRunClientAction) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "Drop Run actions are only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "drop_run") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "Drop Run requires gameKey drop_run.",
        });
      }

      let gate = null;
      if (dropRunAction === "drop_run_play") {
        gate = DROP_RUN_RELEASE_COLUMN;
      } else {
        gate = normalizeDropRunGate(eventPayload?.gate);
        if (gate === null) {
          return res.status(400).json({
            ok: false,
            category: "validation_error",
            status: "invalid_request",
            message: `drop_run_select_gate requires gate 1–${DROP_RUN_GATES}.`,
          });
        }
      }

      const snapshotResult = await buildDropRunSessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "Drop Run event submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.gateConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "gate_conflict",
          message: "Conflicting drop events. Refresh session state.",
        });
      }

      if (snapshot.pendingGate) {
        const pg = snapshot.pendingGate;
        const pendingId = pg.gateEventId != null ? Number(pg.gateEventId) : null;
        const same = Number(pg.gate) === gate;
        if (same && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Finish the current drop before starting another.",
        });
      }
    }

    const isChallenge21Action =
      sessionRow.game_key === "challenge_21" &&
      eventType === "client_action" &&
      eventPayload?.action === "challenge_21_action";

    if (isChallenge21Action) {
      if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "21 Challenge actions are only allowed for active sessions.",
        });
      }

      const expiresAtRaw = sessionRow.expires_at;
      if (expiresAtRaw) {
        const expiresMs = new Date(expiresAtRaw).getTime();
        if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
          return res.status(409).json({
            ok: false,
            category: "conflict",
            status: "invalid_session_state",
            message: "Session expired.",
          });
        }
      }

      const declaredGameKey = String(eventPayload?.gameKey || "");
      if (declaredGameKey !== "challenge_21") {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "21 Challenge requires gameKey challenge_21.",
        });
      }

      const decision = normalizeChallenge21Decision(eventPayload?.decision);
      if (!decision) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message:
            "challenge_21_action requires a valid decision (hit, stand, double, split, insurance).",
        });
      }

      const activeParse = parseChallenge21ActiveSummary(sessionRow);
      if (!activeParse) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "invalid_session_state",
          message: "21 Challenge session state is missing or invalid.",
        });
      }
      const allowedNow = computeAllowedChallenge21Decisions(activeParse);
      if (!allowedNow.includes(decision)) {
        return res.status(400).json({
          ok: false,
          category: "validation_error",
          status: "invalid_request",
          message: "That action is not allowed right now.",
        });
      }

      const snapshotResult = await buildChallenge21SessionSnapshot(supabase, sessionRow);
      if (!snapshotResult.ok) {
        if (isMissingTable(snapshotResult.error)) {
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
          message: "21 Challenge action submission is temporarily unavailable.",
        });
      }

      const snapshot = snapshotResult.snapshot;
      if (snapshot.actionConflict) {
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "action_conflict",
          message: "Conflicting actions. Refresh session state.",
        });
      }

      if (snapshot.pendingAction) {
        const pa = snapshot.pendingAction;
        const pendingId = pa.actionEventId != null ? Number(pa.actionEventId) : null;
        const same = normalizeChallenge21Decision(pa.decision) === decision;
        if (same && Number.isFinite(pendingId) && pendingId > 0) {
          return res.status(200).json({
            ok: true,
            category: "success",
            status: "accepted",
            idempotent: true,
            event: {
              id: pendingId,
              eventType,
            },
            session: {
              id: sessionId,
              sessionStatus: sessionRow.session_status || SOLO_V2_SESSION_STATUS.IN_PROGRESS,
            },
            authority: {
              eventValidation: "server",
              gameplayResolution: "deferred",
            },
          });
        }
        return res.status(409).json({
          ok: false,
          category: "conflict",
          status: "turn_pending",
          message: "Resolve the current action before submitting a new one.",
        });
      }
    }

    const appendResult = await supabase.rpc("solo_v2_append_session_event", {
      p_session_id: sessionId,
      p_player_ref: playerRef,
      p_event_type: eventType,
      p_event_payload: eventPayload,
    });

    if (appendResult.error) {
      if (isMissingTable(appendResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 event persistence is not migrated yet.",
        });
      }
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "event_rejected",
        message: appendResult.error.message,
      });
    }

    const row = Array.isArray(appendResult.data) ? appendResult.data[0] : appendResult.data;
    return res.status(200).json({
      ok: true,
      category: "success",
      status: "accepted",
      event: {
        id: row?.event_id || null,
        eventType,
      },
      session: {
        id: sessionId,
        sessionStatus: row?.session_status || "in_progress",
      },
      authority: {
        eventValidation: "server",
        gameplayResolution: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/sessions/[sessionId]/event failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Append event failed",
    });
  }
}
