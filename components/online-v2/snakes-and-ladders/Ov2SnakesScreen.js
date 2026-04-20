"use client";

import { useRouter } from "next/router";
import { useCallback, useId, useMemo, useState } from "react";
import { useOv2SnakesSession } from "../../../hooks/useOv2SnakesSession";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";

const finishDismissStorageKey = sid => `ov2_snakes_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** Same shape as Ludo `member.meta.ludo.rematch_requested` — also checks `snakes` / `ov2_snakes` for future parity. */
function readOv2MemberRematchRequested(meta) {
  const raw = meta && typeof meta === "object" ? meta : null;
  if (!raw) return false;
  for (const key of ["ludo", "snakes", "ov2_snakes"]) {
    const bucket = raw[key];
    if (!bucket || typeof bucket !== "object") continue;
    if (bucket.rematch_requested === true || bucket.rematch_requested === "true" || bucket.rematch_requested === 1) return true;
  }
  return false;
}

/** Turn highlight on board pawns: colored drop-shadow (no ring — maximizes piece area). */
const SEAT_TURN_FILTER = [
  "drop-shadow(0 0 12px rgba(56,189,248,0.82)) drop-shadow(0 0 3px rgba(56,189,248,0.55))",
  "drop-shadow(0 0 12px rgba(251,191,36,0.82)) drop-shadow(0 0 3px rgba(251,191,36,0.55))",
  "drop-shadow(0 0 12px rgba(52,211,153,0.82)) drop-shadow(0 0 3px rgba(52,211,153,0.55))",
  "drop-shadow(0 0 12px rgba(232,121,249,0.82)) drop-shadow(0 0 3px rgba(232,121,249,0.55))",
];

/** HUD seat chips: always `ring-2` width; color vs transparent so turn changes do not shift layout. */
const SEAT_TURN_RING = ["ring-sky-400/90", "ring-amber-400/90", "ring-emerald-400/90", "ring-fuchsia-400/90"];

/** Center of cell `n` in unified 0–100 viewBox space (matches `cellNumberAt` serpentine layout). */
function cellCenterUv(n) {
  if (!Number.isFinite(n) || n < 1 || n > 100) return { u: 0, v: 0 };
  const rowFromBottom = Math.floor((n - 1) / 10);
  const row = 9 - rowFromBottom;
  const idx = (n - 1) % 10;
  const leftToRight = rowFromBottom % 2 === 0;
  const col = leftToRight ? idx : 9 - idx;
  return { u: (col + 0.5) * 10, v: (row + 0.5) * 10 };
}

const LADDER_RAIL_HALF = 0.92;

/**
 * @returns {{ left: string, right: string, rungs: { x1: number; y1: number; x2: number; y2: number }[] }}
 */
function ladderGeometry(fromN, toN) {
  const A = cellCenterUv(fromN);
  const B = cellCenterUv(toN);
  const du = B.u - A.u;
  const dv = B.v - A.v;
  const len = Math.hypot(du, dv) || 1;
  const tu = du / len;
  const tv = dv / len;
  const nu = -tv * LADDER_RAIL_HALF;
  const nv = tu * LADDER_RAIL_HALF;
  const Lu0 = A.u + nu;
  const Lv0 = A.v + nv;
  const Lu1 = B.u + nu;
  const Lv1 = B.v + nv;
  const Ru0 = A.u - nu;
  const Rv0 = A.v - nv;
  const Ru1 = B.u - nu;
  const Rv1 = B.v - nv;
  const rungCount = Math.max(7, Math.min(16, Math.round(len / 1.25)));
  const rungs = [];
  for (let i = 1; i < rungCount; i += 1) {
    const s = i / rungCount;
    const pu = A.u + s * du;
    const pv = A.v + s * dv;
    rungs.push({ x1: pu + nu, y1: pv + nv, x2: pu - nu, y2: pv - nv });
  }
  return {
    left: `M ${Lu0} ${Lv0} L ${Lu1} ${Lv1}`,
    right: `M ${Ru0} ${Rv0} L ${Ru1} ${Rv1}`,
    rungs,
    footU: A.u,
    footV: A.v,
    topU: B.u,
    topV: B.v,
    dirU: tu,
    dirV: tv,
    spanLen: len,
  };
}

function cubicBezierPoint(t, ax, ay, bx, by, cx, cy, dx, dy) {
  const m = 1 - t;
  const m2 = m * m;
  const t2 = t * t;
  return {
    x: m2 * m * ax + 3 * m2 * t * bx + 3 * m * t2 * cx + t2 * t * dx,
    y: m2 * m * ay + 3 * m2 * t * by + 3 * m * t2 * cy + t2 * t * dy,
  };
}

function cubicBezierTangent(t, ax, ay, bx, by, cx, cy, dx, dy) {
  const m = 1 - t;
  const m2 = m * m;
  const t2 = t * t;
  return {
    tx: 3 * m2 * (bx - ax) + 6 * m * t * (cx - bx) + 3 * t2 * (dx - cx),
    ty: 3 * m2 * (by - ay) + 6 * m * t * (cy - by) + 3 * t2 * (dy - cy),
  };
}

const SNAKE_RAIL_OFF = 0.34;

/**
 * Cubic snake spine (head at fromN → tail at toN) + parallel “rails”, scales, head/tail angles.
 */
function snakeSpineGeometry(fromN, toN) {
  const u1 = cellCenterUv(fromN).u;
  const v1 = cellCenterUv(fromN).v;
  const u2 = cellCenterUv(toN).u;
  const v2 = cellCenterUv(toN).v;
  const dx = u2 - u1;
  const dy = v2 - v1;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const sag = Math.min(13, Math.max(4.2, len * 0.19));
  const c1x = u1 + dx * 0.32 + nx * sag;
  const c1y = v1 + dy * 0.32 + ny * sag;
  const c2x = u1 + dx * 0.68 - nx * sag * 0.58;
  const c2y = v1 + dy * 0.68 - ny * sag * 0.58;
  const d = `M ${u1} ${v1} C ${c1x} ${c1y} ${c2x} ${c2y} ${u2} ${v2}`;
  const ko = SNAKE_RAIL_OFF;
  const u1L = u1 - nx * ko;
  const v1L = v1 - ny * ko;
  const c1xL = c1x - nx * ko;
  const c1yL = c1y - ny * ko;
  const c2xL = c2x - nx * ko;
  const c2yL = c2y - ny * ko;
  const u2L = u2 - nx * ko;
  const v2L = v2 - ny * ko;
  const dRailL = `M ${u1L} ${v1L} C ${c1xL} ${c1yL} ${c2xL} ${c2yL} ${u2L} ${v2L}`;
  const u1R = u1 + nx * ko;
  const v1R = v1 + ny * ko;
  const c1xR = c1x + nx * ko;
  const c1yR = c1y + ny * ko;
  const c2xR = c2x + nx * ko;
  const c2yR = c2y + ny * ko;
  const u2R = u2 + nx * ko;
  const v2R = v2 + ny * ko;
  const dRailR = `M ${u1R} ${v1R} C ${c1xR} ${c1yR} ${c2xR} ${c2yR} ${u2R} ${v2R}`;

  const tux = c1x - u1;
  const tuy = c1y - v1;
  const tlen = Math.hypot(tux, tuy) || 1;
  const tx = tux / tlen;
  const ty = tuy / tlen;
  const headAngleDeg = (Math.atan2(ty, tx) * 180) / Math.PI;

  const t2x = u2 - c2x;
  const t2y = v2 - c2y;
  const t2l = Math.hypot(t2x, t2y) || 1;
  const wx = t2x / t2l;
  const wy = t2y / t2l;
  const tailAngleDeg = (Math.atan2(wy, wx) * 180) / Math.PI;

  const scaleTs = [0.15, 0.26, 0.37, 0.48, 0.59, 0.7, 0.81];
  const scales = [];
  for (const t of scaleTs) {
    const p = cubicBezierPoint(t, u1, v1, c1x, c1y, c2x, c2y, u2, v2);
    const tg = cubicBezierTangent(t, u1, v1, c1x, c1y, c2x, c2y, u2, v2);
    scales.push({ x: p.x, y: p.y, deg: (Math.atan2(tg.ty, tg.tx) * 180) / Math.PI });
  }

  return {
    d,
    dRailL,
    dRailR,
    hx: u1,
    hy: v1,
    headAngleDeg,
    tailUx: u2,
    tailUy: v2,
    tailAngleDeg,
    scales,
    approxLen: len,
  };
}

/** Ludo soldier assets (same paths as `ov2LudoBoardView.js`). */
function ludoPawnSrc(seat) {
  return `/images/ludo/dog_${seat}.png`;
}

/** @param {number} row 0 = top row on screen */
/** @param {number} col 0 = left */
function cellNumberAt(row, col) {
  const rowFromBottom = 9 - row;
  const leftToRight = rowFromBottom % 2 === 0;
  const c = leftToRight ? col : 9 - col;
  return rowFromBottom * 10 + c + 1;
}

/** @param {{ ladders: Record<number, number>, snakes: Record<number, number> }} edges from `public.ov2_snakes_board_edges()` (via session) */
function useEdgeLookups(edges) {
  return useMemo(() => {
    const ladderFoot = new Set(Object.keys(edges.ladders).map(Number));
    const ladderTop = new Set(Object.values(edges.ladders));
    const snakeHead = new Set(Object.keys(edges.snakes).map(Number));
    const snakeTail = new Set(Object.values(edges.snakes));
    return { ladderFoot, ladderTop, snakeHead, snakeTail };
  }, [edges]);
}

/** @param {{ edges: { ladders: Record<number, number>, snakes: Record<number, number> } }} props */
function Ov2SnakesEdgeOverlay({ edges }) {
  const uid = useId().replace(/:/g, "");
  const gidRail = `ov2-sn-ladder-rail-${uid}`;
  const gidBelly = `ov2-sn-snake-belly-${uid}`;
  const { ladders, snakesSorted } = useMemo(() => {
    const lad = [];
    for (const [from, to] of Object.entries(edges.ladders)) {
      const f = Number(from);
      const t = Number(to);
      lad.push({ key: `l-${from}`, fromN: f, ...ladderGeometry(f, t) });
    }
    lad.sort((a, b) => a.fromN - b.fromN);
    const sn = [];
    for (const [from, to] of Object.entries(edges.snakes)) {
      const f = Number(from);
      const t = Number(to);
      sn.push({ key: `s-${from}`, fromN: f, ...snakeSpineGeometry(f, t) });
    }
    sn.sort((a, b) => b.approxLen - a.approxLen || a.fromN - b.fromN);
    return { ladders: lad, snakesSorted: sn };
  }, [edges]);

  return (
    <svg
      className="pointer-events-none z-[1] block h-full w-full overflow-visible"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      overflow="visible"
      aria-hidden
    >
      <defs>
        <linearGradient id={gidRail} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#f3e8d4" />
          <stop offset="50%" stopColor="#c9b18a" />
          <stop offset="100%" stopColor="#8b6f47" />
        </linearGradient>
        <linearGradient id={gidBelly} x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#fecdd3" stopOpacity="0.92" />
          <stop offset="100%" stopColor="#7f1d1d" stopOpacity="0.96" />
        </linearGradient>
      </defs>

      {/* Crossing: snake bodies under ladders (ladders read as crossing “over”). */}
      <g className="ov2-snakes-spine-under">
        {snakesSorted.map(s => (
          <g key={`${s.key}-spine`}>
            <path
              d={s.dRailL}
              fill="none"
              stroke="rgba(8,4,4,0.88)"
              strokeWidth="1.22"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={s.dRailR}
              fill="none"
              stroke="rgba(8,4,4,0.88)"
              strokeWidth="1.22"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={s.d}
              fill="none"
              stroke="rgba(0,0,0,0.78)"
              strokeWidth="3.05"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d={s.d}
              fill="none"
              stroke="#5c1a14"
              strokeWidth="2.25"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.96"
            />
            <path
              d={s.d}
              fill="none"
              stroke={`url(#${gidBelly})`}
              strokeWidth="1.38"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.86"
            />
            {s.scales.map((sc, i) => (
              <ellipse
                key={`${s.key}-sc-${i}`}
                cx={sc.x}
                cy={sc.y}
                rx="0.44"
                ry="0.76"
                fill="#4a1510"
                stroke="rgba(252,211,211,0.22)"
                strokeWidth="0.06"
                opacity="0.9"
                transform={`rotate(${sc.deg} ${sc.x} ${sc.y})`}
              />
            ))}
          </g>
        ))}
      </g>

      <g className="ov2-snakes-ladders-bridge">
        {ladders.map(l => (
          <g key={l.key}>
            <path d={l.left} fill="none" stroke="rgba(0,0,0,0.48)" strokeWidth="0.82" strokeLinecap="butt" />
            <path d={l.right} fill="none" stroke="rgba(0,0,0,0.48)" strokeWidth="0.82" strokeLinecap="butt" />
            <path d={l.left} fill="none" stroke={`url(#${gidRail})`} strokeWidth="0.62" strokeLinecap="butt" />
            <path d={l.right} fill="none" stroke={`url(#${gidRail})`} strokeWidth="0.62" strokeLinecap="butt" />
            {l.rungs.map((r, i) => (
              <line
                key={`${l.key}-r-${i}`}
                x1={r.x1}
                y1={r.y1}
                x2={r.x2}
                y2={r.y2}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="0.52"
                strokeLinecap="butt"
              />
            ))}
            {l.rungs.map((r, i) => (
              <line
                key={`${l.key}-rf-${i}`}
                x1={r.x1}
                y1={r.y1}
                x2={r.x2}
                y2={r.y2}
                stroke="#d4c4a8"
                strokeWidth="0.4"
                strokeLinecap="butt"
              />
            ))}
            <path
              d={l.left}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="0.16"
              strokeLinecap="butt"
            />
            <path
              d={l.right}
              fill="none"
              stroke="rgba(255,255,255,0.14)"
              strokeWidth="0.16"
              strokeLinecap="butt"
            />
          </g>
        ))}
      </g>

      {/* Ladder endpoints: foot vs top readable at a glance. */}
      <g className="ov2-snakes-ladder-anchors">
        {ladders.map(l => {
          const { footU, footV, topU, topV, dirU, dirV } = l;
          const pu = -dirV * 0.58;
          const pv = dirU * 0.58;
          const fTipX = footU + dirU * 2.75;
          const fTipY = footV + dirV * 2.75;
          const fB1x = footU + dirU * 0.95 + pu;
          const fB1y = footV + dirV * 0.95 + pv;
          const fB2x = footU + dirU * 0.95 - pu;
          const fB2y = footV + dirV * 0.95 - pv;
          const tTipX = topU - dirU * 2.45;
          const tTipY = topV - dirV * 2.45;
          const tB1x = topU - dirU * 0.92 + pu;
          const tB1y = topV - dirV * 0.92 + pv;
          const tB2x = topU - dirU * 0.92 - pu;
          const tB2y = topV - dirV * 0.92 - pv;
          return (
            <g key={`${l.key}-cap`}>
              <circle
                cx={footU}
                cy={footV}
                r="2.38"
                fill="rgba(234,179,8,0.1)"
                stroke="rgba(202,138,4,0.55)"
                strokeWidth="0.2"
              />
              <polygon
                points={`${fTipX},${fTipY} ${fB1x},${fB1y} ${fB2x},${fB2y}`}
                fill="rgba(253,224,71,0.22)"
                stroke="rgba(202,138,4,0.45)"
                strokeWidth="0.1"
              />
              <circle
                cx={topU}
                cy={topV}
                r="2.12"
                fill="rgba(163,230,53,0.08)"
                stroke="rgba(190,242,100,0.42)"
                strokeWidth="0.18"
              />
              <polygon
                points={`${tTipX},${tTipY} ${tB1x},${tB1y} ${tB2x},${tB2y}`}
                fill="rgba(217,249,157,0.16)"
                stroke="rgba(132,204,22,0.35)"
                strokeWidth="0.09"
              />
            </g>
          );
        })}
      </g>

      {/* Heads / tails above ladder art so endpoints stay legible where paths meet. */}
      <g className="ov2-snakes-endpoints">
        {snakesSorted.map(s => (
          <g key={`${s.key}-ht`}>
            <g transform={`translate(${s.hx},${s.hy}) rotate(${s.headAngleDeg})`}>
              <ellipse
                cx="0.85"
                cy="0"
                rx="2.05"
                ry="1.22"
                fill="#2c0a0e"
                stroke="#fca5a5"
                strokeWidth="0.14"
              />
              <polygon points="2.45,0 3.55,-0.62 3.55,0.62" fill="#1a0507" stroke="#fecdd3" strokeWidth="0.1" strokeLinejoin="round" />
              <circle cx="1.15" cy="-0.48" r="0.38" fill="#0c0a0a" stroke="#44403c" strokeWidth="0.07" />
              <circle cx="1.22" cy="-0.52" r="0.14" fill="#fde68a" />
              <path
                d="M 3.55 0 L 4.15 -0.22 L 4.05 0 L 4.15 0.22 Z"
                fill="#9f1239"
                stroke="#fecaca"
                strokeWidth="0.05"
              />
            </g>
            <g transform={`translate(${s.tailUx},${s.tailUy}) rotate(${s.tailAngleDeg})`}>
              <ellipse cx="-0.55" cy="0" rx="1.18" ry="0.82" fill="#1c1412" stroke="#a8a29e" strokeWidth="0.11" />
              <path
                d="M -1.05 0 Q -1.75 0.42 -2.05 0.08"
                fill="none"
                stroke="#57534e"
                strokeWidth="0.24"
                strokeLinecap="round"
              />
              <circle cx="-1.95" cy="0.02" r="0.28" fill="#292524" stroke="#78716c" strokeWidth="0.06" />
              <circle cx="-2.32" cy="0.05" r="0.2" fill="#1c1917" stroke="#57534e" strokeWidth="0.05" />
            </g>
          </g>
        ))}
      </g>
    </svg>
  );
}

