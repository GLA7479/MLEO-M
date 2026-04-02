/**
 * Stable seat colors for OV2 Bingo (0..7). Strong hue separation for seats + claimed prize tiles.
 * @type {readonly { border: string, bg: string, text: string, prize: string }[]}
 */
export const OV2_BINGO_SEAT_STYLES = Object.freeze([
  {
    border: "border-red-500",
    bg: "bg-red-950/70",
    text: "text-red-50",
    prize: "border-2 border-red-400 bg-red-950/80 text-red-50 ring-2 ring-red-400/70",
  },
  {
    border: "border-blue-500",
    bg: "bg-blue-950/70",
    text: "text-blue-50",
    prize: "border-2 border-blue-400 bg-blue-950/80 text-blue-50 ring-2 ring-blue-400/70",
  },
  {
    border: "border-emerald-500",
    bg: "bg-emerald-950/70",
    text: "text-emerald-50",
    prize: "border-2 border-emerald-400 bg-emerald-950/80 text-emerald-50 ring-2 ring-emerald-400/70",
  },
  {
    border: "border-amber-500",
    bg: "bg-amber-950/70",
    text: "text-amber-50",
    prize: "border-2 border-amber-400 bg-amber-950/80 text-amber-50 ring-2 ring-amber-400/70",
  },
  {
    border: "border-violet-500",
    bg: "bg-violet-950/70",
    text: "text-violet-50",
    prize: "border-2 border-violet-400 bg-violet-950/80 text-violet-50 ring-2 ring-violet-400/70",
  },
  {
    border: "border-pink-500",
    bg: "bg-pink-950/70",
    text: "text-pink-50",
    prize: "border-2 border-pink-400 bg-pink-950/80 text-pink-50 ring-2 ring-pink-400/70",
  },
  {
    border: "border-cyan-500",
    bg: "bg-cyan-950/70",
    text: "text-cyan-50",
    prize: "border-2 border-cyan-400 bg-cyan-950/80 text-cyan-50 ring-2 ring-cyan-400/70",
  },
  {
    border: "border-orange-500",
    bg: "bg-orange-950/70",
    text: "text-orange-50",
    prize: "border-2 border-orange-400 bg-orange-950/80 text-orange-50 ring-2 ring-orange-400/70",
  },
]);

/** @param {number|null|undefined} seatIndex */
export function getOv2BingoSeatStyle(seatIndex) {
  const si = Math.floor(Number(seatIndex));
  if (!Number.isInteger(si) || si < 0 || si >= OV2_BINGO_SEAT_STYLES.length) {
    return OV2_BINGO_SEAT_STYLES[0];
  }
  return OV2_BINGO_SEAT_STYLES[si];
}
