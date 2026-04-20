"use client";

import Link from "next/link";
import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { useOv2SnakesSession } from "../../../hooks/useOv2SnakesSession";

/** Display-only mirror of `public.ov2_snakes_board_edges()` (Appendix A). */
const SNAKES_BOARD_EDGES = {
  ladders: {
    2: 15,
    7: 28,
    22: 41,
    28: 55,
    41: 63,
    50: 69,
    57: 76,
    65: 82,
    68: 90,
    71: 91,
  },
  snakes: {
    99: 80,
    94: 71,
    89: 52,
    74: 35,
    62: 19,
    49: 12,
    16: 6,
  },
};

/** Turn highlight on board pawns: colored drop-shadow (no ring — maximizes piece area). */
const SEAT_TURN_FILTER = [
  "drop-shadow(0 0 12px rgba(56,189,248,0.82)) drop-shadow(0 0 3px rgba(56,189,248,0.55))",
  "drop-shadow(0 0 12px rgba(251,191,36,0.82)) drop-shadow(0 0 3px rgba(251,191,36,0.55))",
  "drop-shadow(0 0 12px rgba(52,211,153,0.82)) drop-shadow(0 0 3px rgba(52,211,153,0.55))",
  "drop-shadow(0 0 12px rgba(232,121,249,0.82)) drop-shadow(0 0 3px rgba(232,121,249,0.55))",
];

/** HUD seat chips still use thin inset rings (unchanged pattern). */
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
  const dirU = tu;
  const dirV = tv;
  return {
    left: `M ${Lu0} ${Lv0} L ${Lu1} ${Lv1}`,
    right: `M ${Ru0} ${Rv0} L ${Ru1} ${Rv1}`,
    rungs,
    footU: A.u,
    footV: A.v,
    topU: B.u,
    topV: B.v,
    dirU,
    dirV,
    spanLen: len,
  };
}

