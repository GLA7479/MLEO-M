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

/** @param {string[]} squares */
function sqCh(squares, i) {
  const t = squares[i];
  if (!t || t === ".") return ".";
  return String(t).trim().slice(0, 1);
}

/** @param {string[]} squares */
function slidingClear(squares, fromIdx, toIdx, sdr, sdc) {
  let r = Math.floor(fromIdx / 8) + sdr;
  let c = (fromIdx % 8) + sdc;
  const tr = Math.floor(toIdx / 8);
  const tc = toIdx % 8;
  while (r >= 0 && r <= 7 && c >= 0 && c <= 7) {
    const idx = r * 8 + c;
    if (r === tr && c === tc) return true;
    if (sqCh(squares, idx) !== ".") return false;
    r += sdr;
    c += sdc;
  }
  return false;
}

/** Knight steps in linear index (matches server `ov2_ch_piece_attacks_square`). */
const KNIGHT_STEPS = [-17, -15, -10, -6, 6, 10, 15, 17];

/**
 * Whether `squares[fromIdx]` attacks empty-or-target `toIdx` (x-ray through empty only).
 * Mirrors server attack geometry for UI highlights only.
 * @param {string[]} squares
 */
export function ov2ChessPieceAttacksSquare(squares, fromIdx, toIdx) {
  const ch = sqCh(squares, fromIdx);
  if (ch === ".") return false;
  const kind = ch.toLowerCase();
  const fr = Math.floor(fromIdx / 8);
  const fc = fromIdx % 8;
  const tr = Math.floor(toIdx / 8);
  const tc = toIdx % 8;
  const dr = tr - fr;
  const dc = tc - fc;

  if (kind === "p") {
    if (ch === "P") return dr === 1 && Math.abs(dc) === 1;
    return dr === -1 && Math.abs(dc) === 1;
  }
  if (kind === "n") {
    for (const step of KNIGHT_STEPS) {
      if (fromIdx + step === toIdx) return true;
    }
    return false;
  }
  if (kind === "k") {
    return Math.abs(dr) <= 1 && Math.abs(dc) <= 1 && (dr !== 0 || dc !== 0);
  }
  if (kind === "r") {
    if (fr !== tr && fc !== tc) return false;
    const sdr = dr === 0 ? 0 : dr > 0 ? 1 : -1;
    const sdc = dc === 0 ? 0 : dc > 0 ? 1 : -1;
    return slidingClear(squares, fromIdx, toIdx, sdr, sdc);
  }
  if (kind === "b") {
    if (Math.abs(dr) !== Math.abs(dc) || dr === 0) return false;
    const sdr = dr > 0 ? 1 : -1;
    const sdc = dc > 0 ? 1 : -1;
    return slidingClear(squares, fromIdx, toIdx, sdr, sdc);
  }
  if (kind === "q") {
    if (fr === tr || fc === tc) {
      const sdr = dr === 0 ? 0 : dr > 0 ? 1 : -1;
      const sdc = dc === 0 ? 0 : dc > 0 ? 1 : -1;
      return slidingClear(squares, fromIdx, toIdx, sdr, sdc);
    }
    if (Math.abs(dr) === Math.abs(dc) && dr !== 0) {
      const sdr = dr > 0 ? 1 : -1;
      const sdc = dc > 0 ? 1 : -1;
      return slidingClear(squares, fromIdx, toIdx, sdr, sdc);
    }
    return false;
  }
  return false;
}

/**
 * Side to move: `0` = white, `1` = black. Highlights the checked king and all attackers.
 * @param {string[]} squares server order
 * @param {number|null} turnSeat
 * @returns {{ inCheck: boolean, kingServerIdx: number, attackerServerIdxs: number[] }}
 */
export function ov2ChessKingCheckHighlights(squares, turnSeat) {
  if (turnSeat !== 0 && turnSeat !== 1) {
    return { inCheck: false, kingServerIdx: -1, attackerServerIdxs: [] };
  }
  const kingCh = turnSeat === 0 ? "K" : "k";
  let kingIdx = -1;
  for (let i = 0; i < 64; i += 1) {
    if (sqCh(squares, i) === kingCh) {
      kingIdx = i;
      break;
    }
  }
  if (kingIdx < 0) return { inCheck: false, kingServerIdx: -1, attackerServerIdxs: [] };

  const attackers = [];
  for (let i = 0; i < 64; i += 1) {
    const ch = sqCh(squares, i);
    if (ch === ".") continue;
    const pieceWhite = ch === ch.toUpperCase();
    const kingWhite = turnSeat === 0;
    if (pieceWhite === kingWhite) continue;
    if (ov2ChessPieceAttacksSquare(squares, i, kingIdx)) attackers.push(i);
  }
  return {
    inCheck: attackers.length > 0,
    kingServerIdx: kingIdx,
    attackerServerIdxs: attackers,
  };
}
