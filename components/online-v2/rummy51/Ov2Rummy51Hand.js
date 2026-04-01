"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { deserializeCard } from "../../../lib/online-v2/rummy51/ov2Rummy51Engine";

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
 *   drawHighlightIds?: Set<string>|null,
 *   selectedIds: Set<string>|string[],
 *   discardCardId: string|null,
 *   discardPickMode: boolean,
 *   sortMode: "rank"|"suit",
 *   disabled?: boolean,
 *   selectionDisabled?: boolean, // when unset, falls back to `disabled`; use to allow select/reorder off-turn
 *   sortDisabled?: boolean,
 *   embedded?: boolean,
 *   onToggleCardId: (id: string) => void,
 *   onSortModeChange: (m: "rank"|"suit") => void,
 *   onEnterDiscardPickMode: () => void,
 *   targetMeldId: string|null,
 *   onNewMeldFromSelection: () => void,
 *   onAddSelectionToTarget: () => void,
 *   onClearMeldDraft: () => void,
 *   hasMeldDraft: boolean,
 *   clearDisabled?: boolean,
 *   manualOrder: string[]|null,
 *   setManualOrder: import("react").Dispatch<import("react").SetStateAction<string[]|null>>,
 * }} props
 */
export default function Ov2Rummy51Hand({
  handRaw = [],
  drawHighlightIds = null,
  selectedIds,
  discardCardId,
  discardPickMode,
  sortMode,
  disabled = false,
  selectionDisabled,
  sortDisabled,
  embedded = false,
  onToggleCardId,
  onSortModeChange,
  onEnterDiscardPickMode,
  targetMeldId,
  onNewMeldFromSelection,
  onAddSelectionToTarget,
  onClearMeldDraft,
  hasMeldDraft,
  clearDisabled,
  manualOrder,
  setManualOrder,
}) {
  const rankSuitLocked = sortDisabled === undefined ? disabled : sortDisabled;
  const reorderLocked = rankSuitLocked;

  const selectionLocked = selectionDisabled !== undefined ? selectionDisabled : disabled;
  /** Tap to select — can stay true off-turn while `disabled` blocks meld/discard actions. */
  const cardsInteractive = !selectionLocked;

  const selected = useMemo(() => {
    if (selectedIds instanceof Set) return selectedIds;
    return new Set(Array.isArray(selectedIds) ? selectedIds : []);
  }, [selectedIds]);

  const selCount = selected.size;

  const naturalCards = useMemo(() => {
    const out = [];
    for (const raw of handRaw) {
      try {
        out.push(deserializeCard(raw));
      } catch {
        /* skip */
      }
    }
    return out;
  }, [handRaw]);

  const cardById = useMemo(() => new Map(naturalCards.map(c => [c.id, c])), [naturalCards]);

  const displayCards = useMemo(() => {
    if (manualOrder?.length) {
      const out = [];
      const seen = new Set();
      for (const id of manualOrder) {
        const c = cardById.get(id);
        if (c) {
          out.push(c);
          seen.add(id);
        }
      }
      for (const c of naturalCards) {
        if (!seen.has(c.id)) out.push(c);
      }
      return out;
    }
    return naturalCards;
  }, [manualOrder, naturalCards, cardById]);

  /** Drag reorder: allowed when not busy / session idle (`reorderLocked`), even off-turn. */
  const allowPointerReorder = !reorderLocked && displayCards.length > 1;

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

  const clrBtnDisabled = clearDisabled !== undefined ? clearDisabled : disabled || !hasMeldDraft;

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
      if (reorderLocked || displayCards.length <= 1) return;
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
    [reorderLocked, displayCards.length]
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
        const basis = manualOrder?.length ? [...manualOrder] : naturalCards.map(c => c.id);
        d.orderSnapshot = basis;
        setManualOrder(basis);
        setDraggingId(d.id);
      }
      const orderIds = d.orderSnapshot;
      const slot = slotIndexFromClientX(e.clientX, orderIds, cardRefs.current);
      hoverSlotRef.current = slot;
    },
    [manualOrder, naturalCards, setManualOrder]
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
    [finishDrag, setManualOrder]
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
      if (selectionLocked) return;
      onToggleCardId(id);
    },
    [onToggleCardId, selectionLocked]
  );

  const shell = embedded
    ? "flex w-full shrink-0 flex-col gap-0 overflow-hidden px-0.5 pb-0 pt-0 sm:px-1"
    : "flex w-full shrink-0 flex-col gap-1 overflow-hidden rounded-lg border border-violet-500/25 bg-violet-950/20 p-2";

  return (
    <div className={shell}>
      <div
        ref={rowRef}
        className={`relative flex w-full shrink-0 flex-row flex-nowrap select-none items-end justify-center overflow-hidden overscroll-none ${draggingId ? "touch-none" : ""} ${displayCards.length ? "min-h-[5.45rem] pt-3.5 pb-0 sm:min-h-[5.7rem] sm:pt-4" : "min-h-0 py-0.5"}`}
        role="list"
        aria-label="Your cards"
      >
        {displayCards.map((c, idx) => {
          const id = c.id;
          const isSel = selected.has(id);
          const isDisc = discardCardId === id;
          const isDrawGlow = Boolean(drawHighlightIds && drawHighlightIds.size > 0 && drawHighlightIds.has(id));
          const red = c.suit === "H" || c.suit === "D";
          const mid = (displayCards.length - 1) / 2;
          const fanDeg = displayCards.length > 1 ? (idx - mid) * 1.1 : 0;
          const marginLeft = idx === 0 ? 0 : -overlapPx;
          const zBase = 10 + idx;
          const isDragging = draggingId === id;
          const z = isDragging ? 80 : isSel ? 60 : isDrawGlow ? 55 : isDisc ? 50 : zBase;

          const passiveHand = !cardsInteractive;
          const liftPx = isSel ? (passiveHand ? 10 : 14) : 0;
          const liftScale = isSel ? (passiveHand ? 1.04 : 1.07) : 1;

          return (
            <button
              key={id}
              type="button"
              role="listitem"
              ref={el => {
                if (el) cardRefs.current.set(id, el);
                else cardRefs.current.delete(id);
              }}
              tabIndex={cardsInteractive || allowPointerReorder ? 0 : -1}
              aria-disabled={!(cardsInteractive || allowPointerReorder)}
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
                  ? `translateY(-${liftPx}px) scale(${liftScale}) rotate(${fanDeg}deg)`
                  : `translateY(0) rotate(${fanDeg}deg)`,
                opacity: isDragging ? 0.92 : undefined,
              }}
              className={[
                "relative box-border h-[4.1rem] w-[3rem] shrink-0 rounded-md border-[1.5px] bg-[#faf7f0] text-left transition-[transform,box-shadow,border-color,opacity] duration-150 sm:h-[4.35rem] sm:w-[3.5rem]",
                allowPointerReorder || isDragging ? "touch-none" : "",
                isDrawGlow ? "duration-300 animate-pulse shadow-[0_0_16px_rgba(16,185,129,0.7),0_2px_10px_rgba(0,0,0,0.35)]" : "",
                passiveHand && !isSel && !isDisc
                  ? "border-zinc-700 shadow-[0_1px_5px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.96)]"
                  : "border-zinc-900 shadow-[0_2px_10px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.98)]",
                cardsInteractive || allowPointerReorder
                  ? "cursor-grab active:cursor-grabbing focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-400/80"
                  : "pointer-events-none cursor-default",
                isSel
                  ? "z-[1] border-sky-500 shadow-[0_0_0_2px_rgba(14,165,233,0.55),0_4px_16px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.98)]"
                  : "",
                isDrawGlow && !isDisc ? "ring-2 ring-emerald-400 ring-offset-2 ring-offset-[#faf7f0]" : "",
                isDisc ? "ring-2 ring-amber-500 ring-offset-2 ring-offset-[#faf7f0]" : "",
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

      <div className="flex shrink-0 flex-nowrap items-center justify-center gap-0.5 overflow-x-auto border-t border-white/5 pt-1 [scrollbar-width:thin]">
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => {
            onSortModeChange("rank");
          }}
          className={`min-h-[34px] min-w-[3.35rem] shrink-0 rounded-md px-1.5 py-1.5 text-[10px] font-semibold leading-tight sm:min-h-[38px] sm:min-w-[4.25rem] sm:px-2.5 sm:py-2 sm:text-xs ${
            sortMode === "rank" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Rank
        </button>
        <button
          type="button"
          disabled={rankSuitLocked}
          onClick={() => {
            onSortModeChange("suit");
          }}
          className={`min-h-[34px] min-w-[3.35rem] shrink-0 rounded-md px-1.5 py-1.5 text-[10px] font-semibold leading-tight sm:min-h-[38px] sm:min-w-[4.25rem] sm:px-2.5 sm:py-2 sm:text-xs ${
            sortMode === "suit" ? "bg-violet-600/50 text-white" : "bg-white/10 text-zinc-400"
          } disabled:opacity-40`}
        >
          Suit
        </button>
        <button
          type="button"
          disabled={disabled || selCount < 3}
          onClick={() => onNewMeldFromSelection()}
          className="min-h-[34px] min-w-[3.35rem] shrink-0 rounded-md border border-white/15 bg-white/5 px-1.5 py-1.5 text-[10px] font-semibold leading-tight text-zinc-200 disabled:opacity-40 sm:min-h-[38px] sm:min-w-[4.25rem] sm:px-2.5 sm:py-2 sm:text-xs"
        >
          Meld
        </button>
        <button
          type="button"
          disabled={disabled || selCount < 1 || !targetMeldId}
          onClick={() => onAddSelectionToTarget()}
          className="min-h-[34px] min-w-[3.35rem] shrink-0 rounded-md border border-fuchsia-500/35 bg-fuchsia-950/25 px-1.5 py-1.5 text-[10px] font-semibold leading-tight text-fuchsia-100 disabled:opacity-40 sm:min-h-[38px] sm:min-w-[4.25rem] sm:px-2.5 sm:py-2 sm:text-xs"
        >
          Tbl
        </button>
        <button
          type="button"
          disabled={clrBtnDisabled}
          onClick={() => onClearMeldDraft()}
          className="min-h-[34px] min-w-[3.1rem] shrink-0 rounded-md border border-red-500/25 px-1.5 py-1.5 text-[10px] font-semibold leading-tight text-red-300/90 disabled:opacity-40 sm:min-h-[38px] sm:min-w-[3.5rem] sm:px-2 sm:py-2 sm:text-xs"
        >
          Clr
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onEnterDiscardPickMode()}
          className={`min-h-[34px] min-w-[3.35rem] shrink-0 rounded-md px-1.5 py-1.5 text-[10px] font-semibold leading-tight sm:min-h-[38px] sm:min-w-[4.25rem] sm:px-2.5 sm:py-2 sm:text-xs ${
            discardPickMode ? "bg-amber-600/60 text-amber-50" : "border border-amber-500/40 bg-amber-950/30 text-amber-100"
          } disabled:opacity-40`}
        >
          Discard
        </button>
      </div>
    </div>
  );
}
