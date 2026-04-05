"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  ov2BgClientLegalDestinationsForFrom,
  ov2BgClientLegalDiceForFromTo,
  ov2BgClientValidateSubmitSteps,
} from "../../../lib/online-v2/backgammon/ov2BackgammonClientLegality";
import {
  ov2BgAutoChainForcedMoves,
  ov2BgDraftBaseFromServerBoard,
  ov2BgReplayDraftSteps,
} from "../../../lib/online-v2/backgammon/ov2BackgammonDraftTurn";
import { useOv2BackgammonSession } from "../../../hooks/useOv2BackgammonSession";

const AUTO_ROLL_STORAGE_KEY = "ov2_bg_auto_roll";
const finishDismissStorageKey = sid => `ov2_bg_finish_dismiss_${sid}`;

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
    ? "h-[18px] w-[18px] min-h-[18px] min-w-[18px] border border-black/50 shadow-[0_1px_2px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] ring-1 ring-black/20 sm:h-5 sm:w-5 sm:min-h-5 sm:min-w-5"
    : "h-5 w-5 min-h-5 min-w-5 border border-black/50 shadow-[0_1px_3px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.14)] ring-1 ring-black/25 sm:h-[1.4rem] sm:w-[1.4rem] sm:min-h-[1.4rem] sm:min-w-[1.4rem] md:h-6 md:w-6 md:min-h-6 md:min-w-6 lg:h-[1.65rem] lg:w-[1.65rem] lg:min-h-[1.65rem] lg:min-w-[1.65rem]";
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
  const stackGap = "gap-[3.5px] sm:gap-1";
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
 *   selectedFrom: boolean,
 *   highlightDestination: boolean,
 *   invalidFlash: boolean,
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
  selectedFrom,
  highlightDestination,
  invalidFlash,
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
        highlightDestination
          ? "z-[2] ring-2 ring-emerald-400/90 ring-offset-1 ring-offset-[#1a0f08] shadow-[0_0_14px_rgba(52,211,153,0.35)]"
          : ""
      } ${selectedFrom ? "z-[2] ring-2 ring-sky-400 ring-offset-2 ring-offset-[#1a0f08]" : ""} ${
        invalidFlash ? "animate-pulse ring-2 ring-rose-500/70" : ""
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
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2BackgammonScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2BackgammonSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    err,
    setErr,
    roll,
    submitTurn,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;
  const [selFrom, setSelFrom] = useState(/** @type {number|'bar'|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [narrowViewport, setNarrowViewport] = useState(true);
  const [invalidFlashIdx, setInvalidFlashIdx] = useState(/** @type {number|null} */ (null));
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [autoRoll, setAutoRoll] = useState(false);
  const autoRollBusyRef = useRef(false);
  const autoRollEffectGenRef = useRef(0);
  /** When the same (from,to) is legal with more than one die value, player picks here. */
  const [pendingDieChoice, setPendingDieChoice] = useState(
    /** @type {{ fromPt: number, toPt: number, dice: number[] } | null} */ (null)
  );
  /** Local draft; committed only via `submitTurn` (server RPC). */
  const [draftSteps, setDraftSteps] = useState(/** @type {{ from: number, to: number, die: number }[]} */ ([]));
  const draftEpochRef = useRef("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      setAutoRoll(window.localStorage.getItem(AUTO_ROLL_STORAGE_KEY) === "1");
    } catch {
      setAutoRoll(false);
    }
  }, []);

  const persistAutoRoll = useCallback(next => {
    setAutoRoll(next);
    try {
      window.localStorage.setItem(AUTO_ROLL_STORAGE_KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const mq = window.matchMedia("(max-width: 639px)");
    const apply = () => setNarrowViewport(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (invalidFlashIdx == null) return undefined;
    const t = window.setTimeout(() => setInvalidFlashIdx(null), 420);
    return () => window.clearTimeout(t);
  }, [invalidFlashIdx]);

  const room = contextInput?.room && typeof contextInput.room === "object" ? contextInput.room : null;
  const roomId = room?.id != null ? String(room.id) : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const selfKey = contextInput?.self?.participant_key?.trim() || "";
  const onLeaveToLobby =
    contextInput && typeof contextInput === "object" && typeof contextInput.onLeaveToLobby === "function"
      ? contextInput.onLeaveToLobby
      : null;
  const leaveToLobbyBusy = Boolean(
    contextInput && typeof contextInput === "object" && contextInput.leaveToLobbyBusy === true
  );

  const stakePerSeat =
    room?.stake_per_seat != null && Number.isFinite(Number(room.stake_per_seat)) ? Number(room.stake_per_seat) : null;

  const draftBase = useMemo(() => {
    if (!snapshot?.board || String(vm.phase) !== "playing" || !vm.canClientMove || vm.readOnly) return null;
    if (vm.turnSeat == null || vm.mySeat == null || Number(vm.turnSeat) !== Number(vm.mySeat)) return null;
    return ov2BgDraftBaseFromServerBoard(snapshot.board, vm.turnSeat);
  }, [snapshot, vm.phase, vm.canClientMove, vm.readOnly, vm.turnSeat, vm.mySeat]);

  const draftEpoch = useMemo(() => {
    if (!draftBase) return "";
    return `${vm.sessionId}|${vm.revision}|${draftBase.diceAvail.join(",")}`;
  }, [draftBase, vm.sessionId, vm.revision]);

  useEffect(() => {
    if (!draftEpoch) {
      draftEpochRef.current = "";
      return;
    }
    if (draftEpochRef.current === draftEpoch) return;
    draftEpochRef.current = draftEpoch;
    setPendingDieChoice(null);
    setSelFrom(null);
    if (draftBase && vm.turnSeat != null) {
      setDraftSteps(ov2BgAutoChainForcedMoves(draftBase, vm.turnSeat, []));
    } else {
      setDraftSteps([]);
    }
  }, [draftEpoch, draftBase, vm.turnSeat]);

  useEffect(() => {
    if (!draftBase) setDraftSteps([]);
  }, [draftBase]);

  const draftReplay = useMemo(() => {
    if (!draftBase || vm.turnSeat == null) return { ok: false, board: null };
    return ov2BgReplayDraftSteps(draftBase, vm.turnSeat, draftSteps);
  }, [draftBase, vm.turnSeat, draftSteps]);

  const displayPts = useMemo(() => {
    const p =
      draftReplay.ok && Array.isArray(draftReplay.board?.pts)
        ? draftReplay.board.pts.map(x => Number(x))
        : Array.isArray(vm.pts)
          ? vm.pts.map(x => Number(x))
          : [];
    while (p.length < 24) p.push(0);
    return p.slice(0, 24);
  }, [draftReplay, vm.pts]);

  const displayBar =
    draftReplay.ok && draftReplay.board && Array.isArray(draftReplay.board.bar) ? draftReplay.board.bar : vm.bar;
  const displayOff =
    draftReplay.ok && draftReplay.board && Array.isArray(draftReplay.board.off) ? draftReplay.board.off : vm.off;
  const displayDiceAvail =
    draftReplay.ok && draftReplay.board && Array.isArray(draftReplay.board.diceAvail)
      ? draftReplay.board.diceAvail
      : vm.diceAvail;

  const myBar = vm.mySeat === 0 ? displayBar[0] : vm.mySeat === 1 ? displayBar[1] : 0;

  const legalityBoard = useMemo(
    () => ({
      pts: displayPts,
      bar: displayBar,
      off: displayOff,
      turnSeat: vm.turnSeat,
      diceAvail: displayDiceAvail,
    }),
    [displayPts, displayBar, displayOff, vm.turnSeat, displayDiceAvail]
  );

  const submitValidation = useMemo(() => {
    if (!draftBase || vm.turnSeat == null) {
      return { ok: false, code: "NO_DRAFT", message: "Not in draft mode" };
    }
    return ov2BgClientValidateSubmitSteps({ ...draftBase, turnSeat: vm.turnSeat }, draftSteps);
  }, [draftBase, vm.turnSeat, draftSteps]);

  const boardColDir = vm.mySeat === 1 ? "flex-col-reverse" : "flex-col";

  const legalDest = useMemo(() => {
    if (selFrom == null || !vm.canClientMove || vm.readOnly) return new Set();
    const fromPt = selFrom === "bar" ? -1 : selFrom;
    return ov2BgClientLegalDestinationsForFrom(legalityBoard, fromPt);
  }, [selFrom, vm.canClientMove, vm.readOnly, legalityBoard]);

  const resetSelection = useCallback(() => {
    setSelFrom(null);
    setPendingDieChoice(null);
  }, []);

  useEffect(() => {
    setPendingDieChoice(null);
  }, [vm.revision]);

  useEffect(() => {
    resetSelection();
  }, [vm.phase, vm.turnSeat, resetSelection]);

  const flashInvalid = useCallback(idx => {
    setInvalidFlashIdx(idx);
  }, []);

  const appendDraftStep = useCallback(
    (fromPt, toPt, die) => {
      if (!draftBase || vm.turnSeat == null) return;
      const turn = vm.turnSeat;
      const tentative = [...draftSteps, { from: fromPt, to: toPt, die }];
      const rep = ov2BgReplayDraftSteps(draftBase, turn, tentative);
      if (!rep.ok) {
        setErr(typeof rep.code === "string" ? rep.code : "Illegal move");
        return;
      }
      setErr("");
      setDraftSteps(ov2BgAutoChainForcedMoves(draftBase, turn, tentative));
      resetSelection();
    },
    [draftBase, vm.turnSeat, draftSteps, resetSelection, setErr]
  );

  const tryCompleteMove = useCallback(
    async (fromPt, toPt) => {
      const opts = ov2BgClientLegalDiceForFromTo(legalityBoard, fromPt, toPt);
      if (opts.length === 0) {
        setErr("No legal die for that move.");
        return;
      }
      if (opts.length > 1) {
        setPendingDieChoice({ fromPt, toPt, dice: opts });
        return;
      }
      appendDraftStep(fromPt, toPt, opts[0]);
    },
    [legalityBoard, appendDraftStep, setErr]
  );

  const confirmDieChoice = useCallback(
    async die => {
      if (!pendingDieChoice) return;
      const { fromPt, toPt } = pendingDieChoice;
      setPendingDieChoice(null);
      appendDraftStep(fromPt, toPt, die);
    },
    [pendingDieChoice, appendDraftStep]
  );

  const undoDraft = useCallback(() => {
    setDraftSteps(s => s.slice(0, -1));
    resetSelection();
  }, [resetSelection]);

  const resetDraft = useCallback(() => {
    resetSelection();
    if (draftBase && vm.turnSeat != null) {
      setDraftSteps(ov2BgAutoChainForcedMoves(draftBase, vm.turnSeat, []));
    } else {
      setDraftSteps([]);
    }
  }, [draftBase, vm.turnSeat, resetSelection]);

  const confirmTurn = useCallback(async () => {
    if (!submitValidation.ok) {
      setErr(submitValidation.message || "Cannot confirm this turn.");
      return;
    }
    const r = await submitTurn(draftSteps);
    if (r?.ok) {
      setDraftSteps([]);
      resetSelection();
    }
  }, [submitTurn, draftSteps, submitValidation, resetSelection, setErr]);

  const onPointClick = useCallback(
    async idx => {
      if (vm.readOnly || busy) return;
      if (String(vm.phase) !== "playing") return;
      if (!vm.canClientMove && !vm.canClientRoll) return;
      if (vm.canClientRoll) return;

      if (myBar > 0 && selFrom !== "bar") {
        setErr("You must move from the bar first.");
        flashInvalid(idx);
        return;
      }

      if (selFrom == null) {
        if (myBar > 0) return;
        const v = displayPts[idx] || 0;
        const mine = vm.mySeat === 0 ? v > 0 : vm.mySeat === 1 ? v < 0 : false;
        if (!mine) {
          flashInvalid(idx);
          return;
        }
        const dests = ov2BgClientLegalDestinationsForFrom(legalityBoard, idx);
        if (dests.size === 0) {
          flashInvalid(idx);
          return;
        }
        setSelFrom(idx);
        return;
      }

      if (selFrom === "bar") {
        if (!legalDest.has(idx)) {
          flashInvalid(idx);
          return;
        }
        await tryCompleteMove(-1, idx);
        return;
      }

      const from = selFrom;
      if (typeof from === "number" && from === idx) {
        resetSelection();
        return;
      }

      // 1) Legal destination from current selection — complete (including landing on own stack)
      if (legalDest.has(idx)) {
        await tryCompleteMove(from, idx);
        return;
      }

      const v = displayPts[idx] || 0;
      const mine = vm.mySeat === 0 ? v > 0 : vm.mySeat === 1 ? v < 0 : false;
      // 2) Else switch origin to another of my points that has legal moves from itself
      if (mine) {
        const dests = ov2BgClientLegalDestinationsForFrom(legalityBoard, idx);
        if (dests.size === 0) {
          flashInvalid(idx);
          return;
        }
        setSelFrom(idx);
        return;
      }

      flashInvalid(idx);
    },
    [
      vm,
      busy,
      myBar,
      selFrom,
      displayPts,
      legalDest,
      legalityBoard,
      tryCompleteMove,
      flashInvalid,
      setErr,
      resetSelection,
    ]
  );

  const onBearOffClick = useCallback(async () => {
    if (vm.readOnly || busy || selFrom == null || selFrom === "bar") return;
    if (!legalDest.has(-1)) {
      flashInvalid(-1);
      return;
    }
    await tryCompleteMove(selFrom, -1);
  }, [vm.readOnly, busy, selFrom, legalDest, tryCompleteMove, flashInvalid]);

  const onBarClick = useCallback(() => {
    if (vm.readOnly || busy || String(vm.phase) !== "playing" || !vm.canClientMove) return;
    if (myBar <= 0) return;
    const dests = ov2BgClientLegalDestinationsForFrom(legalityBoard, -1);
    if (dests.size === 0) {
      flashInvalid(-2);
      return;
    }
    setSelFrom(s => (s === "bar" ? null : "bar"));
  }, [vm.readOnly, busy, vm.phase, vm.canClientMove, myBar, legalityBoard, flashInvalid]);

  useEffect(() => {
    if (
      !autoRoll ||
      !vm.canClientRoll ||
      busy ||
      vm.readOnly ||
      String(vm.phase) !== "playing" ||
      vm.mySeat == null ||
      vm.turnSeat == null ||
      vm.mySeat !== vm.turnSeat
    )
      return;
    const sid = String(vm.sessionId || "").trim();
    if (!sid) return;
    const gen = ++autoRollEffectGenRef.current;
    const t = window.setTimeout(() => {
      if (gen !== autoRollEffectGenRef.current) return;
      if (autoRollBusyRef.current) return;
      autoRollBusyRef.current = true;
      void (async () => {
        try {
          await roll();
        } finally {
          autoRollBusyRef.current = false;
        }
      })();
    }, 400);
    return () => window.clearTimeout(t);
  }, [
    autoRoll,
    vm.canClientRoll,
    busy,
    vm.readOnly,
    vm.phase,
    vm.revision,
    vm.sessionId,
    vm.turnSeat,
    vm.mySeat,
    roll,
    err,
  ]);

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
  const isLiveMatch = Boolean(room?.active_session_id) && String(vm.phase).toLowerCase() === "playing";
  const didIWin = vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat === vm.mySeat;
  const canHostStartNext = isHost && isFinished && eligibleRematch >= 2 && readyRematch >= eligibleRematch;

  const finishSessionId = isFinished ? String(vm.sessionId || "").trim() : "";

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [room?.active_session_id]);

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

  const showResultModal = isFinished && finishSessionId.length > 0 && !finishModalDismissed;

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
          value={displayPts[i] ?? 0}
          mySeat={vm.mySeat}
          selectedFrom={typeof selFrom === "number" && selFrom === i}
          highlightDestination={selFrom != null && legalDest.has(i)}
          invalidFlash={invalidFlashIdx === i}
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

  const offS1 = displayOff[1] ?? 0;
  const offS0 = displayOff[0] ?? 0;
  const bearHighlight = selFrom != null && typeof selFrom === "number" && legalDest.has(-1);
  const barInvalidTop = invalidFlashIdx === -2 && vm.mySeat === 1;
  const barInvalidBot = invalidFlashIdx === -2 && vm.mySeat === 0;

  const barCol = (
    <div className="flex w-9 shrink-0 flex-col border-x border-amber-900/90 bg-gradient-to-b from-zinc-900 to-black sm:w-11 md:w-14">
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 1 || displayBar[1] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 1) return;
          void onBarClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 sm:py-1.5 ${
          vm.mySeat === 1 && myBar > 0 && selFrom === "bar"
            ? "bg-sky-900/55 text-sky-50 ring-2 ring-sky-400/80 ring-inset"
            : ""
        } ${barInvalidTop ? "animate-pulse ring-2 ring-rose-500/60 ring-inset" : ""} disabled:opacity-40`}
        aria-label="Bar, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-100/95 sm:text-[9px] md:text-[10px] md:tracking-[0.24em]">
          Bar
        </span>
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P2</span>
        <CheckerStack count={-Math.max(0, displayBar[1])} maxVisible={5} compact={compactBoard} />
      </button>
      <div className="h-px shrink-0 bg-black/60" aria-hidden />
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 0 || displayBar[0] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 0) return;
          void onBarClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 sm:py-1.5 ${
          vm.mySeat === 0 && myBar > 0 && selFrom === "bar"
            ? "bg-sky-900/55 text-sky-50 ring-2 ring-sky-400/80 ring-inset"
            : ""
        } ${barInvalidBot ? "animate-pulse ring-2 ring-rose-500/60 ring-inset" : ""} disabled:opacity-40`}
        aria-label="Bar, seat one"
      >
        <CheckerStack count={Math.max(0, displayBar[0])} maxVisible={5} compact={compactBoard} />
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
        disabled={!bearHighlight || vm.mySeat !== 1}
        onClick={() => {
          if (vm.mySeat === 1) void onBearOffClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-start gap-1 border-b border-black/30 py-1 sm:py-1.5 ${
          bearHighlight && vm.mySeat === 1
            ? "bg-emerald-950/35 ring-2 ring-inset ring-emerald-400/55 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
            : ""
        } ${invalidFlashIdx === -1 ? "animate-pulse ring-rose-500/50" : ""} disabled:cursor-default disabled:opacity-60`}
        aria-label="Borne off, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-100/90 sm:text-[9px] md:text-[10px]">Off</span>
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P2</span>
        <CheckerStack count={-offS1} maxVisible={6} compact={compactBoard} />
      </button>
      <button
        type="button"
        disabled={!bearHighlight || vm.mySeat !== 0}
        onClick={() => {
          if (vm.mySeat === 0) void onBearOffClick();
        }}
        className={`flex min-h-0 flex-1 flex-col items-center justify-end gap-1 py-1 sm:py-1.5 ${
          bearHighlight && vm.mySeat === 0
            ? "bg-emerald-950/35 ring-2 ring-inset ring-emerald-400/55 shadow-[0_0_12px_rgba(52,211,153,0.25)]"
            : ""
        } disabled:cursor-default disabled:opacity-60`}
        aria-label="Borne off, seat one"
      >
        <CheckerStack count={offS0} maxVisible={6} compact={compactBoard} />
        <span className="text-[7px] font-semibold text-zinc-500 sm:text-[8px]">P1</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-100/90 sm:text-[9px] md:text-[10px]">Off</span>
      </button>
    </div>
  );

  const turnTimerTone =
    vm.turnTimeLeftSec == null
      ? "border-white/15 bg-black/30 text-zinc-300"
      : vm.turnTimeLeftSec <= 5
        ? "animate-pulse border-red-500/55 bg-red-950/45 text-red-100"
        : vm.turnTimeLeftSec <= 10
          ? "border-amber-500/50 bg-amber-950/40 text-amber-100"
          : "border-sky-500/40 bg-sky-950/30 text-sky-100";

  const myMiss =
    vm.mySeat === 0 ? vm.missedStreakBySeat[0] : vm.mySeat === 1 ? vm.missedStreakBySeat[1] : 0;
  const oppMiss =
    vm.mySeat === 0 ? vm.missedStreakBySeat[1] : vm.mySeat === 1 ? vm.missedStreakBySeat[0] : 0;

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${vm.winnerSeat + 1}`;
  }, [members, vm.winnerSeat]);

  const finishedPanel = (
    <div className="mt-3 flex w-full max-w-sm flex-col gap-2">
      {eligibleRematch >= 2 ? (
        <p className="text-center text-[10px] text-zinc-400">Rematch: {readyRematch}/{eligibleRematch} ready</p>
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
          {rematchBusy ? "…" : myRematchRequested ? "Cancel rematch" : "REMATCH"}
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
          className="w-full rounded-md border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-bold uppercase tracking-wide text-emerald-100 disabled:opacity-45"
        >
          {startNextBusy ? "…" : "NEXT MATCH"}
        </button>
      ) : null}
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
        className="w-full rounded-md border border-red-500/50 bg-red-950/40 py-2 text-xs font-bold uppercase tracking-wide text-red-100 disabled:opacity-45"
      >
        {exitBusy ? "…" : "LEAVE"}
      </button>
      <button
        type="button"
        disabled={exitBusy}
        onClick={() => void router.replace({ pathname: "/online-v2/rooms", query: { room: roomId } }, undefined, { shallow: true })}
        className="w-full rounded-md border border-white/20 bg-white/5 py-2 text-xs font-semibold text-zinc-300"
      >
        Room lobby
      </button>
      {exitErr ? <p className="text-center text-[10px] text-red-300">{exitErr}</p> : null}
    </div>
  );

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col gap-0.5 overflow-hidden px-1 pb-0.5 pt-0 text-white sm:gap-1 sm:px-2 sm:pb-1">
      <div className="shrink-0 rounded-md border border-white/10 bg-black/35 px-1.5 py-1 sm:px-2 sm:py-1.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="min-w-0 text-[8px] leading-snug text-zinc-300 sm:text-[9px] md:text-[10px]">
            <span className="font-medium">
              You P{vm.mySeat != null ? vm.mySeat + 1 : "—"} · off{" "}
              {vm.mySeat === 0 ? offS0 : vm.mySeat === 1 ? offS1 : "—"}/15
              {myBar > 0 ? <span className="text-amber-200/95"> · bar {myBar}</span> : null}
            </span>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {String(vm.phase) === "playing" && vm.turnDeadline != null ? (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold tabular-nums sm:px-2 sm:py-1 sm:text-[10px] ${turnTimerTone}`}
                title="Turn time remaining"
              >
                {vm.turnTimeLeftSec != null ? `${vm.turnTimeLeftSec}s` : "—"}
              </span>
            ) : String(vm.phase) === "playing" ? (
              <span className="shrink-0 text-[9px] text-zinc-500 sm:text-[10px]">
                Turn P{vm.turnSeat != null ? vm.turnSeat + 1 : "—"}
              </span>
            ) : null}
            {String(vm.phase) === "playing" ? (
              <span className="text-[8px] font-medium tabular-nums text-zinc-400 sm:text-[9px]">
                Miss: {myMiss}/3
                <span className="hidden sm:inline"> · opp {oppMiss}/3</span>
              </span>
            ) : null}
            {Array.isArray(vm.dice) ? (
              <span className="pointer-events-none select-none font-mono text-zinc-500" aria-hidden>
                {JSON.stringify(vm.dice)}
                {draftBase ? (
                  <span className="ml-1 text-emerald-400/90" title="Dice remaining (draft)">
                    →{JSON.stringify(displayDiceAvail)}
                  </span>
                ) : null}
              </span>
            ) : null}
            {isLiveMatch && onLeaveToLobby ? (
              <button
                type="button"
                disabled={leaveToLobbyBusy}
                onClick={() => void onLeaveToLobby()}
                className="shrink-0 rounded-md border border-red-500/55 bg-red-950/45 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-red-100 shadow-sm shadow-black/20 disabled:pointer-events-none disabled:opacity-45 sm:px-3 sm:py-1.5 sm:text-[11px]"
              >
                {leaveToLobbyBusy ? "…" : "LEAVE"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {vaultClaimBusy ? (
        <p className="shrink-0 text-center text-[9px] text-zinc-400 sm:text-[10px]">Updating balance…</p>
      ) : null}

      {err ? (
        <div className="shrink-0 rounded border border-amber-500/35 bg-amber-950/30 px-1.5 py-0.5 text-[8px] text-amber-100 sm:px-2 sm:py-1 sm:text-[9px]">
          {err}
          <button type="button" className="ml-1.5 underline" onClick={() => setErr("")}>
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="flex shrink-0 flex-wrap items-center gap-1 sm:gap-1.5">
        {String(vm.phase) === "playing" ? (
          <button
            type="button"
            onClick={() => persistAutoRoll(!autoRoll)}
            className={`rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide sm:py-1.5 sm:text-[10px] ${
              autoRoll
                ? "border-amber-400/60 bg-amber-950/50 text-amber-100 shadow-sm shadow-amber-950/25"
                : "border-white/20 bg-white/5 text-zinc-500"
            }`}
          >
            Auto
          </button>
        ) : null}
        {vm.canClientRoll ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void roll()}
            className="rounded-md border border-violet-500/45 bg-violet-950/40 px-2 py-1 text-[9px] font-bold text-violet-100 disabled:opacity-45 sm:px-2.5 sm:py-1.5 sm:text-[10px] md:text-xs"
          >
            {busy ? "Rolling…" : "Roll"}
          </button>
        ) : null}
        {vm.canClientMove && selFrom != null ? (
          <button type="button" className="text-[8px] text-zinc-500 underline sm:text-[9px]" onClick={resetSelection}>
            Clear selection
          </button>
        ) : null}
        {draftBase ? (
          <>
            <button
              type="button"
              disabled={busy || draftSteps.length === 0}
              onClick={() => undoDraft()}
              className="rounded-md border border-zinc-500/40 bg-zinc-900/50 px-2 py-1 text-[9px] font-semibold text-zinc-200 disabled:opacity-40 sm:text-[10px]"
            >
              Undo
            </button>
            <button
              type="button"
              disabled={busy || draftSteps.length === 0}
              onClick={() => resetDraft()}
              className="rounded-md border border-zinc-500/40 bg-zinc-900/50 px-2 py-1 text-[9px] font-semibold text-zinc-200 disabled:opacity-40 sm:text-[10px]"
            >
              Reset
            </button>
            <button
              type="button"
              disabled={busy || !submitValidation.ok}
              onClick={() => void confirmTurn()}
              className="rounded-md border border-emerald-500/55 bg-emerald-950/40 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-emerald-100 disabled:opacity-40 sm:text-[10px]"
            >
              {busy ? "…" : "Confirm turn"}
            </button>
          </>
        ) : null}
      </div>

      {pendingDieChoice && vm.canClientMove && String(vm.phase) === "playing" ? (
        <div
          className="flex shrink-0 flex-wrap items-center gap-1.5 rounded-md border border-sky-500/40 bg-sky-950/35 px-2 py-1.5 sm:gap-2"
          role="dialog"
          aria-label="Choose die for this move"
        >
          <span className="text-[9px] font-semibold text-sky-100 sm:text-[10px]">Which die?</span>
          <div className="flex flex-wrap gap-1">
            {pendingDieChoice.dice.map(d => (
              <button
                key={d}
                type="button"
                disabled={busy}
                onClick={() => void confirmDieChoice(d)}
                className="min-w-[2rem] rounded border border-sky-400/60 bg-sky-900/50 px-2 py-0.5 text-xs font-bold tabular-nums text-sky-50 disabled:opacity-45 sm:px-2.5 sm:py-1"
              >
                {d}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="text-[8px] text-zinc-400 underline sm:text-[9px]"
            onClick={() => setPendingDieChoice(null)}
          >
            Cancel
          </button>
        </div>
      ) : null}

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
            <div className={`flex h-full min-h-0 min-w-0 flex-1 ${boardColDir}`}>
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(TOP_OUTER, "down")}</div>
              <div className="h-px shrink-0 bg-black/50" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(BOT_OUTER, "up")}</div>
            </div>
            {barCol}
            <div className={`flex h-full min-h-0 min-w-0 flex-1 ${boardColDir}`}>
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(TOP_HOME_S1, "down")}</div>
              <div className="h-px shrink-0 bg-black/50" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(BOT_HOME_S0, "up")}</div>
            </div>
            {offColumn}
          </div>
        </div>
      </div>

      <span className="sr-only">
        Backgammon table: your home is shown toward the bottom; bar between halves. Confirm turn to commit moves.
      </span>

      {isFinished ? (
        showResultModal ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3 backdrop-blur-[2px]">
            <div className="w-full max-w-sm rounded-xl border border-white/20 bg-zinc-900/95 p-4 text-center shadow-2xl sm:max-w-md">
              <p
                className={`text-lg font-bold uppercase tracking-wide sm:text-xl ${
                  didIWin ? "text-emerald-200" : vm.mySeat != null ? "text-red-300" : "text-white"
                }`}
              >
                {didIWin ? "YOU WIN" : vm.mySeat != null ? "YOU LOSE" : "MATCH OVER"}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                {vm.winnerSeat != null ? (
                  <>
                    Winner: <span className="font-semibold text-zinc-100">{winnerDisplayName}</span>
                  </>
                ) : (
                  "Match complete"
                )}
              </p>
              {stakePerSeat != null ? (
                <p className="mt-2 text-[11px] text-zinc-400">
                  Entry {stakePerSeat.toLocaleString()} · pot {(stakePerSeat * 2).toLocaleString()}
                </p>
              ) : null}
              {didIWin && stakePerSeat != null ? (
                <p className="mt-1 text-sm font-semibold text-emerald-300/95">
                  You take the pot ({(stakePerSeat * 2).toLocaleString()})
                </p>
              ) : null}
              {!didIWin && vm.mySeat != null && stakePerSeat != null ? (
                <p className="mt-1 text-sm font-semibold text-red-400/95">Entry settled ({stakePerSeat.toLocaleString()})</p>
              ) : null}
              {finishedPanel}
              <button
                type="button"
                className="mt-3 w-full rounded-md border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-100"
                onClick={() => {
                  try {
                    window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
                  } catch {
                    /* ignore */
                  }
                  setFinishModalDismissedSessionId(finishSessionId);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="shrink-0 rounded-xl border border-white/15 bg-black/40 p-3">{finishedPanel}</div>
        )
      ) : null}
    </div>
  );
}
