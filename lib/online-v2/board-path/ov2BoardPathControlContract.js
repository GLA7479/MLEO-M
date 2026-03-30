/**
 * OV2 Board Path — control gating (contract only; no RPC).
 */

import { BOARD_PATH_SESSION_STATE } from "../ov2BoardPathAdapter";
import { ONLINE_V2_ROOM_PHASE } from "../ov2Economy";
import { OV2_BP_PHASES } from "./ov2BoardPathPhases";
import {
  canBoardPathSeatEndTurn,
  canBoardPathSeatMove,
  canBoardPathSeatRoll,
} from "./ov2BoardPathEngine";

/** UI control bucket — derive only from `vm.phase` + `vm.sessionState` (+ room lifecycle for stakes). */
export const BOARD_PATH_CONTROL_SURFACE = Object.freeze({
  BLOCKED: "blocked",
  COMMIT_STAKE: "commit_stake",
  WAITING: "waiting",
  TURN_ACTIONS: "turn_actions",
  REMATCH_FLOW: "rematch_flow",
});

/**
 * @param {string} phase — `OV2_BP_PHASES` value from VM
 * @param {string} sessionState — `BOARD_PATH_SESSION_STATE` value from VM
 * @param {string|undefined|null} roomLifecycle
 */
export function resolveBoardPathControlSurface(phase, sessionState, roomLifecycle) {
  if (phase === OV2_BP_PHASES.BLOCKED) {
    return BOARD_PATH_CONTROL_SURFACE.BLOCKED;
  }
  if (roomLifecycle === ONLINE_V2_ROOM_PHASE.PENDING_STAKES) {
    return BOARD_PATH_CONTROL_SURFACE.COMMIT_STAKE;
  }
  if (phase === OV2_BP_PHASES.POST_FINISH) {
    return BOARD_PATH_CONTROL_SURFACE.REMATCH_FLOW;
  }
  if (phase === OV2_BP_PHASES.MATCH_ENDED || sessionState === BOARD_PATH_SESSION_STATE.FINISHED) {
    return BOARD_PATH_CONTROL_SURFACE.WAITING;
  }
  if (
    phase === OV2_BP_PHASES.OPENING_SESSION ||
    phase === OV2_BP_PHASES.SESSION_LOADING ||
    phase === OV2_BP_PHASES.SESSION_HYDRATING ||
    sessionState === BOARD_PATH_SESSION_STATE.MISSING ||
    sessionState === BOARD_PATH_SESSION_STATE.OPENING ||
    sessionState === BOARD_PATH_SESSION_STATE.NO_SEATS ||
    sessionState === BOARD_PATH_SESSION_STATE.HYDRATING
  ) {
    return BOARD_PATH_CONTROL_SURFACE.WAITING;
  }
  if (phase === OV2_BP_PHASES.IN_MATCH && sessionState === BOARD_PATH_SESSION_STATE.ACTIVE) {
    return BOARD_PATH_CONTROL_SURFACE.TURN_ACTIONS;
  }
  if (phase === OV2_BP_PHASES.SESSION_READY && sessionState === BOARD_PATH_SESSION_STATE.READY) {
    return BOARD_PATH_CONTROL_SURFACE.WAITING;
  }
  return BOARD_PATH_CONTROL_SURFACE.WAITING;
}

/**
 * True when self may invoke a server turn action (roll / move / end turn) for the current step.
 * @param {{ phase?: string, engine_phase?: string, turnMeta?: Record<string, unknown> }|null|undefined} session
 * @param {{ seatIndex: number, participantKey?: string }|null|undefined} selfSeat
 * @param {unknown[]|null|undefined} seats — session seat rows or local seats (`seat_index` / `seatIndex`)
 */
export function canSelfAct(session, selfSeat, seats) {
  const pk = selfSeat?.participantKey?.trim() || null;
  if (!session || !selfSeat || !Array.isArray(seats) || seats.length === 0 || !pk) return false;
  return (
    canBoardPathSeatRoll(session, seats, pk) ||
    canBoardPathSeatMove(session, seats, pk) ||
    canBoardPathSeatEndTurn(session, seats, pk)
  );
}

/**
 * @param {{ phase?: string, engine_phase?: string, turnMeta?: Record<string, unknown> }|null|undefined} session
 * @param {{ seatIndex: number, participantKey?: string }|null|undefined} selfSeat
 * @param {unknown[]|null|undefined} seats
 */
export function canEndTurn(session, selfSeat, seats) {
  const pk = selfSeat?.participantKey?.trim() || null;
  if (!session || !selfSeat || !pk || !Array.isArray(seats)) return false;
  return canBoardPathSeatEndTurn(session, seats, pk);
}
