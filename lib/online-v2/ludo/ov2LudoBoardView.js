/**
 * OV2 Ludo board view — presentation only (from `games-online/LudoMP.js` patterns, OV2-only).
 * Parent owns authority: pass `disableHighlights` / omit `onPieceClick` when not in local preview.
 */

"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listMovablePieces, LUDO_HOME_LEN, LUDO_TRACK_LEN, toGlobalIndex } from "./ov2LudoEngine";
import {
  OV2_LUDO_SEAT_HEX_COLORS,
  ov2LudoDescribePieceProgress,
  ov2LudoLightenColor,
  ov2LudoProjectGlobalTrackCell,
  ov2LudoProjectPieceOnBoard,
} from "./ov2LudoBoardProjection";

const FINISH_FLASH_MS = 2200;

function useFinishFlash(activeSeats, pieces) {
  const prevPositionsRef = useRef(new Map());
  const finishFlashRef = useRef(new Map());
  const finishTimeoutsRef = useRef(new Map());
  const [, forceFlashTick] = useState(0);

  const positionsSignature = useMemo(() => {
    return activeSeats
      .map(seat => {
        const arr = pieces[String(seat)] || [];
        return `${seat}:${arr.join(",")}`;
      })
      .join("|");
  }, [activeSeats, pieces]);

  useEffect(() => {
    const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
    const prev = prevPositionsRef.current;
    const next = new Map();
    const newFinishes = [];

    activeSeats.forEach(seat => {
      const seatPieces = pieces[String(seat)] || [];
      seatPieces.forEach((pos, idx) => {
        const key = `${seat}-${idx}`;
        next.set(key, pos);
        const prevPos = prev.get(key);
        if ((prevPos == null || prevPos < totalPath) && pos >= totalPath) {
          newFinishes.push(key);
        }
      });
    });

    prevPositionsRef.current = next;

    newFinishes.forEach(key => {
      if (finishFlashRef.current.has(key)) return;
      finishFlashRef.current.set(key, true);
      forceFlashTick(n => n + 1);
      const timeoutId = setTimeout(() => {
        finishFlashRef.current.delete(key);
        finishTimeoutsRef.current.delete(key);
        forceFlashTick(n => n + 1);
      }, FINISH_FLASH_MS);
      finishTimeoutsRef.current.set(key, timeoutId);
    });

    Array.from(finishFlashRef.current.keys()).forEach(key => {
      const pos = next.get(key);
      if (pos == null || pos < totalPath) {
        finishFlashRef.current.delete(key);
        const timeoutId = finishTimeoutsRef.current.get(key);
        if (timeoutId) {
          clearTimeout(timeoutId);
          finishTimeoutsRef.current.delete(key);
        }
      }
    });
  }, [positionsSignature, activeSeats, pieces]);

  useEffect(() => {
    return () => {
      finishTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      finishTimeoutsRef.current.clear();
    };
  }, []);

  return useCallback((seat, idx, isFinished) => {
    if (!isFinished) return true;
    return finishFlashRef.current.has(`${seat}-${idx}`);
  }, []);
}

function DiceDisplay({ displayValue, rolling, seat, clickable = false }) {
  const dots = displayValue ?? 1;
  const color = OV2_LUDO_SEAT_HEX_COLORS[seat] || "#f8fafc";
  const highlight = ov2LudoLightenColor(color, 0.45);

  return (
    <div
      className={`relative w-12 h-12 sm:w-14 sm:h-14 text-white transition-transform duration-150 ${
        clickable ? "hover:scale-105" : ""
      }`}
    >
      <div
        className={`absolute inset-0 rounded-2xl border-2 shadow-lg shadow-black/40 transition ${
          rolling ? "animate-pulse" : ""
        }`}
        style={{
          borderColor: color,
          background: `linear-gradient(145deg, ${highlight}, ${color})`,
        }}
      />
      <span className="absolute inset-0 flex items-center justify-center text-[28px] sm:text-[36px] font-black text-black drop-shadow">
        {dots}
      </span>
    </div>
  );
}

