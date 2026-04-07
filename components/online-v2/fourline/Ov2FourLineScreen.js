"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  fourLineColumnPlayable,
  OV2_FOURLINE_COLS,
  OV2_FOURLINE_ROWS,
  parseFourLineCells,
} from "../../../lib/online-v2/fourline/ov2FourLineClientLegality";
import { useOv2FourLineSession } from "../../../hooks/useOv2FourLineSession";

const finishDismissStorageKey = sid => `ov2_fl_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

const DROP_MS = 155;
const WIN_FREEZE_MS = 280;
const MOVE_PULSE_MS = 220;

/** @param {(null|0|1)[]} cells @param {number} row @param {number} col @param {0|1} seat */
function fourLineWinningIndicesFromLastMove(cells, row, col, seat) {
  if (!Number.isInteger(row) || !Number.isInteger(col)) return [];
  const idx = row * OV2_FOURLINE_COLS + col;
  if (cells[idx] !== seat) return [];
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ];
  for (const [dr, dc] of dirs) {
    const line = [];
    let r = row;
    let c = col;
    while (r >= 0 && r < OV2_FOURLINE_ROWS && c >= 0 && c < OV2_FOURLINE_COLS && cells[r * OV2_FOURLINE_COLS + c] === seat) {
      line.push(r * OV2_FOURLINE_COLS + c);
      r -= dr;
      c -= dc;
    }
    r = row + dr;
    c = col + dc;
    while (r >= 0 && r < OV2_FOURLINE_ROWS && c >= 0 && c < OV2_FOURLINE_COLS && cells[r * OV2_FOURLINE_COLS + c] === seat) {
      line.push(r * OV2_FOURLINE_COLS + c);
      r += dr;
      c += dc;
    }
    if (line.length >= 4) return line;
  }
  return [];
}

/**
 * @param {{ seat: null|0|1, hideDisc?: boolean, isWinning?: boolean, pulseWin?: boolean }} props
 */
function CellDisc({ seat, hideDisc = false, isWinning = false, pulseWin = false }) {
  const hole = (
    <div
      className={`relative flex aspect-square w-full max-w-[3rem] items-center justify-center rounded-full sm:max-w-none ${
        isWinning
          ? "shadow-[inset_0_2px_6px_rgba(0,0,0,0.55),inset_0_-1px_0_rgba(255,255,255,0.06),0_0_0_2px_rgba(52,211,153,0.45)]"
          : "shadow-[inset_0_3px_8px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.05)]"
      } ${pulseWin ? "animate-pulse" : ""}`}
      style={{ background: "radial-gradient(ellipse at 50% 35%, rgba(39,39,42,0.55) 0%, rgba(9,9,11,0.92) 55%, rgba(0,0,0,0.45) 100%)" }}
    >
      {seat === 0 || seat === 1 ? (
        <div
          className={`absolute inset-[10%] rounded-full border border-black/25 transition-opacity duration-75 ${
            seat === 0
              ? "bg-gradient-to-b from-sky-300/95 to-blue-700/95 shadow-[0_3px_8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.22)]"
              : "bg-gradient-to-b from-amber-200/95 to-yellow-600/95 shadow-[0_3px_8px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.2)]"
          } ${hideDisc ? "opacity-0" : "opacity-100"}`}
        />
      ) : null}
    </div>
  );
  return hole;
}

/** @param {{ seat: 0|1, className?: string }} props */
function GhostOrMiniDisc({ seat, className = "" }) {
  const cls =
    seat === 0
      ? "bg-gradient-to-b from-sky-300/90 to-blue-700/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
      : "bg-gradient-to-b from-amber-200/90 to-yellow-600/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]";
  return (
    <div
      className={`pointer-events-none aspect-square w-[42%] max-w-[1.65rem] rounded-full border border-black/20 opacity-75 ${cls} ${className}`}
      aria-hidden
    />
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2FourLineScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2FourLineSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    playColumn,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const cells = useMemo(() => parseFourLineCells(vm.cells), [vm.cells]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  const onColumn = useCallback(
    async col => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      if (!fourLineColumnPlayable(col, cells)) {
        setErr("That column is full.");
        return;
      }
      setErr("");
      await playColumn(col);
    },
    [vm, busy, vaultClaimBusy, cells, playColumn, setErr]
  );

  const onRematch = useCallback(async () => {
    if (!roomId || rematchBusy) return;
    setRematchBusy(true);
    setErr("");
    try {
      const r = await requestRematch();
      if (!r.ok) setErr(r.error || "Rematch request failed");
    } finally {
      setRematchBusy(false);
    }
  }, [roomId, rematchBusy, requestRematch, setErr]);

  const onStartNext = useCallback(async () => {
    if (!roomId || !isHost || startNextBusy) return;
    setStartNextBusy(true);
    setErr("");
    try {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        setErr(r.error || "Could not start next match");
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
        } catch {
          /* ignore */
        }
      }
      if (typeof onSessionRefresh === "function") {
        const prev = snapshot?.sessionId != null ? String(snapshot.sessionId) : "";
        await onSessionRefresh(prev, "", { expectClearedSession: true });
      }
      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
    } finally {
      setStartNextBusy(false);
    }
  }, [
    roomId,
    isHost,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    onSessionRefresh,
    snapshot?.sessionId,
    router,
    setErr,
  ]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !pk || exitBusy) return;
    setExitBusy(true);
    setExitErr("");
    try {
      await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: pk });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      await router.push("/online-v2/rooms");
    } catch (e) {
      setExitErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setExitBusy(false);
    }
  }, [roomId, pk, exitBusy, room, router]);

  const finished = vm.phase === "finished";
  const finishSessionId = finished ? String(vm.sessionId || "").trim() : "";
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
  const showResultModal = finished && finishSessionId.length > 0 && !finishModalDismissed;
  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const isDraw = finished && vm.winnerSeat == null;

  const myColorLabel = vm.mySeat === 0 ? "Blue" : vm.mySeat === 1 ? "Gold" : "—";
  const oppColorLabel = vm.mySeat === 0 ? "Gold" : vm.mySeat === 1 ? "Blue" : "—";

  const canPickColumn =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    !vm.mustRespondDouble &&
    !busy &&
    !vaultClaimBusy;

  const [hoverCol, setHoverCol] = useState(/** @type {number|null} */ (null));
  const [movePulseCol, setMovePulseCol] = useState(/** @type {number|null} */ (null));
  const [dropAnim, setDropAnim] = useState(
    /** @type {null | { key: string; row: number; col: number; seat: 0|1 }} */ (null)
  );
  const [dropTranslatePx, setDropTranslatePx] = useState(0);
  const [winFreeze, setWinFreeze] = useState(false);
  const [cellStridePx, setCellStridePx] = useState(0);
  const prevRevisionRef = useRef(/** @type {number|null} */ (null));
  const prevLmKeyRef = useRef("");
  const lmPulseInitRef = useRef(false);
  const prevPhaseRef = useRef("");
  const firstCellRef = useRef(/** @type {HTMLDivElement|null} */ (null));

  const indicatorSeat = useMemo(() => {
    if (vm.phase !== "playing") return null;
    if (vm.mustRespondDouble && vm.pendingDouble?.responder_seat != null) {
      const rs = Number(vm.pendingDouble.responder_seat);
      if (rs === 0 || rs === 1) return rs;
    }
    const t = vm.turnSeat;
    return t === 0 || t === 1 ? t : null;
  }, [vm.phase, vm.mustRespondDouble, vm.pendingDouble, vm.turnSeat]);

  const winHighlightSet = useMemo(() => {
    if (vm.phase !== "finished" || vm.winnerSeat == null) return null;
    const w = vm.winnerSeat;
    const lm = vm.lastMove;
    if (!lm || lm.row == null || lm.col == null) return null;
    const idxs = fourLineWinningIndicesFromLastMove(cells, lm.row, lm.col, w);
    return idxs.length >= 4 ? new Set(idxs) : null;
  }, [vm.phase, vm.winnerSeat, vm.lastMove, cells]);

  useEffect(() => {
    prevRevisionRef.current = null;
    prevLmKeyRef.current = "";
    lmPulseInitRef.current = false;
    prevPhaseRef.current = "";
  }, [vm.sessionId]);

  useEffect(() => {
    if (prevRevisionRef.current === null) {
      prevRevisionRef.current = vm.revision;
      return;
    }
    if (vm.revision === prevRevisionRef.current) return;
    prevRevisionRef.current = vm.revision;
    const lm = vm.lastMove;
    if (!lm || lm.row == null || lm.col == null) return;
    const seat = cells[lm.row * OV2_FOURLINE_COLS + lm.col];
    if (seat !== 0 && seat !== 1) return;
    const key = `${vm.revision}-${lm.row}-${lm.col}`;
    setDropAnim({ key, row: lm.row, col: lm.col, seat });
    const t = window.setTimeout(() => setDropAnim(null), DROP_MS);
    return () => clearTimeout(t);
  }, [vm.revision, vm.lastMove, cells]);

  useEffect(() => {
    if (!dropAnim) {
      setDropTranslatePx(0);
      return;
    }
    setDropTranslatePx(0);
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setDropTranslatePx(dropAnim.row * cellStridePx);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [dropAnim, cellStridePx]);

  useEffect(() => {
    const lm = vm.lastMove;
    if (!lm || lm.row == null || lm.col == null) return;
    const key = `${vm.revision}-${lm.row}-${lm.col}`;
    if (!lmPulseInitRef.current) {
      lmPulseInitRef.current = true;
      prevLmKeyRef.current = key;
      return;
    }
    if (key === prevLmKeyRef.current) return;
    prevLmKeyRef.current = key;
    setMovePulseCol(lm.col);
    const t = window.setTimeout(() => setMovePulseCol(null), MOVE_PULSE_MS);
    return () => clearTimeout(t);
  }, [vm.lastMove, vm.revision]);

  useEffect(() => {
    const p = vm.phase;
    const was = prevPhaseRef.current;
    prevPhaseRef.current = p;
    if (p === "finished" && vm.winnerSeat != null && was !== "finished") {
      setWinFreeze(true);
      const t = window.setTimeout(() => setWinFreeze(false), WIN_FREEZE_MS);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [vm.phase, vm.winnerSeat, vm.sessionId]);

  useLayoutEffect(() => {
    const el = firstCellRef.current;
    if (!el) return undefined;
    const measure = () => {
      const h = el.getBoundingClientRect().height;
      const wrap = el.closest("[data-fl-cells]");
      let gap = 4;
      if (wrap && wrap instanceof HTMLElement) {
        const g = window.getComputedStyle(wrap).gap;
        const parsed = parseFloat(g);
        if (Number.isFinite(parsed)) gap = parsed;
      }
      setCellStridePx(Math.max(0, Math.round(h + gap)));
    };
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [cells]);

  const ghostSeat =
    vm.phase === "playing" && !vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
      ? indicatorSeat
      : null;

  const lastMoveSeatForPulse = useMemo(() => {
    const lm = vm.lastMove;
    if (!lm || lm.row == null || lm.col == null) return null;
    const s = cells[lm.row * OV2_FOURLINE_COLS + lm.col];
    return s === 0 || s === 1 ? s : null;
  }, [vm.lastMove, cells]);

  const turnBoardGlow =
    vm.phase === "playing" && !vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
      ? indicatorSeat === 0
        ? "shadow-[0_0_0_2px_rgba(56,189,248,0.38),0_0_36px_rgba(56,189,248,0.14)]"
        : "shadow-[0_0_0_2px_rgba(251,191,36,0.35),0_0_36px_rgba(245,158,11,0.12)]"
      : vm.phase === "playing" && vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
        ? indicatorSeat === 0
          ? "shadow-[0_0_0_2px_rgba(56,189,248,0.32),0_0_28px_rgba(56,189,248,0.1)]"
          : "shadow-[0_0_0_2px_rgba(251,191,36,0.3),0_0_28px_rgba(245,158,11,0.09)]"
        : "";

  const finishedActions = (
    <div className="flex flex-wrap justify-center gap-1.5">
      <button type="button" disabled={rematchBusy} onClick={() => void onRematch()} className={BTN_PRIMARY}>
        {rematchBusy ? "…" : "Rematch"}
      </button>
      <button type="button" onClick={() => void cancelRematch()} className={BTN_SECONDARY}>
        Cancel rematch
      </button>
      {isHost ? (
        <button type="button" disabled={startNextBusy} onClick={() => void onStartNext()} className={BTN_ACCENT}>
          {startNextBusy ? "…" : "Start next (host)"}
        </button>
      ) : null}
    </div>
  );

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Board full — stakes refunded";
    if (didIWin) return "Four in a row";
    return "Opponent connected four";
  }, [finished, isDraw, didIWin]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    const at = vm.chipsPerSeatAtStake;
    const pot = vm.chipsPrizeTotal;
    if (at == null || pot == null) return { text: "—", className: "text-zinc-500" };
    if (isDraw) return { text: `+${at} chips`, className: "font-semibold tabular-nums text-emerald-300/95" };
    if (didIWin) return { text: `+${pot} chips`, className: "font-semibold tabular-nums text-amber-200/95" };
    return { text: `−${at} chips`, className: "font-semibold tabular-nums text-rose-300/95" };
  }, [finished, vaultClaimBusy, vm.chipsPerSeatAtStake, vm.chipsPrizeTotal, isDraw, didIWin]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-1 overflow-hidden bg-zinc-950 px-1 pb-1.5 sm:gap-1 sm:px-2 sm:pb-2">
      <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.5rem]">
        <div className="rounded-lg border border-white/[0.08] bg-zinc-950/50 px-2 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex items-center rounded-md border px-2 py-1 tabular-nums ${
                vm.phase === "playing" &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/38 bg-amber-950/50 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/65 text-zinc-400"
              }`}
            >
              {vm.phase === "playing" && vm.turnTimeLeftSec != null ? (
                <span>
                  <span className="font-medium uppercase text-zinc-500">Timer</span>{" "}
                  <span className="font-semibold text-zinc-100">~{vm.turnTimeLeftSec}s</span>
                </span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="rounded border border-white/10 px-2 py-0.5 text-zinc-300">
                Table ×{vm.stakeMultiplier}
              </span>
              <span className="hidden rounded border border-white/10 px-2 py-0.5 sm:inline">
                You: {myColorLabel}
              </span>
              <span className="hidden rounded border border-white/10 px-2 py-0.5 sm:inline">
                Opponent: {oppColorLabel}
              </span>
            </div>
            {vaultClaimBusy ? (
              <span className="rounded-md border border-sky-500/18 bg-sky-950/35 px-2 py-0.5 text-[10px] text-sky-100/88">
                Settlement…
              </span>
            ) : null}
          </div>
        </div>
        {err ? (
          <div className="rounded-md border border-red-500/20 bg-red-950/20 px-2 py-1.5 text-[11px] text-red-200/95">
            <span>{err}</span>{" "}
            <button type="button" className="text-red-300 underline" onClick={() => setErr("")}>
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto">
        {vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble ? (
          <div className="rounded-lg border border-amber-500/25 bg-amber-950/25 p-2">
            <p className="text-[11px] text-amber-100/90">
              Opponent proposes table ×{String(vm.pendingDouble.proposed_mult ?? "")}. Declining or timing out ends the round at
              the current ×{vm.stakeMultiplier}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button type="button" disabled={busy} className={BTN_PRIMARY} onClick={() => void respondDouble(true)}>
                Accept ×{String(vm.pendingDouble.proposed_mult ?? "")}
              </button>
              <button type="button" disabled={busy} className={BTN_DANGER} onClick={() => void respondDouble(false)}>
                Decline
              </button>
            </div>
          </div>
        ) : null}

        <div
          className={`mx-auto w-full max-w-md rounded-xl border border-white/[0.08] bg-zinc-950/78 p-2 transition-[transform,opacity,box-shadow] duration-200 sm:max-w-lg sm:p-3 md:max-w-xl ${turnBoardGlow} ${
            winFreeze ? "scale-[0.99] opacity-[0.93]" : "scale-100 opacity-100"
          }`}
        >
          <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
            <span
              className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-black/20 align-middle shadow-sm ${
                indicatorSeat === 0
                  ? "bg-gradient-to-b from-sky-300 to-blue-600"
                  : indicatorSeat === 1
                    ? "bg-gradient-to-b from-amber-200 to-yellow-600"
                    : "bg-zinc-700/80"
              }`}
              aria-hidden
            />
            Board{" "}
            <span className="font-normal normal-case text-zinc-500/85">· drop to connect four</span>
          </p>
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 md:gap-2">
            {Array.from({ length: OV2_FOURLINE_COLS }, (_, c) => {
              const playable = canPickColumn && fourLineColumnPlayable(c, cells);
              const showGhost =
                hoverCol === c &&
                ghostSeat != null &&
                vm.phase === "playing" &&
                !vm.mustRespondDouble &&
                fourLineColumnPlayable(c, cells);
              const hoverTintSeat =
                hoverCol === c &&
                ghostSeat != null &&
                vm.phase === "playing" &&
                !vm.mustRespondDouble &&
                fourLineColumnPlayable(c, cells)
                  ? ghostSeat
                  : null;
              const pulseTintSeat = movePulseCol === c && hoverCol !== c ? lastMoveSeatForPulse : null;
              const tintSeat = hoverTintSeat ?? pulseTintSeat;
              const colTint =
                tintSeat === 0 ? "bg-sky-500/14" : tintSeat === 1 ? "bg-amber-400/11" : "bg-transparent";
              return (
                <div
                  key={c}
                  data-fl-col
                  className={`relative flex min-w-0 flex-col gap-1 rounded-md transition-[background-color] duration-150 ${colTint}`}
                  onPointerEnter={() => {
                    if (vm.phase !== "playing" || vm.mustRespondDouble) return;
                    setHoverCol(c);
                  }}
                  onPointerLeave={() => setHoverCol(null)}
                >
                  <button
                    type="button"
                    disabled={!playable}
                    aria-label={`Play column ${c + 1}`}
                    onClick={() => void onColumn(c)}
                    className={`relative z-10 flex h-9 min-h-[2.25rem] items-center justify-center rounded-md border text-[11px] font-bold transition sm:h-10 ${
                      playable
                        ? "border-sky-500/35 bg-sky-950/40 text-sky-100 active:scale-[0.97]"
                        : "cursor-not-allowed border-white/[0.06] bg-zinc-950/40 text-zinc-600 opacity-50"
                    }`}
                  >
                    ▼
                  </button>
                  <div className="relative flex min-h-0 flex-col gap-1" data-fl-cells>
                    {showGhost ? (
                      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[15] flex justify-center">
                        <GhostOrMiniDisc seat={ghostSeat} />
                      </div>
                    ) : null}
                    {dropAnim && dropAnim.col === c && cellStridePx > 0 ? (
                      <div
                        className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center"
                        style={{
                          transform: `translateY(${dropTranslatePx}px)`,
                          transition:
                            dropTranslatePx === 0
                              ? "none"
                              : `transform ${DROP_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`,
                        }}
                      >
                        <div
                          className={`aspect-square w-[55%] max-w-[2.75rem] rounded-full border border-black/25 sm:w-[58%] sm:max-w-none ${
                            dropAnim.seat === 0
                              ? "bg-gradient-to-b from-sky-300/95 to-blue-700/95 shadow-[0_4px_10px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.22)]"
                              : "bg-gradient-to-b from-amber-200/95 to-yellow-600/95 shadow-[0_4px_10px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.2)]"
                          }`}
                        />
                      </div>
                    ) : null}
                    {Array.from({ length: OV2_FOURLINE_ROWS }, (_, ri) => {
                      const r = ri;
                      const idx = r * OV2_FOURLINE_COLS + c;
                      const v = cells[idx];
                      const hideDrop =
                        Boolean(dropAnim && dropAnim.row === r && dropAnim.col === c) && cellStridePx > 0;
                      const isWin = winHighlightSet != null && winHighlightSet.has(idx);
                      return (
                        <div
                          key={r}
                          ref={c === 0 && r === 0 ? firstCellRef : undefined}
                          className="min-w-0 px-0.5"
                        >
                          <CellDisc
                            seat={v}
                            hideDisc={hideDrop}
                            isWinning={isWin}
                            pulseWin={isWin}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500 sm:hidden">
            You {myColorLabel} · Opponent {oppColorLabel}
          </p>
        </div>

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble ? (
          <div className="flex flex-wrap gap-2">
            {vm.canOfferDouble ? (
              <button type="button" disabled={busy} className={BTN_ACCENT} onClick={() => void offerDouble()}>
                Increase table stake
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="mt-auto flex flex-col gap-1 border-t border-white/[0.06] pt-2 text-[10px] text-zinc-500">
          <p>
            Missed turns: you {vm.mySeat != null ? vm.missedStreakBySeat[vm.mySeat] ?? 0 : "—"} · opponent{" "}
            {vm.mySeat === 0 ? vm.missedStreakBySeat[1] : vm.mySeat === 1 ? vm.missedStreakBySeat[0] : "—"}
          </p>
          <button
            type="button"
            disabled={exitBusy || !pk}
            className="w-fit text-sky-300 underline disabled:opacity-45"
            onClick={() => void onExitToLobby()}
          >
            {exitBusy ? "Leaving…" : "Leave table"}
          </button>
          {exitErr ? <span className="text-red-300">{exitErr}</span> : null}
        </div>
      </div>

      {showResultModal ? (
        <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/55 p-2 sm:items-center">
          <div
            className="w-full max-w-[min(100%,17.5rem)] rounded-xl border border-white/[0.08] bg-zinc-950/96 p-3 shadow-2xl backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
          >
            <p className="text-center text-base font-bold tracking-tight text-zinc-50">
              {isDraw ? "Draw" : didIWin ? "You won" : "You lost"}
            </p>
            <p className="mt-1 text-center text-[10px] font-medium text-zinc-500">Table ×{vm.stakeMultiplier}</p>
            <p className={`mt-2 text-center text-lg ${finishAmountLine.className}`}>{finishAmountLine.text}</p>
            <p className="mt-1 text-center text-[10px] leading-snug text-zinc-400">{finishReasonLine}</p>
            <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
              {vaultClaimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
            </p>
            <div className="mt-3">{finishedActions}</div>
            <button
              type="button"
              className="mt-2 w-full rounded-lg border border-white/10 py-1.5 text-[11px] text-zinc-300"
              onClick={() => {
                setFinishModalDismissedSessionId(finishSessionId);
                try {
                  window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
                } catch {
                  /* ignore */
                }
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
