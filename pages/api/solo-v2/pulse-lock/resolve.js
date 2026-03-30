import { getSupabaseAdmin } from "../../../../lib/server/supabaseAdmin";
import { parseSessionId, resolvePlayerRef } from "../../../../lib/solo-v2/server/contracts";
import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "../../../../lib/solo-v2/server/sessionTypes";
import { buildPulseLockSessionSnapshot } from "../../../../lib/solo-v2/server/pulseLockSnapshot";
import { buildPulseLockSettlementSummary, PULSE_LOCK_MIN_WAGER } from "../../../../lib/solo-v2/pulseLockConfig";
import { QUICK_FLIP_CONFIG } from "../../../../lib/solo-v2/quickFlipConfig";
import { markerPhase01 } from "../../../../lib/solo-v2/pulseLockConfig";
import { evaluatePulseLockHit } from "../../../../lib/solo-v2/server/pulseLockEngine";

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
  return stake >= PULSE_LOCK_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

function createResolvedPayload(sessionRow) {
  const summary = sessionRow?.server_outcome_summary || {};
  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);
  const hq = String(summary.hitQuality || "miss").toLowerCase();
  return {
    sessionId: sessionRow?.id || null,
    sessionStatus: sessionRow?.session_status || SOLO_V2_SESSION_STATUS.RESOLVED,
    hitQuality: hq,
    positionTicks: summary.positionTicks ?? null,
    distanceTicks: summary.distanceTicks ?? null,
    isWin: Boolean(summary.isWin),
    resolvedAt: summary.resolvedAt || sessionRow?.resolved_at || null,
    settlementSummary:
      summary.settlementSummary ||
      buildPulseLockSettlementSummary({
        hitQuality: hq,
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
          message: "Solo V2 Pulse Lock resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Pulse Lock resolve is temporarily unavailable.",
      });
    }

    const sessionRow = Array.isArray(sessionRead.data) ? sessionRead.data[0] : sessionRead.data;
    if (!sessionRow) {
      return res.status(404).json({ ok: false, category: "validation_error", status: "not_found", message: "Session not found" });
    }

    if (sessionRow.game_key !== "pulse_lock") {
      return res.status(400).json({
        ok: false,
        category: "validation_error",
        status: "invalid_game",
        message: "Session game must be pulse_lock",
      });
    }

    if (
      ![
        SOLO_V2_SESSION_STATUS.CREATED,
        SOLO_V2_SESSION_STATUS.IN_PROGRESS,
        SOLO_V2_SESSION_STATUS.RESOLVED,
      ].includes(sessionRow.session_status)
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

    const snapshotResult = await buildPulseLockSessionSnapshot(supabase, sessionRow);
    if (!snapshotResult.ok) {
      if (isMissingTable(snapshotResult.error)) {
        return res.status(503).json({
          ok: false,
          category: "pending_migration",
          status: "pending_migration",
          message: "Solo V2 Pulse Lock resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Pulse Lock snapshot is temporarily unavailable.",
      });
    }

    const snapshot = snapshotResult.snapshot;
    if (!snapshot.canResolve || snapshot.readState !== "lock_submitted") {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "lock_required",
        message: "Lock the pulse before resolving this session.",
      });
    }

    const playing = snapshot.playing;
    const lockMs = snapshot.lockServerMs;
    if (!playing || lockMs == null || !playing.roundStartAt) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_pulse_state",
        message: "Pulse Lock session is missing sweep or lock data.",
      });
    }

    const roundStartMs = new Date(playing.roundStartAt).getTime();
    if (!Number.isFinite(roundStartMs)) {
      return res.status(409).json({
        ok: false,
        category: "conflict",
        status: "invalid_pulse_state",
        message: "Invalid round start time.",
      });
    }

    const phase = markerPhase01(lockMs, roundStartMs, playing.sweepPeriodMs);
    const positionTicks = Math.floor(phase * 10000) % 10000;
    const cfg = {
      centerTicks: playing.centerTicks,
      rPerfectTicks: playing.rPerfectTicks,
      rGoodTicks: playing.rGoodTicks,
      rEdgeTicks: playing.rEdgeTicks,
    };
    const { hitQuality, distanceTicks } = evaluatePulseLockHit(positionTicks, cfg);
    const isWin = hitQuality !== "miss";
    const resolvedAt = new Date().toISOString();
    const entryCost = entryCostFromSessionRow(sessionRow);
    const fundingSource = fundingSourceFromSessionRow(sessionRow);
    const resolvedSummary = {
      phase: "pulse_lock_resolved",
      hitQuality,
      positionTicks,
      distanceTicks,
      isWin,
      resolvedAt,
      settlementSummary: buildPulseLockSettlementSummary({ hitQuality, entryCost, fundingSource }),
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
          message: "Solo V2 Pulse Lock resolve is not migrated yet.",
        });
      }
      return res.status(503).json({
        ok: false,
        category: "unavailable",
        status: "unavailable",
        message: "Pulse Lock resolve is temporarily unavailable.",
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
        gameKey: "pulse_lock",
        action: "resolve",
        hitQuality,
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
        hitQuality,
        positionTicks,
        distanceTicks,
        isWin,
        resolvedAt,
        settlementSummary: buildPulseLockSettlementSummary({ hitQuality, entryCost, fundingSource }),
      },
      authority: {
        outcomeTruth: "server",
        settlement: "deferred",
        stats: "deferred",
      },
    });
  } catch (error) {
    console.error("solo-v2/pulse-lock/resolve failed", error);
    return res.status(500).json({
      ok: false,
      category: "unexpected_error",
      status: "server_error",
      message: "Pulse Lock resolve failed",
    });
  }
}
