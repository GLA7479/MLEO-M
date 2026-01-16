// lib/checkersEngine.js
// Simple Checkers (American/English draughts) engine:
// - 8x8, pieces only on dark squares
// - Men move forward diagonally, Kings both ways
// - Captures are mandatory; multi-capture continues with same piece
// - Win when opponent has no pieces OR no legal moves on their turn

const N = 8;

export function idx(r, c) { return r * N + c; }
export function rc(i) { return [Math.floor(i / N), i % N]; }
export function inBounds(r, c) { return r >= 0 && r < N && c >= 0 && c < N; }
export function isDark(r, c) { return ((r + c) % 2) === 1; }

export function pieceOwner(ch) {
  if (!ch) return null;
  const low = ch.toLowerCase();
  if (low === "a") return "A";
  if (low === "b") return "B";
  return null;
}
export function isKing(ch) {
  if (!ch) return false;
  return ch === "A" || ch === "B";
}
export function makePiece(owner, king) {
  return owner === "A" ? (king ? "A" : "a") : (king ? "B" : "b");
}
export function oppOf(p) { return p === "A" ? "B" : "A"; }

export function initialBoardState() {
  // Board as length-64 array. null for empty. 'a'/'A' = A man/king, 'b'/'B' = B man/king
  const board = Array(64).fill(null);

  // B at top rows 0..2 on dark squares
  for (let r = 0; r <= 2; r++) {
    for (let c = 0; c < N; c++) {
      if (!isDark(r, c)) continue;
      board[idx(r, c)] = "b";
    }
  }
  // A at bottom rows 5..7 on dark squares
  for (let r = 5; r <= 7; r++) {
    for (let c = 0; c < N; c++) {
      if (!isDark(r, c)) continue;
      board[idx(r, c)] = "a";
    }
  }

  return {
    turn: "A",
    board,
    forced_from: null, // when multi-capture must continue with same piece
    last_move: null,
  };
}

function forwardDir(player) {
  // A moves "up" (row -1), B moves "down" (row +1)
  return player === "A" ? -1 : +1;
}

function stepDirsForPiece(player, king) {
  const dirs = [];
  if (king) {
    dirs.push([-1, -1], [-1, +1], [+1, -1], [+1, +1]);
    return dirs;
  }
  const dr = forwardDir(player);
  dirs.push([dr, -1], [dr, +1]);
  return dirs;
}

export function countPieces(state, player) {
  let n = 0;
  for (const ch of state.board) if (pieceOwner(ch) === player) n++;
  return n;
}

export function anyCaptureAvailable(state, player) {
  const fromList = allMyPieceIndices(state, player);
  for (const from of fromList) {
    const caps = captureStepsFrom(state, player, from);
    if (caps.length > 0) return true;
  }
  return false;
}

export function hasAnyMove(state, player) {
  const forced = state.forced_from;
  const mustCap = anyCaptureAvailable(state, player);
  const fromList = forced != null ? [forced] : allMyPieceIndices(state, player);

  for (const from of fromList) {
    const caps = captureStepsFrom(state, player, from);
    if (caps.length > 0) return true;
    if (!mustCap) {
      const quiet = quietStepsFrom(state, player, from);
      if (quiet.length > 0) return true;
    }
  }
  return false;
}

function allMyPieceIndices(state, player) {
  const res = [];
  for (let i = 0; i < 64; i++) {
    const ch = state.board[i];
    if (pieceOwner(ch) === player) res.push(i);
  }
  return res;
}

function quietStepsFrom(state, player, from) {
  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return [];
  const [r, c] = rc(from);
  const king = isKing(ch);

  const out = [];
  for (const [dr, dc] of stepDirsForPiece(player, king)) {
    const r2 = r + dr, c2 = c + dc;
    if (!inBounds(r2, c2)) continue;
    if (!isDark(r2, c2)) continue;
    const to = idx(r2, c2);
    if (state.board[to] == null) out.push({ to });
  }
  return out;
}

