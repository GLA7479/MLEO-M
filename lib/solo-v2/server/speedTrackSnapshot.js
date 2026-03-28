import { SOLO_V2_SESSION_MODE, SOLO_V2_SESSION_STATUS } from "./sessionTypes";
import {
  buildSpeedTrackSettlementSummary,
  SPEED_TRACK_CHECKPOINT_COUNT,
  SPEED_TRACK_ROUTE_COUNT,
  SPEED_TRACK_MIN_WAGER,
  SPEED_TRACK_ROUTES,
} from "../speedTrackConfig";
import { computePlayingNumbers } from "./speedTrackEngine";
import { QUICK_FLIP_CONFIG } from "../quickFlipConfig";

export function normalizeSpeedTrackRoute(value) {
  const s = String(value ?? "")
    .trim()
    .toLowerCase();
  const idx = SPEED_TRACK_ROUTES.indexOf(s);
  if (idx < 0) return null;
  return idx;
}

export function routeLabelFromIndex(routeIndex) {
  const i = Math.floor(Number(routeIndex));
  if (!Number.isFinite(i) || i < 0 || i >= SPEED_TRACK_ROUTES.length) return null;
  return SPEED_TRACK_ROUTES[i];
}

export function normalizeSpeedTrackCheckpointIndex(value) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n >= SPEED_TRACK_CHECKPOINT_COUNT) return null;
  return n;
}

function entryCostFromSessionRow(sessionRow) {
  const stake = Math.floor(Number(sessionRow?.entry_amount || 0));
  return stake >= SPEED_TRACK_MIN_WAGER ? stake : QUICK_FLIP_CONFIG.entryCost;
}

function fundingSourceFromSessionRow(sessionRow) {
  return sessionRow?.session_mode === SOLO_V2_SESSION_MODE.FREEPLAY ? "gift" : "vault";
}

export function parseSpeedTrackActiveSummary(sessionRow) {
  const s = sessionRow?.server_outcome_summary || {};
  if (s.phase !== "speed_track_active") return null;
  const blockedRoutes = Array.isArray(s.blockedRoutes)
    ? s.blockedRoutes.map(c => Math.floor(Number(c)))
    : [];
  if (blockedRoutes.length !== SPEED_TRACK_CHECKPOINT_COUNT) return null;
  if (blockedRoutes.some(c => !Number.isFinite(c) || c < 0 || c >= SPEED_TRACK_ROUTE_COUNT)) return null;

  const currentCheckpointIndex = Math.max(0, Math.floor(Number(s.currentCheckpointIndex) || 0));
  const clearedCheckpoints = Array.isArray(s.clearedCheckpoints)
    ? s.clearedCheckpoints
        .map(c => Math.floor(Number(c)))
        .filter(n => Number.isFinite(n) && n >= 0 && n < SPEED_TRACK_CHECKPOINT_COUNT)
    : [];
  const routeHistory = Array.isArray(s.routeHistory)
    ? s.routeHistory.filter(
        h =>
          h &&
          typeof h === "object" &&
          Number.isFinite(Math.floor(Number(h.checkpointIndex))) &&
          Number.isFinite(Math.floor(Number(h.route))),
      )
    : [];
  const lastProcessedPickEventId = Math.max(0, Math.floor(Number(s.lastProcessedPickEventId) || 0));

  return {
    checkpointCount: SPEED_TRACK_CHECKPOINT_COUNT,
    routeCount: SPEED_TRACK_ROUTE_COUNT,
    blockedRoutes,
    currentCheckpointIndex,
    clearedCheckpoints,
    routeHistory,
    lastProcessedPickEventId,
    lastTurn: s.lastTurn && typeof s.lastTurn === "object" ? s.lastTurn : null,
  };
}

async function readSpeedTrackPickEventsAfter(supabase, sessionId, minIdExclusive) {
  const query = await supabase
    .from("solo_v2_session_events")
    .select("id,event_payload,created_at")
    .eq("session_id", sessionId)
    .eq("event_type", "client_action")
    .gt("id", minIdExclusive)
    .order("id", { ascending: true })
    .limit(120);

  if (query.error) return { ok: false, error: query.error };
  const rows = Array.isArray(query.data) ? query.data : [];
  const picks = rows.filter(
    r =>
      String(r?.event_payload?.action || "") === "speed_track_pick" &&
      String(r?.event_payload?.gameKey || "") === "speed_track",
  );
  return { ok: true, rows: picks };
}

function buildPlayingPayload(_sessionRow, active, entryCost) {
  const cp = active.currentCheckpointIndex;
  const clearedLen = active.clearedCheckpoints.length;
  const nums = computePlayingNumbers(entryCost, cp, clearedLen);
  return {
    checkpointCount: SPEED_TRACK_CHECKPOINT_COUNT,
    routeCount: SPEED_TRACK_ROUTE_COUNT,
    currentCheckpointIndex: cp,
    clearedCheckpoints: active.clearedCheckpoints,
    routeHistory: active.routeHistory,
    currentMultiplier: nums.currentMultiplier,
    nextMultiplier: nums.nextMultiplier,
    currentPayout: nums.currentPayout,
    nextPayout: nums.nextPayout,
    lastTurn: active.lastTurn,
  };
}

