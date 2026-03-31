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
  const { vm, rollDicePreview, onPieceClick, canRoll, resetPreviewBoard } = session;
  const roomProductId =
    contextInput?.room && typeof contextInput.room === "object" && contextInput.room.product_game_id != null
      ? String(contextInput.room.product_game_id)
      : null;
  const {
    board,
    diceRolling,
    playMode,
    interactionTier,
    boardSeatForUi,
    previewWaitingOtherSeat,
    winnerSeat,
    boardViewReadOnly,
    liveLegalMovablePieceIndices,
    lobbySeatLabels,
    lobbySelfRingIndex,
  } = vm;

  const isReadOnlyRoom = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  const isLiveMatch = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE;

  const seatLabels = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return ["Seat 1 · you (preview)", "Seat 2", "Seat 3", "Seat 4"];
    }
    if (isLiveMatch && boardSeatForUi != null) {
      return ["Seat 1", "Seat 2", "Seat 3", "Seat 4"].map((l, i) => (i === boardSeatForUi ? `${l} · you` : l));
    }
    if (isReadOnlyRoom && Array.isArray(lobbySeatLabels) && lobbySeatLabels.length >= 4) {
      return lobbySeatLabels;
    }
    return ["Seat 1 · —", "Seat 2 · —", "Seat 3 · —", "Seat 4 · —"];
  }, [playMode, isLiveMatch, boardSeatForUi, isReadOnlyRoom, lobbySeatLabels]);

  const selfHighlightIndex =
    isLiveMatch && boardSeatForUi != null
      ? boardSeatForUi
      : isReadOnlyRoom && lobbySelfRingIndex != null
        ? lobbySelfRingIndex
        : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
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
          mySeat={boardSeatForUi}
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
