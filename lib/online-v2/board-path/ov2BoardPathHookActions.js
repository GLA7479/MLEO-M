/**
 * OV2 Board Path — shared hook-side action helpers (app layer only; no SQL).
 * Single refresh policy after successful live RPCs; stable error normalization.
 */

import { Ov2RoomRpcError } from "../ov2RoomsApi";

/**
 * Canonical hook action kinds (pending / logging). Not all map to gameplay `actionPending`.
 * @readonly
 */
export const BOARD_PATH_HOOK_ACTION_KIND = Object.freeze({
  COMMIT_STAKE: "commit_stake",
  ROLL: "roll",
  MOVE: "move",
  END_TURN: "end_turn",
  REMATCH_FLOW: "rematch_flow",
  START_NEXT_MATCH: "start_next_match",
  FINALIZE_SESSION: "finalize_session",
  FINALIZE_ROOM: "finalize_room",
  CLAIM_SETTLEMENT: "claim_settlement",
});

/**
 * After any successful Board Path RPC that mutates room / members / session / seats,
 * call the same coordinated fetch the live-sync path uses (members + detailed session).
 *
 * Does not start polling. Refresh may yield null bundle (e.g. identity race); callers
 * should not treat null as “fake success” of their RPC — only that refresh ran.
 *
 * @param {() => Promise<unknown>} coordinatedFetchAndApply
 * @returns {Promise<{ ok: true, refreshed: boolean } | { ok: false, reason: string, message?: string }>}
 */
export async function refreshBoardPathRoomBundleAfterAction(coordinatedFetchAndApply) {
  if (typeof coordinatedFetchAndApply !== "function") {
    return { ok: false, reason: "no_coordinated_fetch" };
  }
  try {
    await coordinatedFetchAndApply();
    return { ok: true, refreshed: true };
  } catch (e) {
    return {
      ok: false,
      reason: "refresh_exception",
      message: e?.message || String(e),
    };
  }
}

/**
 * @param {unknown} e
 * @returns {{ code: string, message: string }}
 */
export function normalizeBoardPathHookCaughtError(e) {
  if (e instanceof Ov2RoomRpcError) {
    return { code: String(e.code || "RPC_ERROR"), message: String(e.message || "Request failed.") };
  }
  const msg = e && typeof e === "object" && "message" in e && typeof e.message === "string" ? e.message : null;
  return { code: "ACTION_EXCEPTION", message: msg || String(e) };
}
