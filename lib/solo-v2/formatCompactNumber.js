/** Shared compact number display for Solo V2 shell stats (vault, amounts). */
export function formatCompactNumber(value) {
  const num = Number(value) || 0;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  return String(Math.floor(num));
}
