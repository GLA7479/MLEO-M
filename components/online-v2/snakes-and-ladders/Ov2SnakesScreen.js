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

/** Turn / identity accent (ring only). */
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

function ladderPathD(u1, v1, u2, v2) {
  return `M ${u1} ${v1} L ${u2} ${v2}`;
}

/** Curved snake path (head → tail) for a readable S-bend. */
function snakePathD(u1, v1, u2, v2) {
  const mx = (u1 + u2) / 2;
  const my = (v1 + v2) / 2;
  const dx = u2 - u1;
  const dy = v2 - v1;
  const len = Math.hypot(dx, dy) || 1;
  const sag = Math.min(11, Math.max(3.2, len * 0.14));
  const nx = -dy / len;
  const ny = dx / len;
  const cx = mx + nx * sag;
  const cy = my + ny * sag;
  return `M ${u1} ${v1} Q ${cx} ${cy} ${u2} ${v2}`;
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
  const flL = `ov2-snakes-ladder-glow-${uid}`;
  const flS = `ov2-snakes-snake-glow-${uid}`;
  const { ladderPaths, snakePaths } = useMemo(() => {
    const ladders = [];
    for (const [from, to] of Object.entries(SNAKES_BOARD_EDGES.ladders)) {
      const a = cellCenterUv(Number(from));
      const b = cellCenterUv(Number(to));
      ladders.push({ key: `l-${from}`, d: ladderPathD(a.u, a.v, b.u, b.v) });
    }
    const snakes = [];
    for (const [from, to] of Object.entries(SNAKES_BOARD_EDGES.snakes)) {
      const a = cellCenterUv(Number(from));
      const b = cellCenterUv(Number(to));
      snakes.push({ key: `s-${from}`, d: snakePathD(a.u, a.v, b.u, b.v) });
    }
    return { ladderPaths: ladders, snakePaths: snakes };
  }, []);

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-[1] h-full w-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <defs>
        <filter id={flL} x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.55" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id={flS} x="-25%" y="-25%" width="150%" height="150%">
          <feGaussianBlur stdDeviation="0.65" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {ladderPaths.map(({ key, d }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke="rgba(250,250,250,0.22)"
          strokeWidth={1.15}
          strokeLinecap="round"
        />
      ))}
      {ladderPaths.map(({ key, d }) => (
        <path
          key={`${key}-lime`}
          d={d}
          fill="none"
          stroke="#a3e635"
          strokeWidth={0.85}
          strokeLinecap="round"
          strokeOpacity={0.95}
          filter={`url(#${flL})`}
        />
      ))}
      {snakePaths.map(({ key, d }) => (
        <path
          key={key}
          d={d}
          fill="none"
          stroke="rgba(15,15,18,0.55)"
          strokeWidth={1.55}
          strokeLinecap="round"
        />
      ))}
      {snakePaths.map(({ key, d }) => (
        <path
          key={`${key}-rose`}
          d={d}
          fill="none"
          stroke="#fb7185"
          strokeWidth={1.05}
          strokeLinecap="round"
          strokeOpacity={0.94}
          filter={`url(#${flS})`}
        />
      ))}
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

function PawnWithTurnRing({ seat, turnSeat }) {
  const isTurn = turnSeat === seat;
  const ring = SEAT_TURN_RING[seat] ?? "ring-amber-300/85";
  return (
    <span
      className={`flex h-full w-full max-h-full max-w-full items-center justify-center rounded-full ${
        isTurn
          ? `scale-[1.05] shadow-[0_0_14px_rgba(255,255,255,0.14)] ring-[3px] ring-offset-[2px] ring-offset-black/45 ${ring}`
          : "shadow-[0_2px_8px_rgba(0,0,0,0.55)] ring-1 ring-black/35"
      }`}
    >
      <img
        src={ludoPawnSrc(seat)}
        alt=""
        title={`Seat ${seat}`}
        draggable={false}
        className="block h-full w-full max-h-full max-w-full object-contain"
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
      const s = Math.max(168, Math.floor(Math.min(r.width, r.height) - 2));
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
            className="relative overflow-hidden rounded-xl border border-amber-800/40 bg-gradient-to-br from-amber-950/55 via-zinc-900 to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06),0_14px_44px_rgba(0,0,0,0.5)] ring-2 ring-amber-700/20"
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
                    return (
                      <div
                        key={`c-${row}-${col}`}
                        className={`relative flex min-h-0 min-w-0 overflow-hidden rounded-sm border text-[6px] font-bold leading-none sm:text-[7px] ${
                          isEnd
                            ? "border-emerald-500/45 text-emerald-100/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
                            : isStart
                              ? "border-sky-500/40 text-sky-100/95 [text-shadow:0_1px_2px_rgba(0,0,0,0.85)]"
                              : "border-white/[0.06] text-zinc-400 [text-shadow:0_1px_2px_rgba(0,0,0,0.75)]"
                        } ${edgeBg}`}
                      >
                        <span className="pointer-events-none absolute left-0 right-0 top-0.5 z-[4] text-center">{n}</span>
                        {occupants.length > 0 ? (
                          <div className="pointer-events-none absolute inset-0 z-[3] flex items-center justify-center pt-[11px] sm:pt-[12px]">
                            {occupants.length === 1 ? (
                              <div className="flex h-[92%] w-[92%] items-center justify-center">
                                <PawnWithTurnRing seat={occupants[0]} turnSeat={turnSeat} />
                              </div>
                            ) : (
                              <div className="grid h-[90%] w-[90%] max-w-full grid-cols-2 grid-rows-2 place-items-center gap-[1px] px-px">
                                {occupants.map(s => (
                                  <div key={`o-${n}-${s}`} className="flex h-[92%] w-[92%] items-center justify-center">
                                    <PawnWithTurnRing seat={s} turnSeat={turnSeat} />
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
            <span className="text-zinc-600">Lime rails = ladders · Rose curves = snakes</span>
          )}
        </div>
      </div>
    </div>
  );
}
