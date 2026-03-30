/**
 * OV2 Board Path — pure gameplay helpers (no UI, no network).
 * Server/session row remains source of truth; this module only normalizes and derives read-only state.
 */

export const BOARD_PATH_DEFAULT_PATH_LENGTH = 30;

/** Server + client turn_meta.step */
export const BOARD_PATH_TURN_STEP = Object.freeze({
  AWAITING_ROLL: "awaiting_roll",
  AWAITING_MOVE: "awaiting_move",
  AWAITING_END: "awaiting_end",
  ENDED: "ended",
});

/** Primary button action for live gameplay */
export const BOARD_PATH_PRIMARY_ACTION = Object.freeze({
  NONE: "none",
  WAIT: "wait",
  ROLL: "roll",
  MOVE: "move",
  END_TURN: "end_turn",
});

/**
 * @param {unknown} sessionLike
 */
function turnMetaObject(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const tm = s.turnMeta ?? s.turn_meta;
  return tm && typeof tm === "object" ? /** @type {Record<string, unknown>} */ (tm) : {};
}

/**
 * @param {unknown} sessionLike
 */
export function getBoardPathTurnStep(sessionLike) {
  const tm = turnMetaObject(sessionLike);
  const raw = tm.step ?? tm.Step;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  const phase = resolveGamePhase(sessionLike);
  if (phase === "ended") return BOARD_PATH_TURN_STEP.ENDED;
  if (phase === "pregame") return BOARD_PATH_TURN_STEP.AWAITING_ROLL;
  const rv = tm.rollValue ?? tm.roll_value;
  const n = typeof rv === "number" ? rv : Number(rv);
  if (Number.isFinite(n) && n >= 1 && n <= 6) return BOARD_PATH_TURN_STEP.AWAITING_MOVE;
  return BOARD_PATH_TURN_STEP.AWAITING_ROLL;
}

/**
 * @param {unknown} sessionLike
 * @returns {number|null}
 */
export function getBoardPathRollValue(sessionLike) {
  const tm = turnMetaObject(sessionLike);
  const rv = tm.rollValue ?? tm.roll_value;
  if (rv == null || rv === "") return null;
  const n = typeof rv === "number" ? rv : Number(rv);
  if (!Number.isFinite(n) || n < 1 || n > 6) return null;
  return Math.floor(n);
}

/** @typedef {{ seatIndex: number, participantKey: string }} BoardPathSeatRef */

/**
 * @param {unknown} row
 * @returns {{ seatIndex: number, participantKey: string }|null}
 */
function normalizeSeatRow(row, fallbackIndex) {
  if (!row || typeof row !== "object") return null;
  const o = /** @type {Record<string, unknown>} */ (row);
  const pk = o.participant_key ?? o.participantKey;
  if (typeof pk !== "string" || !pk.trim()) return null;
  const si = o.seat_index ?? o.seatIndex;
  const n = si != null && si !== "" ? Number(si) : fallbackIndex;
  if (Number.isNaN(n)) return null;
  return { seatIndex: n, participantKey: String(pk) };
}

/**
 * Ordered seats for engine logic (by seat_index ascending).
 * @param {unknown} _sessionLike
 * @param {unknown[]|null|undefined} seats
 * @returns {BoardPathSeatRef[]}
 */
export function getBoardPathSeatOrder(_sessionLike, seats) {
  if (!Array.isArray(seats)) return [];
  const out = [];
  for (let i = 0; i < seats.length; i++) {
    const r = normalizeSeatRow(seats[i], i);
    if (r) out.push(r);
  }
  out.sort((a, b) => a.seatIndex - b.seatIndex);
  return out;
}

/**
 * @param {unknown} sessionLike
 */
export function getBoardPathPathLength(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const bs = s.boardState ?? s.board_state;
  const b = bs && typeof bs === "object" ? /** @type {Record<string, unknown>} */ (bs) : {};
  const pl = b.pathLength ?? b.path_length;
  const n = typeof pl === "number" ? pl : Number(pl);
  if (!Number.isFinite(n) || n < 1) return BOARD_PATH_DEFAULT_PATH_LENGTH;
  return Math.floor(n);
}

/**
 * Raw positions map from session (participant_key -> progress).
 * @param {unknown} sessionLike
 */
