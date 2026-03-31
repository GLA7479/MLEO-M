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
  const stateSurface = isLiveMatch ? (
    <div className="flex w-full max-w-[28rem] flex-col gap-1">
      <div className="flex flex-wrap items-stretch justify-end gap-1">
        <div className={`min-w-[9rem] rounded-md border px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${turnTimerTone}`}>
          <div className="flex items-center justify-between gap-2">
            <span>{isMyTurnLive ? "Your turn" : `Turn: ${turnSeat != null ? `Seat ${Number(turnSeat) + 1}` : "—"}`}</span>
            {isTurnTimerActive && turnTimeLeftSec != null ? <span>{turnTimeLeftSec}s</span> : <span>—</span>}
          </div>
        </div>
        <div className={`min-w-[11rem] rounded-md border px-2 py-1 text-[10px] font-semibold sm:text-[11px] ${doubleTimerTone}`}>
          <div className="flex items-center justify-between gap-2">
            <span>Double x{Number(currentMultiplier || 1)}</span>
            {isDoublePending && isDoubleTimerActive && doubleTimeLeftSec != null ? <span>{doubleTimeLeftSec}s</span> : <span>—</span>}
          </div>
          <div className="mt-0.5 text-[9px] font-normal text-zinc-200/90 sm:text-[10px]">
            {doubleStateLine}
          </div>
        </div>
      </div>
      <div className="text-right text-[9px] text-zinc-300 sm:text-[10px]">
        {doubleAwaitingSeat != null ? `Pending: proposer ${proposerLabel} · awaiting ${responderLabel} · queue ${pendingSeatsLabel}` : "Pending: none"}
      </div>
      {statusLine ? (
        <div className="rounded-md border border-amber-500/35 bg-amber-950/25 px-2 py-1 text-[9px] font-semibold text-amber-100 sm:text-[10px]">
          {statusLine}
        </div>
      ) : null}
      <div className="text-right text-[9px] text-zinc-300 sm:text-[10px]">
        {eliminatedSeats?.length
          ? `Eliminated: ${eliminatedSeats.map(s => `Seat ${Number(s) + 1}`).join(", ")}`
          : `Strikes: ${[0, 1, 2, 3].map(seat => `S${seat + 1}:${Number(strikeDisplayMap?.[seat] || 0)}`).join(" · ")}`}
      </div>
    </div>
  ) : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      {isLiveMatch ? (
        <div className="flex shrink-0 flex-wrap items-center gap-1">
          <button
            type="button"
            disabled={!canOfferDouble}
            onClick={() => void offerDouble()}
            className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-40"
          >
            Offer Double
          </button>
          {doubleAwaitingSeat != null ? (
            <span className="text-[9px] text-zinc-300 sm:text-[10px]">
              Pending: proposer {proposerLabel} · awaiting {responderLabel} · queue {pendingSeatsLabel}
            </span>
          ) : null}
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
        </div>
      ) : null}
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
      {isLiveMatch ? <div className="hidden shrink-0 justify-end md:flex">{stateSurface}</div> : null}
      <div className="min-h-0 flex-1 overflow-hidden">
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
      {isLiveMatch ? <div className="shrink-0 md:hidden">{stateSurface}</div> : null}
    </div>
  );
}
