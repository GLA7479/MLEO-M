/**
 * OV2 Board Path — canonical live room bundle coordination (fetch-only; no SQL; no client mutations).
 *
 * Owns the ordered network sequence used for hydration and post-action refresh:
 * 1. Detailed snapshot — `ov2_rooms` slice, active session row, seats, settlement/session lists
 *    (`fetchBoardPathSessionDetailed`)
 * 2. Room members — `ov2_room_members` (`fetchOv2RoomMembersForRoom`)
 *
 * Callers apply results into React state. This module does not open sessions, poll, or fake success.
 */

/** @typedef {import("@supabase/supabase-js").SupabaseClient} SupabaseClient */

import { fetchBoardPathSessionDetailed, fetchOv2RoomMembersForRoom } from "./ov2BoardPathSessionApi";

/**
 * Coordinated bundle load lifecycle (room + members + session + seats path only).
 * Not action pending, not gameplay turn state, not VM “blocked”.
 * @readonly
 */
export const BOARD_PATH_BUNDLE_SYNC_STATE = Object.freeze({
  IDLE: "idle",
  LOADING_BUNDLE: "loading_bundle",
  BUNDLE_READY: "bundle_ready",
  BUNDLE_PARTIAL: "bundle_partial",
  BUNDLE_FAILED: "bundle_failed",
});

/**
 * Single coordinated fetch for the live Board Path bundle inputs.
 *
 * @param {SupabaseClient} supabase
 * @param {string} roomId
 * @returns {Promise<{ detailed: Awaited<ReturnType<typeof fetchBoardPathSessionDetailed>>, members: Record<string, unknown>[]|null }>}
 */
export async function fetchBoardPathLiveCoordinatedBundle(supabase, roomId) {
  const rid = roomId != null ? String(roomId).trim() : "";
  if (!rid) {
    const detailed = /** @type {const} */ ({
      ok: false,
      code: "NO_ROOM_ID",
      message: "Missing room id.",
    });
    return { detailed, members: null };
  }

  const detailed = await fetchBoardPathSessionDetailed(supabase, rid);
  if (!detailed.ok) {
    return { detailed, members: null };
  }

  const members = await fetchOv2RoomMembersForRoom(supabase, rid);
  return { detailed, members };
}

/**
 * Session-open follow-up is implemented in `ov2BoardPathSessionOpenFollowUp.js` + `useOv2BoardPathSession`
 * (`attemptSessionOpen`): host calls `rpcOv2BoardPathOpenSession`, then re-enters
 * `fetchBoardPathLiveCoordinatedBundle` via `coordinatedFetchAndApply` — no local seat fabrication.
 */
export const BOARD_PATH_BUNDLE_COORDINATOR_OPEN_SESSION_HOOKPOINT = "ov2_bp_bundle_open_session_follow_up";
