"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2BackgammonSession } from "../../../hooks/useOv2BackgammonSession";

/**
 * Visual column order must match real board geometry: top-left column j pairs index (12+j) above with (11−j) below
 * (standard 13–18 over 12–7). Bottom outer is already [11..6] L→R; top outer must be [12..17] L→R — not reversed.
 */
const TOP_OUTER = [12, 13, 14, 15, 16, 17];
const TOP_HOME_S1 = [18, 19, 20, 21, 22, 23];
const BOT_OUTER = [11, 10, 9, 8, 7, 6];
const BOT_HOME_S0 = [5, 4, 3, 2, 1, 0];

/**
 * @param {{ count: number, maxVisible?: number, compact?: boolean, stackFrom?: 'top' | 'bottom', className?: string }} props
 */
function CheckerStack({ count, maxVisible = 5, compact = false, stackFrom = "top", className = "" }) {
  const n = Math.abs(Math.trunc(count));
  if (n <= 0) {
    return <div className={`min-h-[2px] ${className}`} aria-hidden />;
  }
  const isLight = count > 0;
  const dot = compact
    ? "h-3.5 w-3.5 min-h-[14px] min-w-[14px] border border-black/50 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-black/20 sm:h-4 sm:w-4 sm:min-h-4 sm:min-w-4"
    : "h-4 w-4 min-h-4 min-w-4 border border-black/50 shadow-[0_1px_3px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-black/25 sm:h-[1.1rem] sm:w-[1.1rem] sm:min-h-[1.1rem] sm:min-w-[1.1rem] md:h-5 md:w-5 md:min-h-5 md:min-w-5";
  const disks = n > maxVisible ? maxVisible - 1 : n;
  const label =
    n > maxVisible ? (
      <span
        className={`shrink-0 text-[8px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)] sm:text-[9px] md:text-[10px] ${
          stackFrom === "top" ? "mb-px sm:mb-0.5" : "mt-px sm:mt-0.5"
        }`}
      >
        {n}
      </span>
    ) : null;
  const diskEls = Array.from({ length: disks }, (_, i) => (
    <div
      key={i}
      className={`shrink-0 rounded-full ${dot} ${isLight ? "bg-gradient-to-b from-amber-50 to-amber-200" : "bg-gradient-to-b from-zinc-500 to-zinc-900"}`}
    />
  ));
  const stackGap = "gap-[2.5px]";
  if (stackFrom === "bottom") {
    return (
      <div className={`inline-flex flex-col-reverse items-center ${stackGap} ${className}`}>
        {diskEls}
        {label}
      </div>
    );
  }
  return (
    <div className={`inline-flex flex-col items-center ${stackGap} ${className}`}>
      {label}
      {diskEls}
    </div>
  );
}

/**
 * @param {{
 *   pointIndex: number,
 *   value: number,
 *   mySeat: number|null,
 *   selected: boolean,
 *   disabled: boolean,
 *   direction: 'down' | 'up',
 *   tone: 'a' | 'b',
 *   isHome: boolean,
 *   compact: boolean,
 *   onPointClick: (i: number) => void,
 * }} props
 */
