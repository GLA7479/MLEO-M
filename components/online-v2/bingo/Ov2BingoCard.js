"use client";

import { useMemo } from "react";
import { normalizeCalledNumbers } from "../../../lib/online-v2/bingo/ov2BingoEngine";

/** @param {string} prizeKey */
function rowIndexFromPrizeKey(prizeKey) {
  const m = /^row([1-5])$/.exec(String(prizeKey || ""));
  if (!m) return null;
  const n = Number(m[1]) - 1;
  return Number.isInteger(n) && n >= 0 && n < 5 ? n : null;
}

/**
 * Presentational 5×5 Bingo card. Marks toggle only on numbers that appear in `called`.
 *
 * @param {{
 *   card: number[][],
 *   called: unknown,
 *   marks: boolean[],
 *   wonPrizeKeys?: string[],
 *   onToggleMark?: ((n: number) => void) | null,
 *   disabled?: boolean,
 * }} props
 */
export default function Ov2BingoCard({
  card,
  called,
  marks,
  wonPrizeKeys = [],
  onToggleMark = null,
  disabled = false,
}) {
  const headers = ["B", "I", "N", "G", "O"];
  const calledSet = useMemo(() => new Set(normalizeCalledNumbers(called)), [called]);
  const canInteract = typeof onToggleMark === "function" && !disabled;

  const rowEmphasis = useMemo(() => {
    const rows = new Set();
    let full = false;
    for (const k of wonPrizeKeys) {
      if (k === "full") full = true;
      else {
        const ri = rowIndexFromPrizeKey(k);
        if (ri != null) rows.add(ri);
      }
    }
    return { rows, full };
  }, [wonPrizeKeys]);

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
          const row = Math.floor(idx / 5);
          const isFree = n === 0 && idx === 12;
          const isMarked = marks[idx];
          const isCalled = isFree || calledSet.has(n);
          const shouldShowYellow = isMarked && isCalled && !isFree;
          const rowWin = rowEmphasis.rows.has(row) || rowEmphasis.full;

          return (
            <button
              key={idx}
              type="button"
              onClick={() => {
                if (!canInteract || isFree) return;
                if (!calledSet.has(n)) return;
                onToggleMark?.(n);
              }}
              disabled={!canInteract || isFree || !calledSet.has(n)}
              className={[
                "grid min-h-[1.85rem] place-items-center rounded-lg border text-xs font-semibold transition sm:min-h-[2.25rem] sm:text-sm",
                isFree
                  ? "border-cyan-400/80 bg-gradient-to-br from-cyan-700/50 to-sky-900/40 text-cyan-50 shadow-inner shadow-cyan-900/40"
                  : shouldShowYellow
                    ? "border-yellow-400 bg-yellow-500 shadow-lg shadow-yellow-500/60"
                    : "",
                !isFree && isMarked && !shouldShowYellow ? "border-emerald-400 bg-emerald-600/55 shadow-md shadow-emerald-900/50" : "",
                !isFree && !isMarked ? "border-white/15 bg-white/5 text-zinc-100" : "",
                rowWin && !isFree ? "ring-1 ring-amber-400/70 ring-offset-1 ring-offset-black/20" : "",
              ].join(" ")}
            >
              <span className={shouldShowYellow || (isMarked && !isFree) ? "font-bold text-white" : ""}>{isFree ? "FREE" : n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
