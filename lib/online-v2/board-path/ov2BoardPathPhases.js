import { BOARD_PATH_SESSION_STATE } from "../ov2BoardPathAdapter";
import { ONLINE_V2_ROOM_PHASE } from "../ov2Economy";

export const OV2_BP_PHASES = {
  IDLE: "idle",
  ROOM_PENDING_START: "room_pending_start",
  ROOM_PENDING_STAKES: "room_pending_stakes",
  OPENING_SESSION: "opening_session",
  SESSION_LOADING: "session_loading",
  SESSION_HYDRATING: "session_hydrating",
  SESSION_READY: "session_ready",
  IN_MATCH: "in_match",
  MATCH_ENDED: "match_ended",
  POST_FINISH: "post_finish",
  BLOCKED: "blocked",
};

/**
 * Product phase (room lifecycle + session pipeline). Uses adapter `sessionState` only — no hook heuristics.
 *
 * @param {{
 *   roomLifecycle?: string|null,
 *   sessionState: keyof typeof BOARD_PATH_SESSION_STATE,
 *   hasSettlement: boolean,
 *   isBlocked?: boolean,
 * }} input
 */
export function resolveBoardPathPhase(input) {
  const { roomLifecycle, sessionState, hasSettlement, isBlocked } = input;

  if (isBlocked) return OV2_BP_PHASES.BLOCKED;

  if (!roomLifecycle) return OV2_BP_PHASES.IDLE;

  if (roomLifecycle === ONLINE_V2_ROOM_PHASE.PENDING_START) {
    return OV2_BP_PHASES.ROOM_PENDING_START;
  }

  if (roomLifecycle === ONLINE_V2_ROOM_PHASE.PENDING_STAKES) {
    return OV2_BP_PHASES.ROOM_PENDING_STAKES;
  }

  if (
    roomLifecycle === ONLINE_V2_ROOM_PHASE.SETTLING ||
    roomLifecycle === ONLINE_V2_ROOM_PHASE.CLOSED ||
    roomLifecycle === ONLINE_V2_ROOM_PHASE.ABORTED
  ) {
    return hasSettlement ? OV2_BP_PHASES.POST_FINISH : OV2_BP_PHASES.MATCH_ENDED;
  }

  if (roomLifecycle === ONLINE_V2_ROOM_PHASE.LOBBY) {
    return OV2_BP_PHASES.IDLE;
  }

  if (roomLifecycle === ONLINE_V2_ROOM_PHASE.ACTIVE) {
    switch (sessionState) {
      case BOARD_PATH_SESSION_STATE.MISSING:
        return OV2_BP_PHASES.OPENING_SESSION;
      case BOARD_PATH_SESSION_STATE.OPENING:
        return OV2_BP_PHASES.OPENING_SESSION;
      case BOARD_PATH_SESSION_STATE.NO_SEATS:
        return OV2_BP_PHASES.SESSION_LOADING;
      case BOARD_PATH_SESSION_STATE.HYDRATING:
        return OV2_BP_PHASES.SESSION_HYDRATING;
      case BOARD_PATH_SESSION_STATE.READY:
        return OV2_BP_PHASES.SESSION_READY;
      case BOARD_PATH_SESSION_STATE.ACTIVE:
        return OV2_BP_PHASES.IN_MATCH;
      case BOARD_PATH_SESSION_STATE.FINISHED:
        return hasSettlement ? OV2_BP_PHASES.POST_FINISH : OV2_BP_PHASES.MATCH_ENDED;
      default:
        return OV2_BP_PHASES.SESSION_READY;
    }
  }

  return OV2_BP_PHASES.IDLE;
}
