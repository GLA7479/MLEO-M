/**
 * Canonical per-game economy entry policy (server mirrors via ov2_shared_resolve_economy_entry_policy).
 * Debit timing is per-game — not a permanent shared-room rule.
 *
 * @typedef {'ON_HOST_START' | 'ON_ROUND_ENTRY' | 'NONE'} Ov2EconomyEntryPolicy
 */

/** @type {Ov2EconomyEntryPolicy} */
export const OV2_ECONOMY_ENTRY_POLICY = Object.freeze({
  ON_HOST_START: "ON_HOST_START",
  ON_ROUND_ENTRY: "ON_ROUND_ENTRY",
  NONE: "NONE",
});

/**
 * @param {string} productGameId
 * @returns {Ov2EconomyEntryPolicy}
 */
export function getEconomyEntryPolicyForProduct(productGameId) {
  const id = String(productGameId || "").trim();
  /** Cash live tables: debits only via `/api/ov2-community-cards/operate` (buy-in/top-up), not shared-room stake. */
  if (id === "ov2_community_cards") {
    return OV2_ECONOMY_ENTRY_POLICY.NONE;
  }
  if (id === "ov2_c21") {
    return OV2_ECONOMY_ENTRY_POLICY.ON_ROUND_ENTRY;
  }
  if (id === "ov2_color_wheel") {
    return OV2_ECONOMY_ENTRY_POLICY.NONE;
  }
  if (
    id === "ov2_ludo" ||
    id === "ov2_snakes_ladders" ||
    id === "ov2_bingo" ||
    id === "ov2_rummy51" ||
    id === "ov2_backgammon" ||
    id === "ov2_checkers" ||
    id === "ov2_chess" ||
    id === "ov2_dominoes" ||
    id === "ov2_fourline" ||
    id === "ov2_flipgrid" ||
    id === "ov2_meldmatch" ||
    id === "ov2_colorclash" ||
    id === "ov2_fleet_hunt" ||
    id === "ov2_goal_duel"
  ) {
    return OV2_ECONOMY_ENTRY_POLICY.ON_HOST_START;
  }
  return OV2_ECONOMY_ENTRY_POLICY.NONE;
}
