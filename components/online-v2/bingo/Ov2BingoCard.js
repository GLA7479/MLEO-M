"use client";

/**
 * OV2 Bingo card — presentation-first, parent-driven (from `games-online/BingoMP.js` patterns).
 * Does not own session authority: parent supplies marks, called set, and optional click handler.
 */

/**
 * @param {{
 *   title?: string,
 *   card: number[][],
 *   marks: boolean[],
 *   calledSet: Set<number>|ReadonlySet<number>,
 *   onCellClick?: ((n: number) => void) | null,
 *   lastNumber?: number|null,
 *   footerHint?: string|null,
 * }} props
 */
export default function Ov2BingoCard({
  title = "Card",
  card,
  marks,
  calledSet,
  onCellClick = null,
  lastNumber = null,
  footerHint = null,
}) {
  const headers = ["B", "I", "N", "G", "O"];
  const canInteract = typeof onCellClick === "function";

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-sm flex-col">
      <div className="shrink-0 text-center text-[11px] font-semibold leading-tight sm:text-xs">{title}</div>

      <div className="mt-0.5 grid shrink-0 grid-cols-5 gap-0.5">
        {headers.map(h => (
          <div key={h} className="h-5 rounded bg-white/10 py-0.5 text-center text-[10px] font-bold">
            {h}
          </div>
        ))}
      </div>

      <div className={`mt-0.5 grid min-h-0 flex-1 grid-cols-5 gap-0.5 ${!canInteract ? "pointer-events-none opacity-90" : ""}`}>
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
              onClick={() => {
                if (!canInteract || isFree) return;
                onCellClick(n);
              }}
              disabled={!canInteract || (!isCalled && !isFree)}
              className={`grid min-h-[1.75rem] place-items-center rounded-lg border text-xs font-semibold transition sm:min-h-[2rem] sm:text-sm
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

      {footerHint ? (
        <p className="mt-0.5 shrink-0 text-center text-[9px] leading-tight text-zinc-500 sm:text-[10px]">{footerHint}</p>
      ) : null}
    </div>
  );
}
