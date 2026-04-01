"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { deserializeCard, sortCardsForHand } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

/**
 * @typedef {import("../../../lib/online-v2/rummy51/ov2Rummy51Engine").Rummy51Card} Rummy51Card
 */

const SUIT_SYM = /** @type {const} */ ({ S: "♠", H: "♥", D: "♦", C: "♣" });
const RANK_CORNER = ["", "A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const DRAG_THRESHOLD_PX = 10;

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
 * @param {string[]} ids
 * @param {number} from
 * @param {number} hoverSlot insert-before index in original array (0..ids.length)
 */
function reorderIds(ids, from, hoverSlot) {
  const next = [...ids];
  const [x] = next.splice(from, 1);
  let s = hoverSlot;
  if (from < hoverSlot) s = hoverSlot - 1;
  s = Math.max(0, Math.min(s, next.length));
  next.splice(s, 0, x);
  return next;
}

/**
 * @param {number} clientX
 * @param {string[]} orderIds
 * @param {Map<string, HTMLElement>} refs
 */
function slotIndexFromClientX(clientX, orderIds, refs) {
  const n = orderIds.length;
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const el = refs.get(orderIds[i]);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const mid = r.left + r.width / 2;
    if (clientX < mid) return i;
  }
  return n;
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
  const reorderLocked = rankSuitLocked;

  const selected = useMemo(() => {
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(Array.isArray(selectedIds) ? selectedIds : []);
  }, [selectedIds]);

  const sortedCards = useMemo(() => {
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

  const sortedIdKey = useMemo(() => [...sortedCards.map(c => c.id)].sort().join("\0"), [sortedCards]);

  /** @type {[string[]|null, import("react").Dispatch<import("react").SetStateAction<string[]|null>>]} */
  const [manualOrder, setManualOrder] = useState(/** @type {string[]|null} */ (null));

  useEffect(() => {
    setManualOrder(prev => {
      if (!prev?.length) return null;
      const ids = new Set(sortedCards.map(c => c.id));
      if (![...prev].some(id => ids.has(id))) return null;
      const next = [];
      const leftover = new Set(ids);
      for (const id of prev) {
        if (leftover.has(id)) {
          next.push(id);
          leftover.delete(id);
        }
      }
      for (const c of sortedCards) {
        if (leftover.has(c.id)) next.push(c.id);
      }
      return next;
    });
  }, [sortedIdKey, sortedCards]);

  const cardById = useMemo(() => new Map(sortedCards.map(c => [c.id, c])), [sortedCards]);

  const displayCards = useMemo(() => {
    if (!manualOrder?.length) return sortedCards;
    const out = [];
    for (const id of manualOrder) {
      const c = cardById.get(id);
      if (c) out.push(c);
    }
    return out;
  }, [manualOrder, sortedCards, cardById]);

  const rowRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const cardRefs = useRef(/** @type {Map<string, HTMLButtonElement>} */ (new Map()));
  const [overlapPx, setOverlapPx] = useState(0);

  const dragRef = useRef(
    /** @type {null | { id: string, fromIndex: number, startX: number, startY: number, moved: boolean, pointerId: number, orderSnapshot: string[] }} */ (
      null
    )
  );
  const hoverSlotRef = useRef(/** @type {number|null} */ (null));
  const suppressClickRef = useRef(false);
  const [draggingId, setDraggingId] = useState(/** @type {string|null} */ (null));

  const n = displayCards.length;

  useLayoutEffect(() => {
    const el = rowRef.current;
    if (!el) return undefined;

    const mq = window.matchMedia("(min-width: 640px)");

    const measure = () => {
      requestAnimationFrame(() => {
        const cardW = mq.matches ? 56 : 48;
        const count = displayCards.length;
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
  }, [n, displayCards.length]);

  const finishDrag = useCallback(() => {
    const d = dragRef.current;
    dragRef.current = null;
    hoverSlotRef.current = null;
    setDraggingId(null);
    if (d?.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
  }, []);

  const handlePointerDown = useCallback(
    (e, id, idx) => {
      if (reorderLocked) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      hoverSlotRef.current = null;
      dragRef.current = {
        id,
        fromIndex: idx,
        startX: e.clientX,
        startY: e.clientY,
        moved: false,
        pointerId: e.pointerId,
        orderSnapshot: [],
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [reorderLocked]
  );

  const handlePointerMove = useCallback(
    e => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      if (!d.moved) {
        if (Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        d.moved = true;
        const snap = manualOrder?.length ? [...manualOrder] : sortedCards.map(c => c.id);
        d.orderSnapshot = snap;
        setManualOrder(snap);
        setDraggingId(d.id);
      }
      const orderIds = d.orderSnapshot;
      const slot = slotIndexFromClientX(e.clientX, orderIds, cardRefs.current);
      hoverSlotRef.current = slot;
    },
    [manualOrder, sortedCards]
  );

  const handlePointerUp = useCallback(
    e => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d.moved && d.orderSnapshot.length) {
        const slot = hoverSlotRef.current ?? d.fromIndex;
        const next = reorderIds(d.orderSnapshot, d.fromIndex, slot);
        setManualOrder(next);
      }
      finishDrag();
    },
    [finishDrag]
  );

  const handlePointerCancel = useCallback(
    e => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      finishDrag();
    },
    [finishDrag]
  );

  const handleCardClick = useCallback(
    id => {
      if (suppressClickRef.current) return;
      if (disabled) return;
      onToggleCardId(id);
    },
    [onToggleCardId, disabled]
  );

  const shell = embedded
    ? "flex w-full shrink-0 flex-col gap-0 overflow-hidden px-0.5 pb-0 pt-0 sm:px-1"
    : "flex w-full shrink-0 flex-col gap-1 overflow-hidden rounded-lg border border-violet-500/25 bg-violet-950/20 p-2";

  return (
    <div className={shell}>
      <div
        ref={rowRef}
        className={`relative flex w-full shrink-0 flex-row flex-nowrap items-end justify-center overflow-hidden overscroll-none ${draggingId ? "touch-none" : ""} ${displayCards.length ? "min-h-[5.45rem] pt-3.5 pb-0 sm:min-h-[5.7rem] sm:pt-4" : "min-h-0 py-0.5"}`}
        role="list"
        aria-label="Your cards"
      >
        {displayCards.map((c, idx) => {
          const id = c.id;
          const isSel = selected.has(id);
          const isDisc = discardCardId === id;
          const red = c.suit === "H" || c.suit === "D";
          const mid = (displayCards.length - 1) / 2;
          const fanDeg = displayCards.length > 1 ? (idx - mid) * 1.1 : 0;
          const marginLeft = idx === 0 ? 0 : -overlapPx;
          const zBase = 10 + idx;
          const isDragging = draggingId === id;
          const z = isDragging ? 80 : isSel ? 60 : isDisc ? 50 : zBase;

          return (
            <button
              key={id}
              type="button"
              role="listitem"
              ref={el => {
                if (el) cardRefs.current.set(id, el);
                else cardRefs.current.delete(id);
              }}
              disabled={reorderLocked}
              aria-disabled={disabled}
              onClick={() => handleCardClick(id)}
              onPointerDown={e => handlePointerDown(e, id, idx)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerCancel}
              style={{
                marginLeft: idx === 0 ? 0 : marginLeft,
                zIndex: z,
                transformOrigin: "50% 100%",
                transform: isSel
                  ? `translateY(-14px) scale(1.07) rotate(${fanDeg}deg)`
                  : `translateY(0) rotate(${fanDeg}deg)`,
                opacity: isDragging ? 0.92 : undefined,
              }}
              className={[
                "relative box-border h-[4.1rem] w-[3rem] shrink-0 rounded-md border-[1.5px] border-zinc-800 bg-[#faf7f0] text-left shadow-[0_2px_8px_rgba(0,0,0,0.32),inset_0_1px_0_rgba(255,255,255,0.95)] transition-[transform,box-shadow,border-color,opacity] duration-150 sm:h-[4.35rem] sm:w-[3.5rem]",
                reorderLocked ? "cursor-default" : "cursor-grab active:cursor-grabbing",
                isSel
                  ? "z-[1] border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.55),0_4px_16px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.95)]"
                  : "",
                isDisc ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-[#faf7f0]" : "",
                disabled && !reorderLocked ? "opacity-45" : "",
              ].join(" ")}
            >
              <span
                className={[
                  "pointer-events-none absolute left-0.5 top-0.5 flex flex-col leading-none whitespace-nowrap drop-shadow-[0_0.5px_0_rgba(255,255,255,0.6)]",
                  c.isJoker ? "text-amber-900" : red ? "text-red-700" : "text-neutral-900",
                ].join(" ")}
              >
                <span className="text-[11px] font-extrabold tracking-tight sm:text-xs">{cornerRank(c)}</span>
                <span className="text-[13px] font-bold leading-none sm:text-sm">{cornerSuit(c)}</span>
              </span>
              {isDisc ? (
                <span className="pointer-events-none absolute bottom-0.5 right-0.5 rounded bg-amber-500 px-0.5 text-[5px] font-bold uppercase leading-none text-white">
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

      <div className="flex shrink-0 flex-nowrap items-center justify-center gap-1 border-t border-white/5 pt-1">
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => {
            setManualOrder(null);
            onSortModeChange("rank");
          }}
          className={`min-h-[34px] min-w-[4.75rem] shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold leading-tight sm:min-h-[38px] sm:min-w-[5.75rem] sm:px-4 sm:py-2 sm:text-sm ${
            sortMode === "rank" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Rank
        </button>
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => {
            setManualOrder(null);
            onSortModeChange("suit");
          }}
          className={`min-h-[34px] min-w-[4.75rem] shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold leading-tight sm:min-h-[38px] sm:min-w-[5.75rem] sm:px-4 sm:py-2 sm:text-sm ${
            sortMode === "suit" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Suit
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnterDiscardPickMode()}
          className={`min-h-[34px] min-w-[4.75rem] shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold leading-tight sm:min-h-[38px] sm:min-w-[5.75rem] sm:px-4 sm:py-2 sm:text-sm ${
            discardPickMode ? "bg-amber-600/60 text-amber-50" : "border border-amber-500/40 bg-amber-950/30 text-amber-100"
          } disabled:opacity-40`}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
