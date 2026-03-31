/**
 * OV2 Bingo — session / authority boundary (no RPC or SQL here).
 *
 * Today every round is **client-local preview**: deterministic card + deck from a seed, local
 * “caller” queue, and marks that are **UI-only** until a server-owned round exists.
 *
 * Next phase (plug in here):
 * - `fetchOv2BingoLiveRoundSnapshot` / subscribe (Realtime) for called numbers, round id, phase
 * - Caller / draw ownership (who may advance the ball — server decides)
 * - `submitOv2BingoClaimIntent` → server validates row/full/card against authoritative marks or server grid
 * - Map `room` + members → seated match session (no client-side fake seats)
 */

/**
 * Standalone preview route or no OV2 room row in context.
 * @type {"preview_only"}
 */
export const OV2_BINGO_PLAY_MODE_PREVIEW_ONLY = "preview_only";

/**
 * OV2 room is loaded (navigation/shell). There is still **no** authoritative Bingo match session.
 * @type {"room_context_no_match_yet"}
 */
export const OV2_BINGO_PLAY_MODE_ROOM_CONTEXT = "room_context_no_match_yet";

export const OV2_BINGO_PLAY_MODE = Object.freeze({
  PREVIEW_ONLY: OV2_BINGO_PLAY_MODE_PREVIEW_ONLY,
  ROOM_CONTEXT_NO_MATCH_YET: OV2_BINGO_PLAY_MODE_ROOM_CONTEXT,
});

/**
 * @typedef {Object} Ov2BingoLiveRoundSnapshot
 * @property {string} roundId
 * @property {number[]} calledNumbersOrdered
 * @property {string|null} callerParticipantKey — server-assigned; null until implemented
 * @property {"open"|"closed"|string} phase
 */

/**
 * @param {{ room?: { id?: string } } | null | undefined} baseContext
 * @returns {(typeof OV2_BINGO_PLAY_MODE)[keyof typeof OV2_BINGO_PLAY_MODE]}
 */
export function resolveOv2BingoPlayMode(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const id = room?.id != null ? String(room.id).trim() : "";
  if (id) return OV2_BINGO_PLAY_MODE.ROOM_CONTEXT_NO_MATCH_YET;
  return OV2_BINGO_PLAY_MODE.PREVIEW_ONLY;
}

/** @returns {Promise<Ov2BingoLiveRoundSnapshot|null>} */
export async function fetchOv2BingoLiveRoundSnapshot(_roomId) {
  return null;
}

/** @returns {Promise<{ ok: boolean, error?: string }>} */
export async function submitOv2BingoClaimIntent(_payload) {
  return { ok: false, error: "Live claims are not implemented." };
}
