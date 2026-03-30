import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import {
  buildRelicDraftPlayingView,
} from "../../../../lib/solo-v2/server/relicDraftSnapshot";
import {
  relicDraftAdvance,
  relicDraftTerminalPayloadFromRow,
} from "../../../../lib/solo-v2/server/relicDraftResolveActions";
import { parseRelicDraftActiveSummary } from "../../../../lib/solo-v2/server/relicDraftEngine";
import { RELIC_DRAFT_MIN_WAGER } from "../../../../lib/solo-v2/relicDraftConfig";
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
  return stake >= RELIC_DRAFT_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
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
          message: "Solo V2 Relic Draft is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Relic Draft resolve is temporarily unavailable.",
      });
    }

    const sessionRow0 = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow0) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow0.game_key !== "relic_draft") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be relic_draft",
      });
    }

    let sessionRow = sessionRow0;

    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: relicDraftTerminalPayloadFromRow(sessionRow),
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

    const actionRaw = String(req.body?.action || "").trim().toLowerCase();
    if (actionRaw !== "advance") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_request",
        message: "action must be advance",
      });
    }

    const out = await relicDraftAdvance(supabase, sessionRow, playerRef, req.body?.relicKey);
    if (!out.ok) {
      const st = out.status || "failed";
      const code =
        st === "invalid_request" ? 400 : st === "invalid_state" || st === "conflict" ? 409 : 503;
      return res.status(code).json({
        ok: false,
        category: st === "invalid_request" ? "validation_error" : st === "conflict" ? "conflict" : "unavailable",
        status: st,
        message: out.message || "Advance failed.",
      });
    }

    if (out.outcome === "step") {
      const active = parseRelicDraftActiveSummary(out.row.server_outcome_summary);
      const entry = entryCostFromSessionRow(out.row);
      const playing = active ? buildRelicDraftPlayingView(active, entry) : null;
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "step",
        playing,
        lastEncounter: out.lastEncounter || null,
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    if (out.idempotent && out.row) {
      return res.status(200).json({
        ok: true,
        category: "success",
        status: "resolved",
        idempotent: true,
        result: relicDraftTerminalPayloadFromRow(out.row),
        authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
      });
    }

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "resolved",
      idempotent: false,
      result: relicDraftTerminalPayloadFromRow(out.row),
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/relic-draft/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Relic Draft resolve failed",
    });
  }
}
