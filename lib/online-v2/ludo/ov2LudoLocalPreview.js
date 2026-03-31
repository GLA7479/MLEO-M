/**
 * OV2 Ludo — **local preview only** (not server-authoritative).
 * Used when `resolveOv2LudoPlayMode` is `PREVIEW_LOCAL`.
 * Do not call for live match flows once RPC-backed state exists.
 */

import { applyMove, createInitialBoard, nextTurnSeat } from "./ov2LudoEngine";

export function createOv2LudoLocalPreviewBoard() {
  return createInitialBoard([0, 1, 2, 3]);
}

/**
 * @param {Record<string, unknown>} board
 * @param {number} controlledSeatIndex
 * @param {number} pieceIndex
 */
export function applyOv2LudoLocalPreviewMove(board, controlledSeatIndex, pieceIndex) {
  const dice = board.dice;
  if (dice == null) return { ok: false, board };
  const res = applyMove(board, controlledSeatIndex, pieceIndex, dice);
  if (!res.ok) return res;
  const nb = res.board;
  const next = nextTurnSeat(nb);
  if (next != null) nb.turnSeat = next;
  return { ok: true, board: nb, hit: res.hit };
}

/**
 * @param {Record<string, unknown>} board
 * @param {number} diceValue
 */
export function setOv2LudoLocalPreviewDice(board, diceValue) {
  return { ...board, dice: diceValue };
}
