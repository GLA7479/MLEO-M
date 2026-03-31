"use client";

/**
 * Horizontal seat chips — OV2-generic; caller supplies labels and highlight index.
 */

/**
 * @param {{
 * count: number,
 * labels?: (string|null|undefined)[],
 * activeIndex?: number|null,
 * selfIndex?: number|null,
 * awaitedIndex?: number|null,
 * eliminatedIndices?: number[]|null,
 * }} props
 */
export default function Ov2SeatStrip({
  count,
  labels = [],
  activeIndex = null,
  selfIndex = null,
  awaitedIndex = null,
  eliminatedIndices = null,
}) {
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
    <div className="flex min-h-0 w-full shrink-0 gap-1 overflow-hidden pb-1 pt-0.5">
      {Array.from({ length: count }).map((_, idx) => {
        const label = labels[idx] ?? `Seat ${idx + 1}`;
        const isSelf = selfIndex === idx;
        const isActive = activeIndex === idx;
        const isAwaited = awaitedIndex === idx;
        const isEliminated = Array.isArray(eliminatedIndices) && eliminatedIndices.includes(idx);
        const tone = tones[idx % tones.length];
        return (
          <div
            key={idx}
            className={`flex min-w-0 flex-1 flex-col rounded-md border px-1.5 py-1.5 text-center text-[10px] font-semibold text-white sm:min-w-[5.5rem] sm:text-[11px] ${tone} ${
              isSelf ? "ring-1 ring-white ring-offset-1 ring-offset-zinc-950" : ""
            } ${isActive ? "brightness-110" : "opacity-90"} ${isEliminated ? "opacity-55 grayscale" : ""}`}
          >
            <span className="text-white">{label}</span>
            <div className="mt-0.5 flex items-center justify-center gap-1">
              {isAwaited && !isEliminated ? (
                <span className="rounded bg-fuchsia-900/70 px-1 text-[8px] font-bold text-fuchsia-100">await</span>
              ) : null}
              {isEliminated ? (
                <span className="rounded bg-zinc-800/80 px-1 text-[8px] font-bold text-zinc-200">out</span>
              ) : null}
            </div>
            {isSelf ? <span className="text-[9px] font-normal text-sky-200">you</span> : null}
          </div>
        );
      })}
    </div>
  );
}
