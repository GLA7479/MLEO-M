"use client";

import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  OV2_LUDO_PLAY_MODE,
  OV2_LUDO_PRODUCT_GAME_ID,
} from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2LudoSession } from "../../../hooks/useOv2LudoSession";
import Ov2LudoBoardView from "../../../lib/online-v2/ludo/ov2LudoBoardView";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null, onSessionRefresh?: (previousActiveSessionId: string, rpcNewSessionId?: string, options?: { expectClearedSession?: boolean }) => void | Promise<unknown> }} props
 */
export default function Ov2LudoScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2LudoSession(contextInput ?? undefined);
  const { vm, rollDicePreview, onPieceClick, canRoll, resetPreviewBoard, offerDouble, respondDouble, requestRematch, cancelRematch, startNextMatch } =
    session;
  const [rematchIntentBusy, setRematchIntentBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
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
    !isDoubleCycleLockedForMe;
  const isAwaitingMyDouble = isLiveMatch && mySeat != null && doubleAwaitingSeat === mySeat;
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
  const canToggleRematchIntent =
    isFinished &&
    mySeat != null &&
    String(myMemberRow?.wallet_state || "").trim() === "committed" &&
    eligibleRematch >= 2 &&
    eligibleRematch <= 4 &&
    !rematchIntentBusy;
  const canHostStartNextMatch =
    isFinished && isHost && eligibleRematch >= 2 && readyRematch >= eligibleRematch && !startNextBusy;
  const prizeTotal = result?.prize != null && Number.isFinite(Number(result.prize)) ? Math.floor(Number(result.prize)) : null;
  const lossPerSeat = result?.lossPerSeat != null && Number.isFinite(Number(result.lossPerSeat)) ? Math.floor(Number(result.lossPerSeat)) : null;
  const winnerNet =
    prizeTotal != null && lossPerSeat != null ? Math.max(0, Math.floor(prizeTotal - lossPerSeat)) : null;
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
      {isAwaitingMyDouble ? (
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => void respondDouble("accept")}
            className="flex-1 rounded-md border border-emerald-500/40 bg-emerald-900/30 px-2 py-1 text-[10px] font-semibold text-emerald-100"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => void respondDouble("decline")}
            className="flex-1 rounded-md border border-red-500/40 bg-red-900/30 px-2 py-1 text-[10px] font-semibold text-red-100"
          >
            Decline
          </button>
        </div>
      ) : null}
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
      {isAwaitingMyDouble ? (
        <>
          <button
            type="button"
            onClick={() => void respondDouble("accept")}
            className="rounded-md border border-emerald-400/45 bg-emerald-950/40 px-3 py-1.5 text-sm font-semibold text-emerald-100 shadow-sm shadow-emerald-950/25"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => void respondDouble("decline")}
            className="rounded-md border border-rose-400/40 bg-rose-950/35 px-3 py-1.5 text-sm font-semibold text-rose-100 shadow-sm shadow-rose-950/25"
          >
            Decline
          </button>
        </>
      ) : null}
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
        {isFinished ? (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/45 p-3">
            <div className="w-full max-w-xs rounded-xl border border-white/20 bg-zinc-900/95 p-4 text-center shadow-2xl">
              <p
                className={`text-lg font-semibold ${
                  didIWin ? "text-emerald-200" : mySeat != null && winnerFromResult != null ? "text-red-300" : "text-white"
                }`}
              >
                {didIWin ? "You won" : mySeat != null && winnerFromResult != null ? "You lost" : "Finished match"}
              </p>
              <p className="mt-1 text-xs text-zinc-300">
                {winnerFromResult != null ? `Winner Seat ${winnerFromResult + 1}` : "Match complete"}
              </p>
              {didIWin && prizeTotal != null ? (
                <p className="mt-2 text-sm font-semibold text-emerald-300/95">
                  {winnerNet != null
                    ? `You won ${winnerNet.toLocaleString()} (Pot ${prizeTotal.toLocaleString()})`
                    : `You won (Pot ${prizeTotal.toLocaleString()})`}
                </p>
              ) : null}
              {!didIWin && mySeat != null && winnerFromResult != null && lossPerSeat != null ? (
                <p className="mt-2 text-sm font-semibold text-red-400/95">You lost {lossPerSeat.toLocaleString()}</p>
              ) : null}
              {mySeat == null && prizeTotal != null && winnerFromResult != null ? (
                <p className="mt-2 text-xs text-zinc-400">
                  Winner S{winnerFromResult + 1} · pot {prizeTotal.toLocaleString()}
                </p>
              ) : null}
              <div className="mt-3 flex flex-col gap-2">
                {eligibleRematch >= 2 ? (
                  <p className="text-center text-[10px] text-zinc-400">
                    Rematch ready: {readyRematch}/{eligibleRematch} seated players
                  </p>
                ) : null}
                {canToggleRematchIntent ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setRematchIntentBusy(true);
                      try {
                        const r = myRematchRequested ? await cancelRematch() : await requestRematch();
                        if (!r?.ok && r?.error) console.warn("[Ludo rematch intent]", r.error);
                      } finally {
                        setRematchIntentBusy(false);
                      }
                    }}
                    className="w-full rounded-md border border-sky-500/40 bg-sky-950/35 px-3 py-2 text-xs font-semibold text-sky-100 disabled:opacity-45"
                  >
                    {rematchIntentBusy
                      ? "Updating…"
                      : myRematchRequested
                        ? "Cancel rematch"
                        : "Ready for rematch"}
                  </button>
                ) : null}
                {isHost ? (
                  <button
                    type="button"
                    disabled={!canHostStartNextMatch}
                    onClick={async () => {
                      if (!canHostStartNextMatch) return;
                      const prevSessionId =
                        contextInput?.room?.active_session_id != null
                          ? String(contextInput.room.active_session_id)
                          : "";
                      setStartNextBusy(true);
                      try {
                        const r = await startNextMatch();
                        if (r?.ok && onSessionRefresh) {
                          await onSessionRefresh(prevSessionId, undefined, { expectClearedSession: true });
                        } else if (!r?.ok && r?.error) {
                          console.warn("[Ludo start next match]", r.error);
                        }
                      } finally {
                        setStartNextBusy(false);
                      }
                    }}
                    className="w-full rounded-md border border-emerald-500/40 bg-emerald-900/30 px-3 py-2 text-xs font-semibold text-emerald-100 disabled:opacity-45"
                  >
                    {startNextBusy ? "Starting next match…" : "Start next match (host)"}
                  </button>
                ) : isFinished && eligibleRematch >= 2 && readyRematch < eligibleRematch ? (
                  <p className="text-center text-[10px] text-zinc-500">Waiting for all players to confirm rematch…</p>
                ) : null}
                {exitErr ? (
                  <p className="text-center text-[10px] text-red-300">{exitErr}</p>
                ) : null}
                {roomId ? (
                  <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={exitBusy}
                      onClick={() => {
                        setExitErr("");
                        void router.replace(
                          { pathname: "/online-v2/rooms", query: { room: roomId } },
                          undefined,
                          { shallow: true }
                        );
                      }}
                      className="rounded-md border border-white/25 bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-45"
                    >
                      Back to room
                    </button>
                    <button
                      type="button"
                      disabled={exitBusy || !selfKey}
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
                            // ignore
                          }
                          await router.replace("/online-v2/rooms");
                        } catch (e) {
                          setExitErr(e?.message || "Could not leave room.");
                        } finally {
                          setExitBusy(false);
                        }
                      }}
                      className="rounded-md border border-red-500/45 bg-red-950/35 px-3 py-2 text-xs font-semibold text-red-100 disabled:opacity-45"
                    >
                      {exitBusy ? "Leaving…" : "Leave room"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </div>
      {isLiveMatch ? <div className="shrink-0 md:hidden">{mobileStateRow}</div> : null}
    </div>
  );
}
