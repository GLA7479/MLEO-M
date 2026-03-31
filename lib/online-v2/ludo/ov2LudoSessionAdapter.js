/**
 * OV2 Ludo — session adapter (boundary between room/API state and the board UI).
 *
 * Today: no `ov2_ludo_sessions` / RPC surface — this module only classifies **intent**
 * (local preview vs room loaded without match session). Later: map RPC + realtime rows
 * into a single `liveSnapshot` consumed by `useOv2LudoSession` without changing
 * `ov2LudoEngine.js` or `ov2LudoBoardView.js`.
 */

/** @typedef {{ room?: object|null, members?: unknown[], self?: { participant_key?: string } }} Ov2LudoContextInput */

export const OV2_LUDO_PLAY_MODE = Object.freeze({
  /** No OV2 room in context — client-only sandbox for layout/rules smoke tests. */
  PREVIEW_LOCAL: "preview_local",
  /** Room row loaded, but no server-authoritative Ludo match session yet — no live play. */
  LIVE_ROOM_WITHOUT_MATCH_SESSION: "live_room_without_match_session",
});

/**
 * Which seat index the **local preview sandbox** lets the user drive (not a real OV2 seat claim).
 * Replace with server-derived seat when match members + `seat_index` exist.
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
  return OV2_LUDO_PLAY_MODE.LIVE_ROOM_WITHOUT_MATCH_SESSION;
}

/**
 * Map `ov2_room_members` (or future Ludo seat rows) → this client's seat index.
 * @returns {number|null} null until DB/RPC exposes a stable seat mapping for Ludo.
 */
export function resolveOv2LudoMySeatFromRoomMembers(members, selfParticipantKey) {
  void members;
  void selfParticipantKey;
  return null;
}

/**
 * Stub for future live snapshot (session row, turn, dice, pieces blob, revision).
 * @returns {null}
 */
export function getOv2LudoLiveSessionSnapshot() {
  return null;
}
