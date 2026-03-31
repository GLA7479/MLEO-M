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
  } = vm;

  const isReadOnlyRoom = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  const isLiveMatch = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE;

  const seatLabels = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return ["Seat 1 · you (preview)", "Seat 2", "Seat 3", "Seat 4"];
    }
    if (isLiveMatch && mySeat != null) {
      return ["Seat 1", "Seat 2", "Seat 3", "Seat 4"].map((l, i) => (i === mySeat ? `${l} · you` : l));
    }
    if (isReadOnlyRoom && Array.isArray(lobbySeatLabels) && lobbySeatLabels.length >= 4) {
      return lobbySeatLabels;
    }
    return ["Seat 1 · —", "Seat 2 · —", "Seat 3 · —", "Seat 4 · —"];
  }, [playMode, isLiveMatch, mySeat, isReadOnlyRoom, lobbySeatLabels]);

  const selfHighlightIndex =
    isLiveMatch && mySeat != null
      ? mySeat
      : isReadOnlyRoom && lobbySelfRingIndex != null
        ? lobbySelfRingIndex
        : null;

  const doubleAwaitingSeat =
    doubleState && typeof doubleState === "object" && doubleState.awaiting != null ? Number(doubleState.awaiting) : null;
  const canOfferDouble =
    isLiveMatch &&
    mySeat != null &&
    board.turnSeat === mySeat &&
    board.dice != null &&
    doubleAwaitingSeat == null &&
    (doubleState?.proposed_by == null || doubleState?.awaiting == null);
  const isAwaitingMyDouble = isLiveMatch && mySeat != null && doubleAwaitingSeat === mySeat;

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
            Double x{Number(doubleState?.value || 1)}
          </button>
          {doubleAwaitingSeat != null ? (
            <span className="text-[9px] text-zinc-300 sm:text-[10px]">Waiting Seat {doubleAwaitingSeat + 1}</span>
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
            ? "Read-only — no live Ludo session yet. The host can open the match when the room is active with 2–4 committed players."
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
      />
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
    </div>
  );
}
