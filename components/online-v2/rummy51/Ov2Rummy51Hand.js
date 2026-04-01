"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { deserializeCard, sortCardsForHand } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

const SUIT_SYM = /** @type {const} */ ({ S: "♠", H: "♥", D: "♦", C: "♣" });
const RANK_CORNER = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** @param {Rummy51Card} card */
function cornerRank(card) {
  if (card.isJoker) return "J";
  return RANK_CORNER[card.rank] ?? "?";
}

/** @param {Rummy51Card} card */
function cornerSuit(card) {
  if (card.isJoker) return "★";
  return card.suit ? SUIT_SYM[card.suit] ?? "" : "";
}

/**
 * @param {{
 *   handRaw: unknown[],
 *   selectedIds: Set<string>|string[],
 *   discardCardId: string|null,
 *   discardPickMode: boolean,
 *   sortMode: "rank"|"suit",
 *   disabled?: boolean,
 *   sortDisabled?: boolean,
 *   embedded?: boolean,
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
  sortDisabled,
  embedded = false,
  onToggleCardId,
  onSortModeChange,
  onEnterDiscardPickMode,
}) {
  const rankSuitLocked = sortDisabled === undefined ? disabled : sortDisabled;
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

  const rowRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const [overlapPx, setOverlapPx] = useState(0);

  const n = cards.length;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;

    const mq = window.matchMedia("(min-width: 640px)");

    const measure = () => {
      requestAnimationFrame(() => {
        const cardW = mq.matches ? 56 : 48;
        const count = cards.length;
        if (count <= 1) {
          setOverlapPx(0);
          return;
        }
        let rowW = el.offsetWidth;
        if (rowW < 24 && el.parentElement) {
          rowW = el.parentElement.clientWidth;
        }
        const pad = 10;
        const avail = Math.max(0, rowW - pad);
        const minStep = 11;
        const rawStep = (avail - cardW) / (count - 1);
        const step = Math.max(minStep, rawStep);
        setOverlapPx(Math.max(0, cardW - step));
      });
    };

    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    mq.addEventListener("change", measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener("change", measure);
    };
  }, [n, cards.length]);

  const shell = embedded
    ? "flex w-full shrink-0 flex-col gap-0 px-0.5 pb-0 pt-0 sm:px-1"
    : "flex w-full shrink-0 flex-col gap-1 rounded-lg border border-violet-500/25 bg-violet-950/20 p-2";

  return (
    <div className={shell}>
      <div
        ref={rowRef}
        className={`relative flex w-full shrink-0 flex-row flex-nowrap items-end justify-center overflow-x-hidden overflow-y-visible ${cards.length ? "min-h-[5.5rem] pt-3 pb-0.5 sm:min-h-[5.75rem]" : "min-h-0 py-0.5"}`}
        role="list"
        aria-label="Your cards"
      >
        {cards.map((c, idx) => {
          const id = c.id;
          const isSel = selected.has(id);
          const isDisc = discardCardId === id;
          const red = c.suit === "H" || c.suit === "D";
          const mid = (cards.length - 1) / 2;
          const fanDeg = cards.length > 1 ? (idx - mid) * 1.1 : 0;
          const marginLeft = idx === 0 ? 0 : -overlapPx;
          const zBase = 10 + idx;
          const z = isSel ? 60 : isDisc ? 50 : zBase;

          return (
            <button
              key={id}
              type="button"
              role="listitem"
              disabled={disabled}
              onClick={() => onToggleCardId(id)}
              style={{
                marginLeft: idx === 0 ? 0 : marginLeft,
                zIndex: z,
                transformOrigin: "50% 100%",
                transform: isSel
                  ? `translateY(-14px) scale(1.07) rotate(${fanDeg}deg)`
                  : `translateY(0) rotate(${fanDeg}deg)`,
              }}
              className={[
                "relative box-border h-[4.1rem] w-[3rem] shrink-0 rounded-lg border-2 bg-gradient-to-b from-zinc-700 to-zinc-900 text-left shadow-md transition-[transform,box-shadow,border-color] duration-150 sm:h-[4.35rem] sm:w-[3.5rem]",
                isSel ? "border-sky-400 shadow-[0_0_0_2px_rgba(56,189,248,0.45),0_8px_20px_rgba(0,0,0,0.45)]" : "border-white/20",
                isDisc ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-950" : "",
                disabled ? "opacity-45" : "active:scale-[1.02]",
              ].join(" ")}
            >
              <span
                className={[
                  "absolute left-0.5 top-0.5 flex flex-col leading-none whitespace-nowrap",
                  c.isJoker ? "text-amber-200" : red ? "text-rose-300" : "text-zinc-100",
                ].join(" ")}
              >
                <span className="text-[11px] font-extrabold tracking-tight sm:text-xs">{cornerRank(c)}</span>
                <span className="text-[13px] font-bold leading-none sm:text-sm">{cornerSuit(c)}</span>
              </span>
              {isDisc ? (
                <span className="absolute bottom-0.5 right-0.5 rounded bg-amber-600/90 px-0.5 text-[5px] font-bold uppercase leading-none text-amber-950">
                  out
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {discardPickMode ? (
        <p className="shrink-0 px-0.5 pb-0.5 text-center text-[8px] leading-tight text-amber-200/90">Tap card to discard.</p>
      ) : null}

      <div className="flex shrink-0 flex-nowrap items-center justify-center gap-0.5 border-t border-white/5 pt-0.5">
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => onSortModeChange("rank")}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold sm:text-[9px] ${
            sortMode === "rank" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Rank
        </button>
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => onSortModeChange("suit")}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold sm:text-[9px] ${
            sortMode === "suit" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Suit
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnterDiscardPickMode()}
          className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-semibold sm:text-[9px] ${
            discardPickMode ? "bg-amber-600/60 text-amber-50" : "border border-amber-500/40 bg-amber-950/30 text-amber-100"
          } disabled:opacity-40`}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
