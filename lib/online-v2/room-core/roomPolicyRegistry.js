/**
 * Registry surface for shared room + economy policy (client-side mirror of server rules).
 * Extend when adding games; keep in sync with SQL `ov2_shared_resolve_economy_entry_policy`.
 */

import { getEconomyEntryPolicyForProduct } from "./roomEconomyEntryPolicy";

/**
 * @param {string} productGameId
 * @returns {{ economyEntryPolicy: import("./roomEconomyEntryPolicy").Ov2EconomyEntryPolicy }}
 */
export function getOv2RoomPolicyForProduct(productGameId) {
  return {
    economyEntryPolicy: getEconomyEntryPolicyForProduct(productGameId),
  };
}
