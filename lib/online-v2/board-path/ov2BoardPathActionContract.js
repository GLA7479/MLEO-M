/**
 * OV2 Board Path — canonical action availability (single source of truth for CTA enablement).
 * Pure: derives from VM + presence of callbacks only.
 */

import {
  BOARD_PATH_SESSION_STATE,
  BOARD_PATH_STAKE_FLOW,
} from "../ov2BoardPathAdapter";
import { ONLINE_V2_ROOM_PHASE } from "../ov2Economy";
import { BOARD_PATH_PRIMARY_ACTION } from "./ov2BoardPathEngine";
import { BOARD_PATH_CONTROL_SURFACE, resolveBoardPathControlSurface } from "./ov2BoardPathControlContract";
import { OV2_BP_PHASES } from "./ov2BoardPathPhases";

/** Distinct copy for session pipeline loading shells (layout may be shared). */
export const BOARD_PATH_SESSION_PIPELINE_STATUS = Object.freeze({
  [BOARD_PATH_SESSION_STATE.MISSING]: "Waiting for table session…",
  [BOARD_PATH_SESSION_STATE.OPENING]: "Session opening — syncing…",
  [BOARD_PATH_SESSION_STATE.NO_SEATS]: "Loading seats…",
  [BOARD_PATH_SESSION_STATE.HYDRATING]: "Loading board…",
  [BOARD_PATH_SESSION_STATE.READY]: "Table ready — starting play…",
  [BOARD_PATH_SESSION_STATE.ACTIVE]: "",
  [BOARD_PATH_SESSION_STATE.FINISHED]: "",
});

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 */
export function isBoardPathPostFinishPipeline(vm) {
  return Boolean(
    vm?.liveDbBoardPath &&
      (vm.sessionState === BOARD_PATH_SESSION_STATE.FINISHED ||
        vm.phase === OV2_BP_PHASES.MATCH_ENDED ||
        vm.phase === OV2_BP_PHASES.POST_FINISH)
  );
}

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 */
export function getBoardPathBlockedStatusLine(vm) {
  if (vm?.phase !== OV2_BP_PHASES.BLOCKED && !vm?.isBlocked) return null;
  const msg = vm?.blockError && typeof vm.blockError === "object" ? vm.blockError.message : null;
  return typeof msg === "string" && msg.trim() !== ""
    ? `Blocked: ${msg}`
    : "Blocked — resolve sync issue before continuing.";
}

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 */
export function resolveBoardPathSettlementClaimRowVisible(vm) {
  if (!isBoardPathPostFinishPipeline(vm) || !vm.roomFinalized) return false;
  const sd = vm.settlementDeliveryUiPhase;
  return (
    Boolean(vm.settlementDeliveryClaimButtonEnabled) ||
    Boolean(vm.selfCanClaimSettlement) ||
    Boolean(vm.settlementClaimBusy) ||
    Boolean(vm.settlementClaimError) ||
    Boolean(vm.settlementVaultReliabilityGapVisible) ||
    sd === "vault_success"
  );
}

/**
 * @typedef {Object} BoardPathActionCallbacks
 * @property {(() => void | Promise<void>)|undefined} [commitStake]
 * @property {(() => void | Promise<void>)|undefined} [rollTurn]
 * @property {(() => void | Promise<void>)|undefined} [chooseToken] — optional token-picker; if omitted, `moveTurn` alone satisfies the move CTA (`canChooseToken`).
 * @property {(() => void | Promise<void>)|undefined} [moveTurn]
 * @property {(() => void | Promise<void>)|undefined} [endTurn]
 * @property {(() => void | Promise<void>)|undefined} [claimSettlement]
 * @property {(() => void | Promise<void>)|undefined} [requestRematch]
 * @property {(() => void | Promise<void>)|undefined} [cancelRematch]
 * @property {(() => void | Promise<void>)|undefined} [startNewMatch]
 * @property {(() => void | Promise<void>)|undefined} [finalizeSession]
 * @property {(() => void | Promise<void>)|undefined} [finalizeRoom]
 */

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 * @param {BoardPathActionCallbacks} callbacks
 */
