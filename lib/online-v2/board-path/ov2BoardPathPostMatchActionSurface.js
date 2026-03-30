/**
 * OV2 Board Path — canonical post-match / finalization pipeline + CTA surface (app-side only).
 * Describes session finalize → room finalize → post-finish readiness. Settlement **delivery** (`canClaimSettlement`)
 * is passed through from the action contract but is not merged into finalization pipeline semantics.
 */

import { BOARD_PATH_SESSION_STATE } from "../ov2BoardPathAdapter";
import {
  isBoardPathPostFinishPipeline,
} from "./ov2BoardPathActionContract";
import { BOARD_PATH_CONTROL_SURFACE } from "./ov2BoardPathControlContract";
import { OV2_BP_PHASES } from "./ov2BoardPathPhases";

/**
 * @readonly
 */
export const BOARD_PATH_POST_MATCH_PIPELINE_STATE = Object.freeze({
  MATCH_LIVE: "match_live",
  MATCH_ENDED_PENDING_SESSION_FINALIZE: "match_ended_pending_session_finalize",
  MATCH_SESSION_FINALIZING: "match_session_finalizing",
  MATCH_SESSION_FINALIZED: "match_session_finalized",
  MATCH_ROOM_FINALIZING: "match_room_finalizing",
  MATCH_ROOM_FINALIZED: "match_room_finalized",
  MATCH_POST_FINISH_READY: "match_post_finish_ready",
  MATCH_POST_FINISH_BLOCKED: "match_post_finish_blocked",
});

/**
 * @typedef {Object} BoardPathPostMatchActionSurface
 * @property {string} postMatchPipelineState
 * @property {boolean} canFinalizeSession
 * @property {boolean} canFinalizeRoom
 * @property {boolean} canClaimSettlement
 * @property {boolean} canRequestRematch
 * @property {boolean} canCancelRematch
 * @property {boolean} canStartNewMatch
 * @property {boolean} postMatchBusy
 * @property {boolean} postMatchBlocked
 * @property {string} postMatchPrimaryActionKey
 * @property {string} postMatchPrimaryActionLabel
 */

export const BOARD_PATH_POST_MATCH_ACTION_SURFACE_OFF = /** @type {BoardPathPostMatchActionSurface} */ ({
  postMatchPipelineState: BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED,
  canFinalizeSession: false,
  canFinalizeRoom: false,
  canClaimSettlement: false,
  canRequestRematch: false,
  canCancelRematch: false,
  canStartNewMatch: false,
  postMatchBusy: false,
  postMatchBlocked: true,
  postMatchPrimaryActionKey: "none",
  postMatchPrimaryActionLabel: "",
});

/**
 * @param {import("../ov2BoardPathAdapter").BoardPathViewModel} vm
 * @param {ReturnType<typeof import("./ov2BoardPathActionContract").resolveBoardPathActions>} actions
 * @returns {BoardPathPostMatchActionSurface}
 */
export function deriveBoardPathPostMatchActionSurface(vm, actions) {
  if (!vm || !actions) {
    return { ...BOARD_PATH_POST_MATCH_ACTION_SURFACE_OFF };
  }

  const syncBlocked = Boolean(vm.isBlocked || actions.isBlocked);
  const sessionFin = Boolean(vm.finalized);
  const roomFin = Boolean(vm.roomFinalized);
  const sessBusy = Boolean(vm.finalizeBusy);
  const roomBusy = Boolean(vm.roomFinalizeBusy);
  const remBusy = Boolean(vm.rematchBusy || vm.sessionTransitioning);

  const hasSessionRow = Boolean(vm.session && typeof vm.session === "object" && vm.session.id != null);

  const postFinish = isBoardPathPostFinishPipeline(vm);
  const sessionEnded =
    vm.sessionState === BOARD_PATH_SESSION_STATE.FINISHED ||
    vm.phase === OV2_BP_PHASES.MATCH_ENDED ||
    vm.phase === OV2_BP_PHASES.POST_FINISH;

  const postMatchContext = Boolean(postFinish || sessionEnded);

  const inMatchActiveBand =
    vm.phase === OV2_BP_PHASES.IN_MATCH &&
    vm.sessionState === BOARD_PATH_SESSION_STATE.ACTIVE;

  const inMatchLive = !syncBlocked && inMatchActiveBand;

  const postMatchBusy = Boolean(sessBusy || roomBusy || remBusy);

  /** @type {string} */
  let postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;

  if (syncBlocked && inMatchActiveBand) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;
  } else if (inMatchLive) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_LIVE;
  } else if (syncBlocked && postMatchContext) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;
  } else if (postMatchContext && !hasSessionRow) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;
  } else if (sessBusy) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_SESSION_FINALIZING;
  } else if (!sessionFin && sessionEnded) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_ENDED_PENDING_SESSION_FINALIZE;
  } else if (sessionFin && !roomFin && !roomBusy) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_SESSION_FINALIZED;
  } else if (roomBusy) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_ROOM_FINALIZING;
  } else if (sessionFin && roomFin && postFinish && !syncBlocked) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_READY;
  } else if (sessionFin && roomFin) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_ROOM_FINALIZED;
  } else if (!inMatchLive && !postMatchContext) {
    postMatchPipelineState = BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;
  }

  const postMatchBlocked =
    syncBlocked ||
    postMatchPipelineState === BOARD_PATH_POST_MATCH_PIPELINE_STATE.MATCH_POST_FINISH_BLOCKED;

  /** @type {{ key: string, label: string }} */
  let primary = { key: "none", label: "" };
  if (actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.REMATCH_FLOW) {
    if (remBusy) {
      primary = { key: "busy", label: "…" };
    } else if (actions.canRequestRematch) {
      primary = { key: "request_rematch", label: "Request rematch" };
    } else if (actions.canCancelRematch) {
      primary = { key: "cancel_rematch", label: "Cancel rematch" };
    } else if (actions.canStartNewMatch) {
      primary = { key: "start_new_match", label: "Start next match" };
    } else {
      primary = { key: "wait", label: "Wait…" };
    }
  } else if (actions.controlSurface === BOARD_PATH_CONTROL_SURFACE.WAITING && sessionEnded) {
    primary = {
      key: "wait_session",
      label: typeof vm.primary?.label === "string" && vm.primary.label.trim() !== "" ? vm.primary.label : "Wait…",
    };
  }

  return {
    postMatchPipelineState,
    canFinalizeSession: Boolean(actions.canFinalizeSession),
    canFinalizeRoom: Boolean(actions.canFinalizeRoom),
    canClaimSettlement: Boolean(actions.canClaimSettlement),
    canRequestRematch: Boolean(actions.canRequestRematch),
    canCancelRematch: Boolean(actions.canCancelRematch),
    canStartNewMatch: Boolean(actions.canStartNewMatch),
    postMatchBusy,
    postMatchBlocked,
    postMatchPrimaryActionKey: primary.key,
    postMatchPrimaryActionLabel: primary.label,
  };
}
