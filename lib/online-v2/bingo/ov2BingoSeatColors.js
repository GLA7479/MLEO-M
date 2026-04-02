/**
 * Stable seat colors for OV2 Bingo (0..7). Used in shared room + live Bingo.
 * @type {readonly { border: string, bg: string, text: string, prize: string }[]}
 */
export const OV2_BINGO_SEAT_STYLES = Object.freeze([
  { border: "border-rose-400/65", bg: "bg-rose-950/45", text: "text-rose-100", prize: "border-rose-400/55 bg-rose-950/40 text-rose-50" },
  { border: "border-amber-400/65", bg: "bg-amber-950/45", text: "text-amber-100", prize: "border-amber-400/55 bg-amber-950/40 text-amber-50" },
  { border: "border-lime-400/65", bg: "bg-lime-950/45", text: "text-lime-100", prize: "border-lime-400/55 bg-lime-950/40 text-lime-50" },
  { border: "border-cyan-400/65", bg: "bg-cyan-950/45", text: "text-cyan-100", prize: "border-cyan-400/55 bg-cyan-950/40 text-cyan-50" },
  { border: "border-violet-400/65", bg: "bg-violet-950/45", text: "text-violet-100", prize: "border-violet-400/55 bg-violet-950/40 text-violet-50" },
  { border: "border-fuchsia-400/65", bg: "bg-fuchsia-950/45", text: "text-fuchsia-100", prize: "border-fuchsia-400/55 bg-fuchsia-950/40 text-fuchsia-50" },
  { border: "border-sky-400/65", bg: "bg-sky-950/45", text: "text-sky-100", prize: "border-sky-400/55 bg-sky-950/40 text-sky-50" },
  { border: "border-orange-400/65", bg: "bg-orange-950/45", text: "text-orange-100", prize: "border-orange-400/55 bg-orange-950/40 text-orange-50" },
]);

/** @param {number|null|undefined} seatIndex */
export function getOv2BingoSeatStyle(seatIndex) {
  const si = Math.floor(Number(seatIndex));
  if (!Number.isInteger(si) || si < 0 || si >= OV2_BINGO_SEAT_STYLES.length) {
    return OV2_BINGO_SEAT_STYLES[0];
  }
  return OV2_BINGO_SEAT_STYLES[si];
}
