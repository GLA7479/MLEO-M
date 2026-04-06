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

/** Pure UI: shared motion + micro-interactions. Shadow tokens: base + ambient only (see --ov2bg-sh-*). */
const OV2BG_STYLE = `
.ov2-backgammon-root{
  --ov2bg-ease:cubic-bezier(0.22,1,0.36,1);
  --ov2bg-ease-dice:cubic-bezier(0.34,1.2,0.42,1);
  --ov2bg-fast:120ms;
  --ov2bg-mid:180ms;
  --ov2bg-mid-dice:160ms;
  --ov2bg-slow:260ms;
  --ov2bg-sh-base:0 2px 4px rgba(0,0,0,0.35);
  --ov2bg-sh-ambient:0 8px 20px rgba(0,0,0,0.25);
  --ov2bg-sh-rest:0 2px 4px rgba(0,0,0,0.24),0 8px 20px rgba(0,0,0,0.16);
}
.ov2bg-frame-sh{box-shadow:var(--ov2bg-sh-base),var(--ov2bg-sh-ambient)}
@keyframes ov2bg-dice-kick{
  0%{transform:translate3d(0,0,0) scale3d(1,1,1) rotate(0)}
  58%{transform:translate3d(0,0,0) scale3d(1.08,1.08,1) rotate(-4deg)}
  100%{transform:translate3d(0,0,0) scale3d(1,1,1) rotate(0)}
}
.ov2bg-dice-kick{animation:ov2bg-dice-kick var(--ov2bg-mid-dice) var(--ov2bg-ease-dice) 1}
@keyframes ov2bg-hit-pop{
  0%{transform:translate3d(0,0,0) scale3d(1,1,1)}
  50%{transform:translate3d(0,0,0) scale3d(1.08,1.08,1)}
  100%{transform:translate3d(0,0,0) scale3d(1,1,1)}
}
.ov2bg-hit-pop{animation:ov2bg-hit-pop 140ms var(--ov2bg-ease) 1}
@keyframes ov2bg-move-nudge{from{transform:translate3d(0,6px,0);opacity:0.94}to{transform:translate3d(0,0,0);opacity:1}}
.ov2bg-move-nudge{animation:ov2bg-move-nudge var(--ov2bg-mid) var(--ov2bg-ease) 1}
@keyframes ov2bg-bar-enter{from{transform:translate3d(0,5px,0);opacity:0.82}to{transform:translate3d(0,0,0);opacity:1}}
.ov2bg-bar-enter{animation:ov2bg-bar-enter var(--ov2bg-mid) var(--ov2bg-ease) 1}
@keyframes ov2bg-bg-breath{0%,100%{opacity:0.988}50%{opacity:1}}
.ov2-backgammon-root.ov2bg-bg-breath::before{animation:ov2bg-bg-breath 8s ease-in-out infinite}
.ov2bg-btn{
  transition-property:transform,box-shadow,opacity;
  transition-duration:var(--ov2bg-fast);
  transition-timing-function:var(--ov2bg-ease);
  box-shadow:var(--ov2bg-sh-rest);
}
.ov2bg-btn:hover:not(:disabled){box-shadow:var(--ov2bg-sh-base),var(--ov2bg-sh-ambient)}
.ov2bg-btn:disabled{box-shadow:none}
.ov2bg-btn--flat,.ov2bg-btn--flat:hover:not(:disabled){box-shadow:none!important}
@media (prefers-reduced-motion:reduce){
  .ov2bg-dice-kick,.ov2bg-hit-pop,.ov2bg-move-nudge,.ov2bg-bar-enter,.ov2-backgammon-root.ov2bg-bg-breath::before{animation:none!important}
}
`;

/** Solid controls: identical hover lift + press + timing; color via Tailwind only. */
const OV2BG_BTN =
  "ov2bg-btn hover:-translate-y-px active:scale-[0.97] disabled:pointer-events-none disabled:!opacity-40";

/** Text-style controls: same motion, no elevation shadow. */
const OV2BG_BTN_FLAT =
  "ov2bg-btn ov2bg-btn--flat hover:-translate-y-px active:scale-[0.97] disabled:pointer-events-none disabled:!opacity-40";

/** Product shadow stack (base + ambient); use with inline material insets where needed. */
const OV2BG_SH_OUT = "0 2px 4px rgba(0,0,0,0.35), 0 8px 20px rgba(0,0,0,0.25)";

