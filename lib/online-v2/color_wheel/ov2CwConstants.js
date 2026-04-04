/**
 * Shared wheel layout + phase timing (client + server).
 * Segment order matches legacy European wheel strip used for angle mapping.
 */

export const OV2_CW_PLACING_MS = 20_000;
export const OV2_CW_SPINNING_MS = 6_000;
export const OV2_CW_RESULT_MS = 5_000;

/** @type {{ num: number; color: "green" | "red" | "black" }[]} */
export const OV2_CW_WHEEL_NUMBERS = Object.freeze([
  { num: 0, color: "green" },
  { num: 32, color: "red" },
  { num: 15, color: "black" },
  { num: 19, color: "red" },
  { num: 4, color: "black" },
  { num: 21, color: "red" },
  { num: 2, color: "black" },
  { num: 25, color: "red" },
  { num: 17, color: "black" },
  { num: 34, color: "red" },
  { num: 6, color: "black" },
  { num: 27, color: "red" },
  { num: 13, color: "black" },
  { num: 36, color: "red" },
  { num: 11, color: "black" },
  { num: 30, color: "red" },
  { num: 8, color: "black" },
  { num: 23, color: "red" },
  { num: 10, color: "black" },
  { num: 5, color: "red" },
  { num: 24, color: "black" },
  { num: 16, color: "red" },
  { num: 33, color: "black" },
  { num: 1, color: "red" },
  { num: 20, color: "black" },
  { num: 14, color: "red" },
  { num: 31, color: "black" },
  { num: 9, color: "red" },
  { num: 22, color: "black" },
  { num: 18, color: "red" },
  { num: 29, color: "black" },
  { num: 7, color: "red" },
  { num: 28, color: "black" },
  { num: 12, color: "red" },
  { num: 35, color: "black" },
  { num: 3, color: "red" },
  { num: 26, color: "black" },
]);

export const OV2_CW_SEGMENT_DEG = 360 / OV2_CW_WHEEL_NUMBERS.length;

export function ov2CwNormalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

export function ov2CwAngleToIndex(angle) {
  const normalized = ov2CwNormalizeAngle(angle);
  return Math.min(
    OV2_CW_WHEEL_NUMBERS.length - 1,
    Math.floor(normalized / OV2_CW_SEGMENT_DEG),
  );
}

/**
 * Pocket center angle (° clockwise from top), matching `conic-gradient(from -90deg, …)` and rim labels.
 * Used so the top pointer lands on the same pocket as `OV2_CW_WHEEL_NUMBERS[idx]`.
 */
export function ov2CwIndexToCenterAngle(idx) {
  const i = Math.max(0, Math.min(OV2_CW_WHEEL_NUMBERS.length - 1, Math.floor(Number(idx)) || 0));
  return ov2CwNormalizeAngle(270 + (i + 0.5) * OV2_CW_SEGMENT_DEG);
}

export function ov2CwColorForNumber(num) {
  const entry = OV2_CW_WHEEL_NUMBERS.find(n => n.num === num);
  return entry?.color || "green";
}

export function ov2CwPayoutMultiplier(playType) {
  switch (playType) {
    case "number":
      return 35;
    case "red":
    case "black":
    case "even":
    case "odd":
    case "low":
    case "high":
      return 2;
    case "dozen":
    case "column":
      return 3;
    default:
      return 1;
  }
}

/**
 * @param {string} playType
 * @param {number | null} playValue dozen/column 1–3, exact number for `number`
 * @param {number} result
 */
export function ov2CwPlayWins(playType, playValue, result) {
  const resultColor = ov2CwColorForNumber(result);
  const value = Math.floor(Number(playValue) || 0);

  switch (playType) {
    case "number":
      return value === result;
    case "red":
      return resultColor === "red";
    case "black":
      return resultColor === "black";
    case "even":
      return result !== 0 && result % 2 === 0;
    case "odd":
      return result !== 0 && result % 2 === 1;
    case "low":
      return result >= 1 && result <= 18;
    case "high":
      return result >= 19 && result <= 36;
    case "dozen": {
      if (value === 1) return result >= 1 && result <= 12;
      if (value === 2) return result >= 13 && result <= 24;
      if (value === 3) return result >= 25 && result <= 36;
      return false;
    }
    case "column": {
      if (value === 1) return [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(result);
      if (value === 2) return [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(result);
      if (value === 3) return [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(result);
      return false;
    }
    default:
      return false;
  }
}
