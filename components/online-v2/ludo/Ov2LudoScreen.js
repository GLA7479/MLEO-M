"use client";

import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  OV2_LUDO_PLAY_MODE,
  OV2_LUDO_PRODUCT_GAME_ID,
} from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2LudoSession } from "../../../hooks/useOv2LudoSession";
import Ov2LudoBoardView from "../../../lib/online-v2/ludo/ov2LudoBoardView";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";
import Ov2SharedFinishModalFrame from "../Ov2SharedFinishModalFrame";
import Ov2SharedStakeDoubleModal from "../Ov2SharedStakeDoubleModal";

const finishDismissStorageKey = sid => `ov2_ludo_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_FINISH_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null, onSessionRefresh?: (previousActiveSessionId: string, rpcNewSessionId?: string, options?: { expectClearedSession?: boolean }) => void | Promise<unknown> }} props
 */
export default function Ov2LudoScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2LudoSession(contextInput ?? undefined);
  const {
    vm,
    vaultClaimBusy,
    rollDicePreview,
    onPieceClick,
    canRoll,
    resetPreviewBoard,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
  } = session;
  const [rematchIntentBusy, setRematchIntentBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const roomMembers = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const roomId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.id != null
      ? String(contextInput.room.id)
      : "";
  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : null;
  const {
    board,
    diceRolling,
    playMode,
    interactionTier,
    boardSeatForUi: mySeat,
    previewWaitingOtherSeat,
    winnerSeat,
    boardViewReadOnly,
    liveLegalMovablePieceIndices,
    lobbySeatLabels,
    lobbySelfRingIndex,
    doubleState,
    turnSeat,
    authoritativeTurnKey,
    turnTimeLeftSec,
    isTurnTimerActive,
    isMyTurnLive,
    currentMultiplier,
    doubleProposedBySeat,
    doubleAwaitingSeat,
    doublePendingSeats,
    isDoublePending,
    doubleTimeLeftSec,
    isDoubleTimerActive,
    strikeDisplayMap,
    eliminatedSeats,
    statusLine,
    matchPhase,
    result,
    liveDiceDisplayValue,
    doubleCycleUsedSeats,
    isDoubleOfferCapped,
    isAtDoubleMultiplierCap,
    sessionId: ludoSessionId,
  } = vm;

  const isReadOnlyRoom = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  const isLiveMatch = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE;

  const membersBySeat = useMemo(() => {
    const out = new Map();
    for (const m of roomMembers) {
      if (!m || typeof m !== "object") continue;
      const rawSeat = "seat_index" in m ? m.seat_index : null;
      if (rawSeat === null || rawSeat === undefined || rawSeat === "") continue;
      const seat = Number(rawSeat);
      if (!Number.isInteger(seat) || seat < 0 || seat > 3) continue;
      if (!out.has(seat)) out.set(seat, m);
    }
    return out;
  }, [roomMembers]);

  const seatLabels = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return ["Seat 1 · you (preview)", "Seat 2", "Seat 3", "Seat 4"];
    }
    if (roomProductId === OV2_LUDO_PRODUCT_GAME_ID && membersBySeat.size > 0) {
      return [0, 1, 2, 3].map(seat => {
        const member = membersBySeat.get(seat);
        if (!member) return `Seat ${seat + 1}`;
        const name =
          member && typeof member === "object" && "display_name" in member
            ? String(member.display_name || "").trim()
            : "";
        return name ? `Seat ${seat + 1} · ${name}` : `Seat ${seat + 1}`;
      });
    }
    if (isReadOnlyRoom && Array.isArray(lobbySeatLabels) && lobbySeatLabels.length >= 4) {
      return lobbySeatLabels;
    }
    return ["Seat 1", "Seat 2", "Seat 3", "Seat 4"];
  }, [playMode, roomProductId, membersBySeat, isReadOnlyRoom, lobbySeatLabels]);

  const selfHighlightIndex =
    isLiveMatch && mySeat != null
      ? mySeat
      : isReadOnlyRoom && lobbySelfRingIndex != null
        ? lobbySelfRingIndex
        : null;

  const doubleCycleUsed = Array.isArray(doubleCycleUsedSeats) ? doubleCycleUsedSeats : [];
  const isDoubleCycleLockedForMe = mySeat != null && doubleCycleUsed.includes(Number(mySeat));
  const canOfferDouble =
    isLiveMatch &&
    isMyTurnLive &&
    authoritativeTurnKey != null &&
    mySeat != null &&
    turnSeat === mySeat &&
    board.dice != null &&
    !boardViewReadOnly &&
    doubleAwaitingSeat == null &&
    (doubleState?.proposed_by == null || doubleState?.awaiting == null) &&
    !isDoubleCycleLockedForMe &&
    !isDoubleOfferCapped &&
    !isAtDoubleMultiplierCap;
  const isAwaitingMyDouble = isLiveMatch && mySeat != null && doubleAwaitingSeat === mySeat;
  const ludoDoubleProposedMult = useMemo(
    () => Math.min(Math.max(1, Number(currentMultiplier || 1)) * 2, 16),
    [currentMultiplier]
  );
  const turnTimerTone =
    !isTurnTimerActive || turnTimeLeftSec == null
      ? "border-sky-400/35 bg-sky-950/30 text-sky-100 shadow-sm shadow-sky-950/40"
      : turnTimeLeftSec <= 5
        ? "border-red-400/55 bg-red-950/40 text-red-100 shadow-sm shadow-red-950/45"
        : turnTimeLeftSec <= 10
          ? "border-amber-400/50 bg-amber-950/38 text-amber-100 shadow-sm shadow-amber-950/40"
          : "border-sky-400/45 bg-sky-950/35 text-sky-100 shadow-sm shadow-sky-950/35";
  const doubleTimerTone =
    !isDoublePending
      ? "border-violet-400/35 bg-violet-950/30 text-violet-100 shadow-sm shadow-violet-950/40"
      : isDoubleTimerActive && doubleTimeLeftSec != null && doubleTimeLeftSec <= 8
        ? "border-red-400/55 bg-red-950/40 text-red-100 shadow-sm shadow-red-950/45"
        : "border-fuchsia-400/45 bg-fuchsia-950/38 text-fuchsia-100 shadow-sm shadow-fuchsia-950/35";
  const pendingSeatsLabel = doublePendingSeats.length > 0 ? doublePendingSeats.map(s => `Seat ${Number(s) + 1}`).join(", ") : "None";
  const responderLabel = doubleAwaitingSeat != null ? `Seat ${Number(doubleAwaitingSeat) + 1}` : "—";
  const proposerLabel = doubleProposedBySeat != null ? `Seat ${Number(doubleProposedBySeat) + 1}` : "—";
  const doubleStateLine = !isDoublePending
    ? "No double pending"
    : isAwaitingMyDouble
      ? `Your response is required (${responderLabel})`
      : `Waiting for ${responderLabel}`;
  const turnToken = isMyTurnLive ? "Turn You" : turnSeat != null ? `Turn S${Number(turnSeat) + 1}` : "Turn —";
  const turnTimeToken = authoritativeTurnKey != null && isTurnTimerActive && turnTimeLeftSec != null ? `${turnTimeLeftSec}s` : "—";
  const doubleToken = `Dx${Number(currentMultiplier || 1)}`;
  const doubleTimeToken = isDoublePending && isDoubleTimerActive && doubleTimeLeftSec != null ? `${doubleTimeLeftSec}s` : "—";
  const pendingToken = isDoublePending && doubleAwaitingSeat != null ? `Wait S${Number(doubleAwaitingSeat) + 1}` : null;
  const statusShort = statusLine
    ? statusLine
        .replace("Match finished — winner Seat ", "Winner S")
        .replace("Seat ", "S")
        .replace(" eliminated after 3 missed turns.", "")
        .replace("Double response timed out — resolving.", "Double timeout")
    : null;
  const strikeSeats = [0, 1, 2, 3]
    .map(seat => ({ seat, v: Number(strikeDisplayMap?.[seat] || 0) }))
    .filter(x => x.v > 0);
  const strikeToken = eliminatedSeats?.length
    ? `Out ${eliminatedSeats.map(s => `S${Number(s) + 1}`).join(",")}`
    : strikeSeats.length
      ? `St ${strikeSeats.map(x => `S${x.seat + 1}:${x.v}`).join(",")}`
      : null;
  const selfKey = String(contextInput?.self?.participant_key || "").trim();
  const onLeaveToLobby =
    contextInput && typeof contextInput === "object" && typeof contextInput.onLeaveToLobby === "function"
      ? contextInput.onLeaveToLobby
      : null;
  const leaveToLobbyBusy = Boolean(
    contextInput && typeof contextInput === "object" && contextInput.leaveToLobbyBusy === true
  );
  const roomHostKey = String(contextInput?.room?.host_participant_key || "").trim();
  const isHost = Boolean(selfKey && roomHostKey && selfKey === roomHostKey);
  const seatedCount = roomMembers.filter(m => m?.seat_index != null).length;
  const myMemberRow = useMemo(
    () => roomMembers.find(m => m && typeof m === "object" && String(m.participant_key || "").trim() === selfKey),
    [roomMembers, selfKey]
  );
  const seatedCommitted = useMemo(
    () =>
      roomMembers.filter(m => m?.seat_index != null && String(m?.wallet_state || "").trim() === "committed"),
    [roomMembers]
  );
  const eligibleRematch = seatedCommitted.length;
  const readyRematch = useMemo(
    () =>
      seatedCommitted.filter(m => {
        const raw = m && typeof m === "object" ? m.meta : null;
        const l = raw && typeof raw === "object" && raw.ludo && typeof raw.ludo === "object" ? raw.ludo : null;
        if (!l) return false;
        return l.rematch_requested === true || l.rematch_requested === "true" || l.rematch_requested === 1;
      }).length,
    [seatedCommitted]
  );
  const myRematchRequested = (() => {
    const raw = myMemberRow && typeof myMemberRow === "object" ? myMemberRow.meta : null;
    const l = raw && typeof raw === "object" && raw.ludo && typeof raw.ludo === "object" ? raw.ludo : null;
    if (!l) return false;
    return l.rematch_requested === true || l.rematch_requested === "true" || l.rematch_requested === 1;
  })();
  const isFinished =
    isLiveMatch &&
    (String(matchPhase || "").toLowerCase() === "finished" || vm?.board?.winner != null || result?.winner != null);
  const winnerFromResult = result?.winner != null ? Number(result.winner) : winnerSeat != null ? Number(winnerSeat) : null;
  const didIWin = isFinished && mySeat != null && winnerFromResult != null && Number(mySeat) === Number(winnerFromResult);
  const baseRematchEligible =
    isFinished &&
    mySeat != null &&
    String(myMemberRow?.wallet_state || "").trim() === "committed" &&
    eligibleRematch >= 2 &&
    eligibleRematch <= 4;
  const finishActionsLocked = vaultClaimBusy;
  const canHostStartNextMatch =
    isFinished && isHost && eligibleRematch >= 2 && readyRematch >= eligibleRematch && !startNextBusy;
  const lossPerSeat =
    result?.lossPerSeat != null && Number.isFinite(Number(result.lossPerSeat)) ? Math.floor(Number(result.lossPerSeat)) : null;
  let prizeTotal =
    result?.prize != null && Number.isFinite(Number(result.prize)) ? Math.floor(Number(result.prize)) : null;
  // Strike walkover path (023) can emit __result__.prize = one stake while lossPerSeat = per-player stake; full pot = loss * seated count.
  if (
    prizeTotal != null &&
    lossPerSeat != null &&
    prizeTotal > 0 &&
    lossPerSeat > 0 &&
    prizeTotal <= lossPerSeat &&
    seatedCount >= 2
  ) {
    prizeTotal = lossPerSeat * seatedCount;
  }
  const winnerNet =
    prizeTotal != null && lossPerSeat != null ? Math.max(0, Math.floor(prizeTotal - lossPerSeat)) : null;

  const finishSessionId = isFinished ? String(ludoSessionId || "").trim() : "";
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
  const showResultModal = isFinished && !finishModalDismissed;

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
    if (!isFinished) return "unknown";
    if (winnerFromResult == null) return "unknown";
    if (mySeat == null) return "unknown";
    if (Number(mySeat) === Number(winnerFromResult)) return "win";
    return "loss";
  }, [isFinished, winnerFromResult, mySeat]);

  const finishTitle = useMemo(() => {
    if (!isFinished) return "";
    if (finishOutcome === "unknown") return "Match finished";
    if (finishOutcome === "win") return "Victory";
    return "Defeat";
  }, [isFinished, finishOutcome]);

  const finishReasonLine = useMemo(() => {
    if (!isFinished) return "";
    if (winnerFromResult != null) return `Winner: Seat ${winnerFromResult + 1}`;
    return "Match complete";
  }, [isFinished, winnerFromResult]);

  const finishAmountLine = useMemo(() => {
    if (!isFinished) return { text: "—", className: "text-zinc-500" };
    if (didIWin && winnerNet != null && prizeTotal != null) {
      return {
        text: `+${winnerNet.toLocaleString()} MLEO (pot ${prizeTotal.toLocaleString()})`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (didIWin && prizeTotal != null) {
      return {
        text: `Pot ${prizeTotal.toLocaleString()}`,
        className: "font-semibold tabular-nums text-amber-200/95",
      };
    }
    if (!didIWin && mySeat != null && winnerFromResult != null && lossPerSeat != null) {
      return {
        text: `−${lossPerSeat.toLocaleString()} MLEO`,
        className: "font-semibold tabular-nums text-rose-300/95",
      };
    }
    return { text: "—", className: "text-zinc-500" };
  }, [isFinished, didIWin, winnerNet, prizeTotal, mySeat, winnerFromResult, lossPerSeat]);

  const desktopStateSurface = isLiveMatch ? (
    <div className="pointer-events-auto flex w-[14.75rem] flex-col gap-1.5 rounded-lg border border-white/10 bg-black/35 p-2 backdrop-blur-[1px]">
      <button
        type="button"
        disabled={!canOfferDouble}
        onClick={() => void offerDouble()}
        className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40"
      >
        Offer Double
      </button>
      {authoritativeTurnKey != null ? (
        <div className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${turnTimerTone}`}>
          <div className="flex items-center justify-between gap-2">
            <span>{turnToken}</span>
            <span>{turnTimeToken}</span>
          </div>
        </div>
      ) : null}
      <div className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${doubleTimerTone}`}>
        <div className="flex items-center justify-between gap-2">
          <span>{doubleToken}</span>
          <span>{doubleTimeToken}</span>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-1 text-[9px]">
        {pendingToken ? <span className="rounded border border-fuchsia-400/30 bg-fuchsia-950/20 px-1.5 py-0.5 text-fuchsia-100">{pendingToken}</span> : null}
        {statusShort ? <span className="rounded border border-amber-500/35 bg-amber-950/25 px-1.5 py-0.5 text-amber-100">{statusShort}</span> : null}
        {strikeToken ? <span className="rounded border border-zinc-500/35 bg-zinc-900/35 px-1.5 py-0.5 text-zinc-200">{strikeToken}</span> : null}
      </div>
    </div>
  ) : null;
  const mobileStateRow = isLiveMatch ? (
    <div className="flex flex-wrap items-center justify-center gap-2 py-0.5 text-sm leading-tight">
      <button
        type="button"
        disabled={!canOfferDouble}
        onClick={() => void offerDouble()}
        className="rounded-md border border-amber-400/35 bg-amber-950/35 px-3 py-1.5 text-sm font-semibold text-amber-100 shadow-sm shadow-amber-950/30 transition-colors enabled:hover:border-amber-400/50 enabled:hover:bg-amber-950/45 disabled:border-zinc-600/25 disabled:bg-zinc-800/40 disabled:text-zinc-500 disabled:shadow-none"
      >
        Offer
      </button>
      {authoritativeTurnKey != null ? (
        <span className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${turnTimerTone}`}>{turnToken} {turnTimeToken}</span>
      ) : null}
      <span className={`rounded-md border px-3 py-1.5 text-sm font-semibold ${doubleTimerTone}`}>{doubleToken} {doubleTimeToken}</span>
      {pendingToken ? (
        <span className="rounded-md border border-fuchsia-400/40 bg-fuchsia-950/35 px-3 py-1.5 text-sm font-semibold text-fuchsia-100 shadow-sm shadow-fuchsia-950/20">
          {pendingToken}
        </span>
      ) : null}
      {statusShort ? (
        <span className="rounded-md border border-amber-400/40 bg-amber-950/35 px-3 py-1.5 text-sm font-semibold text-amber-100 shadow-sm shadow-amber-950/20">
          {statusShort}
        </span>
      ) : null}
      {strikeToken ? (
        <span className="rounded-md border border-slate-400/35 bg-slate-800/50 px-3 py-1.5 text-sm font-semibold text-slate-100 shadow-sm shadow-slate-950/30">
          {strikeToken}
        </span>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      <Ov2SharedStakeDoubleModal
        open={isAwaitingMyDouble}
        proposedMult={ludoDoubleProposedMult}
        stakeMultiplier={currentMultiplier}
        busy={false}
        onAccept={() => void respondDouble("accept")}
        onDecline={() => void respondDouble("decline")}
      />
      {playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => resetPreviewBoard()}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white"
          >
            Reset preview board
          </button>
          {previewWaitingOtherSeat ? (
            <span className="text-[9px] text-zinc-400 sm:text-[10px]">
              Turn is on another seat (no AI). Reset to play again from seat 1.
            </span>
          ) : null}
          {winnerSeat != null ? (
            <span className="text-[9px] text-emerald-300/90 sm:text-[10px]">
              Preview winner: seat {Number(winnerSeat) + 1}. Reset to play again.
            </span>
          ) : null}
        </div>
      ) : null}
      <Ov2SeatStrip
        count={4}
        labels={seatLabels}
        activeIndex={board.turnSeat}
        selfIndex={selfHighlightIndex}
        awaitedIndex={isDoublePending ? doubleAwaitingSeat : null}
        eliminatedIndices={eliminatedSeats}
      />
      {isLiveMatch && !isFinished && onLeaveToLobby ? (
        <div className="flex shrink-0 justify-end px-0.5 pt-0.5">
          <button
            type="button"
            disabled={leaveToLobbyBusy}
            onClick={() => void onLeaveToLobby()}
            className="text-[10px] font-semibold text-red-200/95 underline decoration-red-400/50 disabled:opacity-45"
          >
            {leaveToLobbyBusy ? "Leaving…" : "Leave table"}
          </button>
        </div>
      ) : null}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLiveMatch ? <div className="pointer-events-none absolute right-2 top-2 z-30 hidden md:block">{desktopStateSurface}</div> : null}
        <Ov2LudoBoardView
          board={board}
          mySeat={mySeat}
          diceValue={
            isLiveMatch && liveDiceDisplayValue != null && typeof liveDiceDisplayValue === "number"
              ? liveDiceDisplayValue
              : board.dice ?? board.lastDice
          }
          diceRolling={diceRolling}
          diceSeat={board.turnSeat}
          diceClickable={canRoll}
          onDiceClick={rollDicePreview}
          onPieceClick={
            interactionTier === "local_preview" || interactionTier === "live_authoritative" ? onPieceClick : undefined
          }
          disableHighlights={interactionTier === "none" || boardViewReadOnly}
          readOnlyPresentation={boardViewReadOnly}
          legalMovablePieceIndices={liveLegalMovablePieceIndices}
        />
      </div>

      {showResultModal ? (
        <Ov2SharedFinishModalFrame titleId="ov2-ludo-finish-title">
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
                  finishOutcome === "unknown" && "border-white/10 bg-zinc-900/80 text-zinc-200",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-hidden
              >
                {finishOutcome === "win" ? "🏆" : finishOutcome === "loss" ? "✕" : "⎔"}
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-zinc-500">Round result</p>
                <h2
                  id="ov2-ludo-finish-title"
                  className={[
                    "mt-0.5 text-2xl font-extrabold leading-tight tracking-tight",
                    finishOutcome === "win" && "text-emerald-400",
                    finishOutcome === "loss" && "text-rose-400",
                    finishOutcome === "unknown" && "text-zinc-100",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {finishTitle}
                </h2>
                <p className="mt-2 text-[10px] font-medium uppercase tracking-wide text-zinc-500">Table multiplier</p>
                <p className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-400">×{currentMultiplier}</p>
                <div className="mt-3 rounded-lg border border-white/[0.1] bg-black/25 px-2.5 py-2.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Settlement</p>
                  <p className={`mt-2 text-center text-xl font-bold tabular-nums leading-tight sm:text-2xl ${finishAmountLine.className}`}>
                    {finishAmountLine.text}
                  </p>
                </div>
                <p className="mt-3 text-center text-[11px] leading-snug text-zinc-400">{finishReasonLine}</p>
                {mySeat == null && prizeTotal != null && winnerFromResult != null ? (
                  <p className="mt-2 text-center text-[10px] text-zinc-500">
                    Spectator · winner S{winnerFromResult + 1} · pot {prizeTotal.toLocaleString()}
                  </p>
                ) : null}
                <p className="mt-2 text-center text-[10px] leading-snug text-zinc-500">
                  {finishActionsLocked
                    ? "Sending results to your balance…"
                    : eligibleRematch >= 2
                      ? `Rematch ready: ${readyRematch}/${eligibleRematch} seated players — then host starts next.`
                      : "Round complete — rematch, then host starts next."}
                </p>
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2 px-4 py-4">
            <button
              type="button"
              disabled={rematchIntentBusy || myRematchRequested || !baseRematchEligible || finishActionsLocked}
              onClick={async () => {
                if (!baseRematchEligible || finishActionsLocked) return;
                setRematchIntentBusy(true);
                try {
                  const r = await requestRematch();
                  if (!r?.ok && r?.error) console.warn("[Ludo rematch intent]", r.error);
                } finally {
                  setRematchIntentBusy(false);
                }
              }}
              className={BTN_PRIMARY + " w-full"}
            >
              {rematchIntentBusy && !myRematchRequested ? "Requesting…" : "Request rematch"}
            </button>
            <button
              type="button"
              disabled={rematchIntentBusy || !myRematchRequested || !baseRematchEligible}
              onClick={async () => {
                if (!baseRematchEligible) return;
                setRematchIntentBusy(true);
                try {
                  const r = await cancelRematch();
                  if (!r?.ok && r?.error) console.warn("[Ludo rematch cancel]", r.error);
                } finally {
                  setRematchIntentBusy(false);
                }
              }}
              className={BTN_SECONDARY + " w-full"}
            >
              Cancel rematch
            </button>
            <div className="w-full overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-950/15 pt-2">
              <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-wide text-emerald-200/85">Host only</p>
              <button
                type="button"
                className={BTN_PRIMARY + " w-full rounded-none"}
                disabled={!isHost || startNextBusy || finishActionsLocked || !canHostStartNextMatch}
                title={!isHost ? "Only the host can start the next match" : undefined}
                onClick={async () => {
                  if (!canHostStartNextMatch || finishActionsLocked) return;
                  const prevSessionId =
                    contextInput?.room?.active_session_id != null ? String(contextInput.room.active_session_id) : "";
                  setStartNextBusy(true);
                  try {
                    const r = await startNextMatch();
                    if (r?.ok) {
                      try {
                        window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
                      } catch {
                        /* ignore */
                      }
                      if (onSessionRefresh) {
                        await onSessionRefresh(prevSessionId, "", { expectClearedSession: true });
                      }
                      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
                    } else if (r?.error) {
                      console.warn("[Ludo start next match]", r.error);
                    }
                  } finally {
                    setStartNextBusy(false);
                  }
                }}
              >
                {startNextBusy ? "Starting…" : "Start next (host)"}
              </button>
              <p className="px-2 py-1.5 text-center text-[11px] text-zinc-500">
                Host starts the next match when all seated players rematch.
              </p>
            </div>
            <button type="button" className={BTN_SECONDARY + " w-full"} onClick={dismissFinishModal}>
              Dismiss
            </button>
            <button
              type="button"
              disabled={exitBusy || !selfKey}
              className={BTN_FINISH_DANGER + " w-full"}
              onClick={async () => {
                if (!selfKey) return;
                setExitErr("");
                setExitBusy(true);
                try {
                  await leaveOv2RoomWithForfeitRetry({
                    room: contextInput?.room,
                    room_id: roomId,
                    participant_key: selfKey,
                  });
                  try {
                    window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
                  } catch {
                    /* ignore */
                  }
                  await router.replace("/online-v2/rooms");
                } catch (e) {
                  setExitErr(e?.message || "Could not leave room.");
                } finally {
                  setExitBusy(false);
                }
              }}
            >
              {exitBusy ? "Leaving…" : "Leave table"}
            </button>
            {exitErr ? <p className="text-center text-[11px] text-red-300">{exitErr}</p> : null}
          </div>
        </Ov2SharedFinishModalFrame>
      ) : null}
      {isLiveMatch ? <div className="shrink-0 md:hidden">{mobileStateRow}</div> : null}
    </div>
  );
}
