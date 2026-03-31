"use client";

import { useMemo } from "react";
import {
  OV2_LUDO_PLAY_MODE,
  OV2_LUDO_PRODUCT_GAME_ID,
} from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { useOv2LudoSession } from "../../../hooks/useOv2LudoSession";
import Ov2LudoBoardView from "../../../lib/online-v2/ludo/ov2LudoBoardView";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
 */
export default function Ov2LudoScreen({ contextInput = null }) {
  const session = useOv2LudoSession(contextInput ?? undefined);
  const { vm, rollDicePreview, onPieceClick, canRoll, resetPreviewBoard, offerDouble, respondDouble } = session;
  const roomMembers = Array.isArray(contextInput?.members) ? contextInput.members : [];
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

  const canOfferDouble =
    isLiveMatch &&
    mySeat != null &&
    turnSeat === mySeat &&
    board.dice != null &&
    doubleAwaitingSeat == null &&
    (doubleState?.proposed_by == null || doubleState?.awaiting == null);
  const isAwaitingMyDouble = isLiveMatch && mySeat != null && doubleAwaitingSeat === mySeat;
  const turnTimerTone =
    !isTurnTimerActive || turnTimeLeftSec == null
      ? "border-white/15 bg-white/5 text-zinc-300"
      : turnTimeLeftSec <= 5
        ? "border-red-400/50 bg-red-950/35 text-red-100"
        : turnTimeLeftSec <= 10
          ? "border-amber-400/50 bg-amber-950/35 text-amber-100"
          : "border-sky-400/40 bg-sky-950/30 text-sky-100";
  const doubleTimerTone =
    !isDoublePending
      ? "border-white/15 bg-white/5 text-zinc-300"
      : isDoubleTimerActive && doubleTimeLeftSec != null && doubleTimeLeftSec <= 8
        ? "border-red-400/50 bg-red-950/35 text-red-100"
        : "border-fuchsia-400/40 bg-fuchsia-950/30 text-fuchsia-100";
  const pendingSeatsLabel = doublePendingSeats.length > 0 ? doublePendingSeats.map(s => `Seat ${Number(s) + 1}`).join(", ") : "None";
  const responderLabel = doubleAwaitingSeat != null ? `Seat ${Number(doubleAwaitingSeat) + 1}` : "—";
  const proposerLabel = doubleProposedBySeat != null ? `Seat ${Number(doubleProposedBySeat) + 1}` : "—";
  const doubleStateLine = !isDoublePending
    ? "No double pending"
    : isAwaitingMyDouble
      ? `Your response is required (${responderLabel})`
      : `Waiting for ${responderLabel}`;
  const turnToken = isMyTurnLive ? "Turn You" : turnSeat != null ? `Turn S${Number(turnSeat) + 1}` : "Turn —";
  const turnTimeToken = isTurnTimerActive && turnTimeLeftSec != null ? `${turnTimeLeftSec}s` : "—";
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
  const desktopStateSurface = isLiveMatch ? (
    <div className="flex w-[16.75rem] flex-col gap-1.5">
      <button
        type="button"
        disabled={!canOfferDouble}
        onClick={() => void offerDouble()}
        className="rounded-md border border-white/20 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-white disabled:opacity-40"
      >
        Offer Double
      </button>
      <div className={`rounded-md border px-2.5 py-1.5 text-[10px] font-semibold ${turnTimerTone}`}>
        <div className="flex items-center justify-between gap-2">
          <span>{turnToken}</span>
          <span>{turnTimeToken}</span>
        </div>
      </div>
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
    <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
      <button
        type="button"
        disabled={!canOfferDouble}
        onClick={() => void offerDouble()}
        className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
      >
        Offer
      </button>
      {isAwaitingMyDouble ? (
        <>
          <button
            type="button"
            onClick={() => void respondDouble("accept")}
            className="rounded-md border border-emerald-500/40 bg-emerald-900/30 px-2 py-1 text-[10px] font-semibold text-emerald-100"
          >
            Accept
          </button>
          <button
            type="button"
            onClick={() => void respondDouble("decline")}
            className="rounded-md border border-red-500/40 bg-red-900/30 px-2 py-1 text-[10px] font-semibold text-red-100"
          >
            Decline
          </button>
        </>
      ) : null}
      <span className={`rounded border px-2 py-1 font-semibold ${turnTimerTone}`}>{turnToken} {turnTimeToken}</span>
      <span className={`rounded border px-2 py-1 font-semibold ${doubleTimerTone}`}>{doubleToken} {doubleTimeToken}</span>
      {pendingToken ? (
        <span className="rounded border border-fuchsia-400/30 bg-fuchsia-950/20 px-2 py-1 font-semibold text-fuchsia-100">{pendingToken}</span>
      ) : null}
      {statusShort ? (
        <span className="rounded border border-amber-500/35 bg-amber-950/25 px-2 py-1 font-semibold text-amber-100">{statusShort}</span>
      ) : null}
      {strikeToken ? (
        <span className="rounded border border-zinc-500/35 bg-zinc-900/35 px-2 py-1 font-semibold text-zinc-200">{strikeToken}</span>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      {isReadOnlyRoom ? (
        <div
          className="shrink-0 rounded-md border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-center text-[9px] font-semibold text-amber-100 sm:text-[10px]"
          role="status"
        >
          {roomProductId === OV2_LUDO_PRODUCT_GAME_ID
            ? "Read-only — no live Ludo session yet. The room host can open the match when 2–4 players are seated."
            : "Read-only — no authoritative match snapshot yet."}
        </div>
      ) : null}
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
      <div className="relative min-h-0 flex-1 overflow-hidden">
        {isLiveMatch ? <div className="absolute right-1 top-1 z-30 hidden md:block">{desktopStateSurface}</div> : null}
        <Ov2LudoBoardView
          board={board}
          mySeat={mySeat}
          diceValue={board.dice ?? board.lastDice}
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
      {isLiveMatch ? <div className="shrink-0 md:hidden">{mobileStateRow}</div> : null}
    </div>
  );
}
