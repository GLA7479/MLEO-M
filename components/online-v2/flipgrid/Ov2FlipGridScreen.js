"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  flipGridCellPlayable,
  OV2_FLIPGRID_SIZE,
  parseFlipGridCells,
} from "../../../lib/online-v2/flipgrid/ov2FlipGridClientLegality";
import { useOv2FlipGridSession } from "../../../hooks/useOv2FlipGridSession";

const finishDismissStorageKey = sid => `ov2_fg_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-lg border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-3 py-2 text-[11px] font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

function CellDisc({ seat }) {
  if (seat !== 0 && seat !== 1) {
    return (
      <div className="aspect-square w-full min-h-[1.85rem] rounded-[3px] border border-white/[0.06] bg-zinc-900/45 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-h-[2.25rem] sm:rounded-md" />
    );
  }
  const cls =
    seat === 0
      ? "bg-gradient-to-b from-rose-400/90 to-rose-700/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]"
      : "bg-gradient-to-b from-amber-300/90 to-amber-700/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.2)]";
  return (
    <div
      className={`aspect-square w-full min-h-[1.85rem] rounded-full border border-black/20 ${cls} sm:min-h-[2.25rem]`}
    />
  );
}

/**
 * @param {{
 *   seat: 0|1,
 *   displayName: string,
 *   relationLabel: string,
 *   colorLabel: "Rose"|"Amber",
 *   discCount: number,
 *   stateLine: string,
 *   active: boolean,
 * }} props
 */
function FlipGridPlayerSeatCard({ seat, displayName, relationLabel, colorLabel, discCount, stateLine, active }) {
  const rose = seat === 0;
  const borderActive = rose
    ? "border-rose-400/40 bg-gradient-to-br from-rose-950/55 to-zinc-900/90 shadow-[0_0_0_1px_rgba(251,113,133,0.18)]"
    : "border-amber-400/40 bg-gradient-to-br from-amber-950/45 to-zinc-900/90 shadow-[0_0_0_1px_rgba(251,191,36,0.2)]";
  const idle = "border-white/[0.1] bg-zinc-900/55";
  const swatch = rose
    ? "border-rose-400/30 bg-gradient-to-b from-rose-200 to-rose-700"
    : "border-amber-400/28 bg-gradient-to-b from-amber-100 to-amber-700";
  const colorText = rose ? "text-rose-200/95" : "text-amber-200/95";
  return (
    <div
      className={`min-w-0 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-1.5 ${active ? borderActive : idle}`}
    >
      <div className="flex items-start gap-1.5">
        <span className={`mt-0.5 h-5 w-5 shrink-0 rounded-full border shadow-sm sm:h-6 sm:w-6 ${swatch}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span className={`text-[10px] font-bold uppercase tracking-wide ${colorText}`}>{colorLabel}</span>
            <span
              className={`rounded px-1 py-px text-[9px] font-semibold uppercase ${
                relationLabel === "You"
                  ? rose
                    ? "bg-rose-500/25 text-rose-50"
                    : "bg-amber-500/25 text-amber-50"
                  : "bg-zinc-700/50 font-medium text-zinc-400"
              }`}
            >
              {relationLabel}
            </span>
          </div>
          <p className="truncate text-[11px] font-medium leading-tight text-zinc-100 sm:text-xs" title={displayName}>
            {displayName}
          </p>
          <p className="mt-0.5 text-[10px] tabular-nums text-zinc-500">
            {discCount} disc{discCount === 1 ? "" : "s"}
          </p>
        </div>
      </div>
      <div className="mt-1 flex min-h-[1.125rem] items-end">
        {stateLine ? (
          <p
            className={`min-w-0 truncate text-[8px] font-semibold uppercase leading-tight tracking-wide tabular-nums sm:text-[9px] ${
              active ? (rose ? "text-rose-300/95" : "text-amber-300/95") : "text-zinc-500"
            }`}
          >
            {stateLine}
          </p>
        ) : null}
      </div>
    </div>
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
 *   discCounts: [number, number],
 *   missedStreakBySeat: { 0: number, 1: number },
 * }} opts
 */
