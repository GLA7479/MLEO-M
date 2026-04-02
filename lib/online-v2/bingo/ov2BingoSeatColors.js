/**
 * Stable seat colors for OV2 Bingo (0..7). Used in shared room + live Bingo.
 * @type {readonly { border: string, bg: string, text: string, prize: string }[]}
 */
export const OV2_BINGO_SEAT_STYLES = Object.freeze([
  {
    border: "border-rose-500/90",
    bg: "bg-rose-950/60",
    text: "text-rose-50",
    prize: "border-2 border-rose-400/90 bg-rose-950/55 text-rose-50 ring-2 ring-rose-400/50",
  },
  {
    border: "border-amber-500/90",
    bg: "bg-amber-950/60",
    text: "text-amber-50",
    prize: "border-2 border-amber-400/90 bg-amber-950/55 text-amber-50 ring-2 ring-amber-400/50",
  },
  {
    border: "border-lime-500/90",
    bg: "bg-lime-950/60",
    text: "text-lime-50",
    prize: "border-2 border-lime-400/90 bg-lime-950/55 text-lime-50 ring-2 ring-lime-400/50",
  },
  {
    border: "border-cyan-500/90",
    bg: "bg-cyan-950/60",
    text: "text-cyan-50",
    prize: "border-2 border-cyan-400/90 bg-cyan-950/55 text-cyan-50 ring-2 ring-cyan-400/50",
  },
  {
    border: "border-violet-500/90",
    bg: "bg-violet-950/60",
    text: "text-violet-50",
    prize: "border-2 border-violet-400/90 bg-violet-950/55 text-violet-50 ring-2 ring-violet-400/50",
  },
  {
    border: "border-fuchsia-500/90",
    bg: "bg-fuchsia-950/60",
    text: "text-fuchsia-50",
    prize: "border-2 border-fuchsia-400/90 bg-fuchsia-950/55 text-fuchsia-50 ring-2 ring-fuchsia-400/50",
  },
  {
    border: "border-sky-500/90",
    bg: "bg-sky-950/60",
    text: "text-sky-50",
    prize: "border-2 border-sky-400/90 bg-sky-950/55 text-sky-50 ring-2 ring-sky-400/50",
  },
  {
    border: "border-orange-500/90",
    bg: "bg-orange-950/60",
    text: "text-orange-50",
    prize: "border-2 border-orange-400/90 bg-orange-950/55 text-orange-50 ring-2 ring-orange-400/50",
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
