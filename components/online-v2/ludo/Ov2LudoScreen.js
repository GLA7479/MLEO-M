"use client";

import { useMemo } from "react";
import { OV2_LUDO_PLAY_MODE } from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { useOv2LudoSession } from "../../../hooks/useOv2LudoSession";
import Ov2LudoBoardView from "../../../lib/online-v2/ludo/ov2LudoBoardView";
import Ov2GameStatusStrip from "../shared/Ov2GameStatusStrip";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
 */
export default function Ov2LudoScreen({ contextInput = null }) {
  const session = useOv2LudoSession(contextInput ?? undefined);
  const { vm, rollDicePreview, onPieceClick, canRoll, resetPreviewBoard } = session;
  const {
    board,
    diceRolling,
    phaseLine,
    playMode,
    interactionTier,
    boardSeatForUi,
    liveMySeat,
    previewWaitingOtherSeat,
    winnerSeat,
  } = vm;

  const isReadOnlyRoom = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;

  const stripTone = isReadOnlyRoom ? "amber" : "neutral";
  const title = isReadOnlyRoom ? "Ludo · read-only (no match yet)" : "Ludo · local preview";

  const seatLabels = useMemo(
    () =>
      playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL
        ? ["Seat 1 · you (preview)", "Seat 2", "Seat 3", "Seat 4"]
        : ["Seat 1 · —", "Seat 2 · —", "Seat 3 · —", "Seat 4 · —"],
    [playMode]
  );

  const selfHighlightIndex =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL && boardSeatForUi != null ? boardSeatForUi : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-0.5 overflow-hidden px-0.5 sm:gap-1 sm:px-1">
      <Ov2GameStatusStrip title={title} subtitle={phaseLine} tone={stripTone} />
      {isReadOnlyRoom ? (
        <div
          className="shrink-0 rounded-md border border-amber-500/40 bg-amber-950/30 px-2 py-1 text-center text-[9px] font-semibold text-amber-100 sm:text-[10px]"
          role="status"
        >
          Read-only — no live seat, dice, or moves until OV2 Ludo session + RPC exist.
        </div>
      ) : null}
      {liveMySeat == null && isReadOnlyRoom ? (
        <p className="shrink-0 text-[9px] leading-tight text-amber-200/80 sm:text-[10px]">
          Live seat mapping is not implemented (`resolveOv2LudoMySeatFromRoomMembers` returns null).
        </p>
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
          onPieceClick={interactionTier === "local_preview" ? onPieceClick : undefined}
          disableHighlights={interactionTier !== "local_preview"}
          readOnlyPresentation={isReadOnlyRoom}
        />
      </div>
    </div>
  );
}
