/**
 * Viewer-relative board indices: server a1=0 … h8=63 (row 0 = rank 1 at grid top).
 * Grid renders view 0 at top-left, so seat 0 (white) needs 180° map to put own side at bottom.
 * Seat 1 (black) uses server order — black already sits on high rows (near grid bottom).
 */

function ov2ChessFlip180(i) {
  const r = Math.floor(i / 8);
  const c = i % 8;
  return (7 - r) * 8 + (7 - c);
}

/**
 * @param {number} serverIdx
 * @param {number|null} mySeat
 */
export function ov2ChessServerToViewIdx(serverIdx, mySeat) {
  const i = Math.floor(Number(serverIdx));
  if (!Number.isFinite(i) || i < 0 || i > 63) return 0;
  if (mySeat !== 0) return i;
  return ov2ChessFlip180(i);
}

/**
 * @param {number} viewIdx
 * @param {number|null} mySeat
 */
export function ov2ChessViewToServerIdx(viewIdx, mySeat) {
  const i = Math.floor(Number(viewIdx));
  if (!Number.isFinite(i) || i < 0 || i > 63) return 0;
  if (mySeat !== 0) return i;
  return ov2ChessFlip180(i);
}

/**
 * @param {unknown[]} cells length 64 server order
 */
export function normalizeOv2ChessSquares(cells) {
  const out = new Array(64).fill(".");
  if (!Array.isArray(cells) || cells.length !== 64) return out;
  for (let i = 0; i < 64; i += 1) {
    const s = cells[i];
    const t = typeof s === "string" ? s.trim().slice(0, 1) : String(s ?? ".").replace(/"/g, "").trim().slice(0, 1);
    out[i] = t || ".";
  }
  return out;
}

/**
 * @param {string} ch
 * @param {number|null} mySeat 0=white pieces, 1=black
 */
export function ov2ChessPieceOwnedBySeat(ch, mySeat) {
  if (!ch || ch === ".") return false;
  const isW = ch === ch.toUpperCase() && ch !== ".";
  return mySeat === 0 ? isW : !isW;
}

/**
 * @param {string[]} squares server
 * @param {number} fromServer
 * @param {number} toServer
 */
export function ov2ChessMoveNeedsPromotion(squares, fromServer, toServer) {
  const ch = squares[fromServer] || ".";
  if (ch !== "P" && ch !== "p") return false;
  const tr = Math.floor(toServer / 8);
  if (ch === "P" && tr === 7) return true;
  if (ch === "p" && tr === 0) return true;
  return false;
}
