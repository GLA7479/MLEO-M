import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildSafeZoneSessionSnapshot } from "../../../../lib/solo-v2/server/safeZoneSnapshot";
import { buildSafeZoneSettlementSummary, SAFE_ZONE_MIN_WAGER } from "../../../../lib/solo-v2/safeZoneConfig";
import { simulateSafeZoneToMs, payoutForSafeZone } from "../../../../lib/solo-v2/server/safeZoneEngine";
import { QUICK_FLIP_CONFIG } from "../../../../lib/solo-v2/quickFlipConfig";

function isMissingTable(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  return code === "42P01" || code === "42883" || message.includes("relation") || message.includes("does not exist") || message.includes("function") || message.includes("rpc");
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SAFE_ZONE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, category: "validation_error", status: "method_not_allowed" });
  }
  const sessionId = parseSessionId(req.body?.sessionId);
  if (!sessionId) return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_request", message: "Invalid sessionId" });
  const actionRaw = String(req.body?.action || "").trim().toLowerCase();
  const isCashOut = actionRaw === "cashout";
  const playerRef = resolvePlayerRef(req);
  try {
    const supabase = getSupabaseAdmin();
    const sessionRead = await supabase.rpc("solo_v2_get_session", { p_session_id: sessionId, p_player_ref: playerRef });
    if (sessionRead.error) {
      if (isMissingTable(sessionRead.error)) return res.status(503).json({ ok: false, category: "pending_migration", status: "pending_migration", message: "Safe Zone resolve is not migrated yet." });
      return res.status(503).json({ ok: false, category: "unavailable", status: "unavailable", message: "Safe Zone resolve unavailable." });
    }
    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    if (sessionRow.game_key !== "safe_zone") return res.status(400).json({ ok: false, category: "validation_error", status: "invalid_game", message: "Session game must be safe_zone" });
    if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: true, result: sessionRow.server_outcome_summary || {} });

    const snapResult = await buildSafeZoneSessionSnapshot(supabase, sessionRow);
    if (!snapResult.ok) return res.status(503).json({ ok: false, category: "unavailable", status: "unavailable", message: "Safe Zone snapshot unavailable." });
    const snap = snapResult.snapshot;
    if (!snap.playing?.config || !snap.playing?.roundStartAt) {
      return res.status(409).json({ ok: false, category: "conflict", status: "invalid_session_state", message: "Missing active run config." });
    }
    const roundStartMs = new Date(snap.playing.roundStartAt).getTime();
    const nowMs = Date.now();
    const sim = simulateSafeZoneToMs({
      cfg: snap.playing.config,
      roundStartMs,
      controls: snap.playing.controls || [],
      targetMs: nowMs,
    });
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);

    if (isCashOut) {
      if (!sim.canCashOut || sim.failed) {
        return res.status(409).json({ ok: false, category: "conflict", status: "cashout_not_allowed", message: "Cash out not available." });
      }
      const payoutReturn = payoutForSafeZone(entryCost, sim.securedMs);
      const resolvedAt = new Date().toISOString();
      const resolvedSummary = {
        phase: "safe_zone_resolved",
        terminalKind: "cashout",
        securedMs: sim.securedMs,
        payoutReturn,
        resolvedAt,
        settlementSummary: buildSafeZoneSettlementSummary({
          terminalKind: "cashout",
          securedMs: sim.securedMs,
          entryCost,
          fundingSource,
        }),
      };
      await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.RESOLVED, resolved_at: resolvedAt, server_outcome_summary: resolvedSummary }).eq("id", sessionId).eq("player_ref", playerRef);
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: false, result: resolvedSummary });
    }

    if (sim.failed || sim.fullDuration) {
      const terminalKind = sim.fullDuration ? "full_duration" : "fail";
      const payoutReturn = terminalKind === "full_duration" ? payoutForSafeZone(entryCost, sim.securedMs) : 0;
      const resolvedAt = new Date().toISOString();
      const resolvedSummary = {
        phase: "safe_zone_resolved",
        terminalKind,
        securedMs: sim.securedMs,
        payoutReturn,
        failAtMs: sim.failAtMs || null,
        resolvedAt,
        settlementSummary: buildSafeZoneSettlementSummary({
          terminalKind,
          securedMs: sim.securedMs,
          entryCost,
          fundingSource,
        }),
      };
      await supabase.from("solo_v2_sessions").update({ session_status: SOLO_V2_SESSION_STATUS.RESOLVED, resolved_at: resolvedAt, server_outcome_summary: resolvedSummary }).eq("id", sessionId).eq("player_ref", playerRef);
      return res.status(200).json({ ok: true, category: "success", status: "resolved", idempotent: false, result: resolvedSummary });
    }

    return res.status(200).json({
      ok: true,
      category: "success",
      status: "active",
      idempotent: false,
      result: {
        sessionId,
        sessionStatus: SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        securedMs: sim.securedMs,
        tierMultiplier: sim.tierMultiplier,
        pos: sim.pos,
        canCashOut: sim.canCashOut,
        terminalKind: null,
      },
      authority: { outcomeTruth: "server", settlement: "deferred", stats: "deferred" },
    });
  } catch (error) {
    console.error("solo-v2/safe-zone/resolve failed", error);
    return res.status(500).json({ ok: false, category: "unexpected_error", status: "server_error", message: "Safe Zone resolve failed" });
  }
}