/**
 * Visual column order must match real board geometry: top-left column j pairs index (12+j) above with (11−j) below
 * (standard 13–18 over 12–7). Bottom outer is already [11..6] L→R; top outer must be [12..17] L→R — not reversed.
 */
const TOP_OUTER = [12, 13, 14, 15, 16, 17];
const TOP_HOME_S1 = [18, 19, 20, 21, 22, 23];
const BOT_OUTER = [11, 10, 9, 8, 7, 6];
const BOT_HOME_S0 = [5, 4, 3, 2, 1, 0];

/** 3×3 cell indices (0–8) for standard pip layouts */
const DIE_PIPS = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 3, 6, 2, 5, 8],
};

/**
 * @param {{ value: number }} props
 */
function DieFace({ value }) {
  const v = Math.min(6, Math.max(1, Math.round(Number(value)) || 1));
  const cells = DIE_PIPS[v] || DIE_PIPS[1];
  return (
    <div
      className="grid aspect-square min-h-[1.6rem] min-w-[1.6rem] grid-cols-3 grid-rows-3 gap-px rounded-md border border-zinc-600/55 bg-[#f4f3f1] p-0.5 sm:min-h-8 sm:min-w-8 sm:gap-0.5 sm:p-1"
      style={{
        boxShadow: `${OV2BG_SH_OUT}, inset 0 1px 0 rgba(255,255,255,0.88), inset 1px 1px 0 rgba(255,255,255,0.35)`,
      }}
      aria-hidden
    >
      {Array.from({ length: 9 }, (_, i) => (
        <div
          key={i}
          className={`min-h-0 min-w-0 rounded-full ${cells.includes(i) ? "bg-[#111] shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)]" : "bg-transparent"}`}
        />
      ))}
    </div>
  );
}

/**
 * @param {{ dice: unknown, bump: boolean, className?: string }} props
 */
