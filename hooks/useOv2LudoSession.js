import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createOv2LudoLocalPreviewBoard,
  applyOv2LudoLocalPreviewMove,
  setOv2LudoLocalPreviewDice,
} from "../lib/online-v2/ludo/ov2LudoLocalPreview";
import {
  OV2_LUDO_PLAY_MODE,
  OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX,
  resolveOv2LudoPlayMode,
  resolveOv2LudoMySeatFromRoomMembers,
} from "../lib/online-v2/ludo/ov2LudoSessionAdapter";

/**
 * OV2 Ludo UI/session hook.
 * - **Preview local:** sandbox only (`ov2LudoLocalPreview` + engine); not authoritative.
 * - **Room without match session:** room context for shell only; board is non-interactive until
 *   `ov2LudoSessionAdapter` supplies a live snapshot (future RPC/realtime).
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2LudoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  const playMode = resolveOv2LudoPlayMode(baseContext);
  const liveMySeat = useMemo(() => resolveOv2LudoMySeatFromRoomMembers(members, selfKey), [members, selfKey]);

  const previewControlledSeatIndex =
    playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL ? OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX : null;

  const [board, setBoard] = useState(() => createOv2LudoLocalPreviewBoard());
  const [diceRolling, setDiceRolling] = useState(false);

  useEffect(() => {
    setBoard(createOv2LudoLocalPreviewBoard());
    setDiceRolling(false);
  }, [playMode, roomId]);

  const phaseLine = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL) {
      return "Local preview — not connected to an OV2 room. Dice/moves are client-only sandbox (not authoritative).";
    }
    return "Room loaded — Ludo match session / RPC not available yet. Board is read-only; no live play.";
  }, [playMode]);

  const interactionTier = playMode === OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL ? "local_preview" : "none";

  const rollDicePreview = useCallback(() => {
    if (interactionTier !== "local_preview") return;
    if (typeof window === "undefined") return;
    if (previewControlledSeatIndex == null) return;
    if (board.turnSeat !== previewControlledSeatIndex || board.dice != null || board.winner != null) return;
    setDiceRolling(true);
    window.setTimeout(() => {
      const v = 1 + Math.floor(Math.random() * 6);
      setBoard(b => setOv2LudoLocalPreviewDice(b, v));
      setDiceRolling(false);
    }, 450);
  }, [interactionTier, previewControlledSeatIndex, board.turnSeat, board.dice, board.winner]);

  const onPieceClick = useCallback(
    pieceIdx => {
      if (interactionTier !== "local_preview" || previewControlledSeatIndex == null) return;
      if (board.turnSeat !== previewControlledSeatIndex || board.dice == null) return;
      const res = applyOv2LudoLocalPreviewMove(board, previewControlledSeatIndex, pieceIdx);
      if (!res.ok) return;
      setBoard(res.board);
    },
    [interactionTier, previewControlledSeatIndex, board]
  );

  const boardSeatForUi = previewControlledSeatIndex;

  const canRoll =
    interactionTier === "local_preview" &&
    previewControlledSeatIndex != null &&
    board.turnSeat === previewControlledSeatIndex &&
    board.dice == null &&
    board.winner == null &&
    !diceRolling;

  return {
    vm: {
      playMode,
      interactionTier,
      previewControlledSeatIndex,
      liveMySeat,
      board,
      diceRolling,
      phaseLine,
      /** Pass to `Ov2LudoBoardView` as `mySeat` only for movable-piece highlight in preview mode. */
      boardSeatForUi,
    },
    rollDicePreview,
    onPieceClick,
    canRoll,
  };
}
