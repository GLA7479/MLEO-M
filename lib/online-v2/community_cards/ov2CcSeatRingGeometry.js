/**
 * Presentation-only: normalized ellipse positions for Community Cards seat ring.
 * Seat index 0 is anchored at bottom center (front of table); indices increase clockwise on screen.
 *
 * @param {number} maxSeats
 * @param {number} seatIndex
 * @param {boolean} [wide=false] larger orbit for sm+ viewports
 * @returns {{ top: string, left: string }}
 */
export function ov2CcSeatRingPercent(maxSeats, seatIndex, wide = false) {
  const n = Math.max(1, Math.floor(Number(maxSeats) || 9));
  const i = Math.floor(Number(seatIndex) || 0);
  if (i < 0 || i >= n) return { top: "50%", left: "50%" };

  const theta = (2 * Math.PI * i) / n;
  const isShort = n <= 5;
  const rx = wide ? (isShort ? 42.5 : 45) : isShort ? 37 : 40;
  const ry = wide ? (isShort ? 38 : 41) : isShort ? 33.5 : 36;

  const leftPct = 50 - rx * Math.sin(theta);
  const topPct = 50 + ry * Math.cos(theta);

  return {
    left: `${Math.round(leftPct * 100) / 100}%`,
    top: `${Math.round(topPct * 100) / 100}%`,
  };
}
