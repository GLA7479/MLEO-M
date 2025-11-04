// lib/backgammonEngine.js
// Pure logic for Backgammon (no UI, no network). JS only.

export function initialBoardState() {
  const pts = Array.from({ length: 24 }, () => ({ owner: null, count: 0 }));

  // Standard opening
  pts[0]  = { owner: "A", count: 2 };
  pts[11] = { owner: "A", count: 5 };
  pts[16] = { owner: "A", count: 3 };
  pts[18] = { owner: "A", count: 5 };
  pts[23] = { owner: "B", count: 2 };
  pts[12] = { owner: "B", count: 5 };
  pts[7]  = { owner: "B", count: 3 };
  pts[5]  = { owner: "B", count: 5 };

  return {
    points: pts,
    bar: { A: 0, B: 0 },
    borne_off: { A: 0, B: 0 },
    turn: Math.random() < 0.5 ? "A" : "B",
    roll: { d1: null, d2: null, is_double: false, moves_left: 0, steps: [] },
    phase: "playing",
    doubling: { enabled: true, owner: null, value: 1 },
  };
}

// A increases indices (0→23), B decreases (23→0)
export function dirFor(p){ return p === "A" ? +1 : -1; }
export function oppOf(p){ return p === "A" ? "B" : "A"; }
export function homeRange(p){ return p === "A" ? [18,23] : [0,5]; }

export function stepList(roll){
  if (!roll?.d1 || !roll?.d2) return [];
  return roll.is_double ? [roll.d1, roll.d1, roll.d1, roll.d1] : [roll.d1, roll.d2];
}

export function canBearOff(board, p){
  const [lo, hi] = homeRange(p);
  if (board.bar[p] > 0) return false;
  if (p === "A") {
    return board.points.every((pt, idx) => pt.owner !== "A" || (idx >= 18 && idx <= 23));
  } else {
    return board.points.every((pt, idx) => pt.owner !== "B" || (idx >= 0 && idx <= 5));
  }
}

export function hasAnyMove(board, p){
  const steps = stepList(board.roll);
  if (!steps.length) return false;

  // if has pieces on bar — must enter first
  if (board.bar[p] > 0) {
    return anyBarEntry(board, p, steps);
  }
  // Try any point of p
  for (let i=0;i<24;i++){
    const pt = board.points[i];
    if (pt.owner === p && pt.count > 0){
      if (legalDestinations(board, p, i).length) return true;
    }
  }
  // maybe bear-off
  if (canBearOff(board, p)) return true;
  return false;
}

function anyBarEntry(board, p, steps){
  const dir = dirFor(p);
  for (const step of steps){
    // From bar — virtual source: for A, dest = (step-1), for B, dest = (23-step+1)
    const dest = p==="A" ? (step-1) : (24-step);
    if (dest < 0 || dest > 23) continue;
    const pt = board.points[dest];
    if (pt.owner && pt.owner !== p && pt.count >= 2) continue; // blocked
    return true;
  }
  return false;
}

export function legalDestinations(board, p, fromIndex){
  const steps = stepList(board.roll);
  if (!steps.length) return [];
  const dir = dirFor(p);
  const res = new Set();

  for (const step of steps) {
    const dest = fromIndex + step*dir;
    if (dest < 0 || dest > 23) {
      if (canBearOff(board, p)) res.add("off");
      continue;
    }
    const pt = board.points[dest];
    if (pt.owner && pt.owner !== p && pt.count >= 2) continue; // blocked
    res.add(dest);
  }
  return [...res];
}

// Apply a single step (mutates a shallow clone you pass)
export function applyStep(board, p, from, to){
  const opp = oppOf(p);

  // Source
  if (from === "bar") {
    if (board.bar[p] <= 0) return { ok:false, reason:"no-piece-on-bar" };
    board.bar[p] -= 1;
  } else {
    const src = board.points[from];
    if (!src || src.owner !== p || src.count <= 0) return { ok:false, reason:"no-piece" };
    src.count -= 1;
    if (src.count === 0) src.owner = null;
  }

  // Destination
  if (to === "off") {
    board.borne_off[p] += 1;
  } else {
    const dst = board.points[to];
    if (dst.owner === opp && dst.count === 1) {
      // hit
      dst.owner = p;
      dst.count = 1;
      board.bar[opp] += 1;
    } else {
      if (dst.owner && dst.owner !== p && dst.count >= 2) {
        return { ok:false, reason:"blocked" };
      }
      if (!dst.owner) dst.owner = p;
      dst.count += 1;
    }
  }
  return { ok:true, board };
}

export function isFinished(board){
  return (board.borne_off.A >= 15) || (board.borne_off.B >= 15);
}

export function winnerAndMultiplier(board){
  // Returns { winner: 'A'|'B', mult: 1|2|3 }
  const A = board.borne_off.A >= 15;
  const B = board.borne_off.B >= 15;
  if (!A && !B) return null;
  const winner = A ? "A" : "B";
  const loser  = A ? "B" : "A";

  // Gammon: loser borne_off == 0
  // Backgammon: loser has piece on bar OR in winner's home-board
  let mult = 1;
  const loserOff = board.borne_off[loser] || 0;
  if (loserOff === 0) {
    // check backgammon
    const inBar = board.bar[loser] > 0;
    const [lo,hi] = homeRange(winner);
    const inOppHome = board.points.some((pt,idx)=> pt.owner===loser && idx>=lo && idx<=hi);
    mult = (inBar || inOppHome) ? 3 : 2;
  }
  return { winner, mult };
}

export function nextTurn(board){
  board.turn = board.turn === "A" ? "B" : "A";
  board.roll = { d1: null, d2: null, is_double: false, moves_left: 0, steps: [] };
  return board;
}

export function applyRoll(board, d1, d2){
  const is_double = d1===d2;
  const moves_left = is_double ? 4 : 2;
  board.roll = { d1, d2, is_double, moves_left, steps: is_double ? [d1,d1,d1,d1] : [d1,d2] };
  return board;
}

// Doubling cube helpers
export function canOfferDouble(board, p){
  if (!board.doubling?.enabled) return false;
  if (board.roll?.d1!=null || board.roll?.d2!=null) return false; // offer only before rolling
  // only the player who doesn't own the cube or cube is center (owner=null) can offer?
  // Classic: only player in turn can offer, and opponent becomes owner if accepted.
  return board.turn === p;
}
export function onAcceptDouble(board, p){
  board.doubling.value = Math.min(64, (board.doubling.value||1) * 2);
  board.doubling.owner = p; // opponent who accepted
  return board;
}