function rawPositionRecord(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const bs = s.boardState ?? s.board_state;
  const b = bs && typeof bs === "object" ? /** @type {Record<string, unknown>} */ (bs) : {};
  const pos = b.positions;
  return pos && typeof pos === "object" ? { .../** @type {Record<string, unknown>} */ (pos) } : {};
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @returns {Record<string, number>}
 */
export function getBoardPathPositionMap(sessionLike, seats) {
  const pathLen = getBoardPathPathLength(sessionLike);
  const raw = rawPositionRecord(sessionLike);
  const order = getBoardPathSeatOrder(sessionLike, seats);
  /** @type {Record<string, number>} */
  const out = {};
  for (const { participantKey } of order) {
    const v = raw[participantKey];
    const n = typeof v === "number" ? v : Number(v);
    const p = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), pathLen)) : 0;
    out[participantKey] = p;
  }
  for (const k of Object.keys(raw)) {
    if (!Object.prototype.hasOwnProperty.call(out, k)) {
      const v = raw[k];
      const n = typeof v === "number" ? v : Number(v);
      out[k] = Number.isFinite(n) ? Math.max(0, Math.min(Math.floor(n), pathLen)) : 0;
    }
  }
  return out;
}

/**
 * @param {unknown} sessionLike
 */
function resolveGamePhase(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const p = s.phase ?? s.engine_phase ?? s.enginePhase;
  const str = typeof p === "string" ? p.trim().toLowerCase() : "";
  if (str === "playing") return "playing";
  if (str === "ended") return "ended";
  return "pregame";
}

/**
 * Active seat index: column first, then turnMeta, else 0 (deterministic default).
 * @param {unknown} sessionLike
 */
