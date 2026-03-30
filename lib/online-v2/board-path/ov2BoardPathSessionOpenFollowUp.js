/**
 * OV2 Board Path — host session-open follow-up (app-side; no SQL).
 *
 * Wires to `BOARD_PATH_BUNDLE_COORDINATOR_OPEN_SESSION_HOOKPOINT` in
 * `ov2BoardPathBundleCoordinator.js`: after a successful `rpcOv2BoardPathOpenSession`, the hook
 * must re-enter `fetchBoardPathLiveCoordinatedBundle` / `coordinatedFetchAndApply` — not invent seats locally.
 *
 * **Not** for `session_opening` (room already has `active_session_id` but client session row is not
 * aligned) — that path is bundle coordinator / `retryBundleSync` only, not open-session RPC.
 */

import { boardPathRoomIdIsOfflineFixture, shouldHostOpenLocalBoardPathSession } from "./ov2BoardPathOpenContract";

/**
 * Host may invoke open-session RPC: live room, not fixture, same gates as `shouldHostOpenLocalBoardPathSession`
 * (active match phase, min members, stakes, host self, **no** `active_session_id` on room yet).
 *
 * @param {{ roomId: string|null, room: object|null, members: unknown[], selfKey: string|null, sessionOpenBusy: boolean }} p
 * @returns {boolean}
 */
export function canHostAttemptBoardPathSessionOpenRpc(p) {
  const { roomId, room, members, selfKey, sessionOpenBusy } = p;
  if (sessionOpenBusy) return false;
  if (!roomId || boardPathRoomIdIsOfflineFixture(String(roomId))) return false;
  if (!Array.isArray(members) || !selfKey) return false;
  return shouldHostOpenLocalBoardPathSession(room, members, selfKey);
}
