/**
 * OV2 Ludo — **local preview sandbox only** (`PREVIEW_LOCAL` mode).
 * Uses `ov2LudoEngine` rules. Never call for authoritative/live match flows.
 */

import {
  applyMove,
  createInitialBoard,
  listMovablePieces,
  nextTurnSeat,
} from "./ov2LudoEngine";

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

/**
 * If `turnSeat` is `forSeatIndex`, dice is set, and no piece can move, consume the roll and advance turn.
 * Prevents preview deadlock after a roll with zero legal moves.
 *
 * @param {Record<string, unknown>} board
 * @param {number} forSeatIndex — must match `board.turnSeat` to apply
 */
export function passPreviewTurnIfNoLegalMoves(board, forSeatIndex) {
  if (board.winner != null) return { changed: false, board };
  if (board.turnSeat !== forSeatIndex || board.dice == null) {
    return { changed: false, board };
  }
  const movable = listMovablePieces(board, board.turnSeat, board.dice);
  if (movable.length > 0) return { changed: false, board };

  const nb = JSON.parse(JSON.stringify(board));
  nb.lastDice = nb.dice;
  nb.dice = null;
  nb.extraTurn = false;
  const next = nextTurnSeat(nb);
  if (next != null) nb.turnSeat = next;
  return { changed: true, board: nb };
}