function BoardPoint({
  pointIndex,
  value,
  mySeat,
  selected,
  disabled,
  direction,
  tone,
  isHome,
  compact,
  onPointClick,
}) {
  const mine = mySeat === 0 ? value > 0 : mySeat === 1 ? value < 0 : false;
  const fill =
    tone === "a"
      ? "from-amber-800/85 via-amber-900/75 to-amber-950/90"
      : "from-amber-900/80 via-amber-950/80 to-black/85";
  const clip = direction === "down" ? "polygon(50% 100%, 0 0, 100% 0)" : "polygon(50% 0, 0 100%, 100% 100%)";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPointClick(pointIndex)}
      className={`relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col items-stretch overflow-visible rounded-sm border border-black/25 outline-none transition-[box-shadow,transform] ${
        selected ? "z-[1] ring-2 ring-sky-400 ring-offset-2 ring-offset-[#1a0f08]" : ""
      } ${mine ? "ring-1 ring-emerald-500/40" : ""} ${isHome ? "ring-1 ring-amber-300/35" : ""} disabled:cursor-not-allowed disabled:opacity-50`}
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label={`Point ${pointIndex + 1}`}
    >
      <div
        className={`pointer-events-none relative mx-auto min-h-0 w-[86%] flex-1 bg-gradient-to-b max-md:min-h-[1.5rem] sm:w-[88%] md:min-h-[2.25rem] md:w-[88%] lg:min-h-[2.75rem] xl:min-h-[3.25rem] ${fill}`}
        style={{ clipPath: clip }}
      />
      {direction === "down" ? (
        <div className="pointer-events-none absolute left-[7%] right-[7%] top-0 z-[1] flex flex-col items-center justify-start pt-0.5 sm:left-[6%] sm:right-[6%] sm:pt-1">
          <CheckerStack count={value} compact={compact} stackFrom="top" />
        </div>
      ) : (
        <div className="pointer-events-none absolute bottom-0 left-[7%] right-[7%] top-auto z-[1] flex flex-col items-center justify-end pb-0.5 sm:left-[6%] sm:right-[6%] sm:pb-1">
          <CheckerStack count={value} compact={compact} stackFrom="bottom" />
        </div>
      )}
    </button>
  );
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2BackgammonScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2BackgammonSession(contextInput ?? undefined);
  const { vm, busy, err, setErr, roll, move, requestRematch, cancelRematch, startNextMatch, isHost, roomMatchSeq } = session;
  const [selDie, setSelDie] = useState(/** @type {number|null} */ (null));
  const [selFrom, setSelFrom] = useState(/** @type {number|'bar'|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [narrowViewport, setNarrowViewport] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const room = contextInput?.room && typeof contextInput.room === "object" ? contextInput.room : null;
  const roomId = room?.id != null ? String(room.id) : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const selfKey = contextInput?.self?.participant_key?.trim() || "";

  const myBar = vm.mySeat === 0 ? vm.bar[0] : vm.mySeat === 1 ? vm.bar[1] : 0;

  const pts24 = useMemo(() => {
    const p = Array.isArray(vm.pts) ? vm.pts.map(x => Number(x)) : [];
    while (p.length < 24) p.push(0);
    return p.slice(0, 24);
  }, [vm.pts]);

  const uniqueDice = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const d of vm.diceAvail) {
      if (!Number.isFinite(d) || seen.has(d)) continue;
      seen.add(d);
      out.push(d);
    }
    return out.sort((a, b) => b - a);
  }, [vm.diceAvail]);

  const resetSelection = useCallback(() => {
    setSelDie(null);
    setSelFrom(null);
  }, []);

  const onPointClick = useCallback(
    async idx => {
      if (vm.readOnly || busy) return;
      if (String(vm.phase) !== "playing") return;
      if (!vm.canClientMove && !vm.canClientRoll) return;
      if (vm.canClientRoll) return;

      if (selDie == null) {
        setErr("Pick a die value first.");
        return;
      }

      if (selFrom == null) {
        if (myBar > 0) {
          setErr("You must move from the bar first.");
          return;
        }
        const v = pts24[idx] || 0;
        const mine = vm.mySeat === 0 ? v > 0 : vm.mySeat === 1 ? v < 0 : false;
        if (!mine) {
          setErr("Choose one of your points.");
          return;
        }
        setSelFrom(idx);
        return;
      }

      if (selFrom === "bar") {
        const to = idx;
        await move(-1, to, selDie);
        resetSelection();
        return;
      }

      const from = selFrom;
      const to = idx;
      await move(from, to, selDie);
      resetSelection();
    },
    [vm, busy, selDie, selFrom, myBar, move, resetSelection, setErr, pts24]
  );

  const onBearOffClick = useCallback(async () => {
    if (vm.readOnly || busy || selDie == null || selFrom == null || selFrom === "bar") return;
    await move(selFrom, -1, selDie);
    resetSelection();
  }, [vm.readOnly, busy, selDie, selFrom, move, resetSelection]);

  const onBarClick = useCallback(() => {
    if (vm.readOnly || busy || String(vm.phase) !== "playing" || !vm.canClientMove) return;
    if (selDie == null) {
      setErr("Pick a die value first.");
      return;
    }
    if (myBar <= 0) return;
    setSelFrom(s => (s === "bar" ? null : "bar"));
  }, [vm.readOnly, busy, vm.phase, vm.canClientMove, selDie, myBar, setErr]);

  const eligibleRematch = useMemo(
    () => members.filter(m => m?.seat_index != null && m?.seat_index !== "" && m?.wallet_state === "committed").length,
    [members]
  );
  const readyRematch = useMemo(
    () =>
      members.filter(m => {
        if (m?.seat_index == null || m?.seat_index === "" || m?.wallet_state !== "committed") return false;
        const bg = m?.meta?.bg;
        return bg?.rematch_requested === true || bg?.rematch_requested === "true";
      }).length,
    [members]
  );
  const myRow = useMemo(() => members.find(m => m?.participant_key === selfKey), [members, selfKey]);
  const myRematchRequested = Boolean(myRow?.meta?.bg?.rematch_requested);
  const isFinished = String(vm.phase).toLowerCase() === "finished";
  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const canHostStartNext = isHost && isFinished && eligibleRematch >= 2 && readyRematch >= eligibleRematch;

  const boardDisabled = busy || vm.readOnly || String(vm.phase) !== "playing";
  const compactBoard = narrowViewport;

  const isHomeForViewer = useCallback(
    idx => {
      if (vm.mySeat === 0) return idx >= 0 && idx <= 5;
      if (vm.mySeat === 1) return idx >= 18 && idx <= 23;
      return idx <= 5 || idx >= 18;
    },
    [vm.mySeat]
  );

  const toneAt = useCallback(i => (i % 2 === 0 ? "a" : "b"), []);

  const renderHalfRow = (indices, direction) => (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row gap-px sm:gap-1">
      {indices.map(i => (
        <BoardPoint
          key={i}
          pointIndex={i}
          value={pts24[i] ?? 0}
          mySeat={vm.mySeat}
          selected={selFrom === i}
          disabled={boardDisabled}
          direction={direction}
          tone={toneAt(i)}
          isHome={isHomeForViewer(i)}
          compact={compactBoard}
          onPointClick={idx => void onPointClick(idx)}
        />
      ))}
    </div>
  );

  const offS1 = vm.off[1] ?? 0;
  const offS0 = vm.off[0] ?? 0;
  const bearOffActive =
    !boardDisabled && vm.canClientMove && selDie != null && selFrom != null && selFrom !== "bar" && myBar <= 0;

  const barCol = (
    <div className="flex w-9 shrink-0 flex-col border-x border-amber-900/90 bg-gradient-to-b from-zinc-900 to-black sm:w-11 md:w-14">
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 1 || vm.bar[1] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 1) return;
          void onBarClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 sm:py-1.5 ${
          vm.mySeat === 1 && myBar > 0 && selFrom === "bar" ? "bg-sky-900/55 text-sky-50" : ""
        } disabled:opacity-40`}
        aria-label="Bar, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-100/95 sm:text-[9px] md:text-[10px] md:tracking-[0.24em]">
          Bar
        </span>
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P2</span>
        <CheckerStack count={-Math.max(0, vm.bar[1])} maxVisible={5} compact={compactBoard} />
      </button>
      <div className="h-px shrink-0 bg-black/60" aria-hidden />
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 0 || vm.bar[0] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 0) return;
          void onBarClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 sm:py-1.5 ${
          vm.mySeat === 0 && myBar > 0 && selFrom === "bar" ? "bg-sky-900/55 text-sky-50" : ""
        } disabled:opacity-40`}
        aria-label="Bar, seat one"
      >
        <CheckerStack count={Math.max(0, vm.bar[0])} maxVisible={5} compact={compactBoard} />
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P1</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-100/95 sm:text-[9px] md:text-[10px] md:tracking-[0.24em]">
          Bar
        </span>
      </button>
    </div>
  );

  const offColumn = (
    <div className="flex w-10 shrink-0 flex-col border-l border-amber-900/50 bg-black/40 sm:w-12 md:w-[3.25rem]">
      <button
        type="button"
        disabled={!bearOffActive || vm.mySeat !== 1}
        onClick={() => {
          if (vm.mySeat === 1) void onBearOffClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-start gap-1 border-b border-black/30 py-1 sm:py-1.5 ${
          bearOffActive && vm.mySeat === 1 ? "bg-amber-900/25 ring-1 ring-inset ring-amber-400/40" : ""
        } disabled:cursor-default disabled:opacity-60`}
        aria-label="Borne off, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-100/90 sm:text-[9px] md:text-[10px]">Off</span>
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P2</span>
        <CheckerStack count={-offS1} maxVisible={6} compact={compactBoard} />
      </button>
      <button
        type="button"
        disabled={!bearOffActive || vm.mySeat !== 0}
        onClick={() => {
          if (vm.mySeat === 0) void onBearOffClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-end gap-1 py-1 sm:py-1.5 ${
          bearOffActive && vm.mySeat === 0 ? "bg-amber-900/25 ring-1 ring-inset ring-amber-400/40" : ""
        } disabled:cursor-default disabled:opacity-60`}
        aria-label="Borne off, seat one"
      >
        <CheckerStack count={offS0} maxVisible={6} compact={compactBoard} />
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P1</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-100/90 sm:text-[9px] md:text-[10px]">Off</span>
      </button>
    </div>
  );

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-1 pb-0.5 pt-0 text-white sm:gap-1 sm:px-2 sm:pb-1">
      <div className="shrink-0 rounded-md border border-white/10 bg-black/35 px-1.5 py-0.5 sm:px-2 sm:py-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5 text-[8px] leading-tight text-zinc-300 sm:text-[9px] md:flex-nowrap md:text-[10px]">
          <span className="min-w-0 font-medium">
            You P{vm.mySeat != null ? vm.mySeat + 1 : "—"} · off{" "}
            {vm.mySeat === 0 ? offS0 : vm.mySeat === 1 ? offS1 : "—"}/15
            {myBar > 0 ? <span className="text-amber-200/95"> · bar {myBar}</span> : null}
          </span>
          <span className="shrink-0 text-zinc-500">
            Turn P{vm.turnSeat != null ? vm.turnSeat + 1 : "—"}
            {Array.isArray(vm.dice) ? (
              <span className="ml-1 font-mono text-zinc-500">· {JSON.stringify(vm.dice)}</span>
            ) : null}
          </span>
        </div>
      </div>

      {err ? (
        <div className="shrink-0 rounded border border-amber-500/35 bg-amber-950/30 px-1.5 py-0.5 text-[8px] text-amber-100 sm:px-2 sm:py-1 sm:text-[9px]">
          {err}
          <button type="button" className="ml-1.5 underline" onClick={() => setErr("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-0.5 sm:gap-1">
        {vm.canClientRoll ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void roll()}
            className="rounded-md border border-violet-500/45 bg-violet-950/40 px-2 py-0.5 text-[9px] font-bold text-violet-100 disabled:opacity-45 sm:px-2.5 sm:py-1 sm:text-[10px] md:text-xs"
          >
            {busy ? "Rolling…" : "Roll"}
          </button>
        ) : null}
        {vm.canClientMove && uniqueDice.length ? (
          <div className="flex flex-wrap items-center gap-0.5 sm:gap-1">
            <span className="text-[8px] text-zinc-500 sm:text-[9px]">Die</span>
            {uniqueDice.map(d => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => {
                  setSelDie(d);
                  setSelFrom(null);
                }}
                className={`min-h-7 min-w-7 rounded border px-1 text-[10px] font-bold sm:min-h-8 sm:min-w-8 sm:text-xs md:min-h-9 md:min-w-9 ${
                  selDie === d ? "border-emerald-400 bg-emerald-900/50" : "border-white/20 bg-white/10"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
        ) : null}
        {vm.canClientMove && myBar > 0 && selDie != null ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setSelFrom(s => (s === "bar" ? null : "bar"))}
            className={`rounded border px-1 py-0.5 text-[8px] font-semibold sm:px-1.5 sm:text-[9px] ${
              selFrom === "bar" ? "border-sky-400 bg-sky-900/40" : "border-white/20 bg-white/10"
            }`}
          >
            Bar {myBar}
          </button>
        ) : null}
        {selDie != null && selFrom != null && selFrom !== "bar" ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void onBearOffClick()}
            className="rounded border border-amber-500/40 bg-amber-950/30 px-1 py-0.5 text-[8px] font-semibold text-amber-100 sm:px-1.5 sm:text-[9px]"
          >
            Off
          </button>
        ) : null}
        {selDie != null ? (
          <button type="button" className="text-[8px] text-zinc-500 underline sm:text-[9px]" onClick={resetSelection}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div className="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-amber-900/70 bg-gradient-to-b from-[#2e1c12] via-[#1a0f08] to-[#0f0805] p-px shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] max-md:h-[min(39svh,78vw)] max-md:max-h-[40svh] max-md:flex-none sm:rounded-xl sm:border-amber-900/80 sm:p-0.5 md:h-[min(56vh,520px)] md:max-w-4xl md:p-1 lg:max-w-[52rem] lg:p-1.5 xl:max-w-[56rem]">
          <div className="pointer-events-none flex shrink-0 items-end justify-between gap-1 px-0.5 pb-px sm:px-1 sm:pb-0.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-zinc-500 sm:text-[8px] md:text-[9px]">Outer</span>
            <span className="w-9 shrink-0 text-center text-[7px] font-bold uppercase tracking-[0.16em] text-amber-200/80 sm:w-11 sm:text-[8px] md:w-14 md:text-[9px]">
              Bar
            </span>
            <span className="min-w-0 flex-1 text-center text-[7px] font-bold uppercase tracking-wide text-amber-100/85 sm:text-[8px] md:text-[9px]">
              P2 home
            </span>
            <span className="w-10 shrink-0 text-center text-[7px] font-bold uppercase tracking-[0.14em] text-amber-200/80 sm:w-12 sm:text-[8px] md:w-[3.25rem] md:text-[9px]">
              Off
            </span>
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-row gap-px overflow-hidden sm:gap-1">
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(TOP_OUTER, "down")}</div>
              <div className="h-px shrink-0 bg-black/50" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(BOT_OUTER, "up")}</div>
            </div>
            {barCol}
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(TOP_HOME_S1, "down")}</div>
              <div className="h-px shrink-0 bg-black/50" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(BOT_HOME_S0, "up")}</div>
            </div>
            {offColumn}
          </div>
        </div>
      </div>

      <span className="sr-only">
        Backgammon table: player one bears off bottom right, player two top right, bar between halves.
      </span>

      {isFinished ? (
        <div className="shrink-0 rounded-xl border border-white/15 bg-black/40 p-3">
          <p className={`text-center text-sm font-semibold ${didIWin ? "text-emerald-200" : vm.mySeat != null ? "text-rose-200" : "text-white"}`}>
            {didIWin ? "You won" : vm.mySeat != null ? "You lost" : "Match finished"}
          </p>
          {vm.winnerSeat != null ? (
            <p className="mt-1 text-center text-[11px] text-zinc-400">Winner: seat {vm.winnerSeat + 1}</p>
          ) : null}
          <div className="mt-2 flex flex-col gap-2">
            {eligibleRematch >= 2 ? (
              <p className="text-center text-[10px] text-zinc-500">
                Rematch: {readyRematch}/{eligibleRematch} ready
              </p>
            ) : null}
            {vm.mySeat != null ? (
              <button
                type="button"
                disabled={rematchBusy}
                onClick={async () => {
                  setRematchBusy(true);
                  try {
                    const r = myRematchRequested ? await cancelRematch() : await requestRematch();
                    if (!r?.ok && r?.error) setErr(r.error);
                  } finally {
                    setRematchBusy(false);
                  }
                }}
                className="w-full rounded-md border border-sky-500/40 bg-sky-950/35 py-2 text-xs font-semibold text-sky-100 disabled:opacity-45"
              >
                {rematchBusy ? "…" : myRematchRequested ? "Cancel rematch" : "Rematch"}
              </button>
            ) : null}
            {isHost ? (
              <button
                type="button"
                disabled={!canHostStartNext || startNextBusy}
                onClick={async () => {
                  const prev = room?.active_session_id != null ? String(room.active_session_id) : "";
                  setStartNextBusy(true);
                  try {
                    const r = await startNextMatch(roomMatchSeq);
                    if (r?.ok && onSessionRefresh) {
                      await onSessionRefresh(prev, undefined, { expectClearedSession: true });
                    } else if (!r?.ok && r?.error) {
                      setErr(r.error);
                    }
                  } finally {
                    setStartNextBusy(false);
                  }
                }}
                className="w-full rounded-md border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-45"
              >
                {startNextBusy ? "Starting…" : "Start next match (host)"}
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={exitBusy}
                onClick={() => void router.replace({ pathname: "/online-v2/rooms", query: { room: roomId } }, undefined, { shallow: true })}
                className="rounded-md border border-white/25 bg-white/10 py-2 text-xs font-semibold"
              >
                Room lobby
              </button>
              <button
                type="button"
                disabled={exitBusy || !selfKey}
                onClick={async () => {
                  setExitErr("");
                  setExitBusy(true);
                  try {
                    await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: selfKey });
                    try {
                      window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
                    } catch {
                      /* ignore */
                    }
                    await router.replace("/online-v2/rooms");
                  } catch (e) {
                    setExitErr(e?.message || "Could not leave.");
                  } finally {
                    setExitBusy(false);
                  }
                }}
                className="rounded-md border border-red-500/45 bg-red-950/35 py-2 text-xs font-semibold text-red-100"
              >
                {exitBusy ? "…" : "Leave room"}
              </button>
            </div>
            {exitErr ? <p className="text-center text-[10px] text-red-300">{exitErr}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
