/**
 * OV2 Board Path — session bootstrap contract (app-side only; no DB execution required).
 * Aligns future wiring with `002_ov2_board_path.sql` (`ov2_board_path_sessions`, `ov2_board_path_seats`).
 */

/**
 * Expected `ov2_board_path_sessions` row shape (Postgres) once SQL exists.
 * @typedef {Object} Ov2BoardPathSessionRowLike
 * @property {string} id
 * @property {string} room_id
 * @property {number} match_seq
 * @property {string} [engine_phase] e.g. pregame | playing | ended
 * @property {Record<string, unknown>|null} [board] path positions / engine payload
 * @property {Record<string, unknown>} [turn] current turn pointer / RPC metadata
 */

/**
 * Expected `ov2_board_path_seats` row shape (Postgres) once SQL exists.
 * @typedef {Object} Ov2BoardPathSeatRowLike
 * @property {string} id
 * @property {string} session_id
 * @property {string|null} [room_member_id]
 * @property {number} seat_index
 * @property {string} participant_key
 * @property {Record<string, unknown>} [meta]
 */

/**
 * -----------------------------------------------------------------------------
 * Bootstrap lifecycle (conceptual)
 * -----------------------------------------------------------------------------
 * BEFORE session row:
 *   - `ov2_rooms.lifecycle_phase === 'active'`
 *   - Every current `ov2_room_members` row has `wallet_state === 'committed'` for this match
 *   - `ov2_rooms.active_session_id` is still null until the open-session RPC completes
 *
 * DURING bootstrap (server):
 *   - RPC creates `ov2_board_path_sessions` for `(room_id, match_seq)`
 *   - RPC inserts `ov2_board_path_seats` for each participant
 *   - RPC sets `ov2_rooms.active_session_id` to the new session id
 *
 * AFTER bootstrap (client):
 *   - `active_session_id` is non-null and matches loaded `Ov2BoardPathSessionRowLike.id`
 *   - Optional: `seats[]` length matches seated members for sanity checks
 *   - `engine_phase` / `turn` / `board` drive the Board Path engine UI (future)
 * -----------------------------------------------------------------------------
 */

/**
 * @param {{ lifecycle_phase?: string }|null|undefined} room
 * @param {{ wallet_state?: string }[]} members
 */
export function boardPathRoomEligibleForSessionOpen(room, members) {
  if (!room || room.lifecycle_phase !== "active") return false;
  if (!Array.isArray(members) || members.length === 0) return false;
  return members.every(m => m.wallet_state === "committed");
}

/**
 * Client is still bootstrapping when the room is active but session is not fully hydrated.
 * @param {{ lifecycle_phase?: string, active_session_id?: string|null }|null|undefined} room
 * @param {{ id?: string|null }|null|undefined} session
 */
export function boardPathClientBootstrappingSession(room, session) {
  if (!room || room.lifecycle_phase !== "active") return false;
  if (!room.active_session_id) return true;
  const sid = String(room.active_session_id);
  if (!session?.id) return true;
  return String(session.id) !== sid;
}

/**
 * @param {{ id?: string|null }|null|undefined} session
 * @param {{ active_session_id?: string|null }|null|undefined} room
 */
export function boardPathSessionIdMatchesRoom(session, room) {
  if (!session?.id || !room?.active_session_id) return false;
  return String(session.id) === String(room.active_session_id);
}

/**
 * @param {Ov2BoardPathSeatRowLike[]|null|undefined} seats
 * @param {number} expectedSeatCount
 */
export function boardPathSeatsLookComplete(seats, expectedSeatCount) {
  if (!Array.isArray(seats) || expectedSeatCount <= 0) return false;
  return seats.length >= expectedSeatCount;
}