export function resolveBoardPathActiveSeatIndex(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const col = s.activeSeatIndex ?? s.active_seat_index;
  if (col != null && col !== "") {
    const n = Number(col);
    if (!Number.isNaN(n)) return Math.max(0, Math.floor(n));
  }
  const tm = s.turnMeta ?? s.turn_meta;
  const t = tm && typeof tm === "object" ? /** @type {Record<string, unknown>} */ (tm) : {};
  const ai = t.activeSeatIndex ?? t.active_seat_index;
  if (ai != null && ai !== "") {
    const n = Number(ai);
    if (!Number.isNaN(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

/**
 * @param {unknown} sessionLike
 */
export function getBoardPathTurnNumber(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const tm = s.turnMeta ?? s.turn_meta;
  const t = tm && typeof tm === "object" ? /** @type {Record<string, unknown>} */ (tm) : {};
  const tn = t.turnNumber ?? t.turn_number;
  if (tn != null && tn !== "") {
    const n = Number(tn);
    if (!Number.isNaN(n) && n >= 1) return Math.floor(n);
  }
  const ti = s.turnIndex ?? s.turn_index;
  if (ti != null && ti !== "") {
    const n = Number(ti);
    if (!Number.isNaN(n)) return Math.max(1, Math.floor(n) + 1);
  }
  return 1;
}

/**
 * @param {unknown} sessionLike
 */
export function getBoardPathRoundIndex(sessionLike) {
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const ri = s.roundIndex ?? s.round_index;
  if (ri != null && ri !== "") {
    const n = Number(ri);
    if (!Number.isNaN(n)) return Math.max(0, Math.floor(n));
  }
  return 0;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @returns {BoardPathSeatRef|null}
 */
export function getBoardPathActiveSeat(sessionLike, seats) {
  const idx = resolveBoardPathActiveSeatIndex(sessionLike);
  const order = getBoardPathSeatOrder(sessionLike, seats);
  return order.find(x => x.seatIndex === idx) ?? order[0] ?? null;
}

/**
 * Normalized snapshot for adapters/tests.
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 */
export function normalizeBoardPathSession(sessionLike, seats) {
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const pathLength = getBoardPathPathLength(sessionLike);
  const positions = getBoardPathPositionMap(sessionLike, seats);
  const phase = resolveGamePhase(sessionLike);
  const activeSeatIndex = resolveBoardPathActiveSeatIndex(sessionLike);
  const turnNumber = getBoardPathTurnNumber(sessionLike);
  const roundIndex = getBoardPathRoundIndex(sessionLike);
  const tmRaw = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike).turnMeta : null;
  const tmObj = tmRaw && typeof tmRaw === "object" ? /** @type {Record<string, unknown>} */ (tmRaw) : {};
  const startedAt = tmObj.startedAt ?? tmObj.started_at;
  const started = typeof startedAt === "number" ? startedAt : Number(startedAt) || 0;

  return {
    phase,
    pathLength,
    positions,
    seatOrder: order,
    activeSeatIndex,
    turnNumber,
    roundIndex,
    turnMeta: {
      turnNumber,
      activeSeatIndex,
      startedAt: started,
    },
    winnerSeatIndexFromRow: (() => {
      const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
      const w = s.winnerSeatIndex ?? s.winner_seat_index;
      if (w == null || w === "") return null;
      const n = Number(w);
      return Number.isNaN(n) ? null : Math.floor(n);
    })(),
  };
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 */
export function isBoardPathFinished(sessionLike, seats) {
  if (resolveGamePhase(sessionLike) === "ended") return true;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  if (order.length === 0) return false;
  return getBoardPathWinner(sessionLike, seats) != null;
}

/**
 * Winner: explicit winner_seat_index, else first seat (lowest seat_index) with position >= pathLength.
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @returns {{ seatIndex: number, participantKey: string }|null}
 */
export function getBoardPathWinner(sessionLike, seats) {
  const norm = normalizeBoardPathSession(sessionLike, seats);
  if (norm.winnerSeatIndexFromRow != null) {
    const row = norm.seatOrder.find(s => s.seatIndex === norm.winnerSeatIndexFromRow);
    if (row) return { seatIndex: row.seatIndex, participantKey: row.participantKey };
  }
  const pathLength = norm.pathLength;
  let best = null;
  for (const s of norm.seatOrder) {
    const pos = norm.positions[s.participantKey] ?? 0;
    if (pos >= pathLength) {
      if (!best || s.seatIndex < best.seatIndex) best = s;
    }
  }
  return best;
}

/**
 * Leader: highest position, tie-break lower seat_index.
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 */
export function getBoardPathLeader(sessionLike, seats) {
  const norm = normalizeBoardPathSession(sessionLike, seats);
  let best = null;
  let bestPos = -1;
  for (const s of norm.seatOrder) {
    const pos = norm.positions[s.participantKey] ?? 0;
    if (best == null || pos > bestPos || (pos === bestPos && s.seatIndex < best.seatIndex)) {
      bestPos = pos;
      best = s;
    }
  }
  if (!best) return null;
  return {
    seatIndex: best.seatIndex,
    participantKey: best.participantKey,
    position: norm.positions[best.participantKey] ?? 0,
  };
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 */
export function isBoardPathPlayable(sessionLike, seats) {
  const order = getBoardPathSeatOrder(sessionLike, seats);
  if (order.length < 2) return false;
  const phase = resolveGamePhase(sessionLike);
  if (phase !== "playing" && phase !== "pregame") return false;
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const st = s.status;
  if (typeof st === "string" && st.toLowerCase() === "closed") return false;
  if (isBoardPathFinished(sessionLike, seats)) return false;
  return getBoardPathWinner(sessionLike, seats) == null;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {number} seatIndex
 */
export function isBoardPathSeatTurn(sessionLike, seats, seatIndex) {
  if (isBoardPathFinished(sessionLike, seats)) return false;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  if (order.length < 2) return false;
  const phase = resolveGamePhase(sessionLike);
  if (phase !== "playing" && phase !== "pregame") return false;
  const s = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : {};
  const st = s.status;
  if (typeof st === "string" && st.toLowerCase() === "closed") return false;
  return resolveBoardPathActiveSeatIndex(sessionLike) === seatIndex;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function canBoardPathSeatRoll(sessionLike, seats, selfParticipantKey) {
  const selfKey = selfParticipantKey?.trim() || null;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const selfSeat = selfKey ? order.find(x => x.participantKey === selfKey) : null;
  if (!selfSeat) return false;
  if (!isBoardPathSeatTurn(sessionLike, seats, selfSeat.seatIndex)) return false;
  if (isBoardPathFinished(sessionLike, seats)) return false;
  const phase = resolveGamePhase(sessionLike);
  if (phase !== "pregame" && phase !== "playing") return false;
  const step = getBoardPathTurnStep(sessionLike);
  return step === BOARD_PATH_TURN_STEP.AWAITING_ROLL;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function canBoardPathSeatMove(sessionLike, seats, selfParticipantKey) {
  const selfKey = selfParticipantKey?.trim() || null;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const selfSeat = selfKey ? order.find(x => x.participantKey === selfKey) : null;
  if (!selfSeat) return false;
  if (!isBoardPathSeatTurn(sessionLike, seats, selfSeat.seatIndex)) return false;
  if (resolveGamePhase(sessionLike) !== "playing") return false;
  return getBoardPathTurnStep(sessionLike) === BOARD_PATH_TURN_STEP.AWAITING_MOVE;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function canBoardPathSeatEndTurn(sessionLike, seats, selfParticipantKey) {
  const selfKey = selfParticipantKey?.trim() || null;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const selfSeat = selfKey ? order.find(x => x.participantKey === selfKey) : null;
  if (!selfSeat) return false;
  if (!isBoardPathSeatTurn(sessionLike, seats, selfSeat.seatIndex)) return false;
  if (resolveGamePhase(sessionLike) !== "playing") return false;
  return getBoardPathTurnStep(sessionLike) === BOARD_PATH_TURN_STEP.AWAITING_END;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 * @returns {keyof typeof BOARD_PATH_PRIMARY_ACTION}
 */
export function getBoardPathPrimaryAction(sessionLike, seats, selfParticipantKey) {
  if (isBoardPathFinished(sessionLike, seats)) return BOARD_PATH_PRIMARY_ACTION.NONE;
  if (canBoardPathSeatRoll(sessionLike, seats, selfParticipantKey)) return BOARD_PATH_PRIMARY_ACTION.ROLL;
  if (canBoardPathSeatMove(sessionLike, seats, selfParticipantKey)) return BOARD_PATH_PRIMARY_ACTION.MOVE;
  if (canBoardPathSeatEndTurn(sessionLike, seats, selfParticipantKey)) return BOARD_PATH_PRIMARY_ACTION.END_TURN;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const selfKey = selfParticipantKey?.trim() || null;
  if (selfKey && order.some(x => x.participantKey === selfKey)) return BOARD_PATH_PRIMARY_ACTION.WAIT;
  return BOARD_PATH_PRIMARY_ACTION.NONE;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function getBoardPathActionLabel(sessionLike, seats, selfParticipantKey) {
  const a = getBoardPathPrimaryAction(sessionLike, seats, selfParticipantKey);
  if (a === BOARD_PATH_PRIMARY_ACTION.ROLL) return "Roll";
  if (a === BOARD_PATH_PRIMARY_ACTION.MOVE) {
    const v = getBoardPathRollValue(sessionLike);
    return v != null ? `Move ${v}` : "Move";
  }
  if (a === BOARD_PATH_PRIMARY_ACTION.END_TURN) return "End turn";
  if (a === BOARD_PATH_PRIMARY_ACTION.WAIT) return "Wait";
  return "—";
}

export function getBoardPathAvailableActions(sessionLike, seats, selfParticipantKey) {
  const selfKey = selfParticipantKey?.trim() || null;
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const phase = resolveGamePhase(sessionLike);
  const finished = isBoardPathFinished(sessionLike, seats);

  if (finished) return ["observe_finished"];
  if (order.length < 2) return ["wait_for_players"];
  if (phase !== "playing" && phase !== "pregame") return ["observe"];

  if (canBoardPathSeatRoll(sessionLike, seats, selfKey)) return ["roll"];
  if (canBoardPathSeatMove(sessionLike, seats, selfKey)) return ["move"];
  if (canBoardPathSeatEndTurn(sessionLike, seats, selfKey)) return ["end_turn"];
  if (selfKey && order.some(x => x.participantKey === selfKey)) return ["wait_opponent_turn"];
  return ["observe"];
}

/**
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function getBoardPathStatusLabel(sessionLike, seats, selfParticipantKey) {
  const norm = normalizeBoardPathSession(sessionLike, seats);
  const winner = getBoardPathWinner(sessionLike, seats);
  if (winner) {
    const selfKey = selfParticipantKey?.trim() || "";
    if (selfKey && winner.participantKey === selfKey) return "You reached the finish — game over.";
    return `Game over — winner: seat ${winner.seatIndex}.`;
  }
  if (norm.phase === "ended") return "Game ended.";
  if (norm.seatOrder.length < 2) return "Waiting for players at the table.";
  if (norm.phase === "pregame") return "Match loaded — first roll starts play.";
  const active = getBoardPathActiveSeat(sessionLike, seats);
  const selfKey = selfParticipantKey?.trim() || "";
  const yours = Boolean(active && selfKey && active.participantKey === selfKey);
  const step = getBoardPathTurnStep(sessionLike);
  const rv = getBoardPathRollValue(sessionLike);
  if (yours) {
    if (step === BOARD_PATH_TURN_STEP.AWAITING_MOVE && rv != null) {
      return `Turn ${norm.turnNumber} — you rolled ${rv}; move.`;
    }
    if (step === BOARD_PATH_TURN_STEP.AWAITING_END) {
      return `Turn ${norm.turnNumber} — end your turn.`;
    }
    return `Turn ${norm.turnNumber} — your turn (${step.replace(/_/g, " ")}).`;
  }
  if (active) {
    return `Turn ${norm.turnNumber} — waiting for seat ${active.seatIndex}.`;
  }
  return `Turn ${norm.turnNumber} — in progress.`;
}

/**
 * Next UX phase hint (descriptive only).
 * @param {unknown} sessionLike
 * @param {unknown[]|null|undefined} seats
 * @param {string|null|undefined} selfParticipantKey
 */
export function getBoardPathNextTurnPhaseLabel(sessionLike, seats, selfParticipantKey) {
  const phase = resolveGamePhase(sessionLike);
  if (phase === "pregame") return "Roll to start";
  if (isBoardPathFinished(sessionLike, seats)) return "Finished";
  const selfKey = selfParticipantKey?.trim() || "";
  const activeIdx = resolveBoardPathActiveSeatIndex(sessionLike);
  const order = getBoardPathSeatOrder(sessionLike, seats);
  const selfSeat = selfKey ? order.find(x => x.participantKey === selfKey) : null;
  if (!(selfSeat && selfSeat.seatIndex === activeIdx)) return "Opponent acting";
  const step = getBoardPathTurnStep(sessionLike);
  if (step === BOARD_PATH_TURN_STEP.AWAITING_ROLL) return "Roll";
  if (step === BOARD_PATH_TURN_STEP.AWAITING_MOVE) return "Move";
  if (step === BOARD_PATH_TURN_STEP.AWAITING_END) return "End turn";
  return "Play";
}

// --- Post-finish rematch (Phase 4; DB member.meta.board_path.rematch_requested is source of truth) ---

/**
 * @param {unknown} member
 */
export function boardPathMemberRematchRequested(member) {
  if (!member || typeof member !== "object") return false;
  const o = /** @type {Record<string, unknown>} */ (member);
  const meta = o.meta && typeof o.meta === "object" ? /** @type {Record<string, unknown>} */ (o.meta) : {};
  const bp = meta.board_path && typeof meta.board_path === "object" ? /** @type {Record<string, unknown>} */ (meta.board_path) : {};
  const v = bp.rematch_requested ?? bp.rematchRequested;
  return v === true || v === "true" || v === 1;
}

/**
 * @param {unknown[]|null|undefined} members
 */
export function getBoardPathRematchEligibleMembers(members) {
  if (!Array.isArray(members)) return [];
  return members.filter(m => m && typeof m === "object" && /** @type {{ wallet_state?: string }} */ (m).wallet_state === "committed");
}

/**
 * @param {unknown[]|null|undefined} members
 */
export function getBoardPathRematchEligibleCount(members) {
  return getBoardPathRematchEligibleMembers(members).length;
}

/**
 * @param {unknown[]|null|undefined} members
 */
export function getBoardPathRematchCount(members) {
  return getBoardPathRematchEligibleMembers(members).filter(boardPathMemberRematchRequested).length;
}

/**
 * @param {unknown[]|null|undefined} members
 * @param {string|null|undefined} selfParticipantKey
 */
export function hasBoardPathSelfRequestedRematch(members, selfParticipantKey) {
  const k = selfParticipantKey?.trim() || null;
  if (!k || !Array.isArray(members)) return false;
  const m = members.find(x => x && typeof x === "object" && String(/** @type {{ participant_key?: string }} */ (x).participant_key) === k);
  return boardPathMemberRematchRequested(m);
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 */
export function isBoardPathRematchAllowed(sessionLike, roomLike, seats) {
  const room = roomLike && typeof roomLike === "object" ? /** @type {Record<string, unknown>} */ (roomLike) : null;
  if (!room) return false;
  if (String(room.product_game_id || "") !== "ov2_board_path") return false;
  if (String(room.lifecycle_phase || "") !== "active") return false;
  const aid = room.active_session_id;
  if (aid == null || (typeof aid === "string" && aid.trim() === "")) return false;
  const sess = sessionLike && typeof sessionLike === "object" ? /** @type {Record<string, unknown>} */ (sessionLike) : null;
  if (!sess?.id || String(sess.id) !== String(aid)) return false;
  const rms = Math.floor(Number(room.match_seq)) || 0;
  const sms = Math.floor(Number(sess.match_seq ?? sess.matchSeq)) || 0;
  if (rms !== sms) return false;
  return isBoardPathFinished(sessionLike, seats);
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown[]|null|undefined} members
 * @param {string|null|undefined} selfParticipantKey
 */
export function canBoardPathSelfRequestRematch(sessionLike, roomLike, seats, members, selfParticipantKey) {
  if (!isBoardPathRematchAllowed(sessionLike, roomLike, seats)) return false;
  const selfKey = selfParticipantKey?.trim() || null;
  if (!selfKey || !Array.isArray(members)) return false;
  const m = members.find(x => x && typeof x === "object" && String(/** @type {{ participant_key?: string }} */ (x).participant_key) === selfKey);
  if (!m || /** @type {{ wallet_state?: string }} */ (m).wallet_state !== "committed") return false;
  if (boardPathMemberRematchRequested(m)) return false;
  return true;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown[]|null|undefined} members
 * @param {string|null|undefined} selfParticipantKey
 */
export function canBoardPathSelfCancelRematch(sessionLike, roomLike, seats, members, selfParticipantKey) {
  if (!isBoardPathRematchAllowed(sessionLike, roomLike, seats)) return false;
  const selfKey = selfParticipantKey?.trim() || null;
  if (!selfKey || !Array.isArray(members)) return false;
  const m = members.find(x => x && typeof x === "object" && String(/** @type {{ participant_key?: string }} */ (x).participant_key) === selfKey);
  if (!m || /** @type {{ wallet_state?: string }} */ (m).wallet_state !== "committed") return false;
  return boardPathMemberRematchRequested(m);
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown[]|null|undefined} members
 * @param {string|null|undefined} selfParticipantKey
 * @param {string|null|undefined} hostParticipantKey
 */
export function canBoardPathHostStartNextMatch(sessionLike, roomLike, seats, members, selfParticipantKey, hostParticipantKey) {
  if (!isBoardPathRematchAllowed(sessionLike, roomLike, seats)) return false;
  const selfKey = selfParticipantKey?.trim() || null;
  const hk = hostParticipantKey?.trim() || null;
  if (!selfKey || !hk || selfKey !== hk) return false;
  const elig = getBoardPathRematchEligibleCount(members);
  if (elig < 2) return false;
  return getBoardPathRematchCount(members) >= elig;
}

/**
 * @param {unknown} sessionLike
 * @param {unknown} roomLike
 * @param {unknown[]|null|undefined} seats
 * @param {unknown[]|null|undefined} members
 * @param {string|null|undefined} selfParticipantKey
 * @param {string|null|undefined} hostParticipantKey
 */
export function getBoardPathRematchState(sessionLike, roomLike, seats, members, selfParticipantKey, hostParticipantKey) {
  const allowed = isBoardPathRematchAllowed(sessionLike, roomLike, seats);
  const rematchEligibleCount = getBoardPathRematchEligibleCount(members);
  const rematchRequestedCount = getBoardPathRematchCount(members);
  const selfRequestedRematch = hasBoardPathSelfRequestedRematch(members, selfParticipantKey);
  return {
    allowed,
    rematchEligibleCount,
    rematchRequestedCount,
    selfRequestedRematch,
    selfCanRequestRematch: canBoardPathSelfRequestRematch(sessionLike, roomLike, seats, members, selfParticipantKey),
    selfCanCancelRematch: canBoardPathSelfCancelRematch(sessionLike, roomLike, seats, members, selfParticipantKey),
    hostCanStartNextMatch: canBoardPathHostStartNextMatch(
      sessionLike,
      roomLike,
      seats,
      members,
      selfParticipantKey,
      hostParticipantKey
    ),
  };
}
