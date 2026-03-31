"use client";

import { useMemo } from "react";
import { deserializeCard, getCardDisplayLabel, sortCardsForHand } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

/**
 * @param {{
 *   handRaw: unknown[],
 *   selectedIds: Set<string>|string[],
 *   discardCardId: string|null,
 *   discardPickMode: boolean,
 *   sortMode: "rank"|"suit",
 *   disabled?: boolean,
 *   onToggleCardId: (id: string) => void,
 *   onSortModeChange: (m: "rank"|"suit") => void,
 *   onEnterDiscardPickMode: () => void,
 * }} props
 */
export default function Ov2Rummy51Hand({
  handRaw = [],
  selectedIds,
  discardCardId,
  discardPickMode,
  sortMode,
  disabled = false,
  onToggleCardId,
  onSortModeChange,
  onEnterDiscardPickMode,
}) {
  const selected = useMemo(() => {
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(Array.isArray(selectedIds) ? selectedIds : []);
  }, [selectedIds]);

  const cards = useMemo(() => {
    const out = [];
    for (const raw of handRaw) {
      try {
        out.push(deserializeCard(raw));
      } catch {
        /* skip */
      }
    }
    const sorted = sortCardsForHand(out);
    if (sortMode === "suit") {
      return [...sorted].sort((a, b) => {
        const sa = a.isJoker ? "Z" : a.suit || "";
        const sb = b.isJoker ? "Z" : b.suit || "";
        if (sa !== sb) return sa.localeCompare(sb);
        const ra = a.rank === 1 ? 14 : a.rank;
        const rb = b.rank === 1 ? 14 : b.rank;
        return ra - rb;
      });
    }
    return sorted;
  }, [handRaw, sortMode]);

  return (
    <div className="flex min-h-0 w-full flex-col gap-2 rounded-lg border border-violet-500/25 bg-violet-950/20 p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-violet-200/90">Your hand</p>
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSortModeChange("rank")}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              sortMode === "rank" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-300"
            } disabled:opacity-40`}
          >
            By rank
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSortModeChange("suit")}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              sortMode === "suit" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-300"
            } disabled:opacity-40`}
          >
            By suit
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onEnterDiscardPickMode()}
            className={`rounded px-2 py-1 text-[10px] font-semibold ${
              discardPickMode ? "bg-amber-600/60 text-amber-50" : "border border-amber-500/40 bg-amber-950/30 text-amber-100"
            } disabled:opacity-40`}
          >
            Discard pick
          </button>
        </div>
      </div>
      {discardPickMode ? (
        <p className="text-[10px] text-amber-200/90">Tap the card you will discard after melds.</p>
      ) : null}

      <div className="flex min-h-[5.5rem] flex-wrap content-start gap-1.5 overflow-y-auto [scrollbar-width:thin] sm:min-h-[6rem]">
        {cards.map(c => {
          const id = c.id;
          const isSel = selected.has(id);
          const isDisc = discardCardId === id;
          const red = c.suit === "H" || c.suit === "D";
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => onToggleCardId(id)}
              className={[
                "flex min-h-[48px] min-w-[2.75rem] flex-col items-center justify-center rounded-md border-2 px-1 py-1.5 text-sm font-bold shadow-md transition sm:min-h-[52px] sm:min-w-[3rem] sm:text-base",
                isSel ? "border-sky-400 bg-sky-900/50 ring-2 ring-sky-300/80" : "border-white/20 bg-zinc-900/90",
                isDisc ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-950" : "",
                red && !c.isJoker ? "text-rose-200" : "text-zinc-100",
                c.isJoker ? "text-amber-200" : "",
                disabled ? "opacity-45" : "active:scale-[0.98]",
              ].join(" ")}
            >
              <span className="leading-none">{getCardDisplayLabel(c)}</span>
              {isDisc ? <span className="mt-0.5 text-[7px] font-bold uppercase text-amber-300">discard</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
