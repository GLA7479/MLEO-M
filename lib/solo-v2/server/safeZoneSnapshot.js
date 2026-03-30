import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildSafeZoneSettlementSummary,
  SAFE_ZONE_MIN_WAGER,
} from "../safeZoneConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";
import { simulateSafeZoneToMs } from "./safeZoneEngine";

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SAFE_ZONE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

async function readLatestSafeZoneEvent(supabase, sessionId, action) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action })
    .order("id", { ascending: false })
    .limit(1);
  if (query.error) return { ok: false, error: query.error };
  const row = Array.isArray(query.data) ? query.data[0] : query.data;
  return { ok: true, row: row || null };
}

async function readSafeZoneControls(supabase, sessionId) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .contains("event_payload", { action: "safe_zone_control" })
    .order("id", { ascending: true })
    .limit(800);
  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  return {
    ok: true,
    controls: rows.map(r => ({
      id: Number(r.id),
      serverMs: Math.floor(Number(r?.event_payload?.serverMs) || 0),
      holding: Boolean(r?.event_payload?.holding),
      createdAt: r.created_at || null,
    })),
  };
}

function normalizePlayingFromStartPayload(payload) {
  if (!payload || payload.action !== "safe_zone_start") return null;
  return {
    roundStartAt: payload.roundStartAt || null,
    startEventId: payload.startEventId || null,
    config: payload.config || null,
  };
}

export async function buildSafeZoneSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "safe_zone") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_safe_zone",
        canResolve: false,
        canCashOut: false,
        playing: null,
        pendingState: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= SAFE_ZONE_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const terminalKind = String(summary.terminalKind || "fail");
    const securedMs = Math.max(0, Math.floor(Number(summary.securedMs) || 0));
    return {
      ok: true,
      snapshot: {
        gameKey: "safe_zone",
        readState: "resolved",
        canResolve: false,
        canCashOut: false,
        playing: null,
        pendingState: null,
        resolvedResult: {
          terminalKind,
          securedMs,
          isWin: terminalKind !== "fail",
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildSafeZoneSettlementSummary({
              terminalKind: terminalKind === "cashout" || terminalKind === "full_duration" ? terminalKind : "fail",
              securedMs,
              entryCost,
              fundingSource,
            }),
        },
      },
    };
  }

  const startRead = await readLatestSafeZoneEvent(supabase, sessionRow.id, "safe_zone_start");
  if (!startRead.ok) return { ok: false, error: startRead.error };
  const startRow = startRead.row;
  if (!startRow) {
    return {
      ok: true,
      snapshot: {
        gameKey: "safe_zone",
        readState: "safe_zone_start_required",
        canResolve: false,
        canCashOut: false,
        playing: null,
        pendingState: null,
        resolvedResult: null,
      },
    };
  }

  const controlsRead = await readSafeZoneControls(supabase, sessionRow.id);
  if (!controlsRead.ok) return { ok: false, error: controlsRead.error };
  const playing = normalizePlayingFromStartPayload(startRow.event_payload);
  if (!playing?.roundStartAt || !playing?.config) {
    return {
      ok: true,
      snapshot: {
        gameKey: "safe_zone",
        readState: "invalid",
        canResolve: false,
        canCashOut: false,
        playing: null,
        pendingState: null,
        resolvedResult: null,
      },
    };
  }
  const roundStartMs = new Date(playing.roundStartAt).getTime();
  const nowMs = Date.now();
  const sim = simulateSafeZoneToMs({
    cfg: playing.config,
    roundStartMs,
    controls: controlsRead.controls,
    targetMs: nowMs,
  });
  return {
    ok: true,
    snapshot: {
      gameKey: "safe_zone",
      readState: sim.failed || sim.fullDuration ? "terminal_pending" : "active",
      canResolve: true,
      canCashOut: sim.canCashOut && !sim.failed,
      playing: {
        ...playing,
        controls: controlsRead.controls,
        simNow: {
          pos: sim.pos,
          securedMs: sim.securedMs,
          tierMultiplier: sim.tierMultiplier,
          failed: sim.failed,
          fullDuration: sim.fullDuration,
          runMs: sim.runMs,
          holding: sim.holding,
        },
      },
      pendingState: {
        pos: sim.pos,
        securedMs: sim.securedMs,
        tierMultiplier: sim.tierMultiplier,
        failed: sim.failed,
        fullDuration: sim.fullDuration,
      },
      resolvedResult: null,
    },
  };
}
