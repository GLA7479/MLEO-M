import { resolveSectorWorldOrder } from "./catalog";
import { buildWorld2PanelFlavor } from "./world2FreightOrbit";
import { buildWorld3PanelFlavor } from "./world3SignalWastes";
import { buildWorld4PanelFlavor } from "./world4ReactorScar";
import { buildWorld5PanelFlavor } from "./world5SalvageGraveyard";
import { buildWorld6PanelFlavor } from "./world6NexusPrime";

/**
 * Active-world panel / overview flavor. Worlds 2–6; World 1 returns null.
 * @param {object} state
 * @param {object} derived
 * @param {{ nextWorldName?: string | null, canDeployToNextWorld?: boolean }} [transitionCtx] from sector snapshot
 */
export function buildActiveWorldPanelFlavor(state, derived, transitionCtx = {}) {
  const order = resolveSectorWorldOrder(state);
  if (order === 2) {
    return buildWorld2PanelFlavor(state, derived, transitionCtx);
  }
  if (order === 3) {
    return buildWorld3PanelFlavor(state, derived, transitionCtx);
  }
  if (order === 4) {
    return buildWorld4PanelFlavor(state, derived, transitionCtx);
  }
  if (order === 5) {
    return buildWorld5PanelFlavor(state, derived, transitionCtx);
  }
  if (order === 6) {
    return buildWorld6PanelFlavor(state, derived, transitionCtx);
  }
  return null;
}
