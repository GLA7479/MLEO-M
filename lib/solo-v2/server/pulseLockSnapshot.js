import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import { buildPulseLockSettlementSummary, PULSE_LOCK_MIN_WAGER } from "../pulseLockConfig";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

async function readLatestPulseLockEvent(supabase, sessionId, action) {
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

function playingFromStartPayload(payload) {
  if (!payload || payload.action !== "pulse_start") return null;
  return {
    roundStartAt: payload.roundStartAt || null,
    sweepPeriodMs: Math.floor(Number(payload.sweepPeriodMs) || 0),
    centerTicks: Math.floor(Number(payload.centerTicks) || 0),
    rPerfectTicks: Math.floor(Number(payload.rPerfectTicks) || 0),
    rGoodTicks: Math.floor(Number(payload.rGoodTicks) || 0),
    rEdgeTicks: Math.floor(Number(payload.rEdgeTicks) || 0),
    startEventId: null,
  };
}

export async function buildPulseLockSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "pulse_lock") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_pulse_lock",
        canResolve: false,
        playing: null,
        startEventId: null,
        lockEventId: null,
        lockServerMs: null,
        resolvedResult: null,
      },
    };
  }

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const stake = Math.floor(Number(sessionRow.entry_amount || 0));
    const entryCost = stake >= PULSE_LOCK_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
    const fundingSource = sessionRow.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
    const hq = String(summary.hitQuality || "miss").toLowerCase();
    return {
      ok: true,
      snapshot: {
        gameKey: "pulse_lock",
        readState: "resolved",
        canResolve: false,
        playing: null,
        startEventId: null,
        lockEventId: null,
        lockServerMs: null,
        resolvedResult: {
          hitQuality: hq === "perfect" || hq === "good" || hq === "edge" ? hq : "miss",
          positionTicks: summary.positionTicks ?? null,
          distanceTicks: summary.distanceTicks ?? null,
          isWin: Boolean(summary.isWin),
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary:
            summary.settlementSummary ||
            buildPulseLockSettlementSummary({
              hitQuality: hq,
              entryCost,
              fundingSource,
            }),
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "pulse_lock",
        readState: "invalid",
        canResolve: false,
        playing: null,
        startEventId: null,
        lockEventId: null,
        lockServerMs: null,
        resolvedResult: null,
      },
    };
  }

  const expiresAtRaw = sessionRow.expires_at;
  if (expiresAtRaw) {
    const expiresMs = new Date(expiresAtRaw).getTime();
    if (Number.isFinite(expiresMs) && expiresMs < Date.now()) {
      return {
        ok: true,
        snapshot: {
          gameKey: "pulse_lock",
          readState: "invalid",
          canResolve: false,
          playing: null,
          startEventId: null,
          lockEventId: null,
          lockServerMs: null,
          resolvedResult: null,
        },
      };
    }
  }

  const startRead = await readLatestPulseLockEvent(supabase, sessionRow.id, "pulse_start");
  if (!startRead.ok) {
    return { ok: false, error: startRead.error };
  }
  const lockRead = await readLatestPulseLockEvent(supabase, sessionRow.id, "pulse_lock");
  if (!lockRead.ok) {
    return { ok: false, error: lockRead.error };
  }

  const startRow = startRead.row;
  const lockRow = lockRead.row;
  const playing = startRow ? playingFromStartPayload(startRow.event_payload) : null;
  if (playing && startRow?.id) {
    playing.startEventId = startRow.id;
  }

  const lockServerMs = lockRow?.event_payload?.lockServerMs != null
    ? Math.floor(Number(lockRow.event_payload.lockServerMs))
    : null;

  if (!startRow) {
    return {
      ok: true,
      snapshot: {
        gameKey: "pulse_lock",
        readState: "pulse_start_required",
        canResolve: false,
        playing: null,
        startEventId: null,
        lockEventId: null,
        lockServerMs: null,
        resolvedResult: null,
      },
    };
  }

  if (!lockRow) {
    return {
      ok: true,
      snapshot: {
        gameKey: "pulse_lock",
        readState: "pulse_sweeping",
        canResolve: false,
        playing,
        startEventId: startRow?.id || null,
        lockEventId: null,
        lockServerMs: null,
        resolvedResult: null,
      },
    };
  }

  return {
    ok: true,
    snapshot: {
      gameKey: "pulse_lock",
      readState: "lock_submitted",
      canResolve: true,
      playing,
      startEventId: startRow?.id || null,
      lockEventId: lockRow?.id || null,
      lockServerMs: Number.isFinite(lockServerMs) ? lockServerMs : null,
      resolvedResult: null,
    },
  };
}