/**
 * Cubic snake spine (head at fromN → tail at toN) + geometry for head marker.
 * @returns {{ d: string, hx: number, hy: number, tx: number; ty: number; tipX: number; tipY: number; bx1: number; by1: number; bx2: number; by2: number }}
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
  const tux = c1x - u1;
  const tuy = c1y - v1;
  const tlen = Math.hypot(tux, tuy) || 1;
  const tx = tux / tlen;
  const ty = tuy / tlen;
  const tipX = u1 + tx * 2.35;
  const tipY = v1 + ty * 2.35;
  const bx = u1 - tx * 0.75;
  const by = v1 - ty * 0.75;
  const px = -ty * 0.62;
  const py = tx * 0.62;
  const t2x = u2 - c2x;
  const t2y = v2 - c2y;
  const t2l = Math.hypot(t2x, t2y) || 1;
  const wx = t2x / t2l;
  const wy = t2y / t2l;
  const tailTipX = u2 + wx * 1.85;
  const tailTipY = v2 + wy * 1.85;
  const tailBx = u2 - wx * 0.72;
  const tailBy = v2 - wy * 0.72;
  const tpx = -wy * 0.52;
  const tpy = wx * 0.52;
  return {
    d,
    hx: u1,
    hy: v1,
    tx,
    ty,
    tipX,
    tipY,
    bx1: bx + px,
    by1: by + py,
    bx2: bx - px,
    by2: by - py,
    tailUx: u2,
    tailUy: v2,
    tailTipX,
    tailTipY,
    tailBx1: tailBx + tpx,
    tailBy1: tailBy + tpy,
    tailBx2: tailBx - tpx,
    tailBy2: tailBy - tpy,
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

function useEdgeLookups() {
  return useMemo(() => {
    const ladderFoot = new Set(Object.keys(SNAKES_BOARD_EDGES.ladders).map(Number));
    const ladderTop = new Set(Object.values(SNAKES_BOARD_EDGES.ladders));
    const snakeHead = new Set(Object.keys(SNAKES_BOARD_EDGES.snakes).map(Number));
    const snakeTail = new Set(Object.values(SNAKES_BOARD_EDGES.snakes));
    return { ladderFoot, ladderTop, snakeHead, snakeTail };
  }, []);
}

function Ov2SnakesEdgeOverlay() {
  const uid = useId().replace(/:/g, "");
  const gidRail = `ov2-sn-ladder-rail-${uid}`;
  const gidBelly = `ov2-sn-snake-belly-${uid}`;
  const { ladders, snakesSorted } = useMemo(() => {
    const lad = [];
    for (const [from, to] of Object.entries(SNAKES_BOARD_EDGES.ladders)) {
      const f = Number(from);
      const t = Number(to);
      lad.push({ key: `l-${from}`, fromN: f, ...ladderGeometry(f, t) });
    }
    lad.sort((a, b) => a.fromN - b.fromN);
    const sn = [];
    for (const [from, to] of Object.entries(SNAKES_BOARD_EDGES.snakes)) {
      const f = Number(from);
      const t = Number(to);
      sn.push({ key: `s-${from}`, fromN: f, ...snakeSpineGeometry(f, t) });
    }
    sn.sort((a, b) => b.approxLen - a.approxLen || a.fromN - b.fromN);
    return { ladders: lad, snakesSorted: sn };
  }, []);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
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
            <circle cx={s.hx} cy={s.hy} r="1.52" fill="#3f0d12" stroke="#fecdd3" strokeWidth="0.14" />
            <polygon
              points={`${s.tipX},${s.tipY} ${s.bx1},${s.by1} ${s.bx2},${s.by2}`}
              fill="#2b070a"
              stroke="#fecdd3"
              strokeWidth="0.11"
              strokeLinejoin="round"
            />
            <circle cx={s.tailUx} cy={s.tailUy} r="1.12" fill="#1a0507" stroke="#a8a29e" strokeWidth="0.12" />
            <polygon
              points={`${s.tailTipX},${s.tailTipY} ${s.tailBx1},${s.tailBy1} ${s.tailBx2},${s.tailBy2}`}
              fill="#292524"
              stroke="#d6d3d1"
              strokeWidth="0.09"
              strokeLinejoin="round"
            />
          </g>
        ))}
      </g>
    </svg>
  );
}

/** Compact 1–6 pip readout (visual only). */
function Ov2SnakesDiceFace({ value, emphasized }) {
  const n = value != null && Number.isFinite(Number(value)) ? Math.floor(Number(value)) : null;
  const active = n != null && n >= 1 && n <= 6;
  const pipCls =
    "block h-1.5 w-1.5 rounded-[1px] bg-zinc-100 shadow-[inset_0_-1px_1px_rgba(0,0,0,0.45)] sm:h-2 sm:w-2";
  const grid = emphasized
    ? "grid h-11 w-11 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-lg border border-amber-400/50 bg-gradient-to-b from-zinc-800 to-zinc-950 p-1.5 shadow-[0_0_16px_rgba(251,191,36,0.25)] sm:h-12 sm:w-12"
    : "grid h-9 w-9 shrink-0 grid-cols-3 grid-rows-3 gap-0.5 rounded-md border border-white/15 bg-gradient-to-b from-zinc-800 to-zinc-950 p-1 sm:h-10 sm:w-10";
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

function PawnWithTurnRing({ seat, turnSeat, dense }) {
  const isTurn = turnSeat === seat;
  const filt = SEAT_TURN_FILTER[seat] ?? SEAT_TURN_FILTER[1];
  const idle = "drop-shadow(0 2px 4px rgba(0,0,0,0.72))";
  const scIdle = dense ? "scale-[1.08]" : "scale-[1.12]";
  const scTurn = dense ? "scale-[1.14]" : "scale-[1.18]";
  return (
    <span
      className="relative flex h-full w-full max-h-full max-w-full items-center justify-center"
      style={{ filter: isTurn ? filt : idle }}
    >
      <img
        src={ludoPawnSrc(seat)}
        alt=""
        title={`Seat ${seat}`}
        draggable={false}
        className={`m-auto block h-full w-full max-h-full max-w-full origin-center object-contain ${isTurn ? scTurn : scIdle}`}
      />
    </span>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null }} props
 */
export default function Ov2SnakesScreen({ contextInput = null }) {
  const session = useOv2SnakesSession(contextInput ?? undefined);
  const { snap, err, rollBusy, roll, vaultClaimBusy, vaultClaimError, retryVaultClaim } = session;

  const room = contextInput?.room;
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const onLeaveToLobby = typeof contextInput?.onLeaveToLobby === "function" ? contextInput.onLeaveToLobby : null;
  const leaveToLobbyBusy = Boolean(contextInput?.leaveToLobbyBusy);

  const boardFitRef = useRef(null);
  const [boardSide, setBoardSide] = useState(260);

  useLayoutEffect(() => {
    const el = boardFitRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      const s = Math.max(168, Math.floor(Math.min(r.width, r.height) - 1));
      setBoardSide(s);
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const { ladderFoot, ladderTop, snakeHead, snakeTail } = useEdgeLookups();

  const positions = snap?.board && typeof snap.board === "object" && snap.board.positions && typeof snap.board.positions === "object" ? snap.board.positions : {};
  const phase = snap ? String(snap.phase || "").toLowerCase() : "";
  const finished = phase === "finished";
  const winnerSeat = snap?.winnerSeat != null ? snap.winnerSeat : null;
  const winnerPk =
    winnerSeat != null && memberBySeat.has(winnerSeat) ? String(memberBySeat.get(winnerSeat)?.participant_key || "") : "";

  const turnSeat = snap?.turnSeat != null ? snap.turnSeat : null;
  const mySeat = snap?.mySeat != null ? snap.mySeat : null;
  const lastRoll = snap?.lastRoll != null ? snap.lastRoll : null;

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between gap-1 border-b border-white/[0.06] px-0.5 py-0.5 sm:px-1">
        <p className="truncate text-[10px] font-semibold leading-tight text-zinc-200 sm:text-[11px]">
          Snakes &amp; Ladders
          {snap?.sessionId ? <span className="font-normal text-zinc-500"> · {snap.sessionId.slice(0, 8)}…</span> : null}
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {onLeaveToLobby ? (
            <button
              type="button"
              disabled={leaveToLobbyBusy}
              onClick={() => void onLeaveToLobby()}
              className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold text-zinc-200 disabled:opacity-45 sm:text-[10px]"
            >
              {leaveToLobbyBusy ? "…" : "Leave"}
            </button>
          ) : null}
          <Link
            href="/online-v2/rooms"
            className="rounded border border-sky-500/25 bg-sky-950/30 px-1.5 py-0.5 text-[9px] font-semibold text-sky-200/90 sm:text-[10px]"
            onClick={() => {
              try {
                window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
              } catch {
                /* ignore */
              }
            }}
          >
            Lobby
          </Link>
        </div>
      </div>

      {err ? <p className="shrink-0 truncate px-0.5 text-[10px] text-red-300">{err}</p> : null}

      {finished ? (
        <div className="shrink-0 rounded-md border border-emerald-500/30 bg-emerald-950/25 px-1.5 py-1 text-[10px] text-emerald-100">
          <span className="font-semibold text-emerald-50">Finished</span>
          <span className="text-emerald-200/90">
            {" "}
            ·
            {winnerSeat != null
              ? ` Seat ${winnerSeat}${winnerPk && winnerPk === pk ? " (you)" : ""}`
              : " Result recorded."}
          </span>
          {vaultClaimBusy ? <span className="text-emerald-200/75"> · Vault…</span> : null}
          {vaultClaimError ? (
            <span className="ml-1 inline-flex flex-wrap items-center gap-1">
              <span className="text-amber-200/95">{vaultClaimError}</span>
              <button
                type="button"
                className="rounded border border-amber-400/40 bg-amber-950/40 px-1 py-0 text-[9px] font-semibold text-amber-50"
                onClick={() => retryVaultClaim()}
              >
                Retry
              </button>
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-0.5 pb-0.5 pt-0.5 sm:gap-1 sm:px-1">
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-md border border-white/[0.07] bg-zinc-950/55 px-1 py-0.5 sm:px-1.5">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[9px] text-zinc-300 sm:text-[10px]">
            <span className="shrink-0 text-zinc-500">Turn</span>
            <span className="font-mono font-semibold text-zinc-50">{turnSeat != null ? turnSeat : "—"}</span>
            {mySeat != null ? (
              <>
                <span className="text-zinc-600">·</span>
                <span className="text-zinc-500">You</span>
                <span className="font-mono font-semibold text-zinc-50">{mySeat}</span>
              </>
            ) : null}
            <span className="text-zinc-600">·</span>
            <span className="text-zinc-500">Last</span>
            <Ov2SnakesDiceFace value={lastRoll} emphasized={Boolean(snap?.canRoll)} />
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {[0, 1, 2, 3].map(si => {
              const m = memberBySeat.get(si);
              const posRaw = positions[String(si)] ?? positions[si];
              const pos = posRaw != null ? Number(posRaw) : null;
              if (!m && !Number.isFinite(pos)) return null;
              const isTurn = turnSeat === si;
              return (
                <div
                  key={`hud-seat-${si}`}
                  className={`flex items-center gap-0.5 rounded-full bg-black/35 pl-0.5 pr-1 ring-inset ${
                    isTurn ? `ring-2 ${SEAT_TURN_RING[si] ?? "ring-amber-300/80"}` : "ring-1 ring-white/10"
                  }`}
                  title={m?.display_name || `Seat ${si}`}
                >
                  <img
                    src={ludoPawnSrc(si)}
                    alt=""
                    className="h-5 w-5 shrink-0 object-contain sm:h-6 sm:w-6"
                    draggable={false}
                  />
                  <span className="font-mono text-[9px] text-zinc-200 sm:text-[10px]">{Number.isFinite(pos) ? pos : "—"}</span>
                </div>
              );
            })}
            {!finished && snap?.canRoll ? (
              <button
                type="button"
                disabled={rollBusy}
                onClick={() => void roll()}
                className="ml-0.5 rounded-md border border-emerald-500/45 bg-emerald-900/50 px-2 py-0.5 text-[9px] font-bold text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] disabled:opacity-45 sm:text-[10px]"
              >
                {rollBusy ? "…" : "Roll"}
              </button>
            ) : !finished && snap ? (
              <span className="text-[9px] text-zinc-500 sm:text-[10px]">Wait…</span>
            ) : !snap ? (
              <span className="text-[9px] text-zinc-500 sm:text-[10px]">Load…</span>
            ) : null}
          </div>
        </div>

        <div ref={boardFitRef} className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden">
          <div
            className="relative overflow-hidden rounded-xl border border-amber-800/50 bg-gradient-to-br from-amber-950/62 via-zinc-900 to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07),0_16px_48px_rgba(0,0,0,0.52)] ring-2 ring-amber-700/28"
            style={{ width: boardSide, height: boardSide }}
          >
            <Ov2SnakesEdgeOverlay />
            <div className="relative z-[2] grid h-full w-full grid-cols-10 grid-rows-10 gap-px p-px">
              {Array.from({ length: 10 }, (_, row) => (
                <div key={`row-${row}`} className="contents">
                  {Array.from({ length: 10 }, (_, col) => {
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
                    return (
                      <div
                        key={`c-${row}-${col}`}
                        className={`relative flex min-h-0 min-w-0 overflow-hidden rounded-sm border text-[6px] font-bold leading-none sm:text-[7px] ${
                          isEnd
                            ? "border-emerald-500/45"
                            : isStart
                              ? "border-sky-500/40"
                              : "border-white/[0.06]"
                        } ${edgeBg}`}
                      >
                        <span
                          className="pointer-events-none absolute right-0 top-0 z-[6] px-0.5 py-px pr-0.5 text-[8px] font-bold tabular-nums leading-none sm:text-[9px]"
                          style={cellNumberStyle}
                        >
                          {n}
                        </span>
                        {occupants.length > 0 ? (
                          <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center">
                            {occupants.length === 1 ? (
                              <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center p-0">
                                <PawnWithTurnRing seat={occupants[0]} turnSeat={turnSeat} />
                              </div>
                            ) : (
                              <div className="grid h-full w-full min-h-0 min-w-0 grid-cols-2 grid-rows-2 place-items-center gap-0 p-0">
                                {occupants.map(s => (
                                  <div key={`o-${n}-${s}`} className="flex h-full w-full min-h-0 min-w-0 items-center justify-center">
                                    <PawnWithTurnRing seat={s} turnSeat={turnSeat} dense />
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-0.5 border-t border-white/[0.05] pt-0.5 text-[9px] text-zinc-500 sm:text-[10px]">
          {room?.pot_locked != null ? (
            <span>Pot {Math.floor(Number(room.pot_locked) || 0).toLocaleString()}</span>
          ) : (
            <span className="text-zinc-600">Gold chevron = climb start · Lime chevron = climb end</span>
          )}
        </div>
      </div>
    </div>
  );
}
