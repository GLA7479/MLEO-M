/**
 * OV2 Board Path — canonical live turn pipeline + gameplay CTA surface (app-side only).
 * Single source for turn-action meanings under `BOARD_PATH_CONTROL_SURFACE.TURN_ACTIONS`.
 * Does not encode bundle sync, session-open, or stake flows.
 */

import { BOARD_PATH_SESSION_STATE } from "../ov2BoardPathAdapter";
import {
  resolveBoardPathPrimaryPressEnabled,
} from "./ov2BoardPathActionContract";
import { BOARD_PATH_CONTROL_SURFACE } from "./ov2BoardPathControlContract";
import { BOARD_PATH_PRIMARY_ACTION } from "./ov2BoardPathEngine";
import { OV2_BP_PHASES } from "./ov2BoardPathPhases";

/**
 * @readonly
 */
export const BOARD_PATH_TURN_PIPELINE_STATE = Object.freeze({
  TURN_WAITING: "turn_waiting",
  TURN_CAN_ROLL: "turn_can_roll",
  TURN_CAN_MOVE: "turn_can_move",
  TURN_CAN_END: "turn_can_end",
  TURN_BUSY: "turn_busy",
  TURN_BLOCKED: "turn_blocked",
  TURN_FINISHED: "turn_finished",
});

/**
 * @typedef {Object} BoardPathGameplayActionSurface
 * @property {string} turnPipelineState
 * @property {'roll'|'move'|'end_turn'|'wait'|'none'} primaryGameplayActionKey
 * @property {string} primaryGameplayActionLabel
 * @property {boolean} gameplayInteractionEnabled
 * @property {boolean} gameplayInteractionBusy
 * @property {boolean} gameplayInteractionBlocked
 */

/** When not on the turn control surface or VM missing. */
export const BOARD_PATH_GAMEPLAY_ACTION_SURFACE_OFF = /** @type {BoardPathGameplayActionSurface} */ ({
  turnPipelineState: BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
  primaryGameplayActionKey: "none",
  primaryGameplayActionLabel: "",
  gameplayInteractionEnabled: false,
  gameplayInteractionBusy: false,
  gameplayInteractionBlocked: true,
});

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 * @param {ReturnType<typeof import("./ov2BoardPathActionContract").resolveBoardPathActions>} actions
 * @param {null|'roll'|'move'|'end_turn'} turnActionPending — gameplay RPC only (`commit_stake` excluded).
 * @returns {BoardPathGameplayActionSurface}
 */
export function deriveBoardPathGameplayActionSurface(vm, actions, turnActionPending) {
  if (!vm || !actions) {
    return { ...BOARD_PATH_GAMEPLAY_ACTION_SURFACE_OFF };
  }

  const gp = vm.gameplay && !vm.gameplay.shapeInvalid ? vm.gameplay : null;
  const gameplayInteractionBusy = Boolean(
    turnActionPending === "roll" || turnActionPending === "move" || turnActionPending === "end_turn"
  );

  const syncBlocked =
    Boolean(actions.isBlocked || actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.BLOCKED) ||
    vm.phase === OV2_BP_PHASES.BLOCKED ||
    Boolean(vm.isBlocked);

  const onTurnSurface = actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.TURN_ACTIONS;

  const hasSelfSeat =
    vm.self?.seatIndex != null && vm.self.seatIndex !== "" && !Number.isNaN(Number(vm.self.seatIndex));

  const turnPipelineOk =
    !syncBlocked &&
    vm.phase === OV2_BP_PHASES.IN_MATCH &&
    vm.sessionState === BOARD_PATH_SESSION_STATE.ACTIVE &&
    hasSelfSeat;

  /** @param {string} pa */
  function keyFromPrimary(pa) {
    if (pa === BOARD_PATH_PRIMARY_ACTION.ROLL) return /** @type {const} */ ("roll");
    if (pa === BOARD_PATH_PRIMARY_ACTION.MOVE) return /** @type {const} */ ("move");
    if (pa === BOARD_PATH_PRIMARY_ACTION.END_TURN) return /** @type {const} */ ("end_turn");
    if (pa === BOARD_PATH_PRIMARY_ACTION.WAIT) return /** @type {const} */ ("wait");
    return /** @type {const} */ ("none");
  }

  /** @returns {BoardPathGameplayActionSurface} */
  function surface(state, key, label, enabled, blocked) {
    return {
      turnPipelineState: state,
      primaryGameplayActionKey: key,
      primaryGameplayActionLabel: label,
      gameplayInteractionEnabled: Boolean(enabled),
      gameplayInteractionBusy,
      gameplayInteractionBlocked: Boolean(blocked),
    };
  }

  if (!onTurnSurface) {
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
      "none",
      "",
      false,
      true
    );
  }

  if (syncBlocked) {
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
      gp ? keyFromPrimary(gp.primaryAction) : "none",
      gp?.primaryActionLabel || "",
      false,
      true
    );
  }

  if (gp?.finished || vm.sessionState === BOARD_PATH_SESSION_STATE.FINISHED) {
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_FINISHED,
      "none",
      gp?.statusLabel || "Match over",
      false,
      false
    );
  }

  if (!gp) {
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
      "none",
      typeof vm.primary?.label === "string" ? vm.primary.label : "",
      false,
      true
    );
  }

  if (gameplayInteractionBusy) {
    const busyKey =
      turnActionPending === "roll"
        ? "roll"
        : turnActionPending === "move"
          ? "move"
          : turnActionPending === "end_turn"
            ? "end_turn"
            : keyFromPrimary(gp.primaryAction);
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_BUSY,
      busyKey === "none" ? keyFromPrimary(gp.primaryAction) : busyKey,
      gp.primaryActionLabel,
      false,
      false
    );
  }

  if (!turnPipelineOk) {
    return surface(
      BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
      keyFromPrimary(gp.primaryAction),
      gp.primaryActionLabel,
      false,
      true
    );
  }

  const enabled = resolveBoardPathPrimaryPressEnabled(vm, actions, gp);

  switch (gp.primaryAction) {
    case BOARD_PATH_PRIMARY_ACTION.WAIT:
      return surface(
        BOARD_PATH_TURN_PIPELINE_STATE.TURN_WAITING,
        "wait",
        gp.primaryActionLabel,
        false,
        false
      );
    case BOARD_PATH_PRIMARY_ACTION.ROLL:
      return surface(
        BOARD_PATH_TURN_PIPELINE_STATE.TURN_CAN_ROLL,
        "roll",
        gp.primaryActionLabel,
        enabled,
        false
      );
    case BOARD_PATH_PRIMARY_ACTION.MOVE:
      return surface(
        BOARD_PATH_TURN_PIPELINE_STATE.TURN_CAN_MOVE,
        "move",
        gp.primaryActionLabel,
        enabled,
        false
      );
    case BOARD_PATH_PRIMARY_ACTION.END_TURN:
      return surface(
        BOARD_PATH_TURN_PIPELINE_STATE.TURN_CAN_END,
        "end_turn",
        gp.primaryActionLabel,
        enabled,
        false
      );
    default:
      return surface(
        BOARD_PATH_TURN_PIPELINE_STATE.TURN_BLOCKED,
        "none",
        gp.primaryActionLabel,
        false,
        true
      );
  }
}
