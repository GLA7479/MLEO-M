"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  dominoLineOpens,
  dominoTileAttachSides,
  parseDominoTile,
} from "../../../lib/online-v2/dominoes/ov2DominoesClientLegality";
import { useOv2DominoesSession } from "../../../hooks/useOv2DominoesSession";

const finishDismissStorageKey = sid => `ov2_dom_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-xl border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-4 py-3 text-sm font-semibold text-emerald-100/92 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-xl border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-4 py-3 text-sm font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_ACCENT =
  "rounded-xl border border-sky-500/24 bg-gradient-to-b from-sky-950/60 to-sky-950 px-4 py-3 text-sm font-semibold text-sky-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-xl border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-4 py-3 text-sm font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** Layout: no reflow — use opacity/transform only for visibility toggles */
const T_OP = "transition-opacity duration-150 ease-out";
const T_TF = "transition-[opacity,transform] duration-150 ease-out";

function PipDots({ n, compact }) {
  const v = Math.min(6, Math.max(0, Math.floor(Number(n) || 0)));
  const patterns = {
    0: [],
    1: [[0.5, 0.5]],
    2: [
      [0.25, 0.25],
      [0.75, 0.75],
    ],
    3: [
      [0.25, 0.25],
      [0.5, 0.5],
      [0.75, 0.75],
    ],
    4: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.25, 0.22],
      [0.75, 0.22],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.25, 0.78],
      [0.75, 0.78],
    ],
  };
  const pts = patterns[v] || [];
  const sz = compact ? 36 : 44;
  return (
    <svg width={sz} height={sz} viewBox="0 0 1 1" className="shrink-0 text-zinc-900">
      <rect x="0.04" y="0.04" width="0.92" height="0.92" rx="0.06" fill="currentColor" className="text-[#f5f0e8]" />
      {pts.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="0.07" className="fill-zinc-900/88" />
      ))}
    </svg>
  );
}

function DominoFace({ a, b, vertical }) {
  if (vertical) {
    return (
      <div className="flex flex-col items-center justify-center gap-0.5 rounded-md border border-black/20 bg-[#faf6ef] px-1 py-1 shadow-inner">
        <PipDots n={a} compact />
        <div className="h-px w-[80%] bg-black/25" />
        <PipDots n={b} compact />
      </div>
    );
  }
  return (
    <div className="flex flex-row items-center justify-center gap-1 rounded-md border border-black/20 bg-[#faf6ef] px-1 py-1 shadow-inner">
      <PipDots n={a} compact />
      <div className="h-[70%] w-px bg-black/25" />
      <PipDots n={b} compact />
    </div>
  );
}

/** @param {{ meta?: unknown }} m */
function memberRematchRequested(m) {
  const meta = m && typeof m === "object" && "meta" in m ? /** @type {{ meta?: unknown }} */ (m).meta : null;
  if (!meta || typeof meta !== "object") return false;
  const dom = /** @type {Record<string, unknown>} */ (meta).dom;
  if (!dom || typeof dom !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (dom).rematch_requested;
  return r === true || r === "true" || r === 1;
}

function playTone(freq, durationSec, type = "sine", gain = 0.07) {
  if (typeof window === "undefined") return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + durationSec);
    setTimeout(() => ctx.close().catch(() => {}), Math.ceil(durationSec * 1000) + 50);
  } catch {
    /* ignore */
  }
}

function ov2DomSoundPlace() {
  playTone(520, 0.05, "square", 0.05);
}
function ov2DomSoundDraw() {
  playTone(380, 0.08, "triangle", 0.06);
}
function ov2DomSoundWin() {
  playTone(660, 0.12, "sine", 0.08);
  setTimeout(() => playTone(880, 0.18, "sine", 0.07), 90);
}
function ov2DomSoundAlert() {
  playTone(740, 0.1, "square", 0.09);
  setTimeout(() => playTone(620, 0.12, "square", 0.07), 90);
}

function useAnimatedNumber(target, active, durationMs = 900) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active || target == null || !Number.isFinite(target)) {
      setV(0);
      return;
    }
    const t0 = performance.now();
    const from = 0;
    let id = 0;
    const tick = now => {
      const u = Math.min(1, (now - t0) / durationMs);
      const eased = 1 - (1 - u) ** 3;
      setV(Math.round(from + (target - from) * eased));
      if (u < 1) id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [target, active, durationMs]);
  return v;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2DominoesScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2DominoesSession(contextInput ?? undefined);
  const {
    snapshot,
    vm,
    busy,
    vaultClaimBusy,
    settlementPrizeAmount,
    err,
    setErr,
    playTile,
    drawOne,
    passTurn,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [selIdx, setSelIdx] = useState(/** @type {number|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const [shakeIdx, setShakeIdx] = useState(/** @type {number|null} */ (null));
  const [placeAnimIdx, setPlaceAnimIdx] = useState(/** @type {number|null} */ (null));
  const [passToast, setPassToast] = useState("");
  const [localReaction, setLocalReaction] = useState("");
  const autoStartDoneRef = useRef(/** @type {string} */ (""));
  const doubleAlertPlayedRef = useRef(false);

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setSelIdx(null);
  }, [vm.sessionId, vm.revision]);

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  useEffect(() => {
    doubleAlertPlayedRef.current = false;
  }, [vm.sessionId, vm.revision, vm.pendingDouble]);

  useEffect(() => {
    if (vm.mustRespondDouble && vm.pendingDouble && !doubleAlertPlayedRef.current) {
      doubleAlertPlayedRef.current = true;
      ov2DomSoundAlert();
    }
  }, [vm.mustRespondDouble, vm.pendingDouble]);

  const onTileClick = useCallback(
    async idx => {
      if (vm.phase !== "playing" || busy || vaultClaimBusy) return;
      if (vm.mySeat == null || vm.turnSeat !== vm.mySeat) return;
      if (vm.mustRespondDouble) return;
      if (!vm.canClientPlayTiles && vm.line.length > 0) {
        setErr("Draw or pass — no legal play on the board.");
        return;
      }
      const tile = parseDominoTile(vm.myHand[idx]);
      if (!tile) return;

      if (vm.line.length === 0) {
        setErr("");
        const r = await playTile(idx, "");
        setSelIdx(null);
        if (r.ok) {
          ov2DomSoundPlace();
          setPlaceAnimIdx(idx);
          window.setTimeout(() => setPlaceAnimIdx(null), 180);
        } else {
          setShakeIdx(idx);
          window.setTimeout(() => setShakeIdx(null), 280);
        }
        return;
      }

      const sides = dominoTileAttachSides(vm.line, tile);
      if (!sides.left && !sides.right) {
        setErr("That tile does not match either end.");
        setShakeIdx(idx);
        window.setTimeout(() => setShakeIdx(null), 280);
        return;
      }

      if (selIdx !== idx) {
        setSelIdx(idx);
        setErr("");
        return;
      }

      if (sides.left && !sides.right) {
        const r = await playTile(idx, "left");
        setSelIdx(null);
        if (r.ok) {
          ov2DomSoundPlace();
          setPlaceAnimIdx(idx);
          window.setTimeout(() => setPlaceAnimIdx(null), 180);
        } else {
          setShakeIdx(idx);
          window.setTimeout(() => setShakeIdx(null), 280);
        }
        return;
      }
      if (!sides.left && sides.right) {
        const r = await playTile(idx, "right");
        setSelIdx(null);
        if (r.ok) {
          ov2DomSoundPlace();
          setPlaceAnimIdx(idx);
          window.setTimeout(() => setPlaceAnimIdx(null), 180);
        } else {
          setShakeIdx(idx);
          window.setTimeout(() => setShakeIdx(null), 280);
        }
        return;
      }
      setErr("Choose left or right end.");
    },
    [vm, busy, vaultClaimBusy, playTile, selIdx, setErr]
  );

  const playSelected = useCallback(
    async side => {
      if (selIdx == null) return;
      setErr("");
      const r = await playTile(selIdx, side);
      const idx = selIdx;
      setSelIdx(null);
      if (r.ok) {
        ov2DomSoundPlace();
        setPlaceAnimIdx(idx);
        window.setTimeout(() => setPlaceAnimIdx(null), 180);
      } else {
        setShakeIdx(idx);
        window.setTimeout(() => setShakeIdx(null), 280);
      }
    },
    [selIdx, playTile, setErr]
  );

  const onDrawOne = useCallback(async () => {
    const r = await drawOne();
    if (r.ok) {
      ov2DomSoundDraw();
    }
  }, [drawOne]);

  const onPassTurn = useCallback(async () => {
    const r = await passTurn();
    if (r.ok) {
      setPassToast("No moves — pass");
      window.setTimeout(() => setPassToast(""), 1200);
    }
  }, [passTurn]);

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

  const winnerDisplayName = useMemo(() => {
    if (vm.winnerSeat == null) return "";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.winnerSeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.winnerSeat) + 1}`;
  }, [members, vm.winnerSeat]);

  const selectedTile =
    selIdx != null && selIdx >= 0 && selIdx < vm.myHand.length ? parseDominoTile(vm.myHand[selIdx]) : null;
  const attachSides =
    selectedTile && vm.line.length > 0 ? dominoTileAttachSides(vm.line, selectedTile) : { left: false, right: false };
  const needSidePick =
    Boolean(
      selIdx != null &&
        attachSides.left &&
        attachSides.right &&
        vm.line.length > 0 &&
        vm.turnSeat === vm.mySeat &&
        vm.canClientPlayTiles
    );

  const lineOpens = useMemo(() => dominoLineOpens(vm.line), [vm.line]);

  const myPipTotal = useMemo(() => {
    let s = 0;
    for (const t of vm.myHand) {
      const p = parseDominoTile(t);
      if (p) s += p.a + p.b;
    }
    return s;
  }, [vm.myHand]);

  const seatedMembers = useMemo(
    () => members.filter(m => m?.seat_index != null && m.seat_index !== "").sort((a, b) => Number(a.seat_index) - Number(b.seat_index)),
    [members]
  );

  const mySeatLabel = useMemo(() => {
    if (vm.mySeat == null) return "You";
    const m = members.find(x => Number(x?.seat_index) === Number(vm.mySeat));
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${Number(vm.mySeat) + 1}`;
  }, [members, vm.mySeat]);

  const oppSeatLabel = useMemo(() => {
    if (vm.mySeat == null) return "Opponent";
    const oi = vm.mySeat === 0 ? 1 : 0;
    const m = members.find(x => Number(x?.seat_index) === oi);
    const n = m && typeof m.display_name === "string" ? String(m.display_name).trim() : "";
    return n || `Seat ${oi + 1}`;
  }, [members, vm.mySeat]);

  const myTurnPlaying =
    vm.phase === "playing" &&
    vm.turnSeat === vm.mySeat &&
    !vm.mustRespondDouble &&
    vm.mySeat != null &&
    vm.turnSeat != null;
  const oppTurnPlaying =
    vm.phase === "playing" &&
    vm.turnSeat !== vm.mySeat &&
    !vm.mustRespondDouble &&
    vm.mySeat != null &&
    vm.turnSeat != null;

  const timerBarPct = Math.min(100, Math.max(0, (vm.turnTimeLeftMs != null ? vm.turnTimeLeftMs / 60000 : 0) * 100));
  const timerCritical = vm.turnTimeLeftSec != null && vm.turnTimeLeftSec <= 8 && vm.turnTimeLeftSec > 0;

  const doubleModalActive = Boolean(vm.phase === "playing" && vm.mustRespondDouble && vm.pendingDouble);
  const doubleLeftSec = vm.doubleTimeLeftSec != null ? vm.doubleTimeLeftSec : 0;
  const doubleBarPct = Math.min(
    100,
    Math.max(0, vm.doubleTimeLeftMs != null ? (vm.doubleTimeLeftMs / 30000) * 100 : 0)
  );
  const doubleCritical = doubleLeftSec <= 5 && doubleLeftSec > 0;

  const prizeTarget = useMemo(() => {
    if (vm.resultPrize != null && Number.isFinite(vm.resultPrize)) return vm.resultPrize;
    if (settlementPrizeAmount != null && Number.isFinite(settlementPrizeAmount)) return settlementPrizeAmount;
    return null;
  }, [vm.resultPrize, settlementPrizeAmount]);

  const displayPrize = useAnimatedNumber(
    prizeTarget ?? 0,
    Boolean(showResultModal && !vaultClaimBusy && prizeTarget != null),
    1000
  );

  const finishMultiplier = vm.resultStakeMultiplier ?? vm.stakeMultiplier;

  const finishWinReason = useMemo(() => {
    if (!finished) return "";
    if (vm.resultForfeitBy && pk) {
      if (vm.resultForfeitBy === pk) return "You forfeited";
      return "Opponent forfeited";
    }
    if (vm.resultDoubleDeclined) return "Double declined";
    if (vm.resultDoubleTimeout) {
      if (vm.mySeat != null && vm.winnerSeat === vm.mySeat) return "Opponent timed out";
      return "You timed out";
    }
    if (vm.resultTimeoutLoserSeat != null && vm.mySeat != null) {
      if (vm.resultTimeoutLoserSeat === vm.mySeat) return "You timed out";
      return "Opponent timed out";
    }
    if (vm.resultDraw && vm.resultBlocked) return "Blocked game";
    if (vm.resultBlocked && vm.resultWinner != null) return "Blocked game";
    if (vm.resultEmptyHand) {
      if (vm.winnerSeat === vm.mySeat) return "Normal win";
      return "Opponent emptied their hand";
    }
    if (isDraw) return "Blocked game";
    return "Round complete";
  }, [
    finished,
    vm.resultForfeitBy,
    vm.resultDoubleDeclined,
    vm.resultDoubleTimeout,
    vm.resultTimeoutLoserSeat,
    vm.resultDraw,
    vm.resultBlocked,
    vm.resultEmptyHand,
    vm.resultWinner,
    vm.winnerSeat,
    vm.mySeat,
    isDraw,
    pk,
  ]);

  const finishPipLine = useMemo(() => {
    if (!vm.resultPipTotalsBySeat || vm.mySeat == null) return null;
    const p0 = vm.resultPipTotalsBySeat[0];
    const p1 = vm.resultPipTotalsBySeat[1];
    if (p0 == null || p1 == null) return null;
    const mine = vm.mySeat === 0 ? p0 : p1;
    const opp = vm.mySeat === 0 ? p1 : p0;
    return `You: ${mine} | Opponent: ${opp}`;
  }, [vm.resultPipTotalsBySeat, vm.mySeat]);

  useEffect(() => {
    if (showResultModal && didIWin && !isDraw) void ov2DomSoundWin();
  }, [showResultModal, didIWin, isDraw]);

  const bothRematchReady = useMemo(() => {
    if (seatedMembers.length < 2) return false;
    return seatedMembers.every(m => memberRematchRequested(m));
  }, [seatedMembers]);

  const iRematchRequested = useMemo(() => {
    const mine = members.find(m => String(m?.participant_key || "") === pk);
    return memberRematchRequested(mine);
  }, [members, pk]);

  useEffect(() => {
    if (!finished || !isHost || !bothRematchReady || !roomId || startNextBusy) return;
    const sid = String(vm.sessionId || "").trim();
    if (!sid || autoStartDoneRef.current === sid) return;
    autoStartDoneRef.current = sid;
    void (async () => {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        autoStartDoneRef.current = "";
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
    })();
  }, [
    finished,
    isHost,
    bothRematchReady,
    roomId,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    vm.sessionId,
    onSessionRefresh,
    snapshot?.sessionId,
  ]);

  const pendingDoubleFromSeat =
    vm.pendingDouble && vm.pendingDouble.from_seat != null ? Number(vm.pendingDouble.from_seat) : null;
  const waitingOnDoubleResponse =
    vm.phase === "playing" && vm.pendingDouble && !vm.mustRespondDouble && pendingDoubleFromSeat === vm.mySeat;

  const showBottomActions =
    vm.phase === "playing" && vm.mySeat === vm.turnSeat && !vm.mustRespondDouble;

  const finishedActions = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={rematchBusy} onClick={() => void onRematch()} className={BTN_PRIMARY}>
          {rematchBusy ? "…" : "Rematch"}
        </button>
        <button type="button" onClick={() => void cancelRematch()} className={BTN_SECONDARY}>
          Cancel rematch
        </button>
        <button
          type="button"
          disabled={startNextBusy || !isHost}
          onClick={() => void onStartNext()}
          className={`${BTN_ACCENT} ${T_OP} ${!isHost ? "pointer-events-none opacity-0" : "opacity-100"}`}
          aria-hidden={!isHost}
        >
          {startNextBusy ? "…" : "Start next (host)"}
        </button>
      </div>
      <button
        type="button"
        disabled={Boolean(contextInput?.leaveToLobbyBusy) || !contextInput?.onLeaveToLobby}
        className={`w-full rounded-xl border border-white/10 py-2.5 text-sm text-zinc-400 transition hover:bg-white/[0.04] disabled:opacity-45 ${T_OP} ${!contextInput?.onLeaveToLobby ? "pointer-events-none opacity-0" : ""}`}
        onClick={() => void contextInput?.onLeaveToLobby?.()}
        aria-hidden={!contextInput?.onLeaveToLobby}
      >
        {contextInput?.leaveToLobbyBusy ? "Leaving…" : "Leave table"}
      </button>
      <div className="relative min-h-[1.25rem]">
        <p
          className={`absolute inset-0 text-center text-[11px] text-emerald-400/90 ${T_OP} ${
            bothRematchReady && isHost ? "opacity-100" : "opacity-0"
          }`}
        >
          Both ready — starting next round…
        </p>
        <p
          className={`absolute inset-0 text-center text-[11px] text-amber-200/85 ${T_OP} ${
            iRematchRequested && !bothRematchReady ? "opacity-100" : "opacity-0"
          }`}
        >
          Waiting for opponent…
        </p>
      </div>
    </div>
  );

  const passToastVisible = Boolean(passToast.trim());

  const renderBoard = () => (
    <div className="relative flex h-full w-full max-w-full items-center justify-center overflow-hidden px-1">
      <span
        className={`pointer-events-none absolute inset-0 flex items-center justify-center text-[10px] text-zinc-500 ${T_OP} ${
          vm.line.length === 0 ? "opacity-100" : "opacity-0"
        }`}
      >
        Empty — first tile sets the line.
      </span>
      <div className={`relative flex max-h-full max-w-full flex-wrap items-center justify-center gap-1 overflow-hidden ${T_OP} ${vm.line.length === 0 ? "opacity-0" : "opacity-100"}`}>
        <div
          className={`pointer-events-none absolute left-0 top-1/2 z-10 h-12 w-2 -translate-y-1/2 rounded-full bg-gradient-to-r from-sky-400/50 to-transparent blur-[1px] animate-ov2-dom-endpoint-glow ${T_OP} ${
            needSidePick && lineOpens && vm.line.length > 0 ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />
        <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
          {vm.line.map((seg, i) => {
            const lo = Math.floor(Number(seg?.lo));
            const hi = Math.floor(Number(seg?.hi));
            return (
              <div key={i} className="flex items-center justify-center">
                <div className="scale-110">
                  <DominoFace a={lo} b={hi} vertical={false} />
                </div>
              </div>
            );
          })}
        </div>
        <div
          className={`pointer-events-none absolute right-0 top-1/2 z-10 h-12 w-2 -translate-y-1/2 rounded-full bg-gradient-to-l from-sky-400/50 to-transparent blur-[1px] animate-ov2-dom-endpoint-glow ${T_OP} ${
            needSidePick && lineOpens && vm.line.length > 0 ? "opacity-100" : "opacity-0"
          }`}
          aria-hidden
        />
      </div>
    </div>
  );

  const renderTiles = () =>
    vm.myHand.map((t, idx) => {
      const p = parseDominoTile(t);
      if (!p) return null;
      const sel = selIdx === idx;
      const disabled =
        busy ||
        vaultClaimBusy ||
        vm.phase !== "playing" ||
        vm.mySeat !== vm.turnSeat ||
        vm.mustRespondDouble ||
        !vm.canClientPlayTiles;
      const selectable = !disabled && vm.phase === "playing";
      const shake = shakeIdx === idx;
      const place = placeAnimIdx === idx;
      return (
        <button
          key={idx}
          type="button"
          disabled={disabled}
          onClick={() => void onTileClick(idx)}
          className={`flex h-[4.4rem] w-[2.8rem] shrink-0 items-center justify-center overflow-visible rounded-sm bg-white p-0 ring-offset-2 ring-offset-[#0b0f14] ${T_TF} ${
            sel ? "ring-2 ring-sky-500/90" : "ring-0"
          } ${shake ? "animate-ov2-dom-shake" : ""} ${place ? "animate-ov2-dom-place" : ""} disabled:opacity-40`}
        >
          <DominoFace a={p.a} b={p.b} vertical />
        </button>
      );
    });

  const renderPlayButtons = () => (
    <>
      <button
        type="button"
        disabled={busy || !needSidePick}
        className={`flex-1 h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[12px] font-medium tracking-wide text-zinc-200 transition-opacity disabled:opacity-45 ${T_OP} ${
          needSidePick ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => void playSelected("left")}
      >
        Play left
      </button>
      <button
        type="button"
        disabled={busy || !needSidePick}
        className={`flex-1 h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[12px] font-medium tracking-wide text-zinc-200 transition-opacity disabled:opacity-45 ${T_OP} ${
          needSidePick ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={() => void playSelected("right")}
      >
        Play right
      </button>
    </>
  );

  return (
    <div className="h-screen w-full flex flex-col overflow-hidden bg-[#0b0f14]">
      {/* Double modal: overlay only (no layout impact) */}
      <div
        className={`fixed inset-0 z-[60] flex items-center justify-center bg-black/55 p-3 backdrop-blur-md ${T_OP} ${
          doubleModalActive ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!doubleModalActive}
      >
        <div
          className={`animate-ov2-dom-modal-in relative w-full max-w-[min(100%,22rem)] overflow-hidden rounded-2xl border border-amber-400/35 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4 shadow-2xl ring-2 ring-offset-2 ring-offset-zinc-950 ${
            doubleCritical ? "animate-pulse ring-red-500/75" : "animate-ov2-dom-double-pulse ring-amber-400/35"
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ov2-dom-double-title"
        >
          <div className="flex flex-col gap-1 text-center">
            <p id="ov2-dom-double-title" className="min-h-[1.75rem] text-lg font-bold leading-tight tracking-tight text-amber-100">
              Stake Challenge
            </p>
            <p className="min-h-[2.5rem] text-[13px] leading-snug text-zinc-300/95">Opponent wants to DOUBLE the stake</p>
            <div className="mt-2 flex justify-center gap-4 text-sm">
              <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-zinc-500">Current</p>
                <p className="min-h-[1.25rem] font-semibold tabular-nums text-zinc-100">×{vm.stakeMultiplier}</p>
              </div>
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/40 px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-emerald-400/90">New</p>
                <p className="min-h-[1.25rem] font-semibold tabular-nums text-emerald-100">
                  ×{vm.pendingDouble?.proposed_mult != null ? String(vm.pendingDouble.proposed_mult) : "—"}
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div
                className={`h-full max-w-full rounded-full ${doubleCritical ? "bg-red-500" : "bg-amber-400"}`}
                style={{ width: `${doubleBarPct}%`, transition: "width 200ms linear" }}
              />
            </div>
            <p className={`min-h-[1.25rem] text-xs tabular-nums ${doubleCritical ? "font-semibold text-red-300" : "text-zinc-400"}`}>
              {doubleLeftSec}s to respond
            </p>
          </div>
          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button type="button" disabled={busy || !doubleModalActive} className={`${BTN_PRIMARY} flex-1`} onClick={() => void respondDouble(true)}>
              ACCEPT
            </button>
            <button type="button" disabled={busy || !doubleModalActive} className={`${BTN_DANGER} flex-1`} onClick={() => void respondDouble(false)}>
              DECLINE
            </button>
          </div>
        </div>
      </div>

      {/* Main layout: no page scroll, no inner scroll */}
      <div className={`flex min-h-0 flex-1 flex-col overflow-hidden ${doubleModalActive ? "pointer-events-none select-none" : ""}`}>
        <div className="shrink-0 px-2 pt-2 pb-1">
          <div className="relative rounded-xl border border-white/[0.08] bg-zinc-950/50 px-2 py-1.5">
            {(() => {
              const time = vm.phase === "playing" && vm.turnTimeLeftSec != null ? Number(vm.turnTimeLeftSec) : null;
              const cls =
                time == null
                  ? "text-white/50"
                  : time > 20
                    ? "text-green-400"
                    : time >= 10
                      ? "text-yellow-400"
                      : "text-red-500 animate-pulse";
              return (
                <div className={`absolute right-2 top-2 text-[11px] font-semibold tabular-nums ${cls}`}>{time != null ? `${time}s` : "—"}</div>
              );
            })()}
            <div className="flex min-h-[1.75rem] items-center justify-between gap-1">
              <p className="text-[11px] font-bold tracking-tight text-zinc-100">Dominoes</p>
              <div className="flex items-center gap-1">
                <div className="flex gap-1">
                  {["👍", "😡", "😂"].map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      className="h-7 min-w-[1.75rem] rounded-md border border-white/10 bg-zinc-900/80 text-sm leading-none transition-colors hover:bg-zinc-800"
                      onClick={() => {
                        setLocalReaction(emoji);
                        window.setTimeout(() => setLocalReaction(""), 1400);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
                <span className="rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-300">×{vm.stakeMultiplier}</span>
              </div>
            </div>
            <div className={`pointer-events-none fixed left-1/2 top-24 z-30 -translate-x-1/2 ${T_OP} ${localReaction ? "opacity-100" : "opacity-0"}`} aria-hidden>
              <span className="animate-ov2-dom-float-up block text-3xl">{localReaction || " "}</span>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-1">
              <div
                className={`flex min-h-[3.25rem] items-center justify-center rounded-xl border p-1 ${T_TF} ${
                  myTurnPlaying
                    ? "border-amber-400/70 bg-amber-950/50 shadow-[0_0_0_2px_rgba(251,191,36,0.35)] animate-ov2-dom-seat-pulse"
                    : "border-white/[0.12] bg-zinc-950/65 opacity-70"
                }`}
              >
                <span className="text-[11px] font-semibold tracking-wide text-zinc-100">YOU</span>
              </div>
              <div
                className={`flex min-h-[3.25rem] items-center justify-center rounded-xl border p-1 ${T_TF} ${
                  oppTurnPlaying
                    ? "border-amber-400/70 bg-amber-950/50 shadow-[0_0_0_2px_rgba(251,191,36,0.35)] animate-ov2-dom-seat-pulse"
                    : "border-white/[0.12] bg-zinc-950/65 opacity-70"
                }`}
              >
                <span className="text-[11px] font-semibold tracking-wide text-zinc-100">OPPONENT</span>
              </div>
            </div>
            <div className="mt-1 flex items-center justify-between gap-1">
              <button
                type="button"
                disabled={exitBusy || !pk || doubleModalActive}
                className="min-w-0 truncate text-left text-[10px] font-medium text-sky-300 underline disabled:opacity-45"
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Leave table"}
              </button>
              <span className={`max-w-[55%] truncate text-right text-[9px] ${exitErr ? "text-red-300" : "text-transparent"}`}>{exitErr || "—"}</span>
            </div>
          </div>
        </div>

        <div className="shrink-0 px-2">
          <div
            className={`h-8 rounded-lg border px-2 py-1 text-center text-[10px] font-medium leading-tight ${T_OP} ${
              passToastVisible ? "border-white/20 bg-zinc-900/70 text-zinc-100 opacity-100" : "border-transparent bg-transparent text-transparent opacity-0"
            }`}
            aria-live="polite"
          >
            {passToast || "—"}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-hidden px-2">
          <div className="flex h-[110px] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/10">
            {renderBoard()}
          </div>

          <div className="flex h-[120px] min-h-0 shrink-0 flex-col justify-between overflow-hidden rounded-xl border border-white/10 p-1">
            <div className="flex min-h-0 flex-1 flex-wrap items-center justify-center gap-1 overflow-hidden">{renderTiles()}</div>
            <div className="flex h-9 shrink-0 items-center justify-center gap-1">{renderPlayButtons()}</div>
          </div>
        </div>

        <div className="shrink-0 h-[40px] px-2 flex items-center justify-center text-[11px] text-white/60 border-t border-white/5">
          Ad space
        </div>

        <div className="flex h-[56px] shrink-0 items-center gap-1 px-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] pt-1">
          <button
            type="button"
            disabled={busy || !showBottomActions}
            className="flex-1 h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[12px] font-medium tracking-wide text-zinc-200 transition-opacity disabled:opacity-45"
            onClick={() => void onDrawOne()}
          >
            Draw
          </button>
          <button
            type="button"
            disabled={busy || !showBottomActions}
            className="flex-1 h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[12px] font-medium tracking-wide text-zinc-200 transition-opacity disabled:opacity-45"
            onClick={() => void onPassTurn()}
          >
            Pass
          </button>
          <button
            type="button"
            disabled={busy || !showBottomActions || !vm.canOfferDouble}
            className={`flex-1 h-9 rounded-lg border border-white/10 bg-zinc-900 px-2 text-[12px] font-medium tracking-wide text-zinc-200 transition-opacity disabled:opacity-45 ${T_OP} ${
              vm.canOfferDouble ? "opacity-100" : "pointer-events-none opacity-40"
            }`}
            onClick={() => void offerDouble()}
          >
            Double
          </button>
        </div>
      </div>

      {/* Finish overlay: overlay only (no layout impact) */}
      <div
        className={`fixed inset-0 z-20 flex items-end justify-center bg-black/60 p-2 backdrop-blur-sm sm:items-center ${T_OP} ${
          showResultModal ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
        aria-hidden={!showResultModal}
      >
        {finished ? (
          <div
            className="max-h-[100dvh] w-full max-w-md overflow-hidden rounded-2xl border border-white/[0.12] bg-zinc-950/96 p-4 shadow-2xl"
            role="dialog"
            aria-modal="true"
          >
            {/* finish content unchanged */}
            <p className="min-h-[2.5rem] text-center text-3xl font-black leading-tight tracking-tight text-zinc-50 sm:text-4xl">
              {isDraw ? "DRAW" : didIWin ? "YOU WIN" : "YOU LOSE"}
            </p>
            <p className="mt-1 min-h-[1.25rem] text-center text-sm font-medium text-amber-200/95">{finishWinReason || "—"}</p>
            <p className={`mt-0.5 min-h-[1rem] text-center text-xs text-zinc-500 ${T_OP} ${!isDraw ? "opacity-100" : "opacity-0"}`}>
              {winnerDisplayName || " "}
            </p>
            <div className="relative mt-2 min-h-[1.5rem]">
              <p className={`text-center text-sm font-semibold tabular-nums text-zinc-100 ${T_OP} ${finishPipLine ? "opacity-100" : "opacity-0"}`}>
                {finishPipLine || " "}
              </p>
              <p className={`absolute inset-0 text-center text-sm text-zinc-300 ${T_OP} ${!finishPipLine && isDraw ? "opacity-100" : "opacity-0"}`}>
                Your hand total: <span className="font-bold tabular-nums text-zinc-100">{myPipTotal}</span> pips
              </p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div
                className={`min-h-[4.5rem] rounded-xl border px-3 py-2 text-center ${T_TF} ${
                  !isDraw && vm.winnerSeat === vm.mySeat
                    ? "border-amber-400/70 bg-amber-950/40 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                    : "border-white/[0.08] bg-zinc-900/40"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">You</p>
                <p className="text-sm font-semibold text-zinc-100">{mySeatLabel}</p>
                <p className={`min-h-[1rem] text-[10px] font-bold uppercase text-amber-300 ${T_OP} ${!isDraw && vm.winnerSeat === vm.mySeat ? "opacity-100" : "opacity-0"}`}>
                  Winner
                </p>
              </div>
              <div
                className={`min-h-[4.5rem] rounded-xl border px-3 py-2 text-center ${T_TF} ${
                  !isDraw && vm.winnerSeat != null && vm.mySeat != null && vm.winnerSeat !== vm.mySeat
                    ? "border-amber-400/70 bg-amber-950/40 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]"
                    : "border-white/[0.08] bg-zinc-900/40"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Opponent</p>
                <p className="text-sm font-semibold text-zinc-100">{oppSeatLabel}</p>
                <p
                  className={`min-h-[1rem] text-[10px] font-bold uppercase text-amber-300 ${T_OP} ${
                    !isDraw && vm.winnerSeat != null && vm.mySeat != null && vm.winnerSeat !== vm.mySeat ? "opacity-100" : "opacity-0"
                  }`}
                >
                  Winner
                </p>
              </div>
            </div>
            <div className="mt-3 flex min-h-[2.75rem] flex-wrap items-center justify-center gap-1 text-amber-100/90">
              <span className="text-[11px] uppercase tracking-wide text-zinc-500">Prize</span>
              <span className="text-2xl font-bold tabular-nums text-amber-200">
                {vaultClaimBusy ? "…" : prizeTarget != null ? displayPrize : "—"}
              </span>
              <span className="text-2xl font-bold text-zinc-400">chips</span>
            </div>
            <div className="mt-1.5 flex min-h-[1.25rem] justify-center gap-2 text-[11px] text-zinc-500">
              <span>Multiplier ×{finishMultiplier}</span>
            </div>
            <p className="mt-3 min-h-[2.5rem] text-center text-[11px] leading-snug text-zinc-500">
              {vaultClaimBusy ? "Sending results to your balance…" : "Round complete. Rematch to play again — host starts next when ready."}
            </p>
            <div className="mt-4">{finishedActions}</div>
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-white/10 py-2.5 text-sm text-zinc-300"
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
        ) : null}
      </div>
    </div>
  );
}