export function resolveBoardPathActions(vm, callbacks) {
  const cb = callbacks && typeof callbacks === "object" ? callbacks : {};

  const isBlocked = vm?.phase === OV2_BP_PHASES.BLOCKED || Boolean(vm?.isBlocked);

  const gp = vm?.gameplay && !vm.gameplay.shapeInvalid ? vm.gameplay : null;

  const hasSelfSeat =
    vm?.self?.seatIndex != null &&
    vm.self.seatIndex !== "" &&
    !Number.isNaN(Number(vm.self.seatIndex));

  const postFinish = isBoardPathPostFinishPipeline(vm);

  const rematchIdle =
    !vm?.rematchBusy && !vm?.sessionTransitioning && !vm?.finalizeBusy && !vm?.roomFinalizeBusy;

  const baseSurface = resolveBoardPathControlSurface(vm?.phase, vm?.sessionState, vm?.room?.lifecycle);
  const controlSurface = isBlocked ? BOARD_PATH_CONTROL_SURFACE.BLOCKED : baseSurface;

  let canCommitStake = false;
  if (
    !isBlocked &&
    vm?.room?.lifecycle === ONLINE_V2_ROOM_PHASE.PENDING_STAKES &&
    vm?.stakeFlow === BOARD_PATH_STAKE_FLOW.SELF_MUST_COMMIT &&
    vm?.primary &&
    !vm.primary.disabled &&
    !vm.primary.muted &&
    !vm?.commitStakeBusy &&
    typeof cb.commitStake === "function"
  ) {
    canCommitStake = true;
  }

  const turnPipelineOk =
    !isBlocked &&
    vm?.phase === OV2_BP_PHASES.IN_MATCH &&
    vm?.sessionState === BOARD_PATH_SESSION_STATE.ACTIVE &&
    hasSelfSeat;

  const wantsRoll = Boolean(gp?.selfCanRoll && !gp?.actionPending);
  const wantsMove = Boolean(gp?.selfCanMove && !gp?.actionPending);
  const wantsEnd = Boolean(gp?.selfCanEndTurn && !gp?.actionPending);

  const canRoll = turnPipelineOk && wantsRoll && typeof cb.rollTurn === "function";

  const canChooseToken =
    turnPipelineOk &&
    wantsMove &&
    (typeof cb.chooseToken === "function" || typeof cb.moveTurn === "function");

  const canEndTurn = turnPipelineOk && wantsEnd && typeof cb.endTurn === "function";

  const canClaimSettlement =
    !isBlocked &&
    Boolean(vm?.settlementDeliveryClaimButtonEnabled) &&
    !vm?.settlementClaimBusy &&
    typeof cb.claimSettlement === "function";

  const canRequestRematch =
    !isBlocked &&
    postFinish &&
    rematchIdle &&
    Boolean(vm?.selfCanRequestRematch) &&
    typeof cb.requestRematch === "function";

  const canCancelRematch =
    !isBlocked &&
    postFinish &&
    rematchIdle &&
    Boolean(vm?.selfCanCancelRematch) &&
    typeof cb.cancelRematch === "function";

  const canRematch = canRequestRematch || canCancelRematch;

  const canStartNewMatch =
    !isBlocked &&
    postFinish &&
    rematchIdle &&
    Boolean(vm?.hostCanStartNextMatch) &&
    typeof cb.startNewMatch === "function";

  const canFinalizeSession =
    !isBlocked &&
    postFinish &&
    Boolean(vm?.canFinalize) &&
    !vm?.finalized &&
    !vm?.finalizeBusy &&
    !vm?.roomFinalizeBusy &&
    !vm?.settlementClaimBusy &&
    typeof cb.finalizeSession === "function";

  const canFinalizeRoom =
    !isBlocked &&
    postFinish &&
    Boolean(vm?.roomCanFinalize) &&
    !vm?.roomFinalized &&
    !vm?.roomFinalizeBusy &&
    !vm?.settlementClaimBusy &&
    typeof cb.finalizeRoom === "function";

  let isWaiting = false;
  if (!isBlocked) {
    if (baseSurface === BOARD_PATH_CONTROL_SURFACE.WAITING) {
      isWaiting = true;
    } else if (
      baseSurface === BOARD_PATH_CONTROL_SURFACE.REMATCH_FLOW &&
      !canRematch &&
      !canStartNewMatch &&
      !canClaimSettlement
    ) {
      isWaiting = true;
    }
  }

  return {
    isBlocked,
    isWaiting,
    controlSurface,
    canCommitStake,
    canRoll,
    canChooseToken,
    canEndTurn,
    canClaimSettlement,
    canRematch,
    canRequestRematch,
    canCancelRematch,
    canStartNewMatch,
    canFinalizeSession,
    canFinalizeRoom,
  };
}

/**
 * Whether the main CTA may be pressed (contract + current gameplay primary step).
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 * @param {ReturnType<typeof resolveBoardPathActions>} actions
 * @param {import("../ov2BoardPathAdapter").BoardPathGameplayViewModel|null|undefined} gp
 */
export function resolveBoardPathPrimaryPressEnabled(vm, actions, gp) {
  if (actions.isBlocked || actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.BLOCKED) return false;
  if (actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.COMMIT_STAKE) return actions.canCommitStake;
  if (actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.REMATCH_FLOW) {
    return actions.canRematch || actions.canStartNewMatch;
  }
  if (actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.TURN_ACTIONS && gp) {
    if (gp.primaryAction === BOARD_PATH_PRIMARY_ACTION.ROLL) return actions.canRoll;
    if (gp.primaryAction === BOARD_PATH_PRIMARY_ACTION.MOVE) return actions.canChooseToken;
    if (gp.primaryAction === BOARD_PATH_PRIMARY_ACTION.END_TURN) return actions.canEndTurn;
    return false;
  }
  return false;
}
