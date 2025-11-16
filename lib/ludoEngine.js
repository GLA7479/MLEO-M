// lib/ludoEngine.js

// Pure game logic for Ludo-style game (no Supabase, no React)

export const LUDO_TRACK_LEN = 52;

export const LUDO_HOME_LEN = 6;

export const LUDO_PIECES_PER_PLAYER = 4;

// Starting offsets on the ring for seats 0..3
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
    pieces[k] = new Array(LUDO_PIECES_PER_PLAYER).fill(-1); // -1 = yard
    finished[k] = 0;
  }

  return {
    seatCount,
    activeSeats: activeSet,         // e.g. [0,1] or [0,1,2,3]
    turnSeat: activeSet[0] ?? null, // seatIndex whose turn it is
    dice: null,
    lastDice: null,
    pieces,
    finished,
    winner: null
  };
}

// Map (seat, pieceLocalPos) -> globalTrackIndex (0..51) or null if in home stretch
export function toGlobalIndex(seatIndex, pos) {
  if (pos < 0) return null; // yard
  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) return null; // finished fully
  if (pos >= LUDO_TRACK_LEN) return null; // home stretch, not on ring
  const offset = LUDO_START_OFFSETS[seatIndex] ?? 0;
  return (offset + pos) % LUDO_TRACK_LEN;
}

// Build occupancy map of global ring cells: index -> [{ seat, piece }]
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

// Check if a move (seat, pieceIndex) is legal given current dice
export function canMovePiece(board, seatIndex, pieceIndex, dice) {
  if (dice == null || dice <= 0) return false;
  const key = seatKey(seatIndex);
  const pieces = board.pieces?.[key];
  if (!pieces) return false;
  const pos = pieces[pieceIndex];
  if (pos == null) return false;

  // Already fully finished
  if (pos >= LUDO_TRACK_LEN + LUDO_HOME_LEN) return false;

  // From yard
  if (pos < 0) {
    if (dice !== 6) return false;
    // entry position index = 0 for local track
    // Check blocking rule: if global cell has 2+ enemy pieces, cannot enter
    const occ = buildOccupancy(board);
    const gi = toGlobalIndex(seatIndex, 0);
    const cell = gi != null ? occ.get(gi) : null;
    if (!cell || cell.length === 0) return true;
    // One enemy → hit, allowed; >=2 → block (safe)
    const enemyCount = cell.filter((p) => p.seat !== seatIndex).length;
    if (enemyCount >= 2) return false;
    return true;
  }

  // On main track or home stretch
  const targetPos = pos + dice;

  // Exactly finish (pos == last home cell)
  if (targetPos === LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return true;
  }

  // If overshoot beyond final home cell -> illegal
  if (targetPos > LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    return false;
  }

  // Inside home stretch (no collisions)
  if (targetPos >= LUDO_TRACK_LEN) {
    return true;
  }

  // On ring: check blocking / hit
  const occ = buildOccupancy(board);
  const gi = toGlobalIndex(seatIndex, targetPos);
  const cell = gi != null ? occ.get(gi) : null;
  if (!cell || cell.length === 0) return true;

  const allies = cell.filter((p) => p.seat === seatIndex).length;
  const enemies = cell.filter((p) => p.seat !== seatIndex).length;

  // Prevent stacking even with same color
  if (allies >= 1) return false;

  // if 2+ enemies, it's a safe tower → cannot land there
  if (enemies >= 2 && allies === 0) return false;

  // otherwise exactly 1 enemy → hit allowed
  return true;
}

// Return list of piece indexes that can move
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

// Apply move (mutates board clone!) and return { board, hit }
export function applyMove(board, seatIndex, pieceIndex, dice) {
  if (!canMovePiece(board, seatIndex, pieceIndex, dice)) {
    return { ok: false, board };
  }

  const b = JSON.parse(JSON.stringify(board));
  const key = seatKey(seatIndex);
  const pieces = b.pieces[key];
  let pos = pieces[pieceIndex];

  // From yard
  if (pos < 0) {
    pos = 0;
  } else {
    pos = pos + dice;
  }

  let hit = null;

  // Exactly finished
  if (pos === LUDO_TRACK_LEN + LUDO_HOME_LEN) {
    // Mark as finished "beyond" final
    pieces[pieceIndex] = pos;
    b.finished[key] = (b.finished[key] || 0) + 1;
  } else if (pos >= LUDO_TRACK_LEN) {
    // home stretch
    pieces[pieceIndex] = pos;
  } else {
    // on ring
    const occ = buildOccupancy(b);
    const gi = toGlobalIndex(seatIndex, pos);
    const cell = gi != null ? occ.get(gi) : null;
    if (cell && cell.length > 0) {
      // we know there's at most one enemy or one ally because canMovePiece checked towers
      const enemy = cell.find((p) => p.seat !== seatIndex);
      if (enemy) {
        const enemyKey = seatKey(enemy.seat);
        b.pieces[enemyKey][enemy.piece] = -1; // send to yard
        hit = { seat: enemy.seat, piece: enemy.piece };
      }
    }
    pieces[pieceIndex] = pos;
  }

  // Winner?
  const allFinished = Object.entries(b.finished || {}).find(
    ([, count]) => count >= LUDO_PIECES_PER_PLAYER
  );
  if (allFinished) {
    const winnerSeat = Number(allFinished[0]);
    b.winner = winnerSeat;
  }

  b.dice = null;
  b.lastDice = dice;
  return { ok: true, board: b, hit };
}

// Advance turn based on lastDice and current activeSeats
export function nextTurnSeat(board) {
  if (!board.activeSeats || board.activeSeats.length === 0) return null;

  const seats = board.activeSeats;
  const idx = seats.indexOf(board.turnSeat);
  if (idx < 0) return seats[0];

  const lastDice = board.lastDice ?? board.dice;

  // Classic Ludo: roll 6 → extra turn
  if (lastDice === 6) {
    return board.turnSeat;
  }

  // otherwise next active seat
  const nextIdx = (idx + 1) % seats.length;
  return seats[nextIdx];
}

// Remove a seat from activeSeats (e.g. resign / decline double)
export function removeSeat(board, seatIndex) {
  const b = JSON.parse(JSON.stringify(board));
  b.activeSeats = (b.activeSeats || []).filter((s) => s !== seatIndex);
  if (b.activeSeats.length === 0) {
    b.turnSeat = null;
    return b;
  }
  if (!b.activeSeats.includes(b.turnSeat)) {
    b.turnSeat = b.activeSeats[0];
  }
  // If only one left and someone finished -> winner; otherwise last survivor wins by default
  if (b.activeSeats.length === 1 && b.winner == null) {
    b.winner = b.activeSeats[0];
  }
  return b;
}