/** 1–6 pip readout (visual only). HUD uses h-12 w-12 to match pawn tiles. */
function Ov2SnakesDiceFace({ value, emphasized }) {
  const n = value != null && Number.isFinite(Number(value)) ? Math.floor(Number(value)) : null;
  const active = n != null && n >= 1 && n <= 6;
  const pipCls =
    "block h-2 w-2 rounded-[1px] bg-zinc-100 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.45)] sm:h-2.5 sm:w-2.5";
  const grid = emphasized
    ? "grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-amber-400/50 bg-gradient-to-b from-zinc-800 to-zinc-950 p-1.5 shadow-[0_0_14px_rgba(251,191,36,0.26)] sm:h-12 sm:w-12 sm:p-2"
    : "grid h-12 w-12 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-white/15 bg-gradient-to-b from-zinc-800 to-zinc-950 p-1.5 sm:h-12 sm:w-12 sm:p-2";
  const patterns = {
    1: [null, null, null, null, "c", null, null, null, null],
    2: ["c", null, null, null, null, null, null, null, "c"],
    3: ["c", null, null, null, "c", null, null, null, "c"],
    4: ["c", null, "c", null, null, null, "c", null, "c"],
    5: ["c", null, "c", null, "c", null, "c", null, "c"],
    6: ["c", null, "c", "c", null, "c", "c", null, "c"],
  };
  const pat = active ? patterns[n] : Array(9).fill(null);
  return (
    <div className={grid} aria-hidden>
      {pat.map((cell, i) => (
        <div key={i} className="flex items-center justify-center">
          {cell ? <span className={pipCls} /> : null}
        </div>
      ))}
    </div>
  );
}

