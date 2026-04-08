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
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_dom_finish_dismiss_${sid}`;

/** Same tokens as `Ov2FourLineScreen` — finish modal + rematch actions stay visually aligned with FL. */
const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98]";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

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

  const seatedMembers = useMemo(
    () => members.filter(m => m?.seat_index != null && m.seat_index !== "").sort((a, b) => Number(a.seat_index) - Number(b.seat_index)),
    [members]
  );

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

  const prizeTarget = useMemo(() => {
    if (vm.resultPrize != null && Number.isFinite(vm.resultPrize)) return vm.resultPrize;
    if (settlementPrizeAmount != null && Number.isFinite(settlementPrizeAmount)) return settlementPrizeAmount;
    return null;
  }, [vm.resultPrize, settlementPrizeAmount]);

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

  const finishReasonLine = useMemo(() => {
    if (!finished) return "";
    const base = finishWinReason.trim() || "—";
    return finishPipLine ? `${base} · ${finishPipLine}` : base;
  }, [finished, finishWinReason, finishPipLine]);

  const finishOutcome = useMemo(() => {
    if (!finished) return "unknown";
    if (isDraw) return "draw";
    if (didIWin) return "win";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "loss";
    return "unknown";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishTitle = useMemo(() => {
    if (!finished) return "";
    if (isDraw) return "Draw";
    if (didIWin) return "Victory";
    if (vm.mySeat != null && vm.winnerSeat != null && vm.winnerSeat !== vm.mySeat) return "Defeat";
    return "Match finished";
  }, [finished, isDraw, didIWin, vm.mySeat, vm.winnerSeat]);

  const finishAmountLine = useMemo(() => {
    if (!finished) return { text: "—", className: "text-zinc-500" };
    if (vaultClaimBusy) return { text: "…", className: "text-zinc-400" };
    if (isDraw) {
      const at =
        vm.resultLossPerSeat != null && Number.isFinite(Number(vm.resultLossPerSeat))
          ? Math.floor(Number(vm.resultLossPerSeat))
          : null;
      if (at != null) {
        return { text: `+${at} MLEO (refunded)`, className: "font-semibold tabular-nums text-emerald-300/95" };
      }
      return { text: "Draw — stakes settled", className: "text-zinc-400" };
    }
    if (didIWin && prizeTarget != null) {
      return {
        text: `+${Math.floor(Number(prizeTarget))} MLEO`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (!didIWin && vm.resultLossPerSeat != null && Number.isFinite(Number(vm.resultLossPerSeat))) {
      return {
        text: `−${Math.floor(Number(vm.resultLossPerSeat))} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [finished, vaultClaimBusy, isDraw, didIWin, prizeTarget, vm.resultLossPerSeat]);

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

  useEffect(() => {
    if (showResultModal && didIWin && !isDraw) void ov2DomSoundWin();
  }, [showResultModal, didIWin, isDraw]);

  const bothRematchReady = useMemo(() => {
    if (seatedMembers.length < 2) return false;
    return seatedMembers.every(m => memberRematchRequested(m));
  }, [seatedMembers]);

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
      <Ov2SharedStakeDoubleModal
        open={doubleModalActive}
        proposedMult={vm.pendingDouble?.proposed_mult}
        stakeMultiplier={vm.stakeMultiplier}
        busy={busy}
        onAccept={() => void respondDouble(true)}
        onDecline={() => void respondDouble(false)}
      />

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

      {showResultModal && finished ? (
        <Ov2SharedFinishModalFrame titleId="ov2-dom-finish-title">
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
                  id="ov2-dom-finish-title"
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
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{finishMultiplier}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
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
                <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
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
              disabled={exitBusy || !pk}
              onClick={() => void onExitToLobby()}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
    </div>
  );
}
