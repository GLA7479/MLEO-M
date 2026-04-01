"use client";

/**
 * Horizontal seat chips — OV2-generic; caller supplies labels and highlight index.
 * Optional `seatScoreLines` / `seatNearElim` for per-seat stats (e.g. Rummy51).
 */

/**
 * @param {{
 * count: number,
 * labels?: (string|null|undefined)[],
 * activeIndex?: number|null,
 * selfIndex?: number|null,
 * awaitedIndex?: number|null,
 * eliminatedIndices?: number[]|null,
 * seatScoreLines?: (string|null|undefined)[]|null,
 * seatOpenedFlags?: (boolean|undefined)[]|null,
 * seatNearElim?: (boolean|undefined)[]|null,
 * }} props
 */
export default function Ov2SeatStrip({
  count,
  labels = [],
  activeIndex = null,
  selfIndex = null,
  awaitedIndex = null,
  eliminatedIndices = null,
  seatScoreLines = null,
  seatOpenedFlags = null,
  seatNearElim = null,
}) {
  void awaitedIndex;
  void seatOpenedFlags;

  const tones = [
    "border-red-300/80 bg-red-800/45",
    "border-sky-300/80 bg-sky-800/45",
    "border-emerald-300/80 bg-emerald-800/45",
    "border-amber-300/80 bg-amber-700/45",
    "border-violet-300/80 bg-violet-800/45",
    "border-cyan-300/80 bg-cyan-800/45",
    "border-orange-300/80 bg-orange-800/45",
    "border-fuchsia-300/80 bg-fuchsia-800/45",
  ];

  return (
    <div className="flex min-h-0 w-full shrink-0 gap-1 overflow-hidden pb-0.5 pt-0 sm:gap-1 sm:pb-0.5 sm:pt-0">
      {Array.from({ length: count }).map((_, idx) => {
        const label = labels[idx] ?? `Seat ${idx + 1}`;
        const isSelf = selfIndex === idx;
        const isActive = activeIndex === idx;
        const isEliminated = Array.isArray(eliminatedIndices) && eliminatedIndices.includes(idx);
        const tone = tones[idx % tones.length];
        const scoreLine = seatScoreLines?.[idx];
        const near = Boolean(seatNearElim?.[idx]);
        return (
          <div
            key={idx}
            className={`flex min-w-0 flex-1 flex-col justify-center rounded-md border px-1.5 py-1.5 text-center sm:min-w-[5.75rem] sm:px-2 sm:py-2 ${tone} ${
              isSelf ? "ring-2 ring-white ring-offset-2 ring-offset-zinc-950" : ""
            } ${isActive ? "brightness-110" : "opacity-90"} ${isEliminated ? "opacity-55 grayscale" : ""} ${
              near && !isEliminated ? "ring-2 ring-amber-500/50 ring-offset-2 ring-offset-zinc-950" : ""
            }`}
          >
            <span className="truncate text-[10px] font-bold leading-tight text-white sm:text-[12px]">{label}</span>
            {scoreLine != null && scoreLine !== "" ? (
              <span className="mt-1 font-mono text-[9px] font-semibold leading-none tabular-nums text-white/95 sm:text-[11px]">
                {scoreLine}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
