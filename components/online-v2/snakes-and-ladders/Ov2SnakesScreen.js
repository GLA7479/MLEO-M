"use client";

import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** Turn / identity accent (ring only — avoid stacking duplicate `ring-*` utilities). */
const SEAT_TURN_RING = ["ring-sky-400/90", "ring-amber-400/90", "ring-emerald-400/90", "ring-fuchsia-400/90"];

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
      const s = Math.max(168, Math.floor(Math.min(r.width, r.height) - 6));
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
            className="overflow-hidden rounded-xl border border-amber-900/35 bg-gradient-to-br from-amber-950/50 via-zinc-900 to-zinc-950 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05),0_8px_28px_rgba(0,0,0,0.45)]"
            style={{ width: boardSide, height: boardSide }}
          >
            <div className="grid h-full w-full grid-cols-10 grid-rows-10 gap-px p-px">
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
                        ? "bg-gradient-to-br from-emerald-900/55 to-emerald-950/80"
                        : isStart
                          ? "bg-gradient-to-br from-sky-900/45 to-sky-950/75"
                          : sh
                            ? "bg-gradient-to-br from-rose-950/55 to-zinc-900"
                            : lf
                              ? "bg-gradient-to-br from-lime-950/40 to-zinc-900"
                              : st
                                ? "bg-gradient-to-br from-rose-900/25 to-zinc-900"
                                : lt
                                  ? "bg-gradient-to-br from-lime-900/25 to-zinc-900"
                                  : "bg-zinc-900/85";
                    const edgeMark =
                      lf || sh ? (
                        <span
                          className={`pointer-events-none absolute left-0.5 top-0.5 text-[7px] leading-none sm:text-[8px] ${sh ? "text-rose-200/90" : "text-lime-200/90"}`}
                          aria-hidden
                        >
                          {sh ? "⌇" : "⌗"}
                        </span>
                      ) : null;
                    return (
                      <div
                        key={`c-${row}-${col}`}
                        className={`relative flex min-h-0 min-w-0 flex-col items-center justify-between rounded-sm border px-px pb-px pt-0.5 text-[6px] font-semibold leading-none text-zinc-500 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] sm:text-[7px] ${
                          isEnd
                            ? "border-emerald-500/50 text-emerald-100/90"
                            : isStart
                              ? "border-sky-500/45 text-sky-100/90"
                              : "border-white/[0.05]"
                        } ${edgeBg}`}
                      >
                        {edgeMark}
                        <span className={`z-[1] ${isEnd || isStart ? "opacity-95" : "opacity-70"}`}>{n}</span>
                        <div
                          className={`z-[1] flex w-full flex-1 items-center justify-center ${
                            occupants.length > 1 ? "grid grid-cols-2 place-items-center gap-px px-px" : ""
                          }`}
                        >
                          {occupants.length <= 1
                            ? occupants.map(s => (
                                <img
                                  key={`o-${n}-${s}`}
                                  src={ludoPawnSrc(s)}
                                  alt=""
                                  title={`Seat ${s}`}
                                  draggable={false}
                                  className={`max-h-[42%] max-w-[55%] object-contain ${
                                    turnSeat === s ? `rounded-full ring-2 ${SEAT_TURN_RING[s] ?? "ring-amber-300/80"}` : ""
                                  }`}
                                />
                              ))
                            : occupants.map(s => (
                                <img
                                  key={`o-${n}-${s}`}
                                  src={ludoPawnSrc(s)}
                                  alt=""
                                  title={`Seat ${s}`}
                                  draggable={false}
                                  className={`h-[38%] w-[38%] max-w-[48%] object-contain ${
                                    turnSeat === s ? `rounded-full ring-2 ${SEAT_TURN_RING[s] ?? "ring-amber-300/80"}` : ""
                                  }`}
                                />
                              ))}
                        </div>
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
            <span className="text-zinc-600">1–100 · ladders climb · snakes slide</span>
          )}
        </div>
      </div>
    </div>
  );
}
