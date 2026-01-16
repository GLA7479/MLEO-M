// lib/checkersEngine.js
// Checkers/Draughts engine with "Flying Kings":
// - Men: move 1 step diagonally forward; capture by jumping 1 enemy to land 2 squares away
// - Kings: move any distance diagonally; capture by jumping exactly ONE enemy on a diagonal
//          and may land on ANY empty square beyond it on the same diagonal
// - Captures are mandatory; multi-capture continues with same piece (forced_from)
// - Promotion does NOT end turn; if capture continues after promotion, keep going

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
  return player === "A" ? -1 : +1;
}

const KING_DIRS = [
  [-1, -1], [-1, +1],
  [+1, -1], [+1, +1],
];

function MAN_DIRS(player) {
  const dr = forwardDir(player);
  return [[dr, -1], [dr, +1]];
}

function allMyPieceIndices(state, player) {
  const res = [];
  for (let i = 0; i < 64; i++) {
    const ch = state.board[i];
    if (pieceOwner(ch) === player) res.push(i);
  }
  return res;
}

export function countPieces(state, player) {
  let n = 0;
  for (const ch of state.board) if (pieceOwner(ch) === player) n++;
  return n;
}

// ----------- move generation (quiet + captures) -----------

function quietStepsFrom(state, player, from) {
  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return [];
  const [r, c] = rc(from);
  const king = isKing(ch);

  const out = [];

  if (!king) {
    for (const [dr, dc] of MAN_DIRS(player)) {
      const r2 = r + dr, c2 = c + dc;
      if (!inBounds(r2, c2) || !isDark(r2, c2)) continue;
      const to = idx(r2, c2);
      if (state.board[to] == null) out.push({ to });
    }
    return out;
  }

  // Flying king quiet move: any distance along diagonal until blocked
  for (const [dr, dc] of KING_DIRS) {
    let rr = r + dr, cc = c + dc;
    while (inBounds(rr, cc)) {
      if (!isDark(rr, cc)) { rr += dr; cc += dc; continue; }
      const to = idx(rr, cc);
      if (state.board[to] != null) break; // blocked
      out.push({ to });
      rr += dr; cc += dc;
    }
  }

  return out;
}

function captureStepsFrom(state, player, from) {
  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return [];
  const [r, c] = rc(from);
  const king = isKing(ch);

  const out = [];

  if (!king) {
    // Man capture: jump over adjacent enemy, land 2 squares away
    for (const [dr, dc] of MAN_DIRS(player)) {
      const rMid = r + dr, cMid = c + dc;
      const r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (!inBounds(r2, c2) || !isDark(r2, c2)) continue;

      const mid = idx(rMid, cMid);
      const to = idx(r2, c2);
      const midCh = state.board[mid];

      if (midCh && pieceOwner(midCh) === oppOf(player) && state.board[to] == null) {
        out.push({ to, cap: mid });
      }
    }
    return out;
  }

  // Flying king capture:
  // scan along each diagonal:
  // - skip empty squares
  // - first piece encountered:
  //    - if own piece: stop
  //    - if enemy: then any empty square BEYOND it is a legal landing (capture that enemy)
  //    - if there is no empty beyond => no capture in that direction
  for (const [dr, dc] of KING_DIRS) {
    let rr = r + dr, cc = c + dc;
    let enemyIdx = null;

    while (inBounds(rr, cc)) {
      if (!isDark(rr, cc)) { rr += dr; cc += dc; continue; }
      const i = idx(rr, cc);
      const cur = state.board[i];

      if (cur == null) {
        rr += dr; cc += dc;
        continue;
      }

      const owner = pieceOwner(cur);
      if (owner === player) {
        // blocked by own piece
        enemyIdx = null;
        break;
      }

      if (owner === oppOf(player)) {
        enemyIdx = i;
        rr += dr; cc += dc;
        break;
      }

      rr += dr; cc += dc;
    }

    if (enemyIdx == null) continue;

    // collect landing squares after the enemy until blocked
    while (inBounds(rr, cc)) {
      if (!isDark(rr, cc)) { rr += dr; cc += dc; continue; }
      const land = idx(rr, cc);
      const cur = state.board[land];
      if (cur != null) break; // blocked (prevents "jumping over 2 pieces" in one capture)
      out.push({ to: land, cap: enemyIdx });
      rr += dr; cc += dc;
    }
  }

  return out;
}

// Mandatory capture check (global)
export function anyCaptureAvailable(state, player) {
  const forced = state.forced_from;
  const fromList = forced != null ? [forced] : allMyPieceIndices(state, player);
  for (const from of fromList) {
    const caps = captureStepsFrom(state, player, from);
    if (caps.length > 0) return true;
  }
  return false;
}

export function hasAnyMove(state, player) {
  if (state.turn !== player) return true;

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

export function legalMovesFrom(state, player, from) {
  if (state.turn !== player) return { quiet: [], caps: [], mustCap: false };
  if (state.forced_from != null && state.forced_from !== from) return { quiet: [], caps: [], mustCap: true };

  const mustCap = anyCaptureAvailable(state, player);
  const caps = captureStepsFrom(state, player, from);
  const quiet = mustCap ? [] : quietStepsFrom(state, player, from);
  return { quiet, caps, mustCap };
}

function maybePromote(player, toIdx) {
  const [r] = rc(toIdx);
  if (player === "A" && r === 0) return true;
  if (player === "B" && r === 7) return true;
  return false;
}

export function applyStep(state, player, from, to) {
  if (state.turn !== player) return { ok: false, error: "Not your turn" };
  if (state.forced_from != null && state.forced_from !== from) return { ok: false, error: "Must continue capture" };

  const ch = state.board[from];
  if (!ch || pieceOwner(ch) !== player) return { ok: false, error: "No piece" };
  if (state.board[to] != null) return { ok: false, error: "Destination occupied" };

  const mustCap = anyCaptureAvailable(state, player);
  const caps = captureStepsFrom(state, player, from);
  const quiet = mustCap ? [] : quietStepsFrom(state, player, from);

  const capMove = caps.find(m => m.to === to) || null;
  const quietMove = quiet.find(m => m.to === to) || null;

  if (!capMove && !quietMove) {
    return { ok: false, error: mustCap ? "Capture is mandatory" : "Illegal move" };
  }

  const next = JSON.parse(JSON.stringify(state));
  next.last_move = { player, from, to, capture: !!capMove, at: new Date().toISOString() };

  // move piece
  next.board[from] = null;

  // capture remove
  if (capMove) {
    next.board[capMove.cap] = null;
  }

  // promotion
  let movingCh = ch;
  if (!isKing(movingCh) && maybePromote(player, to)) {
    movingCh = makePiece(player, true);
  }
  next.board[to] = movingCh;

  // continuation capture?
  if (capMove) {
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
  if (!hasAnyMove(state, state.turn)) return oppOf(state.turn);
  return null;
}
