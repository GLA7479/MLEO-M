"use client";

/**
 * Bingo card grid (from `games-online/BingoMP.js` BingoCard — OV2-only).
 */

/** @param {{ title?: string, card: number[][], marks: boolean[], calledSet: Set<number>, onCellClick: (n: number) => void, lastNumber?: number|null }} props */
export default function Ov2BingoCard({ title = "Card", card, marks, calledSet, onCellClick, lastNumber = null }) {
  const headers = ["B", "I", "N", "G", "O"];

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className="mb-0.5 text-center text-xs font-semibold">{title}</div>

      <div className="mb-0.5 grid grid-cols-5 gap-0.5">
        {headers.map(h => (
          <div key={h} className="h-5 rounded bg-white/10 py-0.5 text-center text-[10px] font-bold">
            {h}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-0.5">
        {card.flat().map((n, idx) => {
          const isFree = n === 0 && idx === 12;
          const isMarked = marks[idx];
          const isCalled = isFree || calledSet.has(n);
          const shouldShowYellow = isMarked && isCalled && !isFree;
          const isLast = lastNumber != null && n === lastNumber && !isFree;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => (isFree ? null : onCellClick(n))}
              disabled={!isCalled && !isFree}
              className={`grid h-8 place-items-center rounded-lg border text-sm font-semibold transition sm:h-9
                ${shouldShowYellow ? "border-yellow-400 bg-yellow-500 shadow-lg shadow-yellow-500/60" : ""}
                ${isMarked && !shouldShowYellow ? "border-emerald-400 bg-emerald-500/60 shadow-lg shadow-emerald-500/50" : ""}
                ${!isMarked ? "border-white/15 bg-white/5" : ""}
                ${isLast ? "ring-2 ring-emerald-300" : ""}
              `}
            >
              <span className={shouldShowYellow || isMarked ? "font-bold text-white" : ""}>{isFree ? "FREE" : n}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-1 text-center text-[10px] text-zinc-500">Called numbers only — server will validate claims in OV2 RPC phase.</p>
    </div>
  );
}