/** HUD seat: pawn h-12 w-12 (same as dice) + name/pos; empty slot reserves space for grid corners. */
function Ov2SnakesHudSeatChip({ si, memberBySeat, positions, turnSeat, pk }) {
  const m = memberBySeat.get(si);
  const posRaw = positions[String(si)] ?? positions[si];
  const pos = posRaw != null ? Number(posRaw) : null;
  const occupied = Boolean(m) || Number.isFinite(pos);
  const isTurn = turnSeat === si;
  const rawName = m?.display_name != null ? String(m.display_name).trim() : "";
  const label = rawName || (occupied ? `Seat ${si}` : "");
  if (!occupied) {
    return <div className="h-12 min-h-12 w-[4.5rem] min-w-0 max-w-full shrink sm:w-[5rem]" aria-hidden />;
  }
  const isYou = pk && m?.participant_key && String(m.participant_key) === pk;
  const nameLine = isYou ? `${label || `Seat ${si}`} (you)` : label;
  return (
    <div
      className={`flex h-12 min-w-0 max-w-[min(100%,9rem)] shrink items-center gap-1 rounded-lg bg-black/35 py-1 pl-1 pr-1.5 ring-2 ring-inset ${
        isTurn ? SEAT_TURN_RING[si] ?? "ring-amber-300/80" : "ring-transparent"
      }`}
      title={m?.display_name || `Seat ${si}`}
    >
      <img src={ludoPawnSrc(si)} alt="" className="h-12 w-12 shrink-0 object-contain" draggable={false} />
      <div className="flex min-w-0 flex-1 flex-col justify-center leading-tight">
        <span className="truncate text-[8px] font-medium text-zinc-200 sm:text-[9px]">{nameLine}</span>
        <span className="font-mono text-[10px] font-semibold tabular-nums text-zinc-200 sm:text-[11px]">
          {Number.isFinite(pos) ? pos : "—"}
        </span>
      </div>
    </div>
  );
}

