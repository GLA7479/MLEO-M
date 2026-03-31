/**
 * OV2 Ludo — pure rules engine (verbatim copy of `lib/ludoEngine.js` for Online V2).
 * Source of truth for rules: original `lib/ludoEngine.js` (read-only reference).
 */

export const LUDO_TRACK_LEN = 52;

export const LUDO_HOME_LEN = 6;

export const LUDO_PIECES_PER_PLAYER = 4;

export const LUDO_START_OFFSETS = [0, 13, 26, 39];

function seatKey(seatIndex) {
  return String(seatIndex);
}

export function createInitialBoard(activeSeats) {
  const seatCount = activeSeats.length;
  const pieces = {};
  const finished = {};
  const activeSet = Array.from(new Set(activeSeats)).sort((a, b) => a - b);

  for (const s of activeSet) {
    const k = seatKey(s);
    pieces[k] = new Array(LUDO_PIECES_PER_PLAYER).fill(-1);
    finished[k] = 0;
  }

  return {
    seatCount,
    activeSeats: activeSet,
    turnSeat: activeSet[0] ?? null,
    dice: null,
    lastDice: null,
    pieces,
    finished,
    winner: null,
  };
}

export function toGlobalIndex(seatIndex, pos) {
  if (pos < 0) return null;
  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) return null;
  if (pos >= LUDO_TRACK_LEN) return null;
  const offset = LUDO_START_OFFSETS[seatIndex] ?? 0;
  return (offset + pos) % LUDO_TRACK_LEN;
}

export function buildOccupancy(board) {
  const occ = new Map();
  for (const [seatStr, arr] of Object.entries(board.pieces || {})) {
    const s = Number(seatStr);
    arr.forEach((pos, idx) => {
      if (pos >= 0 && pos < LUDO_TRACK_LEN) {
        const gi = toGlobalIndex(s, pos);
        if (gi == null) return;
        if (!occ.has(gi)) occ.set(gi, []);
        occ.get(gi).push({ seat: s, piece: idx });
      }
    });
  }
  return occ;
}

export function canMovePiece(board, seatIndex, pieceIndex, dice) {
  if (dice == null || dice <= 0) return false;
  const key = seatKey(seatIndex);
  const pieces = board.pieces?.[key];
  if (!pieces) return false;
  const pos = pieces[pieceIndex];
  if (pos == null) return false;

  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) return false;

  if (pos < 0) {
    if (dice !== 6) return false;
    const occ = buildOccupancy(board);
    const gi = toGlobalIndex(seatIndex, 0);
    const cell = gi != null ? occ.get(gi) : null;
    if (!cell || cell.length === 0) return true;
    const enemyCount = cell.filter(p => p.seat !== seatIndex).length;
    if (enemyCount >= 2) return false;
    return true;
  }

  const targetPos = pos + dice;

  if (targetPos === LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return true;
  }

  if (targetPos > LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return false;
  }

  if (targetPos >= LUDO_TRACK_LEN) {
    const k = seatKey(seatIndex);
    const ps = board.pieces?.[k] || [];
    if (ps.some((currPos, idx) => idx !== pieceIndex && currPos === targetPos)) {
      return false;
    }
    return true;
  }

  const occ = buildOccupancy(board);
  const gi = toGlobalIndex(seatIndex, targetPos);
  const cell = gi != null ? occ.get(gi) : null;
  if (!cell || cell.length === 0) return true;

  const allies = cell.filter(p => p.seat === seatIndex).length;
  const enemies = cell.filter(p => p.seat !== seatIndex).length;

  if (allies >= 1) return false;

  if (enemies >= 2 && allies === 0) return false;

  return true;
}

export function listMovablePieces(board, seatIndex, dice) {
  const key = seatKey(seatIndex);
  const pieces = board.pieces?.[key] || [];
  const result = [];
  for (let i = 0; i < pieces.length; i += 1) {
    if (canMovePiece(board, seatIndex, i, dice)) {
      result.push(i);
    }
  }
  return result;
}

export function applyMove(board, seatIndex, pieceIndex, dice) {
  if (!canMovePiece(board, seatIndex, pieceIndex, dice)) {
    return { ok: false, board };
  }

  const b = JSON.parse(JSON.stringify(board));
  const key = seatKey(seatIndex);
  const pieces = b.pieces[key];
  let pos = pieces[pieceIndex];

  if (pos < 0) {
    pos = 0;
  } else {
    pos = pos + dice;
  }

  let hit = null;

  if (pos === LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    pieces[pieceIndex] = pos;
    b.finished[key] = (b.finished[key] || 0) + 1;
    b.extraTurn = true;
  } else if (pos >= LUDO_TRACK_LEN) {
    pieces[pieceIndex] = pos;
  } else {
    const occ = buildOccupancy(b);
    const gi = toGlobalIndex(seatIndex, pos);
    const cell = gi != null ? occ.get(gi) : null;
    if (cell && cell.length > 0) {
      const enemy = cell.find(p => p.seat !== seatIndex);
      if (enemy) {
        const enemyKey = seatKey(enemy.seat);
        b.pieces[enemyKey][enemy.piece] = -1;
        hit = { seat: enemy.seat, piece: enemy.piece };
        b.extraTurn = true;
      }
    }
    pieces[pieceIndex] = pos;
  }

  const allFinished = Object.entries(b.finished || {}).find(([, count]) => count >= LUDO_PIECES_PER_PLAYER);
  if (allFinished) {
    const winnerSeat = Number(allFinished[0]);
    b.winner = winnerSeat;
  }

  b.dice = null;
  b.lastDice = dice;
  return { ok: true, board: b, hit };
}

export function nextTurnSeat(board) {
  if (!board.activeSeats || board.activeSeats.length === 0) return null;

  const seats = board.activeSeats;
  const idx = seats.indexOf(board.turnSeat);
  if (idx < 0) return seats[0];

  const lastDice = board.lastDice ?? board.dice;

  if (lastDice === 6 || board.extraTurn) {
    board.extraTurn = false;
    return board.turnSeat;
  }

  const nextIdx = (idx + 1) % seats.length;
  return seats[nextIdx];
}

export function removeSeat(board, seatIndex) {
  const b = JSON.parse(JSON.stringify(board));
  b.activeSeats = (b.activeSeats || []).filter(s => s !== seatIndex);
  if (b.activeSeats.length === 0) {
    b.turnSeat = null;
    return b;
  }
  if (!b.activeSeats.includes(b.turnSeat)) {
    b.turnSeat = b.activeSeats[0];
  }
  if (b.activeSeats.length === 1 && b.winner == null) {
    b.winner = b.activeSeats[0];
  }
  return b;
}
