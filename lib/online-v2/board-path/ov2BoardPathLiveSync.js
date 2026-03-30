/**
 * OV2 Board Path — live realtime coordination helpers (Phase 3).
 * Realtime payloads are never applied as gameplay; only full DB fetches update bundle state.
 */

import { isSameSession } from "./ov2BoardPathSessionManager";

/** UI + hook state for Supabase live sync (no gameplay semantics). */
export const OV2_BP_LIVE_SYNC_STATE = Object.freeze({
  IDLE: "idle",
  SUBSCRIBED: "subscribed",
  REFRESHING: "refreshing",
  ERROR: "error",
});

/** Debounce window to coalesce burst postgres_changes from one server mutation. */
export const OV2_BP_LIVE_SYNC_DEBOUNCE_MS = 100;

/**
 * Pick which bundle to keep after a server fetch. Rejects same-session lower revisions.
 * @param {import("./ov2BoardPathSessionManager").Ov2BoardPathLocalSessionBundle|null} prev
 * @param {import("./ov2BoardPathSessionManager").Ov2BoardPathLocalSessionBundle|null} candidate
 * @returns {import("./ov2BoardPathSessionManager").Ov2BoardPathLocalSessionBundle|null}
 */
export function selectBoardPathBundleAfterFetch(prev, candidate) {
  if (!candidate?.localSession) return prev ?? null;
  if (!prev?.localSession) return candidate;
  const a = prev.localSession;
  const b = candidate.localSession;
  if (String(a.id) !== String(b.id)) return candidate;
  const ar = Number(a.revision) || 0;
  const br = Number(b.revision) || 0;
  if (br < ar) return prev;
  if (isSameSession(a, b)) return prev;
  return candidate;
}