function PawnWithTurnRing({ seat, turnSeat, dense, edgeHang }) {
  const isTurn = turnSeat === seat;
  const filt = SEAT_TURN_FILTER[seat] ?? SEAT_TURN_FILTER[1];
  const idle = "drop-shadow(0 2px 4px rgba(0,0,0,0.72))";
  const sc = dense ? "scale-[1.09]" : "scale-[1.12]";
  const hangFilter = edgeHang ? "brightness(1.06) saturate(1.08)" : "";
  const combinedFilter = [isTurn ? filt : idle, hangFilter].filter(Boolean).join(" ");
  return (
    <span className="relative flex h-full w-full max-h-full max-w-full items-center justify-center" style={{ filter: combinedFilter || idle }}>
      <img
        src={ludoPawnSrc(seat)}
        alt=""
        title={`Seat ${seat}`}
        draggable={false}
        className={`m-auto block h-full w-full max-h-full max-w-full origin-center object-contain ${sc}`}
      />
    </span>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (previousActiveSessionId: string, rpcNewSessionId?: string, options?: { expectClearedSession?: boolean }) => void | Promise<unknown> }} props
 */
export default function Ov2SnakesScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2SnakesSession(contextInput ?? undefined);
  const { snap, err, rollBusy, roll, vaultClaimBusy, vaultClaimError, retryVaultClaim, pawnMotion, boardEdges } = session;

  const room = contextInput?.room;
  const roomId =
    room && typeof room === "object" && room.id != null ? String(room.id).trim() : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const selfKey = pk;
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const onLeaveToLobby = typeof contextInput?.onLeaveToLobby === "function" ? contextInput.onLeaveToLobby : null;
  const leaveToLobbyBusy = Boolean(contextInput?.leaveToLobbyBusy);

  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [rematchIntentBusy, setRematchIntentBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);

  const memberBySeat = useMemo(() => {
    /** @type {Map<number, { participant_key?: string, display_name?: string }>} */
    const m = new Map();
    for (const row of members) {
      const si = row?.seat_index;
      if (si == null || si === "") continue;
      const n = Number(si);
      if (!Number.isInteger(n) || n < 0 || n > 3) continue;
      m.set(n, {
        participant_key: row?.participant_key != null ? String(row.participant_key) : "",
        display_name: row?.display_name != null ? String(row.display_name) : "",
      });
    }
    return m;
  }, [members]);

  const roomMembers = members;
  const roomHostKey = String(room?.host_participant_key || "").trim();
  const isHost = Boolean(selfKey && roomHostKey && selfKey === roomHostKey);
  const seatedCount = roomMembers.filter(m => m?.seat_index != null).length;
  const myMemberRow = useMemo(
    () => roomMembers.find(m => m && typeof m === "object" && String(m.participant_key || "").trim() === selfKey),
    [roomMembers, selfKey]
  );
  const seatedCommitted = useMemo(
    () => roomMembers.filter(m => m?.seat_index != null && String(m?.wallet_state || "").trim() === "committed"),
    [roomMembers]
  );
  const eligibleRematch = seatedCommitted.length;
  const readyRematch = useMemo(
    () => seatedCommitted.filter(m => readOv2MemberRematchRequested(m?.meta)).length,
    [seatedCommitted]
  );
  const myRematchRequested = (() => readOv2MemberRematchRequested(myMemberRow?.meta))();

  const { ladderFoot, ladderTop, snakeHead, snakeTail } = useEdgeLookups(boardEdges);

  const basePositions =
    snap?.board && typeof snap.board === "object" && snap.board.positions && typeof snap.board.positions === "object"
      ? snap.board.positions
      : {};
  const positions = useMemo(() => {
    const m = pawnMotion;
    if (!m) return basePositions;
    const out = { ...basePositions };
    const seatKey = String(m.seat);
    out[seatKey] = m.displayCell;
    out[m.seat] = m.displayCell;
    return out;
  }, [basePositions, pawnMotion]);
  const phase = snap ? String(snap.phase || "").toLowerCase() : "";
  const finished = phase === "finished";
  const winnerSeat = snap?.winnerSeat != null ? snap.winnerSeat : null;

  const mySeat = snap?.mySeat != null ? snap.mySeat : null;
  const result = snap?.result && typeof snap.result === "object" ? snap.result : null;
  const winnerFromResult =
    result?.winner != null ? Number(result.winner) : winnerSeat != null ? Number(winnerSeat) : null;
  const didIWin = finished && mySeat != null && winnerFromResult != null && Number(mySeat) === Number(winnerFromResult);
  const lossPerSeat =
    result?.lossPerSeat != null && Number.isFinite(Number(result.lossPerSeat)) ? Math.floor(Number(result.lossPerSeat)) : null;
  let prizeTotal =
    result?.prize != null && Number.isFinite(Number(result.prize)) ? Math.floor(Number(result.prize)) : null;
  if (
    prizeTotal != null &&
    lossPerSeat != null &&
    prizeTotal > 0 &&
    lossPerSeat > 0 &&
    prizeTotal <= lossPerSeat &&
    seatedCount >= 2
  ) {
    prizeTotal = lossPerSeat * seatedCount;
  }
  const winnerNet =
    prizeTotal != null && lossPerSeat != null ? Math.max(0, Math.floor(prizeTotal - lossPerSeat)) : null;

  const isFinished = finished;
  const baseRematchEligible =
    isFinished &&
    mySeat != null &&
    String(myMemberRow?.wallet_state || "").trim() === "committed" &&
    eligibleRematch >= 2 &&
    eligibleRematch <= 4;
  const finishActionsLocked = vaultClaimBusy;
  const canHostStartNextMatch =
    isFinished && isHost && eligibleRematch >= 2 && readyRematch >= eligibleRematch && !startNextBusy;

  const finishSessionId = isFinished
    ? String(snap?.sessionId || "").trim() ||
      String(room && typeof room === "object" && room.active_session_id != null ? room.active_session_id : "").trim() ||
      (roomId ? `room:${roomId}` : "")
    : "";
  const finishModalDismissed =
    finishSessionId.length > 0 &&
    (finishModalDismissedSessionId === finishSessionId ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(finishSessionId)) === "1";
          } catch {
            return false;
          }
        })()));
  const showResultModal = isFinished && !finishModalDismissed;

  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    try {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      }
    } catch {
      /* ignore */
    }
  }, [finishSessionId]);

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Snakes rematch RPC not wired yet" };
  }, [roomId, selfKey]);
  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Snakes rematch RPC not wired yet" };
  }, [roomId, selfKey]);
  const startNextMatch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "missing" };
    return { ok: false, error: "Snakes start-next RPC not wired yet" };
  }, [roomId, selfKey]);

  const finishOutcome = useMemo(() => {
    if (!isFinished) return "unknown";
    if (winnerFromResult == null) return "unknown";
    if (mySeat == null) return "unknown";
    if (Number(mySeat) === Number(winnerFromResult)) return "win";
    return "loss";
  }, [isFinished, winnerFromResult, mySeat]);

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (finishOutcome === "unknown") return "Match finished";
    if (finishOutcome === "win") return "Victory";
    return "Defeat";
  }, [isFinished, finishOutcome]);

  const finishReasonLine = useMemo(() => {
    if (!isFinished) return "";
    if (winnerFromResult != null) return `Winner: Seat ${winnerFromResult + 1}`;
    return "Match complete";
  }, [isFinished, winnerFromResult]);

  const finishAmountLine = useMemo(() => {
    if (!isFinished) return { text: "—", className: "text-zinc-500" };
    if (didIWin && winnerNet != null && prizeTotal != null) {
      return {
        text: `+${winnerNet.toLocaleString()} MLEO (pot ${prizeTotal.toLocaleString()})`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (didIWin && prizeTotal != null) {
      return {
        text: `Pot ${prizeTotal.toLocaleString()}`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (!didIWin && mySeat != null && winnerFromResult != null && lossPerSeat != null) {
      return {
        text: `−${lossPerSeat.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [isFinished, didIWin, winnerNet, prizeTotal, mySeat, winnerFromResult, lossPerSeat]);

  const currentMultiplier = 1;

  const turnSeat = snap?.turnSeat != null ? snap.turnSeat : null;
  const lastRoll = snap?.lastRoll != null ? snap.lastRoll : null;

  const boardCells = useMemo(() => {
    const out = [];
    for (let row = 0; row < 10; row += 1) {
      for (let col = 0; col < 10; col += 1) {
        const n = cellNumberAt(row, col);
        const occupants = [];
        for (let s = 0; s <= 3; s += 1) {
          const posRaw = positions[String(s)] ?? positions[s];
          const pos = posRaw != null ? Number(posRaw) : NaN;
          if (Number.isFinite(pos) && Math.floor(pos) === n) occupants.push(s);
        }
        const isStart = n === 1;
        const isEnd = n === 100;
        const lf = ladderFoot.has(n);
        const lt = ladderTop.has(n);
        const sh = snakeHead.has(n);
        const st = snakeTail.has(n);
        const edgePreBeat =
          pawnMotion &&
          pawnMotion.phase === "edge_hold" &&
          n === pawnMotion.preCell &&
          occupants.includes(pawnMotion.seat);
        const edgeLandFlash =
          pawnMotion &&
          pawnMotion.phase === "edge_land" &&
          n === pawnMotion.finalCell &&
          occupants.includes(pawnMotion.seat);
        const edgeBg =
          isEnd
            ? "bg-gradient-to-br from-emerald-900/50 to-emerald-950/72"
            : isStart
              ? "bg-gradient-to-br from-sky-900/42 to-sky-950/68"
              : sh
                ? "bg-gradient-to-br from-rose-950/48 to-zinc-950/58"
                : lf
                  ? "bg-gradient-to-br from-lime-950/38 to-zinc-950/58"
                  : st
                    ? "bg-gradient-to-br from-rose-900/28 to-zinc-950/58"
                    : lt
                      ? "bg-gradient-to-br from-lime-900/28 to-zinc-950/58"
                      : "bg-zinc-950/50";
        const cellNumberStyle =
          isEnd
            ? {
                color: "rgb(192 132 252)",
                textShadow: "0 1px 3px rgb(12 4 28 / 0.92), 0 0 1px rgb(0 0 0 / 0.55)",
              }
            : isStart
              ? {
                  color: "rgb(45 212 191)",
                  textShadow: "0 1px 3px rgb(4 24 28 / 0.92), 0 0 1px rgb(0 0 0 / 0.5)",
                }
              : {
                  color: "rgb(196 181 253)",
                  textShadow: "0 1px 3px rgb(8 6 22 / 0.92), 0 0 1px rgb(0 0 0 / 0.5)",
                };
        out.push({
          key: `c-${row}-${col}`,
          n,
          occupants,
          edgeBg,
          cellNumberStyle,
          edgePreBeat,
          edgeLandFlash,
          edgeKind: pawnMotion?.kind ?? null,
        });
      }
    }
    return out;
  }, [positions, ladderFoot, ladderTop, snakeHead, snakeTail, pawnMotion]);

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      {err ? <p className="shrink-0 truncate px-0.5 text-[10px] text-red-300">{err}</p> : null}
      {snap && vaultClaimError && !vaultClaimBusy ? (
        <p className="shrink-0 px-0.5 text-[10px] text-red-300/95">
          {vaultClaimError}{" "}
          <button type="button" className="underline" onClick={() => void retryVaultClaim()}>
            Retry
          </button>
        </p>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-visible px-0.5 pb-0.5 pt-0.5 sm:gap-1 sm:px-1">
        {/*
          One “balloon”: left (0,2) | dice | right (1,3). flex-1 + justify-end + pr on the right wing
          pins the right pair to the inner edge of the pill so the second seat sits flush on that side.
        */}
        <div className="flex w-full min-w-0 shrink-0 items-center rounded-full border border-white/[0.14] bg-zinc-950/75 py-1 pl-1.5 pr-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] sm:py-1.5 sm:pl-2 sm:pr-1.5">
          <div className="flex min-h-12 min-w-0 flex-1 items-center justify-start gap-1 overflow-hidden pl-0 sm:gap-1.5">
            <Ov2SnakesHudSeatChip si={0} memberBySeat={memberBySeat} positions={positions} turnSeat={turnSeat} pk={pk} />
            <Ov2SnakesHudSeatChip si={2} memberBySeat={memberBySeat} positions={positions} turnSeat={turnSeat} pk={pk} />
          </div>
          <div className="flex w-12 shrink-0 items-center justify-center sm:w-[3.25rem]">
            <Ov2SnakesDiceFace value={lastRoll} emphasized={Boolean(snap?.canRoll)} />
          </div>
          <div className="flex min-h-12 min-w-0 flex-1 items-center justify-end gap-1 overflow-hidden pr-0.5 sm:gap-1.5 sm:pr-0">
            <Ov2SnakesHudSeatChip si={1} memberBySeat={memberBySeat} positions={positions} turnSeat={turnSeat} pk={pk} />
            <Ov2SnakesHudSeatChip si={3} memberBySeat={memberBySeat} positions={positions} turnSeat={turnSeat} pk={pk} />
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-visible p-0.5 max-sm:items-stretch max-sm:justify-center">
          {/*
            Mobile: fill the flex band (tall rectangle). SVG uses preserveAspectRatio="none" so edges
            stretch with the same 10×10 grid as the CSS cells. sm+: square board for larger viewports.
          */}
          <div
            className="relative isolate min-w-0 overflow-visible rounded-lg border border-amber-800/50 bg-gradient-to-br from-amber-950/62 via-zinc-900 to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),0_12px_36px_rgba(0,0,0,0.52)] ring-2 ring-amber-700/28 max-sm:h-full max-sm:w-full max-sm:min-h-0 max-sm:max-h-[min(100%,calc(100dvh-15rem))] sm:aspect-square sm:h-auto sm:max-h-full sm:w-full sm:max-w-full sm:min-h-[148px] sm:shrink-0 sm:rounded-xl sm:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),0_16px_48px_rgba(0,0,0,0.52)]"
          >
            {/* Cell fills under SVG so paths read through semi-transparent tiles. */}
            <div className="pointer-events-none absolute inset-0 z-[1] grid h-full w-full grid-cols-10 grid-rows-10 gap-px bg-zinc-950/85 p-px">
              {boardCells.map(c => (
                <div key={`bg-${c.key}`} className={`min-h-0 min-w-0 rounded-sm ${c.edgeBg}`} />
              ))}
            </div>
            {/* Snakes & ladders above cell paint, below numbers/pawns — avoids border “cuts”. */}
            <div className="pointer-events-none absolute inset-0 z-[2] overflow-visible">
              <Ov2SnakesEdgeOverlay edges={boardEdges} />
            </div>
            <div className="pointer-events-none absolute inset-0 z-[3] grid h-full w-full grid-cols-10 grid-rows-10 gap-px p-px">
              {boardCells.map(c => (
                <div
                  key={c.key}
                  className={[
                    "relative flex min-h-0 min-w-0 overflow-visible rounded-sm bg-transparent text-[6px] font-bold leading-none sm:text-[7px]",
                    c.edgeLandFlash
                      ? c.edgeKind === "snake"
                        ? "ring-2 ring-rose-300/45 shadow-[0_0_12px_rgba(251,113,133,0.18)]"
                        : "ring-2 ring-lime-300/50 shadow-[0_0_12px_rgba(190,242,100,0.2)]"
                      : c.edgePreBeat
                        ? c.edgeKind === "snake"
                          ? "ring-2 ring-rose-400/55 shadow-[0_0_14px_rgba(251,113,133,0.22)]"
                          : "ring-2 ring-amber-300/60 shadow-[0_0_14px_rgba(251,191,129,0.25)]"
                        : "ring-0 ring-transparent shadow-none",
                  ].join(" ")}
                >
                  <span
                    className="pointer-events-none absolute right-0 top-0 z-[6] px-0.5 py-px pr-0.5 text-[8px] font-bold tabular-nums leading-none sm:text-[9px]"
                    style={c.cellNumberStyle}
                  >
                    {c.n}
                  </span>
                  {c.occupants.length > 0 ? (
                    <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
                      {c.occupants.length === 1 ? (
                        <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center p-0">
                          <PawnWithTurnRing
                            seat={c.occupants[0]}
                            turnSeat={turnSeat}
                            edgeHang={Boolean(c.edgePreBeat && c.occupants[0] === pawnMotion?.seat)}
                          />
                        </div>
                      ) : (
                        <div className="grid h-full w-full min-h-0 min-w-0 grid-cols-2 grid-rows-2 place-items-center gap-0 p-0">
                          {c.occupants.map(s => (
                            <div key={`o-${c.n}-${s}`} className="flex h-full w-full min-h-0 min-w-0 items-center justify-center">
                              <PawnWithTurnRing
                                seat={s}
                                turnSeat={turnSeat}
                                dense
                                edgeHang={Boolean(c.edgePreBeat && s === pawnMotion?.seat)}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>

        {(onLeaveToLobby || !finished) && !(finished && showResultModal) ? (
          <div className="flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/[0.08] bg-zinc-950/40 px-1 py-1.5 sm:gap-3 sm:py-2">
            {onLeaveToLobby ? (
              <button
                type="button"
                disabled={leaveToLobbyBusy}
                onClick={() => void onLeaveToLobby()}
                className="min-w-[4.5rem] rounded-md border border-white/18 bg-white/8 px-2.5 py-1 text-[10px] font-semibold text-zinc-100 shadow-sm disabled:opacity-45 sm:min-w-[5rem] sm:px-3 sm:py-1.5 sm:text-[11px]"
              >
                {leaveToLobbyBusy ? "…" : "Leave"}
              </button>
            ) : null}
            {!finished ? (
              <button
                type="button"
                disabled={Boolean(!snap || rollBusy || !snap.canRoll)}
                onClick={() => void roll()}
                title={
                  !snap ? "Loading…" : !snap.canRoll ? "Not your turn" : rollBusy ? "Rolling…" : "Roll the dice"
                }
                className="min-w-[4.5rem] rounded-md border border-emerald-500/50 bg-emerald-900/55 px-2.5 py-1 text-[10px] font-bold text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] hover:bg-emerald-800/55 active:bg-emerald-950/55 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-emerald-900/55 sm:min-w-[5rem] sm:px-3 sm:py-1.5 sm:text-[11px]"
              >
                {!snap ? "Roll" : rollBusy ? "…" : "Roll"}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-white/[0.05] pt-0.5 text-[8px] text-zinc-500 sm:text-[9px]">
          {room?.pot_locked != null ? (
            <span>Pot {Math.floor(Number(room.pot_locked) || 0).toLocaleString()}</span>
          ) : (
            <span className="text-zinc-600">Gold chevron = climb start · Lime chevron = climb end</span>
          )}
        </div>
      </div>

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-snakes-finish-title">
          <div
            className={[
              "border-b px-4 pb-3 pt-4",
              finishOutcome === "win"
                ? "border-emerald-500/20 bg-gradient-to-br from-emerald-950/45 to-zinc-950/80"
                : finishOutcome === "loss"
                  ? "border-rose-500/20 bg-gradient-to-br from-rose-950/40 to-zinc-950/80"
                  : "border-white/[0.07] bg-zinc-950/60",
            ].join(" ")}
          >
            <div className="flex items-start gap-3">
              <span
                className={[
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl shadow-inner",
                  finishOutcome === "win" && "border-emerald-500/45 bg-emerald-950/60 text-emerald-200",
                  finishOutcome === "loss" && "border-rose-500/45 bg-rose-950/55 text-rose-200",
                  finishOutcome === "unknown" && "border-white/10 bg-zinc-900/80 text-zinc-200",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
                <h2
                  id="ov2-snakes-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    finishOutcome === "win" && "text-emerald-400",
                    finishOutcome === "loss" && "text-rose-400",
                    finishOutcome === "unknown" && "text-zinc-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishTitle}
                </h2>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{currentMultiplier}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                {mySeat == null && prizeTotal != null && winnerFromResult != null ? (
                  <p className="mt-2 text-center text-[10px] text-zinc-500">
                    Spectator · winner S{winnerFromResult + 1} · pot {prizeTotal.toLocaleString()}
                  </p>
                ) : null}
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {finishActionsLocked
                    ? "Sending results to your balance…"
                    : eligibleRematch >= 2
                      ? `Rematch ready: ${readyRematch}/${eligibleRematch} seated players — then host starts next.`
                      : "Round complete — rematch, then host starts next."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button
              type="button"
              disabled={rematchIntentBusy || myRematchRequested || !baseRematchEligible || finishActionsLocked}
              onClick={async () => {
                if (!baseRematchEligible || finishActionsLocked) return;
                setRematchIntentBusy(true);
                try {
                  const r = await requestRematch();
                  if (!r?.ok && r?.error) console.warn("[Snakes rematch intent]", r.error);
                } finally {
                  setRematchIntentBusy(false);
                }
              }}
              className={BTN_PRIMARY + " w-full"}
            >
              {rematchIntentBusy && !myRematchRequested ? "Requesting…" : "Request rematch"}
            </button>
            <button
              type="button"
              disabled={rematchIntentBusy || !myRematchRequested || !baseRematchEligible}
              onClick={async () => {
                if (!baseRematchEligible) return;
                setRematchIntentBusy(true);
                try {
                  const r = await cancelRematch();
                  if (!r?.ok && r?.error) console.warn("[Snakes rematch cancel]", r.error);
                } finally {
                  setRematchIntentBusy(false);
                }
              }}
              className={BTN_SECONDARY + " w-full"}
            >
              Cancel rematch
            </button>
            <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
              <button
                type="button"
                className={BTN_PRIMARY + " w-full rounded-none"}
                disabled={!isHost || startNextBusy || finishActionsLocked || !canHostStartNextMatch}
                title={!isHost ? "Only the host can start the next match" : undefined}
                onClick={async () => {
                  if (!canHostStartNextMatch || finishActionsLocked) return;
                  const prevSessionId =
                    contextInput?.room?.active_session_id != null ? String(contextInput.room.active_session_id) : "";
                  setStartNextBusy(true);
                  try {
                    const r = await startNextMatch();
                    if (r?.ok) {
                      try {
                        window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
                      } catch {
                        /* ignore */
                      }
                      if (onSessionRefresh) {
                        await onSessionRefresh(prevSessionId, "", { expectClearedSession: true });
                      }
                      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
                    } else if (r?.error) {
                      console.warn("[Snakes start next match]", r.error);
                    }
                  } finally {
                    setStartNextBusy(false);
                  }
                }}
              >
                {startNextBusy ? "Starting…" : "Start next (host)"}
              </button>
              <p className="px-2 py-1.5 text-center text-[11px] text-zinc-500">
                Host starts the next match when all seated players rematch.
              </p>
            </div>
            <button type="button" className={BTN_SECONDARY + " w-full"} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_FINISH_DANGER + " w-full"}
              onClick={async () => {
                if (!selfKey) return;
                setExitErr("");
                setExitBusy(true);
                try {
                  await leaveOv2RoomWithForfeitRetry({
                    room: contextInput?.room,
                    room_id: roomId,
                    participant_key: selfKey,
                  });
                  try {
                    window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
                  } catch {
                    /* ignore */
                  }
                  await router.replace("/online-v2/rooms");
                } catch (e) {
                  setExitErr(e?.message || "Could not leave room.");
                } finally {
                  setExitBusy(false);
                }
              }}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
