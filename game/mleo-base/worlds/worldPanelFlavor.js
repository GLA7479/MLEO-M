import { resolveSectorWorldOrder } from "./catalog";
import { buildWorld2PanelFlavor } from "./world2FreightOrbit";

/**
 * Active-world panel / overview flavor. Only World 2 is implemented; others return null.
 * @param {object} state
 * @param {object} derived
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [transitionCtx] from sector snapshot
 */
export function buildActiveWorldPanelFlavor(state, derived, transitionCtx = {}) {
  const order = resolveSectorWorldOrder(state);
  if (order === 2) {
    return buildWorld2PanelFlavor(state, derived, transitionCtx);
  }
  return null;
}
