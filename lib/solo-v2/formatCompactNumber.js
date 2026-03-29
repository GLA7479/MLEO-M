/**
 * Shared compact number display for Solo V2 (vault, stakes, stats).
 * Uses K / M / B with up to 2 fractional digits, trailing zeros trimmed (e.g. 1K, 1.5K, 141.08M).
 */
function scaledSuffix(absInt, divisor, suffix) {
  const x = absInt / divisor;
  const t = parseFloat(x.toFixed(2));
  return `${t}${suffix}`;
}

export function formatCompactNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const sign = num < 0 ? "-" : "";
  const n = Math.floor(Math.abs(num));
  if (n < 1000) return `${sign}${n}`;
  if (n >= 1_000_000_000) return `${sign}${scaledSuffix(n, 1_000_000_000, "B")}`;
  if (n >= 1_000_000) return `${sign}${scaledSuffix(n, 1_000_000, "M")}`;
  if (n >= 1_000) return `${sign}${scaledSuffix(n, 1_000, "K")}`;
  return `${sign}${n}`;
}