function captureStepsFrom(state, player, from) {
  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return [];
  const [r, c] = rc(from);
  const king = isKing(ch);

  const out = [];
  for (const [dr, dc] of stepDirsForPiece(player, king)) {
    const rMid = r + dr, cMid = c + dc;
    const r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (!inBounds(r2, c2)) continue;
    if (!isDark(r2, c2)) continue;
    const mid = idx(rMid, cMid);
    const to = idx(r2, c2);
    const midCh = state.board[mid];
    if (midCh && pieceOwner(midCh) === oppOf(player) && state.board[to] == null) {
      out.push({ to, cap: mid });
    }
  }
  return out;
}

export function legalMovesFrom(state, player, from) {
  // Immediate legal steps from a specific piece, respecting forced_from and mandatory capture.
  if (state.turn !== player) return { quiet: [], caps: [] };
  if (state.forced_from != null && state.forced_from !== from) return { quiet: [], caps: [] };

  const mustCap = anyCaptureAvailable(state, player);
  const caps = captureStepsFrom(state, player, from);
  const quiet = mustCap ? [] : quietStepsFrom(state, player, from);
  return { quiet, caps, mustCap };
}

function maybePromote(boardArr, player, to) {
  const [r] = rc(to);
  if (player === "A" && r === 0) return true;
  if (player === "B" && r === 7) return true;
  return false;
}

export function applyStep(state, player, from, to) {
  // Applies ONE step (quiet or single capture). If capture leads to more capture, forces continuation.
  if (state.turn !== player) return { ok: false, error: "Not your turn" };
  if (state.forced_from != null && state.forced_from !== from) return { ok: false, error: "Must continue capture" };

  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return { ok: false, error: "No piece" };
  if (state.board[to] != null) return { ok: false, error: "Destination occupied" };

  const mustCap = anyCaptureAvailable(state, player);
  const caps = captureStepsFrom(state, player, from);
  const quiet = mustCap ? [] : quietStepsFrom(state, player, from);

  // Determine if this is a legal quiet or capture
  const capMove = caps.find(m => m.to === to) || null;
  const quietMove = quiet.find(m => m.to === to) || null;

  if (capMove == null && quietMove == null) {
    return { ok: false, error: mustCap ? "Capture is mandatory" : "Illegal move" };
  }

  const next = JSON.parse(JSON.stringify(state));
  next.last_move = { player, from, to, capture: !!capMove, at: new Date().toISOString() };

  // move piece
  next.board[from] = null;
  let movingCh = ch;

  // capture remove
  if (capMove) {
    next.board[capMove.cap] = null;
  }

  // promotion
  const wasKing = isKing(movingCh);
  if (!wasKing && maybePromote(next.board, player, to)) {
    movingCh = makePiece(player, true);
  }

  next.board[to] = movingCh;

  // continuation?
  if (capMove) {
    // if became king by promotion, in American checkers the move ends immediately in some rulesets;
    // many casual implementations allow continuing. We'll keep it SIMPLE:
    // allow continuation even after promotion (can be toggled later).
    const moreCaps = captureStepsFrom(next, player, to);
    if (moreCaps.length > 0) {
      next.forced_from = to;
      // same player's turn continues
      return { ok: true, state: next, continued: true };
    }
  }

  // end turn
  next.forced_from = null;
  next.turn = oppOf(player);
  return { ok: true, state: next, continued: false };
}

export function isFinished(state) {
  // finished if either player has 0 pieces OR current turn player has no move
  const a = countPieces(state, "A");
  const b = countPieces(state, "B");
  if (a === 0 || b === 0) return true;
  if (!hasAnyMove(state, state.turn)) return true;
  return false;
}

export function winner(state) {
  const a = countPieces(state, "A");
  const b = countPieces(state, "B");
  if (a === 0 && b === 0) return null;
  if (a === 0) return "B";
  if (b === 0) return "A";
  // if turn player cannot move, opponent wins
  if (!hasAnyMove(state, state.turn)) return oppOf(state.turn);
  return null;
}
