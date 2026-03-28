import { randomInt } from "crypto";
import {
  SPEED_TRACK_CHECKPOINT_COUNT,
  SPEED_TRACK_ROUTE_COUNT,
  SPEED_TRACK_MULTIPLIER_LADDER,
  payoutForMultiplier,
} from "../speedTrackConfig";

export function generateBlockedRoutes() {
  const blocked = [];
  for (let c = 0; c < SPEED_TRACK_CHECKPOINT_COUNT; c += 1) {
    blocked.push(randomInt(0, SPEED_TRACK_ROUTE_COUNT));
  }
  return blocked;
}

export function isRouteBlockedAtCheckpoint(blockedRoutes, checkpointIndex, routeIndex) {
  const ch = Math.floor(Number(checkpointIndex));
  const r = Math.floor(Number(routeIndex));
  if (!Number.isFinite(ch) || ch < 0 || ch >= SPEED_TRACK_CHECKPOINT_COUNT) return null;
  if (!Number.isFinite(r) || r < 0 || r >= SPEED_TRACK_ROUTE_COUNT) return null;
  const arr = Array.isArray(blockedRoutes) ? blockedRoutes : [];
  const b = arr[ch];
  if (!Number.isFinite(Number(b))) return null;
  return Number(b) === r;
}

export function buildInitialActiveSummary(blockedRoutes) {
  return {
    phase: "speed_track_active",
    checkpointCount: SPEED_TRACK_CHECKPOINT_COUNT,
    routeCount: SPEED_TRACK_ROUTE_COUNT,
    blockedRoutes: [...blockedRoutes],
    currentCheckpointIndex: 0,
    clearedCheckpoints: [],
    routeHistory: [],
    lastProcessedPickEventId: 0,
    lastTurn: null,
  };
}

export function computePlayingNumbers(entryCost, currentCheckpointIndex, clearedCheckpointsLength) {
  const cp = Math.max(0, Math.floor(Number(currentCheckpointIndex) || 0));
  const cleared = Math.max(0, Math.floor(Number(clearedCheckpointsLength) || 0));

  let currentMultiplier = 1;
  if (cleared > 0) {
    const m = SPEED_TRACK_MULTIPLIER_LADDER[cleared - 1];
    if (Number.isFinite(m)) currentMultiplier = m;
  }

  let nextMultiplier = null;
  if (cp < SPEED_TRACK_CHECKPOINT_COUNT) {
    nextMultiplier = SPEED_TRACK_MULTIPLIER_LADDER[cp];
  }

  const currentPayout = payoutForMultiplier(entryCost, currentMultiplier);
  const nextPayout =
    nextMultiplier != null ? payoutForMultiplier(entryCost, nextMultiplier) : currentPayout;

  return {
    currentMultiplier,
    nextMultiplier,
    currentPayout,
    nextPayout,
  };
}
