"use client";

/**
 * Horizontal seat chips — OV2-generic; caller supplies labels and highlight index.
 */

/** @param {{ count: number, labels?: (string|null|undefined)[], activeIndex?: number|null, selfIndex?: number|null }} props */
export default function Ov2SeatStrip({ count, labels = [], activeIndex = null, selfIndex = null }) {
  const tones = [
    "border-red-400/50 bg-red-950/40",
    "border-sky-400/50 bg-sky-950/40",
    "border-emerald-400/50 bg-emerald-950/40",
    "border-amber-400/50 bg-amber-950/40",
    "border-violet-400/50 bg-violet-950/40",
    "border-cyan-400/50 bg-cyan-950/40",
    "border-orange-400/50 bg-orange-950/40",
    "border-fuchsia-400/50 bg-fuchsia-950/40",
  ];

  return (
    <div className="flex min-h-0 w-full shrink-0 gap-2 overflow-x-auto pb-1.5 pt-1">
      {Array.from({ length: count }).map((_, idx) => {
        const label = labels[idx] ?? `Seat ${idx + 1}`;
        const isSelf = selfIndex === idx;
        const isActive = activeIndex === idx;
        const tone = tones[idx % tones.length];
        return (
          <div
            key={idx}
            className={`flex min-w-[5rem] flex-1 flex-col rounded-md border px-2 py-2 text-center text-[11px] font-semibold sm:min-w-[5.75rem] sm:text-[11px] ${tone} ${
              isSelf ? "ring-1 ring-white ring-offset-1 ring-offset-zinc-950" : ""
            } ${isActive ? "brightness-110" : "opacity-90"}`}
          >
            <span className="text-white/90">{label}</span>
            {isSelf ? <span className="text-[10px] font-normal text-sky-200">you</span> : null}
          </div>
        );
      })}
    </div>
  );
}
