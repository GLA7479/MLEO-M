/**
 * Goal Duel — allowed room entry amounts (shared-room create + commit).
 */

export const OV2_GOAL_DUEL_PRODUCT_GAME_ID = "ov2_goal_duel";

/** @readonly */
export const OV2_GOAL_DUEL_STAKE_UNITS = Object.freeze([100, 1_000, 10_000, 100_000]);

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isOv2GoalDuelStakeUnitsAllowed(n) {
  const x = Math.floor(Number(n));
  return OV2_GOAL_DUEL_STAKE_UNITS.includes(x);
}