export async function buildSpeedTrackSessionSnapshot(supabase, sessionRow) {
  if (!sessionRow || sessionRow.game_key !== "speed_track") {
    return {
      ok: true,
      snapshot: {
        gameKey: sessionRow?.game_key || null,
        readState: "not_speed_track",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: null,
      },
    };
  }

  const entryCost = entryCostFromSessionRow(sessionRow);
  const fundingSource = fundingSourceFromSessionRow(sessionRow);

  if (sessionRow.session_status === SOLO_V2_SESSION_STATUS.RESOLVED) {
    const summary = sessionRow.server_outcome_summary || {};
    const terminalKind =
      summary.terminalKind === "cashout"
        ? "cashout"
        : summary.terminalKind === "full_clear"
          ? "full_clear"
          : "blocked";
    const payoutReturn = Math.max(0, Math.floor(Number(summary.payoutReturn) || 0));
    const settlementSummary =
      summary.settlementSummary ||
      buildSpeedTrackSettlementSummary({
        terminalKind,
        payoutReturn,
        entryCost,
        fundingSource,
      });

    return {
      ok: true,
      snapshot: {
        gameKey: "speed_track",
        readState: "resolved",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: {
          terminalKind,
          payoutReturn,
          isWin: terminalKind !== "blocked",
          finalCheckpointIndex:
            summary.finalCheckpointIndex != null ? Math.floor(Number(summary.finalCheckpointIndex)) : null,
          lastPickRoute: summary.lastPickRoute != null ? Math.floor(Number(summary.lastPickRoute)) : null,
          blockedRoute: summary.blockedRoute != null ? Math.floor(Number(summary.blockedRoute)) : null,
          blockedRoutes: Array.isArray(summary.blockedRoutes)
            ? summary.blockedRoutes.map(c => Math.floor(Number(c)))
            : null,
          clearedCheckpoints: Array.isArray(summary.clearedCheckpoints)
            ? summary.clearedCheckpoints.map(c => Math.floor(Number(c)))
            : [],
          routeHistory: Array.isArray(summary.routeHistory) ? summary.routeHistory : [],
          resolvedAt: summary.resolvedAt || sessionRow.resolved_at || null,
          settlementSummary,
        },
      },
    };
  }

  if (![SOLO_V2_SESSION_STATUS.CREATED, SOLO_V2_SESSION_STATUS.IN_PROGRESS].includes(sessionRow.session_status)) {
    return {
      ok: true,
      snapshot: {
        gameKey: "speed_track",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
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
          gameKey: "speed_track",
          readState: "invalid",
          canResolveTurn: false,
          canCashOut: false,
          playing: null,
          pendingPick: null,
          pickConflict: false,
          resolvedResult: null,
        },
      };
    }
  }

  const active = parseSpeedTrackActiveSummary(sessionRow);
  if (!active) {
    return {
      ok: true,
      snapshot: {
        gameKey: "speed_track",
        readState: "invalid",
        canResolveTurn: false,
        canCashOut: false,
        playing: null,
        pendingPick: null,
        pickConflict: false,
        resolvedResult: null,
      },
    };
  }

  const pickRead = await readSpeedTrackPickEventsAfter(supabase, sessionRow.id, active.lastProcessedPickEventId);
  if (!pickRead.ok) {
    return { ok: false, error: pickRead.error };
  }

  const currentCp = active.currentCheckpointIndex;
  const forCheckpoint = pickRead.rows.filter(
    r => normalizeSpeedTrackCheckpointIndex(r?.event_payload?.checkpointIndex) === currentCp,
  );
  const routes = new Set();
  for (const r of forCheckpoint) {
    const rt = normalizeSpeedTrackRoute(r?.event_payload?.route);
    if (rt !== null) routes.add(rt);
  }

  const pickConflict = routes.size > 1;
  let pendingPick = null;

  if (!pickConflict && routes.size === 1) {
    const last = forCheckpoint[forCheckpoint.length - 1];
    const routeIndex = normalizeSpeedTrackRoute(last?.event_payload?.route);
    const eid = last?.id != null ? Number(last.id) : null;
    const label = routeIndex != null ? routeLabelFromIndex(routeIndex) : null;
    if (routeIndex !== null && label && Number.isFinite(eid) && eid > 0) {
      pendingPick = {
        checkpointIndex: currentCp,
        route: label,
        routeIndex,
        pickEventId: eid,
        pickSubmittedAt: last?.created_at || null,
      };
    }
  }

  const playing = buildPlayingPayload(sessionRow, active, entryCost);
  const canCashOut = active.clearedCheckpoints.length >= 1 && !pendingPick && !pickConflict;

  const readState = pickConflict ? "pick_conflict" : pendingPick ? "choice_submitted" : "choice_required";

  return {
    ok: true,
    snapshot: {
      gameKey: "speed_track",
      readState,
      canResolveTurn: Boolean(pendingPick) && !pickConflict,
      canCashOut,
      playing,
      pendingPick,
      pickConflict,
      resolvedResult: null,
    },
  };
}
