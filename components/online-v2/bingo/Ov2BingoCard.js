"use client";

import { useMemo } from "react";
import { normalizeCalledNumbers } from "../../../lib/online-v2/bingo/ov2BingoEngine";

/**
 * Presentational 5×5 Bingo card.
 * Marks toggle only on numbers present in authoritative `called` (preview: local called list; live: server list).
 * No called-based “highlight” styling — only neutral unmarked vs neutral marked.
 *
 * @param {{
 *   card: number[][],
 *   called: unknown,
 *   marks: boolean[],
 *   onToggleMark?: ((n: number) => void) | null,
 *   disabled?: boolean,
 * }} props
 */
export default function Ov2BingoCard({ card, called, marks, onToggleMark = null, disabled = false }) {
  const headers = ["B", "I", "N", "G", "O"];
  const calledSet = useMemo(() => new Set(normalizeCalledNumbers(called)), [called]);
  const canInteract = typeof onToggleMark === "function" && !disabled;

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-none flex-col sm:max-w-2xl lg:max-w-3xl">
      <div className="mt-0.5 grid shrink-0 grid-cols-5 gap-0.5 sm:gap-1">
        {headers.map(h => (
          <div key={h} className="h-5 rounded bg-white/10 py-0.5 text-center text-[10px] font-bold text-zinc-200 sm:h-6 sm:text-[11px]">
            {h}
          </div>
        ))}
      </div>

      <div className={`mt-0.5 grid min-h-0 flex-1 grid-cols-5 gap-0.5 sm:gap-1 ${!canInteract ? "pointer-events-none opacity-85" : ""}`}>
        {card.flat().map((n, idx) => {
          const isFree = n === 0 && idx === 12;
          const isMarked = marks[idx];
          const canClickCell = !isFree && calledSet.has(n);

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (!canInteract || isFree) return;
                if (!canClickCell) return;
                onToggleMark?.(n);
              }}
              disabled={!canInteract || isFree || !canClickCell}
              className={[
                "grid min-h-[1.85rem] place-items-center rounded-lg border text-xs font-semibold transition sm:min-h-[2.25rem] sm:text-sm",
                isFree
                  ? "border-cyan-400/80 bg-gradient-to-br from-cyan-700/50 to-sky-900/40 text-cyan-50 shadow-inner shadow-cyan-900/40"
                  : "",
                !isFree && isMarked
                  ? "border-zinc-400/90 bg-zinc-600/50 text-zinc-50 shadow-inner shadow-black/20"
                  : "",
                !isFree && !isMarked ? "border-white/15 bg-white/5 text-zinc-100" : "",
              ].join(" ")}
            >
              <span className={isMarked && !isFree ? "font-semibold text-white" : ""}>{isFree ? "FREE" : n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