function TrackOverlay({ layout, occupancy, highlights, homeSegments, highlightNumbers = new Set() }) {
  if (!layout?.length) return null;
  return (
    <div className="absolute inset-0 pointer-events-none z-10">
      <div className="absolute inset-[12%] rounded-full border border-white/10" />
      {homeSegments?.map(segment => {
        const key = `home-${segment.seat}-${segment.idx}`;
        const isHighlight = highlightNumbers.has(key);
        return (
          <div
            key={key}
            className={`absolute rounded-full border border-white/20 shadow-sm ${
              isHighlight ? "ring-2 ring-amber-300 animate-pulse" : ""
            }`}
            style={{
              left: `${segment.x}%`,
              top: `${segment.y}%`,
              width: "2.8%",
              height: "2.8%",
              minWidth: "12px",
              minHeight: "12px",
              transform: "translate(-50%, -50%)",
              backgroundColor: `${OV2_LUDO_SEAT_HEX_COLORS[segment.seat]}${isHighlight ? "aa" : "55"}`,
              borderColor: `${OV2_LUDO_SEAT_HEX_COLORS[segment.seat]}99`,
              boxShadow: isHighlight
                ? `0 0 12px ${OV2_LUDO_SEAT_HEX_COLORS[segment.seat]}aa`
                : `0 0 6px ${OV2_LUDO_SEAT_HEX_COLORS[segment.seat]}55`,
            }}
          />
        );
      })}
      {layout.map(({ idx, x, y }) => {
        const occupants = occupancy?.get(idx) || [];
        const seatColor =
          occupants.length > 0 ? OV2_LUDO_SEAT_HEX_COLORS[occupants[0].seat] || "white" : "rgba(255,255,255,0.4)";
        const size = occupants.length >= 2 ? 12 : occupants.length === 1 ? 9 : 6;
        const isHighlighted = highlights?.has(idx);
        const labelColor =
          occupants.length > 0 ? OV2_LUDO_SEAT_HEX_COLORS[occupants[0].seat] || "#ffffff" : "rgba(255,255,255,0.75)";
        const dx = x - 50;
        const dy = y - 50;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const labelDist = dist + 7;
        const labelX = 50 + (dx / dist) * labelDist;
        const labelY = 50 + (dy / dist) * labelDist;
        return (
          <Fragment key={idx}>
            <div
              className="absolute flex flex-col items-center gap-0.5 transition-all duration-200"
              style={{
                left: `${x}%`,
                top: `${y}%`,
                transform: "translate(-50%, -50%)",
              }}
            >
              <div
                className={`rounded-full shadow ${isHighlighted ? "ring-2 ring-amber-300" : ""}`}
                style={{
                  width: size,
                  height: size,
                  backgroundColor: seatColor,
                  opacity: isHighlighted ? 1 : occupants.length ? 0.85 : 0.35,
                }}
              />
            </div>
            <span
              className={`absolute text-[10px] sm:text-[16px] font-bold drop-shadow pointer-events-none select-none ${
                highlightNumbers.has(idx) ? "text-amber-300 animate-pulse" : ""
              }`}
              style={{
                left: `${labelX}%`,
                top: `${labelY}%`,
                transform: "translate(-50%, -50%)",
                color: highlightNumbers.has(idx) ? "#fbbf24" : labelColor,
                textShadow: highlightNumbers.has(idx)
                  ? "0 0 6px rgba(251,191,36,0.8)"
                  : "0 1px 2px rgba(0,0,0,0.4)",
              }}
            >
              {idx + 1}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * @param {object} props
 * @param {Record<string, unknown>} props.board
 */
export default function Ov2LudoBoardView({
  board,
  onPieceClick,
  mySeat = null,
  diceValue = null,
  diceRolling = false,
  diceSeat = null,
  diceClickable = false,
  onDiceClick = null,
  disableHighlights = false,
}) {
  const containerRef = useRef(null);
  const [boardSize, setBoardSize] = useState(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const calc = () => {
      const container = containerRef.current;
      if (!container) return;
      const containerRect = container.getBoundingClientRect();
      if (containerRect.height === 0 || containerRect.width === 0) {
        const rootH = window.visualViewport?.height ?? window.innerHeight;
        const rootW = window.innerWidth;
        const maxSize = Math.min(rootH * 0.85, rootW * 0.96);
        setBoardSize(Math.max(280, Math.min(maxSize, 820)));
        return;
      }
      const availableH = containerRect.height - 16;
      const availableW = containerRect.width - 16;
      const maxSize = Math.min(availableH, availableW);
      setBoardSize(Math.max(280, Math.min(maxSize, 820)));
    };

    const timer = setTimeout(calc, 50);
    calc();
    const ro = new ResizeObserver(calc);
    ro.observe(containerRef.current);
    window.addEventListener("resize", calc);
    const vv = window.visualViewport;
    vv?.addEventListener("resize", calc);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
      window.removeEventListener("resize", calc);
      vv?.removeEventListener("resize", calc);
    };
  }, []);

  const pieces = board.pieces || {};
  let active = Array.isArray(board.activeSeats) ? board.activeSeats : [];
  if (!active.length) {
    active = [0, 1, 2, 3].filter(seat => {
      const arr = pieces[String(seat)];
      return Array.isArray(arr) && arr.length > 0;
    });
  }
  const colorClasses = ["bg-red-500", "bg-sky-500", "bg-emerald-500", "bg-amber-400"];
  const shouldRenderFinishedPiece = useFinishFlash(active, pieces);
  const trackLayout = useMemo(
    () =>
      Array.from({ length: LUDO_TRACK_LEN }, (_, idx) => ({
        idx,
        ...ov2LudoProjectGlobalTrackCell(idx),
      })),
    []
  );
  const homeSegments = useMemo(() => {
    const segments = [];
    const starts = [0, 13, 26, 39];
    starts.forEach((startIdx, seat) => {
      const entry = ov2LudoProjectGlobalTrackCell(startIdx);
      for (let i = 0; i < LUDO_HOME_LEN; i += 1) {
        const t = (i + 1) / (LUDO_HOME_LEN + 1);
        segments.push({
          seat,
          idx: i,
          x: entry.x + (50 - entry.x) * t,
          y: entry.y + (50 - entry.y) * t,
        });
      }
    });
    return segments;
  }, []);
  const trackOccupancy = useMemo(() => {
    const map = new Map();
    active.forEach(seat => {
      const seatPieces = pieces[String(seat)] || [];
      seatPieces.forEach((pos, pieceIdx) => {
        if (pos >= 0 && pos < LUDO_TRACK_LEN) {
          const globalIndex = toGlobalIndex(seat, pos);
          if (globalIndex != null) {
            if (!map.has(globalIndex)) map.set(globalIndex, []);
            map.get(globalIndex).push({ seat, piece: pieceIdx });
          }
        }
      });
    });
    return map;
  }, [active, pieces]);
  const highlightTargets = useMemo(() => {
    if (board.turnSeat == null || board.dice == null) return new Set();
    const result = new Set();
    const seatPieces = pieces[String(board.turnSeat)] || [];
    const movable = listMovablePieces(board, board.turnSeat, board.dice);
    movable.forEach(pieceIdx => {
      const pos = seatPieces[pieceIdx];
      if (pos == null) return;
      if (pos < 0) {
        const entryIdx = toGlobalIndex(board.turnSeat, 0);
        if (entryIdx != null) result.add(entryIdx);
        return;
      }
      const targetPos = pos + board.dice;
      if (targetPos < LUDO_TRACK_LEN) {
        const gi = toGlobalIndex(board.turnSeat, targetPos);
        if (gi != null) result.add(gi);
      }
    });
    return result;
  }, [board, pieces]);
  const effectiveHighlights = disableHighlights ? new Set() : highlightTargets;
  const highlightNumbers = useMemo(() => {
    const numbers = new Set();
    if (!disableHighlights && effectiveHighlights.size > 0) {
      effectiveHighlights.forEach(idx => numbers.add(idx));
    }
    if (!disableHighlights && board.turnSeat != null && board.dice != null) {
      const seatPieces = pieces[String(board.turnSeat)] || [];
      const movable = listMovablePieces(board, board.turnSeat, board.dice);
      movable.forEach(pieceIdx => {
        const pos = seatPieces[pieceIdx];
        if (pos == null) return;
        const targetPos = pos + board.dice;
        if (targetPos >= LUDO_TRACK_LEN && targetPos < LUDO_TRACK_LEN + LUDO_HOME_LEN) {
          numbers.add(`home-${board.turnSeat}-${targetPos - LUDO_TRACK_LEN}`);
        }
      });
    }
    return numbers;
  }, [disableHighlights, effectiveHighlights, board, pieces]);

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-2" ref={containerRef}>
      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
        <div
          className="relative aspect-square shrink-0 overflow-hidden rounded-2xl border-2 border-white/30 bg-black shadow-2xl"
          style={{
            width: boardSize ? `${boardSize}px` : "min(96vmin, 100%)",
            height: boardSize ? `${boardSize}px` : "min(96vmin, 100%)",
            maxWidth: "100%",
            maxHeight: "100%",
          }}
        >
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-[#0f172a] via-[#020617] to-black" />
          <div className="absolute inset-4 rounded-[32px] border border-white/5 bg-white/5 blur-[1px] sm:inset-6" />
          <div className="absolute inset-[9%] rounded-full border border-white/10 bg-black/50 shadow-inner shadow-black/70" />
          <img
            src="/images/ludo/board.png"
            alt=""
            className="pointer-events-none absolute left-1/2 top-1/2 w-[85%] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-[28px] object-contain opacity-95"
            onError={e => {
              e.currentTarget.style.display = "none";
            }}
          />

          {(diceValue != null || diceClickable) && (
            <div
              className={`absolute z-30 ${diceClickable ? "cursor-pointer" : "pointer-events-none"}`}
              role={diceClickable ? "button" : undefined}
              tabIndex={diceClickable ? 0 : undefined}
              aria-label={diceClickable ? "Roll dice" : "Dice"}
              onClick={() => {
                if (diceClickable && !diceRolling && typeof onDiceClick === "function") {
                  onDiceClick();
                }
              }}
              onKeyDown={evt => {
                if (!diceClickable || diceRolling || typeof onDiceClick !== "function") return;
                if (evt.key === "Enter" || evt.key === " ") {
                  evt.preventDefault();
                  onDiceClick();
                }
              }}
              style={{
                left: "50%",
                top: "78%",
                transform: "translate(-50%, -50%)",
                pointerEvents: diceClickable ? "auto" : "none",
              }}
            >
              <DiceDisplay
                displayValue={diceValue}
                rolling={diceRolling}
                seat={diceSeat}
                clickable={diceClickable && !diceRolling}
              />
            </div>
          )}

          <TrackOverlay
            layout={trackLayout}
            occupancy={trackOccupancy}
            highlights={effectiveHighlights}
            homeSegments={homeSegments}
            highlightNumbers={highlightNumbers}
          />

          {active.map(seat => {
            const cls = colorClasses[seat] || "bg-white";
            const seatPieces = pieces[String(seat)] || [];
            const isMe = seat === mySeat;
            const imgSrc = `/images/ludo/dog_${seat}.png`;
            const seatColorHex = OV2_LUDO_SEAT_HEX_COLORS[seat] || "#ffffff";

            return seatPieces.map((pos, idx) => {
              const proj = ov2LudoProjectPieceOnBoard(seat, pos, idx);
              const progressInfo = ov2LudoDescribePieceProgress(seat, pos);
              if (!proj) return null;
              const isFinished = progressInfo.state === "finished";
              if (isFinished) {
                return null;
              }
              if (!shouldRenderFinishedPiece(seat, idx, isFinished)) {
                return null;
              }

              const movable =
                isMe && board.dice != null && listMovablePieces(board, seat, board.dice).includes(idx);
              const totalPath = LUDO_TRACK_LEN + LUDO_HOME_LEN;
              const stepsLeft =
                progressInfo.state === "track"
                  ? Math.max(0, totalPath - pos)
                  : progressInfo.state === "home"
                    ? Math.max(0, totalPath - pos)
                    : progressInfo.state === "yard"
                      ? totalPath
                      : null;

              return (
                <button
                  key={`${seat}-${idx}`}
                  type="button"
                  onClick={() => movable && onPieceClick && onPieceClick(idx)}
                  className={`absolute z-20 flex items-center justify-center transition-transform ${
                    movable ? "animate-pulse scale-105" : ""
                  }`}
                  title={`Piece ${idx + 1} • ${progressInfo.label}`}
                  style={{
                    left: `${proj.x}%`,
                    top: `${proj.y}%`,
                    width: "13%",
                    height: "13%",
                    minWidth: "28px",
                    minHeight: "28px",
                    transform: "translate(-50%, -50%)",
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    transition: "left 0.35s ease, top 0.35s ease",
                  }}
                >
                  <div className="pointer-events-none relative h-full w-full">
                    <img
                      src={imgSrc}
                      alt=""
                      className="h-full w-full object-contain"
                      onError={e => {
                        e.currentTarget.style.display = "none";
                        e.currentTarget.nextElementSibling?.classList?.remove("hidden");
                      }}
                    />
                    <div
                      className={`fallback-piece absolute hidden h-[27%] w-[27%] rounded-full border-2 border-white/40 ${cls}`}
                      style={{
                        left: "50%",
                        top: "50%",
                        transform: "translate(-50%, -50%)",
                        background: seatColorHex,
                      }}
                    />
                    {stepsLeft != null ? (
                      <span
                        className="pointer-events-none absolute bottom-[-15%] left-1/2 z-[24] -translate-x-1/2 -translate-y-1/2 select-none text-[10px] font-extrabold text-white"
                        style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
                      >
                        {stepsLeft}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
