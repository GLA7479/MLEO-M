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
 * @param {{ seat: null|0|1, hideDisc?: boolean, isWinning?: boolean }} props
 */
function CellDisc({ seat, hideDisc = false, isWinning = false }) {
  const hole = (
    <div
      className={`relative flex aspect-square w-full max-w-[3.25rem] items-center justify-center rounded-full sm:max-w-none ${
        isWinning
          ? "shadow-[inset_0_3px_10px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(52,211,153,0.38),0_0_12px_rgba(45,212,191,0.14)]"
          : "shadow-[inset_0_3px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.1),inset_0_-2px_4px_rgba(0,0,0,0.35)]"
      }`}
      style={{
        background: isWinning
          ? "radial-gradient(ellipse at 50% 34%, rgba(55,55,62,0.75) 0%, rgba(22,22,26,0.97) 52%, rgba(8,8,10,0.92) 100%)"
          : "radial-gradient(ellipse at 50% 32%, rgba(72,73,82,0.88) 0%, rgba(35,36,42,0.98) 45%, rgba(18,18,22,1) 100%)",
      }}
    >
      {seat === 0 || seat === 1 ? (
        <div
          className={`absolute inset-[10%] rounded-full border transition-opacity duration-75 ${
            seat === 0
              ? "border-sky-300/25 bg-gradient-to-b from-sky-100 to-blue-800 shadow-[0_2px_8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.32),inset_0_-1px_0_rgba(15,23,42,0.45)]"
              : "border-amber-300/22 bg-gradient-to-b from-amber-50 to-amber-700 shadow-[0_2px_8px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.3),inset_0_-1px_0_rgba(120,53,15,0.35)]"
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
      ? "border-sky-400/35 bg-gradient-to-b from-sky-100/85 to-blue-800/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)]"
      : "border-amber-400/28 bg-gradient-to-b from-amber-50/85 to-amber-700/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.24)]";
  return (
    <div
      className={`pointer-events-none aspect-square w-[42%] max-w-[1.65rem] rounded-full opacity-75 ${cls} ${className}`}
      aria-hidden
    />
  );
}

/**
 * @param {{
 *   seat0Label: string,
 *   seat1Label: string,
 *   mySeat: null|0|1,
 *   indicatorSeat: null|0|1,
 *   phase: string,
 *   mustRespondDouble: boolean,
 * }} props
 */
function FourLinePlayerHeader({ seat0Label, seat1Label, mySeat, indicatorSeat, phase, mustRespondDouble }) {
  const playing = phase === "playing";
  const active0 = playing && indicatorSeat === 0;
  const active1 = playing && indicatorSeat === 1;
  return (
    <div className="grid w-full grid-cols-2 gap-1.5 sm:gap-2">
      <div
        className={`min-w-0 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-2 ${
          active0
            ? "border-sky-400/45 bg-gradient-to-br from-sky-950/55 to-zinc-900/90 shadow-[0_0_0_1px_rgba(56,189,248,0.2)]"
            : "border-white/[0.1] bg-zinc-900/55"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-6 w-6 shrink-0 rounded-full border border-sky-400/25 bg-gradient-to-b from-sky-200 to-blue-700 shadow-sm"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-200/95">Blue</span>
              {mySeat === 0 ? (
                <span className="rounded bg-sky-500/25 px-1 py-px text-[9px] font-semibold uppercase text-sky-100">You</span>
              ) : mySeat === 1 ? (
                <span className="rounded bg-zinc-700/50 px-1 py-px text-[9px] font-medium text-zinc-400">Foe</span>
              ) : null}
            </div>
            <p className="truncate text-[11px] font-medium leading-tight text-zinc-100 sm:text-xs" title={seat0Label}>
              {seat0Label}
            </p>
          </div>
        </div>
        <div className="mt-1 flex min-h-[1.125rem] items-end">
          {active0 ? (
            <p className="text-[9px] font-semibold uppercase tracking-wide text-sky-300/95">
              {mustRespondDouble ? "Respond" : "Turn"}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={`min-w-0 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-2 ${
          active1
            ? "border-amber-400/45 bg-gradient-to-br from-amber-950/45 to-zinc-900/90 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]"
            : "border-white/[0.1] bg-zinc-900/55"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span
            className="h-6 w-6 shrink-0 rounded-full border border-amber-400/25 bg-gradient-to-b from-amber-100 to-amber-700 shadow-sm"
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-200/95">Gold</span>
              {mySeat === 1 ? (
                <span className="rounded bg-amber-500/25 px-1 py-px text-[9px] font-semibold uppercase text-amber-100">You</span>
              ) : mySeat === 0 ? (
                <span className="rounded bg-zinc-700/50 px-1 py-px text-[9px] font-medium text-zinc-400">Foe</span>
              ) : null}
            </div>
            <p className="truncate text-[11px] font-medium leading-tight text-zinc-100 sm:text-xs" title={seat1Label}>
              {seat1Label}
            </p>
          </div>
        </div>
        <div className="mt-1 flex min-h-[1.125rem] items-end">
          {active1 ? (
            <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-300/95">
              {mustRespondDouble ? "Respond" : "Turn"}
            </p>
          ) : null}
        </div>
      </div>
    </div>
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

  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const seatDisplayName = useMemo(() => {
    /** @type {{ 0: string, 1: string }} */
    const out = { 0: "", 1: "" };
    for (const m of members) {
      const si = m?.seat_index;
      if (si !== 0 && si !== 1) continue;
      out[si] = String(m?.display_name ?? "").trim();
    }
    return out;
  }, [members]);
  const seat0Label = seatDisplayName[0] ? seatDisplayName[0] : "Guest";
  const seat1Label = seatDisplayName[1] ? seatDisplayName[1] : "Guest";

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
        ? "shadow-[0_0_0_1px_rgba(56,189,248,0.28),0_0_22px_rgba(56,189,248,0.1)]"
        : "shadow-[0_0_0_1px_rgba(251,191,36,0.26),0_0_22px_rgba(245,158,11,0.09)]"
      : vm.phase === "playing" && vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
        ? indicatorSeat === 0
          ? "shadow-[0_0_0_1px_rgba(56,189,248,0.22),0_0_18px_rgba(56,189,248,0.07)]"
          : "shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_0_18px_rgba(245,158,11,0.06)]"
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

  const hasSession = Boolean(vm.sessionId && String(vm.sessionId).trim() !== "");

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden bg-zinc-950 px-1 pb-1 sm:gap-1 sm:px-2 sm:pb-1.5">
      <div className="flex shrink-0 flex-col gap-0.5">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-400 sm:text-[11px]">
            <div
              className={`flex items-center rounded-md border px-2 py-0.5 tabular-nums ${
                vm.phase === "playing" &&
                (vm.turnSeat === vm.mySeat ||
                  (vm.mustRespondDouble && Number(vm.pendingDouble?.responder_seat) === vm.mySeat))
                  ? "border-amber-400/35 bg-amber-950/45 text-amber-50/92"
                  : "border-white/[0.12] bg-zinc-950/55 text-zinc-400"
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
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-white/12 bg-zinc-950/40 px-2 py-0.5 font-medium text-zinc-200">
                Table ×{vm.stakeMultiplier}
              </span>
              {vaultClaimBusy ? (
                <span className="rounded-md border border-sky-500/22 bg-sky-950/40 px-2 py-0.5 text-[10px] text-sky-100/90">
                  Settlement…
                </span>
              ) : null}
            </div>
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

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto overflow-x-hidden overscroll-contain">
        {vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble ? (
          <div className="shrink-0 rounded-lg border border-amber-500/28 bg-amber-950/30 p-2">
            <p className="text-[11px] leading-snug text-amber-100/92">
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

        {hasSession ? (
          <FourLinePlayerHeader
            seat0Label={seat0Label}
            seat1Label={seat1Label}
            mySeat={vm.mySeat}
            indicatorSeat={indicatorSeat}
            phase={vm.phase}
            mustRespondDouble={vm.mustRespondDouble === true}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 shrink-0 flex-col">
          <div
            className={`relative mx-auto w-full max-w-lg rounded-2xl border border-zinc-600/25 bg-gradient-to-b from-zinc-800/55 to-zinc-900/90 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] transition-[transform,opacity,box-shadow] duration-200 sm:max-w-xl sm:p-2.5 md:max-w-2xl ${turnBoardGlow} ${
              winFreeze ? "scale-[0.998] opacity-[0.97]" : "scale-100 opacity-100"
            }`}
          >
            <p className="mb-1.5 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 sm:mb-2">
              <span
                className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-zinc-700/80 align-middle shadow-sm ${
                  indicatorSeat === 0
                    ? "bg-gradient-to-b from-sky-300 to-blue-600"
                    : indicatorSeat === 1
                      ? "bg-gradient-to-b from-amber-200 to-amber-700"
                      : "bg-zinc-600"
                }`}
                aria-hidden
              />
              Playfield
              <span className="font-normal normal-case tracking-normal text-zinc-500"> · connect four</span>
            </p>
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1.5 md:gap-2">
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
                tintSeat === 0 ? "bg-sky-500/10" : tintSeat === 1 ? "bg-amber-400/08" : "bg-transparent";
              return (
                <div
                  key={c}
                  data-fl-col
                  className={`relative flex min-w-0 flex-col gap-0.5 overflow-visible rounded-md transition-[background-color] duration-150 sm:gap-1 ${colTint}`}
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
                    className={`relative z-10 flex h-8 min-h-[2rem] items-center justify-center rounded-md border text-[11px] font-bold transition sm:h-10 ${
                      playable
                        ? "border-sky-500/40 bg-sky-950/50 text-sky-100 shadow-sm active:scale-[0.97]"
                        : "cursor-not-allowed border-white/[0.08] bg-zinc-950/50 text-zinc-500 opacity-55"
                    }`}
                  >
                    ▼
                  </button>
                  <div className="relative flex min-h-0 flex-col gap-0.5 overflow-visible sm:gap-1" data-fl-cells>
                    {showGhost ? (
                      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[15] flex justify-center overflow-visible">
                        <GhostOrMiniDisc seat={ghostSeat} />
                      </div>
                    ) : null}
                    {dropAnim && dropAnim.col === c && cellStridePx > 0 ? (
                      <div
                        className="pointer-events-none absolute left-0 right-0 top-0 z-20 flex justify-center overflow-visible will-change-transform"
                        style={{
                          transform: `translateZ(0) translateY(${dropTranslatePx}px)`,
                          transition:
                            dropTranslatePx === 0
                              ? "none"
                              : `transform ${DROP_MS}ms cubic-bezier(0.33, 1, 0.68, 1)`,
                        }}
                      >
                        <div
                          className={`aspect-square w-[55%] max-w-[2.75rem] rounded-full sm:w-[58%] sm:max-w-none ${
                            dropAnim.seat === 0
                              ? "border border-sky-300/25 bg-gradient-to-b from-sky-100 to-blue-800 shadow-[0_3px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.3)]"
                              : "border border-amber-300/22 bg-gradient-to-b from-amber-50 to-amber-700 shadow-[0_3px_8px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.28)]"
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
                          className="min-w-0 px-px sm:px-0.5"
                        >
                          <CellDisc seat={v} hideDisc={hideDrop} isWinning={isWin} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble && vm.canOfferDouble ? (
          <div className="shrink-0">
            <button
              type="button"
              disabled={busy}
              className={`${BTN_ACCENT} inline-flex w-full items-center justify-center py-2.5 text-xs font-semibold sm:py-2`}
              onClick={() => void offerDouble()}
            >
              Increase table stake
            </button>
          </div>
        ) : null}

        <div className="mt-0 flex shrink-0 flex-col gap-0.5 border-t border-white/[0.08] pt-1.5 text-[10px] text-zinc-500">
          <p className="leading-snug">
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
