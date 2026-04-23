/**
 * Quick Match / Auto Match stake presets only (shared OV2 QM flow). Manual room create is unrelated.
 */

/** @readonly */
export const OV2_QUICK_MATCH_STAKE_UNITS = Object.freeze([100, 1000, 10000, 100000]);

/** @readonly */
export const OV2_QUICK_MATCH_STAKE_OPTIONS = Object.freeze([
  { units: 100, label: "100" },
  { units: 1000, label: "1K" },
  { units: 10000, label: "10K" },
  { units: 100000, label: "100K" },
]);

/**
 * @param {unknown} n
 * @returns {boolean}
 */
export function isOv2QuickMatchAllowedStakeUnits(n) {
  const x = Math.floor(Number(n));
  return OV2_QUICK_MATCH_STAKE_UNITS.includes(x);
}

/**
 * @param {number} units
 * @returns {string}
 */
export function formatOv2QuickMatchStakeShortLabel(units) {
  const u = Math.floor(Number(units));
  const row = OV2_QUICK_MATCH_STAKE_OPTIONS.find(o => o.units === u);
  return row ? row.label : String(u);
}