function DiceTray({ dice, bump, className = "" }) {
  if (!Array.isArray(dice) || dice.length < 2) return null;
  const a = Math.min(6, Math.max(1, Math.round(Number(dice[0])) || 1));
  const b = Math.min(6, Math.max(1, Math.round(Number(dice[1])) || 1));
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 sm:gap-1 ${bump ? "ov2bg-dice-kick will-change-transform" : ""} ${className}`}
    >
      <DieFace value={a} />
      <DieFace value={b} />
    </span>
  );
}

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
    ? "h-[18px] w-[18px] min-h-[18px] min-w-[18px] border border-black/45 ring-1 ring-black/15 transition-transform duration-[120ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:h-5 sm:w-5 sm:min-h-5 sm:min-w-5"
    : "h-5 w-5 min-h-5 min-w-5 border border-black/45 ring-1 ring-black/18 transition-transform duration-[120ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] sm:h-[1.4rem] sm:w-[1.4rem] sm:min-h-[1.4rem] sm:min-w-[1.4rem] md:h-6 md:w-6 md:min-h-6 md:min-w-6 lg:h-[1.65rem] lg:w-[1.65rem] lg:min-h-[1.65rem] lg:min-w-[1.65rem]";
  const disks = n > maxVisible ? maxVisible - 1 : n;
  const label =
    n > maxVisible ? (
      <span
        className={`shrink-0 text-[8px] font-bold tabular-nums leading-none text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.55)] sm:text-[9px] md:text-[10px] ${
          stackFrom === "top" ? "mb-px sm:mb-0.5" : "mt-px sm:mt-0.5"
        }`}
      >
        {n}
      </span>
    ) : null;
  const diskEls = Array.from({ length: disks }, (_, i) => {
    const visualDepth = stackFrom === "bottom" ? disks - 1 - i : i;
    const d = Math.min(visualDepth, 4);
    const brightLight = (1.018 + Math.max(0, 0.012 - d * 0.003)) * 1.05;
    const brightDark = (1.012 - d * 0.002) * 0.9;
    const insetLight = `${OV2BG_SH_OUT}, inset 1px 1px 0 rgba(255,255,255,0.28), inset 0 -1px 2px rgba(0,0,0,0.05)`;
    const insetDark = `${OV2BG_SH_OUT}, inset 0 3px 6px rgba(255,255,255,0.055), inset 0 -2px 4px rgba(0,0,0,0.35)`;
    return (
      <div
        key={i}
        className={`shrink-0 rounded-full ${dot} ${
          isLight
            ? "bg-gradient-to-br from-[#f7f3eb] via-[#efe8db] to-[#e8e0d2]"
            : "bg-gradient-to-b from-zinc-600 via-zinc-800 to-zinc-950 ring-1 ring-white/[0.09]"
        }`}
        style={{
          boxShadow: isLight ? insetLight : insetDark,
          filter: `brightness(${(isLight ? brightLight : brightDark).toFixed(3)})`,
        }}
      />
    );
  });
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
 *   selectedFrom: boolean,
 *   highlightDestination: boolean,
 *   invalidFlash: boolean,
 *   disabled: boolean,
 *   checkerSurfaceClass: string,
 *   direction: 'down' | 'up',
 *   tone: 'a' | 'b',
 *   compact: boolean,
 *   onPointClick: (i: number) => void,
 * }} props
 */
function BoardPoint({
  pointIndex,
  value,
  selectedFrom,
  highlightDestination,
  invalidFlash,
  disabled,
  checkerSurfaceClass,
  direction,
  tone,
  compact,
  onPointClick,
}) {
  const fill = tone === "a" ? "bg-[#f4e2bf]" : "bg-[#922f35]";
  const clip = direction === "down" ? "polygon(50% 100%, 0 0, 100% 0)" : "polygon(50% 0, 0 100%, 100% 100%)";
  const triStyle = {
    clipPath: clip,
    transform: "translateZ(0)",
    WebkitBackfaceVisibility: "hidden",
    filter: "contrast(1.05)",
  };
  const pointHighlightClass = invalidFlash
    ? "ring-1 ring-rose-500/50"
    : selectedFrom
      ? "ring-2 ring-white/40"
      : highlightDestination
        ? "ring-1 ring-white/25"
        : "";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPointClick(pointIndex)}
      className={`group relative isolate flex h-full min-h-0 min-w-0 flex-1 flex-col items-stretch overflow-visible opacity-100 outline-none transition-[transform,opacity] duration-[120ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] ${pointHighlightClass} disabled:cursor-not-allowed disabled:!opacity-100 disabled:pointer-events-none`}
      style={{ WebkitTapHighlightColor: "transparent" }}
      aria-label={`Point ${pointIndex + 1}`}
    >
      <div
        className={`pointer-events-none relative mx-auto min-h-0 w-[86%] flex-1 max-md:min-h-[1.5rem] sm:w-[88%] md:min-h-[2.25rem] md:w-[88%] lg:min-h-[2.75rem] xl:min-h-[3.25rem] ${fill}`}
        style={triStyle}
      />
      {direction === "down" ? (
        <div
          className={`pointer-events-none absolute left-[7%] right-[7%] top-0 z-[1] flex transform-gpu flex-col items-center justify-start pt-0.5 transition-transform duration-[120ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-active:scale-[1.06] group-active:will-change-transform sm:left-[6%] sm:right-[6%] sm:pt-1 ${checkerSurfaceClass}`}
        >
          <CheckerStack count={value} compact={compact} stackFrom="top" />
        </div>
      ) : (
        <div
          className={`pointer-events-none absolute bottom-0 left-[7%] right-[7%] top-auto z-[1] flex transform-gpu flex-col items-center justify-end pb-0.5 transition-transform duration-[120ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-active:scale-[1.06] group-active:will-change-transform sm:left-[6%] sm:right-[6%] sm:pb-1 ${checkerSurfaceClass}`}
        >
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
  const [diceBump, setDiceBump] = useState(false);
  const prevDiceJsonRef = useRef("");
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

  /** UI-only: brief scale pop when rolled dice values change */
  useEffect(() => {
    const s =
      Array.isArray(vm.dice) && vm.dice.length >= 2 ? JSON.stringify([Number(vm.dice[0]), Number(vm.dice[1])]) : "";
    if (!s) {
      prevDiceJsonRef.current = "";
      return;
    }
    if (prevDiceJsonRef.current && prevDiceJsonRef.current !== s) {
      setDiceBump(true);
      const t = window.setTimeout(() => setDiceBump(false), 175);
      prevDiceJsonRef.current = s;
      return () => window.clearTimeout(t);
    }
    prevDiceJsonRef.current = s;
  }, [vm.dice]);

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

  /** UI-only: motion cues when the displayed board/bar changes (draft or server); does not affect legality or RPC. */
  const [surfaceAnim, setSurfaceAnim] = useState(
    /** @type {{ move?: Set<number>, hit?: number | null, bar?: number | null }} */ ({})
  );
  const surfaceAnimClearRef = useRef(/** @type {number | null} */ (null));
  const prevBoardAnimRef = useRef(/** @type {{ pts: number[]; bar: number[] } | null} */ (null));
  const boardAnimSeededRef = useRef(false);

  useEffect(() => {
    boardAnimSeededRef.current = false;
    prevBoardAnimRef.current = null;
  }, [vm.sessionId]);

  useEffect(() => {
    const bar = Array.isArray(displayBar) ? displayBar.map(x => Number(x) || 0) : [0, 0];
    while (bar.length < 2) bar.push(0);
    if (!boardAnimSeededRef.current) {
      prevBoardAnimRef.current = { pts: displayPts.slice(), bar: bar.slice(0, 2) };
      boardAnimSeededRef.current = true;
      return;
    }
    const prev = prevBoardAnimRef.current;
    if (!prev) return;

    const moves = new Set();
    for (let pi = 0; pi < 24; pi++) {
      if ((displayPts[pi] ?? 0) !== (prev.pts[pi] ?? 0)) moves.add(pi);
    }

    let hitIdx = /** @type {number | null} */ (null);
    const mySign = vm.mySeat === 0 ? 1 : vm.mySeat === 1 ? -1 : 0;
    if (mySign) {
      for (let j = 0; j < 24; j++) {
        const p0 = prev.pts[j] ?? 0;
        const p1 = displayPts[j] ?? 0;
        if (Math.abs(p0) === 1 && Math.sign(p0) === -mySign && p1 !== 0 && Math.sign(p1) === mySign) {
          hitIdx = j;
          break;
        }
      }
    }

    let barSeat = /** @type {number | null} */ (null);
    for (let s = 0; s < 2; s++) {
      const next = bar[s] ?? 0;
      const pr = prev.bar[s] ?? 0;
      if (next > pr) barSeat = s;
    }

    prevBoardAnimRef.current = { pts: displayPts.slice(), bar: bar.slice(0, 2) };

    if (moves.size > 0 || hitIdx != null || barSeat != null) {
      setSurfaceAnim({
        move: moves.size > 0 ? moves : undefined,
        hit: hitIdx,
        bar: barSeat,
      });
      if (surfaceAnimClearRef.current != null) window.clearTimeout(surfaceAnimClearRef.current);
      surfaceAnimClearRef.current = window.setTimeout(() => {
        setSurfaceAnim({});
        surfaceAnimClearRef.current = null;
      }, 220);
    }
    return () => {
      if (surfaceAnimClearRef.current != null) window.clearTimeout(surfaceAnimClearRef.current);
    };
  }, [displayPts, displayBar, vm.mySeat]);

  const [hudTurnOpacity, setHudTurnOpacity] = useState(1);
  const prevTurnFadeRef = useRef(/** @type {unknown} */ (undefined));

  useEffect(() => {
    prevTurnFadeRef.current = undefined;
  }, [vm.sessionId]);

  useEffect(() => {
    if (prevTurnFadeRef.current === undefined) {
      prevTurnFadeRef.current = vm.turnSeat;
      return;
    }
    if (prevTurnFadeRef.current === vm.turnSeat) return;
    prevTurnFadeRef.current = vm.turnSeat;
    setHudTurnOpacity(0.72);
    const t = window.setTimeout(() => setHudTurnOpacity(1), 180);
    return () => window.clearTimeout(t);
  }, [vm.turnSeat]);

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

  /** Seat 1 sees the same shell as seat 0 but swaps outer/home vertical halves + triangle dirs (engine indices unchanged). */
  const swapBoardHalvesForViewer = vm.mySeat === 1;
  const leftTopIndices = swapBoardHalvesForViewer ? BOT_OUTER : TOP_OUTER;
  const leftTopDir = swapBoardHalvesForViewer ? "down" : "down";
  const leftBotIndices = swapBoardHalvesForViewer ? TOP_OUTER : BOT_OUTER;
  const leftBotDir = swapBoardHalvesForViewer ? "up" : "up";
  const rightTopIndices = swapBoardHalvesForViewer ? BOT_HOME_S0 : TOP_HOME_S1;
  const rightTopDir = swapBoardHalvesForViewer ? "down" : "down";
  const rightBotIndices = swapBoardHalvesForViewer ? TOP_HOME_S1 : BOT_HOME_S0;
  const rightBotDir = swapBoardHalvesForViewer ? "up" : "up";

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
  /** UI only: slightly richer inner wood while a match is actively in `playing` phase (vs finished / between states). */
  const activePlayFelt = String(vm.phase).toLowerCase() === "playing";
  /** Inner playfield — two-stop wood + single hairline highlight (no heavy insets). */
  const feltPlaySurface =
    "[background:linear-gradient(180deg,#6b4630,#5a3928)] shadow-[inset_0_1px_0_rgba(255,255,255,0.05),inset_0_-1px_0_rgba(0,0,0,0.08)]";
  /** Center bar — flat wood + crisp inset frame. */
  const feltBarRailSurface = "bg-[#553628] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.4)]";
  /** Off rail — flat, minimal edge (no stacked depth shadows). */
  const feltOffRailSurface = activePlayFelt
    ? "bg-[#4e3428] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.36)]"
    : "bg-[#4e3428] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.33)]";

  const toneAt = useCallback(i => (i % 2 === 0 ? "a" : "b"), []);

  const renderHalfRow = (indices, direction) => (
    <div className="flex h-full min-h-0 min-w-0 flex-1 flex-row gap-px sm:gap-1">
      {indices.map(i => (
        <BoardPoint
          key={i}
          pointIndex={i}
          value={displayPts[i] ?? 0}
          selectedFrom={typeof selFrom === "number" && selFrom === i}
          highlightDestination={selFrom != null && legalDest.has(i)}
          invalidFlash={invalidFlashIdx === i}
          disabled={boardDisabled}
          checkerSurfaceClass={
            surfaceAnim.hit === i ? "ov2bg-hit-pop" : surfaceAnim.move?.has(i) ? "ov2bg-move-nudge" : ""
          }
          direction={direction}
          tone={toneAt(i)}
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
    <div
      className={`flex w-9 shrink-0 flex-col border-x border-[rgba(255,255,255,0.06)] ${feltBarRailSurface} sm:w-11 md:w-14 ${
        swapBoardHalvesForViewer ? "flex-col-reverse" : ""
      }`}
    >
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 1 || displayBar[1] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 1) return;
          void onBarClick();
        }}
        className={`${OV2BG_BTN} flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 disabled:!opacity-100 sm:py-1.5 ${
          vm.mySeat === 1 && myBar > 0 && selFrom === "bar"
            ? "bg-[rgba(74,47,34,0.55)] text-amber-50 ring-2 ring-amber-200/45 ring-inset"
            : ""
        } ${barInvalidTop ? "animate-pulse ring-2 ring-rose-500/50 ring-inset" : ""}`}
        aria-label="Bar, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-50 sm:text-[9px] md:text-[10px] md:tracking-[0.24em]">
          Bar
        </span>
        <span className="text-[7px] font-semibold text-zinc-200 sm:text-[8px]">P2</span>
        <CheckerStack
          count={-Math.max(0, displayBar[1])}
          maxVisible={5}
          compact={compactBoard}
          className={surfaceAnim.bar === 1 ? "ov2bg-bar-enter" : ""}
        />
      </button>
      <div className="h-px shrink-0 bg-[rgba(255,255,255,0.06)]" aria-hidden />
      <button
        type="button"
        disabled={boardDisabled || vm.mySeat !== 0 || displayBar[0] <= 0 || !vm.canClientMove}
        onClick={() => {
          if (vm.mySeat !== 0) return;
          void onBarClick();
        }}
        className={`${OV2BG_BTN} flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-0.5 py-1 disabled:!opacity-100 sm:py-1.5 ${
          vm.mySeat === 0 && myBar > 0 && selFrom === "bar"
            ? "bg-[rgba(74,47,34,0.55)] text-amber-50 ring-2 ring-amber-200/45 ring-inset"
            : ""
        } ${barInvalidBot ? "animate-pulse ring-2 ring-rose-500/50 ring-inset" : ""}`}
        aria-label="Bar, seat one"
      >
        <CheckerStack
          count={Math.max(0, displayBar[0])}
          maxVisible={5}
          compact={compactBoard}
          className={surfaceAnim.bar === 0 ? "ov2bg-bar-enter" : ""}
        />
        <span className="text-[7px] font-semibold text-zinc-200 sm:text-[8px]">P1</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-amber-50 sm:text-[9px] md:text-[10px] md:tracking-[0.24em]">
          Bar
        </span>
      </button>
    </div>
  );

  const offColumn = (
    <div
      className={`flex w-10 shrink-0 flex-col border-l border-[rgba(255,255,255,0.06)] ${feltOffRailSurface} sm:w-12 md:w-[3.25rem] ${
        swapBoardHalvesForViewer ? "flex-col-reverse" : ""
      }`}
    >
      <button
        type="button"
        disabled={!bearHighlight || vm.mySeat !== 1}
        onClick={() => {
          if (vm.mySeat === 1) void onBearOffClick();
        }}
        className={`${OV2BG_BTN} flex min-h-0 flex-1 flex-col items-center justify-start gap-1 border-b border-[rgba(255,255,255,0.06)] py-1 disabled:!opacity-100 sm:py-1.5 ${
          bearHighlight && vm.mySeat === 1
            ? "bg-[rgba(90,57,40,0.42)] ring-2 ring-inset ring-amber-300/48"
            : ""
        } ${invalidFlashIdx === -1 ? "animate-pulse ring-rose-500/45" : ""} disabled:cursor-default`}
        aria-label="Borne off, seat two"
      >
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-50/95 sm:text-[9px] md:text-[10px]">Off</span>
        <span className="text-[7px] font-semibold text-zinc-200 sm:text-[8px]">P2</span>
        <CheckerStack count={-offS1} maxVisible={6} compact={compactBoard} />
      </button>
      <button
        type="button"
        disabled={!bearHighlight || vm.mySeat !== 0}
        onClick={() => {
          if (vm.mySeat === 0) void onBearOffClick();
        }}
        className={`${OV2BG_BTN} flex min-h-0 flex-1 flex-col items-center justify-end gap-1 py-1 disabled:!opacity-100 sm:py-1.5 ${
          bearHighlight && vm.mySeat === 0
            ? "bg-[rgba(90,57,40,0.42)] ring-2 ring-inset ring-amber-300/48"
            : ""
        } disabled:cursor-default`}
        aria-label="Borne off, seat one"
      >
        <CheckerStack count={offS0} maxVisible={6} compact={compactBoard} />
        <span className="text-[7px] font-semibold text-zinc-200 sm:text-[8px]">P1</span>
        <span className="text-[8px] font-bold uppercase tracking-[0.18em] text-amber-50/95 sm:text-[9px] md:text-[10px]">Off</span>
      </button>
    </div>
  );

  const turnTimerTone =
    vm.turnTimeLeftSec == null
      ? "border-white/22 bg-zinc-900/65 text-zinc-100"
      : vm.turnTimeLeftSec <= 5
        ? "animate-pulse border-red-500/48 bg-red-950/42 text-red-50"
        : vm.turnTimeLeftSec <= 10
          ? "border-amber-500/44 bg-amber-950/38 text-amber-50"
          : "border-sky-500/40 bg-sky-950/38 text-sky-50";

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
          className={`${OV2BG_BTN} w-full rounded-md border border-sky-500/40 bg-sky-950/35 py-2 text-xs font-semibold text-sky-100`}
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
          className={`${OV2BG_BTN} w-full rounded-md border border-emerald-500/40 bg-emerald-900/30 py-2 text-xs font-bold uppercase tracking-wide text-emerald-100`}
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
        className={`${OV2BG_BTN} w-full rounded-md border border-rose-900/45 bg-rose-950/30 py-2 text-xs font-bold uppercase tracking-wide text-rose-100/95`}
      >
        {exitBusy ? "…" : "LEAVE"}
      </button>
      <button
        type="button"
        disabled={exitBusy}
        onClick={() => void router.replace({ pathname: "/online-v2/rooms", query: { room: roomId } }, undefined, { shallow: true })}
        className={`${OV2BG_BTN} w-full rounded-md border border-white/22 bg-white/[0.07] py-2 text-xs font-semibold text-zinc-200`}
      >
        Room lobby
      </button>
      {exitErr ? <p className="text-center text-[10px] text-red-300">{exitErr}</p> : null}
    </div>
  );

  return (
    <div className="ov2-backgammon-root ov2bg-bg-breath relative flex h-full min-h-0 flex-1 flex-col gap-0.5 overflow-hidden bg-[radial-gradient(ellipse_85%_65%_at_50%_42%,#0F1720_0%,#0B0F14_55%,#080b10_100%)] px-1 pb-0.5 pt-0 text-white before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(ellipse_70%_55%_at_50%_48%,transparent_0%,rgba(5,8,14,0.55)_100%)] sm:gap-1 sm:px-2 sm:pb-1">
      <style>{OV2BG_STYLE}</style>
      <div className="ov2bg-frame-sh relative z-[1] shrink-0 rounded-md border border-white/[0.09] bg-[rgba(24,28,38,0.86)] px-1.5 py-1 backdrop-blur-md sm:px-2 sm:py-1.5">
        <div
          className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2 transition-opacity duration-[180ms] [transition-timing-function:cubic-bezier(0.22,1,0.36,1)]"
          style={{ opacity: hudTurnOpacity }}
        >
          <div className="min-w-0 text-[8px] leading-snug text-zinc-200 sm:text-[9px] md:text-[10px]">
            <span className="font-medium text-zinc-100">
              You P{vm.mySeat != null ? vm.mySeat + 1 : "—"} · off{" "}
              {vm.mySeat === 0 ? offS0 : vm.mySeat === 1 ? offS1 : "—"}/15
              {myBar > 0 ? <span className="text-amber-200"> · bar {myBar}</span> : null}
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
              <span className="shrink-0 text-[9px] text-zinc-400 sm:text-[10px]">
                Turn P{vm.turnSeat != null ? vm.turnSeat + 1 : "—"}
              </span>
            ) : null}
            {String(vm.phase) === "playing" ? (
              <span className="text-[8px] font-medium tabular-nums text-zinc-300 sm:text-[9px]">
                Miss: {myMiss}/3
                <span className="hidden sm:inline"> · opp {oppMiss}/3</span>
              </span>
            ) : null}
            {Array.isArray(vm.dice) && vm.dice.length >= 2 ? (
              <span className="pointer-events-none flex items-center gap-1 select-none" title="Current roll">
                <DiceTray dice={vm.dice} bump={diceBump} />
                {draftBase ? (
                  <span className="font-mono text-[8px] text-emerald-300/95 sm:text-[9px]" title="Dice remaining (draft)">
                    [{displayDiceAvail.join(",")}]
                  </span>
                ) : null}
              </span>
            ) : null}
            {isLiveMatch && onLeaveToLobby ? (
              <button
                type="button"
                disabled={leaveToLobbyBusy}
                onClick={() => void onLeaveToLobby()}
                className={`${OV2BG_BTN} shrink-0 rounded-md border border-rose-900/48 bg-rose-950/34 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-rose-50/95 hover:border-rose-800/50 sm:px-3 sm:py-1.5 sm:text-[11px]`}
              >
                {leaveToLobbyBusy ? "…" : "LEAVE"}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-[3rem] shrink-0 flex-col justify-center gap-1 sm:min-h-[3.25rem]">
        {vaultClaimBusy ? (
          <p className="text-center text-[9px] text-zinc-300 sm:text-[10px]">Updating balance…</p>
        ) : null}
        {err ? (
          <div className="rounded border border-amber-500/40 bg-amber-950/40 px-1.5 py-0.5 text-[8px] text-amber-100 sm:px-2 sm:py-1 sm:text-[9px]">
            {err}
            <button type="button" className={`${OV2BG_BTN_FLAT} ml-1.5 underline`} onClick={() => setErr("")}>
              Dismiss
            </button>
          </div>
        ) : null}
      </div>

      <div className="relative z-[1] flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center overflow-hidden">
        <div className="flex w-full max-w-full flex-col overflow-hidden rounded-lg border border-[#472f22] bg-gradient-to-b from-[#5a3928] to-[#3b2419] p-[2px] shadow-[0_0_0_1px_rgba(0,0,0,0.55),0_6px_16px_rgba(0,0,0,0.18)] max-md:h-[min(43svh,86vw)] max-md:max-h-[44svh] max-md:flex-none sm:rounded-xl sm:p-0.5 md:h-[min(62vh,572px)] md:max-w-4xl md:p-1 lg:max-w-[52rem] lg:p-1.5 xl:max-w-[56rem]">
          <div className="pointer-events-none flex shrink-0 items-end justify-between gap-1 px-0.5 pb-px sm:px-1 sm:pb-0.5">
            <span className="text-[7px] font-bold uppercase tracking-wide text-zinc-200 sm:text-[8px] md:text-[9px]">Outer</span>
            <span className="w-9 shrink-0 text-center text-[7px] font-bold uppercase tracking-[0.16em] text-amber-50 sm:w-11 sm:text-[8px] md:w-14 md:text-[9px]">
              Bar
            </span>
            <span className="min-w-0 flex-1 text-center text-[7px] font-bold uppercase tracking-wide text-amber-50 sm:text-[8px] md:text-[9px]">
              Opp home · yours
            </span>
            <span className="w-10 shrink-0 text-center text-[7px] font-bold uppercase tracking-[0.14em] text-amber-50 sm:w-12 sm:text-[8px] md:w-[3.25rem] md:text-[9px]">
              Off
            </span>
          </div>
          <div
            className={`flex min-h-0 min-w-0 flex-1 flex-row gap-px overflow-hidden rounded-sm p-px sm:gap-1 sm:p-0.5 ${feltPlaySurface}`}
          >
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(leftTopIndices, leftTopDir)}</div>
              <div className="h-px shrink-0 bg-[rgba(255,255,255,0.06)]" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(leftBotIndices, leftBotDir)}</div>
            </div>
            {barCol}
            <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col">
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(rightTopIndices, rightTopDir)}</div>
              <div className="h-px shrink-0 bg-[rgba(255,255,255,0.06)]" aria-hidden />
              <div className="flex min-h-0 min-w-0 flex-1 basis-0">{renderHalfRow(rightBotIndices, rightBotDir)}</div>
            </div>
            {offColumn}
          </div>
        </div>
      </div>

      <div className="mt-1 flex min-h-[3.25rem] shrink-0 flex-col justify-center sm:min-h-[3.5rem]">
        {pendingDieChoice && vm.canClientMove && String(vm.phase) === "playing" ? (
          <div
            className="ov2bg-frame-sh flex flex-wrap items-center gap-1.5 rounded-md border border-sky-500/38 bg-sky-950/42 px-2 py-1.5 sm:gap-2"
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
                  className={`${OV2BG_BTN} min-w-[2rem] rounded border border-sky-400/60 bg-sky-900/50 px-2 py-0.5 text-xs font-bold tabular-nums text-sky-50 sm:px-2.5 sm:py-1`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              type="button"
              className={`${OV2BG_BTN_FLAT} text-[8px] text-zinc-300 underline sm:text-[9px]`}
              onClick={() => setPendingDieChoice(null)}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>

      <div className="flex min-h-[2.75rem] shrink-0 flex-wrap items-center gap-1 sm:gap-1.5">
        {String(vm.phase) === "playing" ? (
          <button
            type="button"
            onClick={() => persistAutoRoll(!autoRoll)}
            className={`${OV2BG_BTN} rounded-md border px-2 py-1 text-[9px] font-bold uppercase tracking-wide sm:py-1.5 sm:text-[10px] ${
              autoRoll
                ? "border-amber-400/52 bg-amber-950/46 text-amber-100"
                : "border-white/22 bg-white/[0.08] text-zinc-300"
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
            className={`${OV2BG_BTN} rounded-md border border-emerald-500/46 bg-emerald-950/42 px-2 py-1 text-[9px] font-bold text-emerald-50 hover:border-emerald-400/50 sm:px-2.5 sm:py-1.5 sm:text-[10px] md:text-xs`}
          >
            {busy ? "Rolling…" : "Roll"}
          </button>
        ) : null}
        {vm.canClientMove && selFrom != null ? (
          <button type="button" className={`${OV2BG_BTN_FLAT} text-[8px] text-zinc-400 underline sm:text-[9px]`} onClick={resetSelection}>
            Clear selection
          </button>
        ) : null}
        {draftBase ? (
          <>
            <button
              type="button"
              disabled={busy || draftSteps.length === 0}
              onClick={() => undoDraft()}
              className={`${OV2BG_BTN} rounded-md border border-zinc-500/45 bg-zinc-900/55 px-2 py-1 text-[9px] font-semibold text-zinc-200 sm:text-[10px]`}
            >
              Undo
            </button>
            <button
              type="button"
              disabled={busy || draftSteps.length === 0}
              onClick={() => resetDraft()}
              className={`${OV2BG_BTN} rounded-md border border-zinc-500/45 bg-zinc-900/55 px-2 py-1 text-[9px] font-semibold text-zinc-200 sm:text-[10px]`}
            >
              Reset
            </button>
            <button
              type="button"
              disabled={busy || !submitValidation.ok}
              onClick={() => void confirmTurn()}
              className={`${OV2BG_BTN} rounded-md border border-sky-500/46 bg-sky-950/42 px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-sky-50 hover:border-sky-400/50 sm:text-[10px]`}
            >
              {busy ? "…" : "Confirm turn"}
            </button>
          </>
        ) : null}
      </div>

      <span className="sr-only">
        Backgammon table: your home is in the lower half of the home column; opponent home above it; bar between board
        halves. Confirm turn to commit moves.
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
                className={`${OV2BG_BTN} mt-3 w-full rounded-md border border-white/20 bg-white/10 py-2 text-xs font-semibold text-zinc-100`}
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
