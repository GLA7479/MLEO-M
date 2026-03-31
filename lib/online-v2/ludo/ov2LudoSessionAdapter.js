/**
 * OV2 Ludo — **session adapter** (single boundary between network/RPC state and UI).
 *
 * Responsibilities (current → future):
 * - **Now:** classify play mode (`PREVIEW_LOCAL` vs room without match); stub live seat + snapshot.
 * - **Next:** resolve authoritative `mySeat` from members / Ludo seat rows; fetch or subscribe to
 *   `Ov2LudoLiveSessionSnapshot`; translate room lifecycle → match lifecycle; expose action dispatch
 *   targets for RPC (roll, move, resign).
 *
 * Do not put React hooks here. Do not import the board view. Pure JS only.
 */

/** @typedef {{ room?: object|null, members?: unknown[], self?: { participant_key?: string } }} Ov2LudoContextInput */

/**
 * Future authoritative snapshot (RPC + optional Realtime). All fields optional until implemented.
 * @typedef {{
 *   revision?: string|number|null,
 *   sessionId?: string|null,
 *   turnSeat?: number|null,
 *   dice?: number|null,
 *   lastDice?: number|null,
 *   pieces?: Record<string, number[]>|null,
 *   winnerSeat?: number|null,
 *   phase?: string|null,
 * }} Ov2LudoLiveSessionSnapshot
 */

export const OV2_LUDO_PLAY_MODE = Object.freeze({
  /** No OV2 room in context — local sandbox only (`ov2LudoLocalPreview.js`). */
  PREVIEW_LOCAL: "preview_local",
  /** Room row present; no authoritative Ludo match session yet — UI read-only. */
  LIVE_ROOM_NO_MATCH_YET: "live_room_no_match_yet",
});

/**
 * Sandbox-only: which ring seat index the human drives in `PREVIEW_LOCAL`.
 * Not a database seat claim. Replaced by `resolveOv2LudoMySeatFromRoomMembers` when live.
 */
export const OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX = 0;

/**
 * @param {Ov2LudoContextInput|null|undefined} baseContext
 * @returns {(typeof OV2_LUDO_PLAY_MODE)[keyof typeof OV2_LUDO_PLAY_MODE]}
 */
export function resolveOv2LudoPlayMode(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  if (!roomId) return OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL;
  return OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
}

/**
 * Map `ov2_room_members` (and later Ludo-specific seat table) → this client's seat index.
 * @param {unknown[]} members
 * @param {string|null} selfParticipantKey
 * @returns {number|null} Always `null` until schema/RPC defines Ludo seating.
 */
export function resolveOv2LudoMySeatFromRoomMembers(members, selfParticipantKey) {
  void members;
  void selfParticipantKey;
  return null;
}

/**
 * Fetch or subscribe to live session snapshot (PostgREST / RPC / Realtime).
 * @returns {Promise<Ov2LudoLiveSessionSnapshot|null>}
 */
export async function fetchOv2LudoLiveSessionSnapshot() {
  return null;
}

/**
 * Synchronous read of cached live snapshot if you add a client cache later.
 * @returns {Ov2LudoLiveSessionSnapshot|null}
 */
export function getOv2LudoLiveSessionSnapshotCached() {
  return null;
}
