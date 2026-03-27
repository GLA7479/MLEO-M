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