const OV2_FG_MISSED_STRIKE_MAX = 3;

function flipGridPlayerPair(opts) {
  const { seat0Label, seat1Label, mySeat, indicatorSeat, phase, mustRespondDouble, discCounts, missedStreakBySeat } = opts;
  const playing = phase === "playing";
  const active0 = playing && indicatorSeat === 0;
  const active1 = playing && indicatorSeat === 1;

  const lineForSeat = seat => {
    if (phase === "finished") return "Finished";
    if (!playing) return "";
    if (mustRespondDouble && Number(seat) === Number(indicatorSeat)) return "Respond to stake";
    if (indicatorSeat !== seat) {
      const m = Math.max(
        0,
        Math.min(OV2_FG_MISSED_STRIKE_MAX, Number(missedStreakBySeat?.[seat] ?? 0) || 0)
      );
      return `Waiting · ${m}/${OV2_FG_MISSED_STRIKE_MAX}`;
    }
    return "Your turn";
  };

  const card0 = (
    <FlipGridPlayerSeatCard
      seat={0}
      displayName={seat0Label}
      relationLabel={mySeat === 0 ? "You" : "Opponent"}
      colorLabel="Rose"
      discCount={discCounts[0] ?? 0}
      stateLine={lineForSeat(0)}
      active={active0}
    />
  );
  const card1 = (
    <FlipGridPlayerSeatCard
      seat={1}
      displayName={seat1Label}
      relationLabel={mySeat === 1 ? "You" : "Opponent"}
      colorLabel="Amber"
      discCount={discCounts[1] ?? 0}
      stateLine={lineForSeat(1)}
      active={active1}
    />
  );
  return { card0, card1 };
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string, display_name?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean, leaveToLobbyError?: string } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2FlipGridScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2FlipGridSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    playCell,
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
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const onLeaveToLobby = contextInput?.onLeaveToLobby;
  const leaveToLobbyBusy = Boolean(contextInput?.leaveToLobbyBusy);
  const leaveToLobbyError =
    contextInput && typeof contextInput.leaveToLobbyError === "string" ? contextInput.leaveToLobbyError.trim() : "";

  const cells = useMemo(() => parseFlipGridCells(vm.cells), [vm.cells]);

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

  const onCell = useCallback(
    async (r, c) => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      if (!flipGridCellPlayable(r, c, cells, vm.mySeat, vm.turnSeat, vm.mustRespondDouble)) {
        setErr("Illegal move — must flip at least one opposing disc.");
        return;
      }
      setErr("");
      await playCell(r, c);
    },
    [vm, busy, vaultClaimBusy, cells, playCell, setErr]
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

  const handleLeaveToLobby = useCallback(() => {
    if (typeof onLeaveToLobby !== "function" || leaveToLobbyBusy || !pk) return;
    void onLeaveToLobby();
  }, [onLeaveToLobby, leaveToLobbyBusy, pk]);

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

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    return "loss";
  }, [finished, isDraw, didIWin]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    return "Defeat";
  }, [finished, isDraw, didIWin]);

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Equal discs — stakes refunded";
    if (didIWin) return "More discs wins the round";
    return "Opponent has more discs";
  }, [finished, isDraw, didIWin]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    const a = vm.discCounts[0] ?? 0;
    const b = vm.discCounts[1] ?? 0;
    if (isDraw) return { text: `${a} – ${b}`, className: "font-semibold tabular-nums text-emerald-300/95" };
    if (didIWin) return { text: `${a} – ${b}`, className: "font-semibold tabular-nums text-amber-200/95" };
    return { text: `${a} – ${b}`, className: "font-semibold tabular-nums text-rose-300/95" };
  }, [finished, vaultClaimBusy, vm.discCounts, isDraw, didIWin]);

  const canInteractBoard =
    vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble && !busy && !vaultClaimBusy;

  const hasSession = Boolean(vm.sessionId && String(vm.sessionId).trim() !== "");

  const indicatorSeat = useMemo(() => {
    if (vm.phase !== "playing") return null;
    if (vm.mustRespondDouble && vm.pendingDouble?.responder_seat != null) {
      const rs = Number(vm.pendingDouble.responder_seat);
      if (rs === 0 || rs === 1) return rs;
    }
    const t = vm.turnSeat;
    return t === 0 || t === 1 ? t : null;
  }, [vm.phase, vm.mustRespondDouble, vm.pendingDouble, vm.turnSeat]);

  const turnBoardGlow =
    vm.phase === "playing" && !vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
      ? indicatorSeat === 0
        ? "shadow-[0_0_0_1px_rgba(251,113,133,0.22),0_0_22px_rgba(244,63,94,0.08)]"
        : "shadow-[0_0_0_1px_rgba(251,191,36,0.26),0_0_22px_rgba(245,158,11,0.09)]"
      : vm.phase === "playing" && vm.mustRespondDouble && (indicatorSeat === 0 || indicatorSeat === 1)
        ? indicatorSeat === 0
          ? "shadow-[0_0_0_1px_rgba(251,113,133,0.18),0_0_18px_rgba(244,63,94,0.06)]"
          : "shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_0_18px_rgba(245,158,11,0.06)]"
        : "";

  const canOfferDoubleNow =
    vm.phase === "playing" &&
    vm.mySeat === vm.turnSeat &&
    vm.mustRespondDouble !== true &&
    vm.canOfferDouble === true;

  const proposedMult =
    vm.pendingDouble != null && vm.pendingDouble.proposed_mult != null
      ? String(vm.pendingDouble.proposed_mult)
      : "—";

  const playerPair = useMemo(
    () =>
      hasSession
        ? flipGridPlayerPair({
            seat0Label,
            seat1Label,
            mySeat: vm.mySeat,
            indicatorSeat,
            phase: vm.phase,
            mustRespondDouble: vm.mustRespondDouble === true,
            discCounts: vm.discCounts,
            missedStreakBySeat: vm.missedStreakBySeat,
          })
        : null,
    [hasSession, seat0Label, seat1Label, vm.mySeat, indicatorSeat, vm.phase, vm.mustRespondDouble, vm.discCounts, vm.missedStreakBySeat]
  );

  const boardChrome = (
    <div
      className={`relative mx-auto w-full max-w-[min(100%,24rem)] rounded-2xl border border-zinc-600/25 bg-gradient-to-b from-zinc-800/55 to-zinc-950/95 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] sm:max-w-[min(100%,28rem)] sm:p-2.5 md:max-w-[min(100%,min(30rem,50vw))] md:px-2.5 md:py-2.5 ${turnBoardGlow}`}
    >
      <p className="mb-2 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-400 md:mb-1.5">
        <span
          className={`mr-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full border border-zinc-700/80 align-middle shadow-sm ${
            indicatorSeat === 0
              ? "bg-gradient-to-b from-rose-300 to-rose-600"
              : indicatorSeat === 1
                ? "bg-gradient-to-b from-amber-200 to-amber-700"
                : "bg-zinc-600"
          }`}
          aria-hidden
        />
        FlipGrid
        <span className="font-normal normal-case tracking-normal text-zinc-500"> · 8×8</span>
      </p>
      <div
        className="grid gap-1 rounded-xl border border-black/40 bg-zinc-950/60 p-1.5 shadow-[inset_0_2px_12px_rgba(0,0,0,0.35)] sm:gap-1.5 sm:p-2"
        style={{ gridTemplateColumns: `repeat(${OV2_FLIPGRID_SIZE}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: OV2_FLIPGRID_SIZE * OV2_FLIPGRID_SIZE }, (_, i) => {
          const r = Math.floor(i / OV2_FLIPGRID_SIZE);
          const c = i % OV2_FLIPGRID_SIZE;
          const v = cells[i];
          const playable = canInteractBoard && flipGridCellPlayable(r, c, cells, vm.mySeat, vm.turnSeat, false);
          return (
            <button
              key={i}
              type="button"
              disabled={!playable}
              aria-label={`Cell row ${r + 1} column ${c + 1}`}
              onClick={() => void onCell(r, c)}
              className={`min-w-0 rounded-[4px] border p-0 transition sm:rounded-md ${
                playable
                  ? "border-sky-400/45 bg-sky-950/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:scale-[0.96]"
                  : "cursor-default border-white/[0.06] bg-zinc-950/50"
              }`}
            >
              <CellDisc seat={v} />
            </button>
          );
        })}
      </div>
    </div>
  );

  const stakeBtnDisabled = busy || vaultClaimBusy || !canOfferDoubleNow;
  const leaveBtnDisabled = leaveToLobbyBusy || !pk || typeof onLeaveToLobby !== "function";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-0 overflow-hidden bg-zinc-950">
      {/* Top status */}
      <div className="flex shrink-0 flex-col gap-1 px-2 pt-2 sm:px-3 sm:pt-2.5">
        <div className="rounded-lg border border-white/[0.1] bg-zinc-900/70 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] sm:py-1.5 sm:px-2.5">
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
              ) : vm.phase === "finished" ? (
                <span className="font-medium text-zinc-500">Round over</span>
              ) : (
                <span>—</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="rounded border border-white/12 bg-zinc-950/40 px-2 py-0.5 font-medium tabular-nums text-zinc-200">
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

      {/* Players + board (mobile: stacked; md+: narrow side cards, board centered between) */}
      <div className="mt-2.5 flex min-h-0 flex-1 flex-col overflow-x-hidden px-2 pb-1 max-md:overflow-y-auto sm:mt-3 md:min-h-0 md:overflow-y-hidden md:overscroll-contain md:px-4 md:pb-5">
        {hasSession && playerPair ? (
          <div
            className="grid min-h-0 w-full min-w-0 grid-cols-2 grid-rows-[auto_auto] gap-x-2 gap-y-5 md:grid-cols-[minmax(0,10.5rem)_minmax(0,1fr)_minmax(0,10.5rem)] md:grid-rows-1 md:items-start md:gap-x-3 md:gap-y-0 md:pt-0 lg:grid-cols-[minmax(0,11.25rem)_minmax(0,1fr)_minmax(0,11.25rem)] lg:gap-x-4"
          >
            <div className="min-w-0 md:col-start-1 md:row-start-1">{playerPair.card0}</div>
            <div className="min-w-0 col-start-2 row-start-1 md:col-start-3 md:row-start-1">{playerPair.card1}</div>
            <div className="col-span-2 row-start-2 flex min-h-0 min-w-0 justify-center md:col-span-1 md:col-start-2 md:row-start-1 md:mt-3 md:self-start lg:mt-4">
              {boardChrome}
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center md:items-start md:justify-center md:pt-1">
            <div className="flex w-full justify-center md:mt-3 lg:mt-4">{boardChrome}</div>
          </div>
        )}

        {/* Action + utility — separated from board on mobile; centered band on desktop */}
        <div className="mt-5 shrink-0 pt-4 md:mt-4 md:pt-3 md:pb-2">
          <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-row items-stretch gap-2 md:max-w-3xl md:justify-center md:gap-3">
            <button
              type="button"
              disabled={stakeBtnDisabled}
              className={`${BTN_ACCENT} flex min-h-[2.75rem] min-w-0 flex-[1.65] items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:flex-1 md:max-w-md md:px-4 md:py-2.5`}
              onClick={() => void offerDouble()}
            >
              Increase table stake
            </button>
            <button
              type="button"
              disabled={leaveBtnDisabled}
              className={`${BTN_DANGER} flex min-h-[2.75rem] min-w-0 flex-1 items-center justify-center px-2 py-2.5 text-center !text-xs font-semibold leading-tight sm:!text-sm md:max-w-[12.5rem] md:flex-none md:shrink-0 md:px-4 md:py-2.5`}
              onClick={handleLeaveToLobby}
            >
              {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
            </button>
          </div>
          {leaveToLobbyError ? <p className="mt-2 text-center text-[11px] text-red-300">{leaveToLobbyError}</p> : null}
        </div>
      </div>

      {/* Double response — center modal, no layout shift */}
      {vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble ? (
        <div className="fixed inset-0 z-40 flex max-h-[100dvh] items-center justify-center bg-black/70 backdrop-blur-[2px] p-3">
          <div
            className="w-full max-w-sm rounded-2xl border border-amber-500/35 bg-gradient-to-b from-amber-950/95 to-zinc-950 p-5 shadow-2xl shadow-black/40"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ov2-fg-double-title"
          >
            <p id="ov2-fg-double-title" className="text-sm font-semibold text-amber-50">
              Double the table stake?
            </p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/88">
              Your opponent proposes raising the multiplier. Accept to continue at the new stake, or decline to end the round at
              the current table multiplier.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-amber-500/20 bg-black/20 px-2.5 py-2">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/70">Current</p>
                <p className="text-sm font-bold tabular-nums text-zinc-100">×{vm.stakeMultiplier}</p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-amber-200/70">Proposed</p>
                <p className="text-sm font-bold tabular-nums text-amber-200">×{proposedMult}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" disabled={busy} className={BTN_PRIMARY + " w-full py-2.5"} onClick={() => void respondDouble(true)}>
                Accept ×{proposedMult}
              </button>
              <button type="button" disabled={busy} className={BTN_DANGER + " w-full py-2.5"} onClick={() => void respondDouble(false)}>
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex max-h-[100dvh] items-end justify-center bg-black/80 p-3 backdrop-blur-[2px] sm:items-center">
          <div
            className="max-h-[min(92dvh,640px)] w-full max-w-sm overflow-y-auto overflow-x-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-zinc-950 shadow-2xl shadow-black/50"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ov2-fg-finish-title"
          >
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
                    (finishOutcome === "draw" || finishOutcome === "unknown") && "border-white/10 bg-zinc-900/80 text-zinc-200",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-hidden
                >
                  {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
                  <h2
                    id="ov2-fg-finish-title"
                    className={[
                      "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                      finishOutcome === "win" && "text-emerald-400",
                      finishOutcome === "loss" && "text-rose-400",
                      finishOutcome === "draw" && "text-sky-300",
                      finishOutcome === "unknown" && "text-zinc-100",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    {finishTitle}
                  </h2>
                  <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{vm.stakeMultiplier}</p>
                  <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                    <p
                      className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}
                    >
                      {finishAmountLine.text}
                    </p>
                  </div>
                  <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                  <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                    {vaultClaimBusy ? "Sending results to your balance…" : "Round complete — rematch, then host starts next."}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 px-4 py-4">
              <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
                {rematchBusy ? "Requesting…" : "Request rematch"}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
                Cancel rematch
              </button>
              {isHost ? (
                <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
                  <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">
                    Host only
                  </p>
                  <button
                    type="button"
                    className={BTN_PRIMARY + " w-full rounded-none"}
                    disabled={startNextBusy}
                    onClick={() => void onStartNext()}
                  >
                    {startNextBusy ? "Starting…" : "Start next (host)"}
                  </button>
                </div>
              ) : (
                <p className="rounded-lg border border-white/[0.06] bg-zinc-950/35 px-2 py-1.5 text-center text-[11px] text-zinc-500">
                  Host starts the next match when both players rematch.
                </p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={dismissFinishModal}>
                Dismiss
              </button>
              <button
                type="button"
                className={BTN_DANGER + " w-full"}
                disabled={leaveToLobbyBusy || !pk || typeof onLeaveToLobby !== "function"}
                onClick={handleLeaveToLobby}
              >
                {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
              </button>
              {leaveToLobbyError ? <p className="text-center text-[11px] text-red-300">{leaveToLobbyError}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
