/**
 * Compact m:ss countdown (Solo V2 lobby only — not legacy arcade free play).
 */
export function formatMsAsMmSs(milliseconds) {
  if (milliseconds <= 0) return "0:00";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}
