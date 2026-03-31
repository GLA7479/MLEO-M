"use client";

import { useOv2LudoSession } from "../../../hooks/useOv2LudoSession";
import Ov2LudoBoardView from "../../../lib/online-v2/ludo/ov2LudoBoardView";
import Ov2GameStatusStrip from "../shared/Ov2GameStatusStrip";
import Ov2SeatStrip from "../shared/Ov2SeatStrip";

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string } } | null }} props
 */
export default function Ov2LudoScreen({ contextInput = null }) {
  const session = useOv2LudoSession(contextInput ?? undefined);
  const { vm, rollDicePreview, onPieceClick } = session;
  const { board, mySeat, diceRolling, phaseLine } = vm;

  const canRoll =
    board.turnSeat === mySeat && board.dice == null && board.winner == null && !diceRolling;

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-1 overflow-hidden px-0.5 sm:gap-1.5 sm:px-1">
      <Ov2GameStatusStrip title="Ludo · OV2" subtitle={phaseLine} tone="neutral" />
      <Ov2SeatStrip
        count={4}
        labels={["Seat 1", "Seat 2", "Seat 3", "Seat 4"]}
        activeIndex={board.turnSeat}
        selfIndex={mySeat}
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
          onPieceClick={onPieceClick}
        />
      </div>
    </div>
  );
}
