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
  const { vm, rollDicePreview, onPieceClick, canRoll } = session;
  const { board, diceRolling, phaseLine, playMode, interactionTier, boardSeatForUi, liveMySeat } = vm;

  const stripTone = playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_WITHOUT_MATCH_SESSION ? "amber" : "neutral";
  const title =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL ? "Ludo · local preview" : "Ludo · room (match not live)";

  const seatLabels = useMemo(
    () =>
      playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL
        ? ["Seat 1 · sandbox", "Seat 2", "Seat 3", "Seat 4"]
        : ["Seat 1 · unassigned", "Seat 2 · unassigned", "Seat 3 · unassigned", "Seat 4 · unassigned"],
    [playMode]
  );

  const selfHighlightIndex =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL && boardSeatForUi != null ? boardSeatForUi : null;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden px-0.5 sm:gap-1.5 sm:px-1">
      <Ov2GameStatusStrip title={title} subtitle={phaseLine} tone={stripTone} />
      {liveMySeat == null && playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_WITHOUT_MATCH_SESSION ? (
        <p className="shrink-0 text-[9px] leading-tight text-amber-200/90 sm:text-[10px]">
          OV2 seat mapping for Ludo is not implemented — you are not assigned a live seat.
        </p>
      ) : null}
      {playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL && board.turnSeat !== boardSeatForUi ? (
        <p className="shrink-0 text-[9px] leading-tight text-zinc-500 sm:text-[10px]">
          Preview sandbox: only seat 1 is controllable — no AI for other seats (reload page to reset the board).
        </p>
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
        />
      </div>
    </div>
  );
}
