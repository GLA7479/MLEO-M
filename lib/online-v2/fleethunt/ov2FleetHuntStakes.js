/**
 * Fleet Hunt — allowed room entry amounts (shared-room create + commit).
 */

export const OV2_FLEET_HUNT_PRODUCT_GAME_ID = "ov2_fleet_hunt";

/** @readonly */
export const OV2_FLEET_HUNT_STAKE_UNITS = Object.freeze([100, 1_000, 10_000, 100_000]);

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isOv2FleetHuntStakeUnitsAllowed(n) {
  const x = Math.floor(Number(n));
  return OV2_FLEET_HUNT_STAKE_UNITS.includes(x);
}
