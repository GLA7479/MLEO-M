import { useCallback, useMemo, useState } from "react";
import { applyMove, createInitialBoard, nextTurnSeat } from "../lib/online-v2/ludo/ov2LudoEngine";

/**
 * OV2 Ludo session hook — shape mirrors Board Path hook (context in → vm + actions).
 * No Supabase/RPC yet: board mutations are local preview only until server authority lands.
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2LudoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;

  const [board, setBoard] = useState(() => createInitialBoard([0, 1, 2, 3]));
  const [diceRolling, setDiceRolling] = useState(false);

  /** TODO: derive from `members` + `self.participant_key` when OV2 Ludo seats exist in DB. */
  const mySeat = 0;

  const phaseLine = useMemo(() => {
    if (roomId) {
      return "Room context loaded — server-synchronized turns/dice are not wired yet (local preview only).";
    }
    return "No room — offline board preview. Dice and moves are client-only.";
  }, [roomId]);

  const rollDicePreview = useCallback(() => {
    if (typeof window === "undefined") return;
    if (board.turnSeat !== mySeat || board.dice != null || board.winner != null) return;
    setDiceRolling(true);
    window.setTimeout(() => {
      const v = 1 + Math.floor(Math.random() * 6);
      setBoard(b => ({ ...b, dice: v }));
      setDiceRolling(false);
    }, 450);
  }, [board.turnSeat, board.dice, board.winner, mySeat]);

  const onPieceClick = useCallback(
    pieceIdx => {
      if (board.turnSeat !== mySeat || board.dice == null) return;
      const res = applyMove(board, mySeat, pieceIdx, board.dice);
      if (!res.ok) return;
      const nb = res.board;
      const next = nextTurnSeat(nb);
      if (next != null) nb.turnSeat = next;
      setBoard(nb);
    },
    [board, mySeat]
  );

  return {
    vm: {
      board,
      mySeat,
      diceRolling,
      phaseLine,
    },
    rollDicePreview,
    onPieceClick,
  };
}
