/**
 * OV2 Board Path — room/session view model (app-side only; no DB required).
 * Maps `Ov2BoardPathContext` (room + members + optional future session) onto UI-ready state.
 */

import { ONLINE_V2_GAME_KINDS, ONLINE_V2_ROOM_PHASE } from "./ov2Economy";
import { getOv2MinPlayersForProduct } from "./onlineV2GameRegistry";
import {
  boardPathRoomEligibleForSessionOpen,
  boardPathSeatsLookComplete,
  boardPathSessionIdMatchesRoom,
} from "./ov2BoardPathBootstrapContract";
import {
  BOARD_PATH_PRIMARY_ACTION,
  BOARD_PATH_TURN_STEP,
  canBoardPathSeatEndTurn,
  canBoardPathSeatMove,
  canBoardPathSeatRoll,
  getBoardPathActiveSeat,
  getBoardPathActionLabel,
  getBoardPathAvailableActions,
  getBoardPathLeader,
  getBoardPathNextTurnPhaseLabel,
  getBoardPathPathLength,
  getBoardPathPositionMap,
  getBoardPathPrimaryAction,
  getBoardPathRollValue,
  getBoardPathRoundIndex,
  getBoardPathStatusLabel,
  getBoardPathTurnNumber,
  getBoardPathTurnStep,
  getBoardPathWinner,
  isBoardPathFinished,
  isBoardPathPlayable,
  resolveBoardPathActiveSeatIndex,
  getBoardPathSeatOrder,
  getBoardPathRematchState,
} from "./board-path/ov2BoardPathEngine";
import {
  buildBoardPathSettlementLines,
  canBoardPathFinalizeSession,
  getBoardPathFinalizationLabel,
  getBoardPathSettlementState,
} from "./board-path/ov2BoardPathSettlement";

/**
 * -----------------------------------------------------------------------------
 * Session bootstrap (see also `ov2BoardPathBootstrapContract.js`)
 * -----------------------------------------------------------------------------
 * 1. Room `lifecycle_phase` becomes `active` only after all seat stakes are committed (server truth).
 * 2. `ov2_rooms.active_session_id` is set by a future RPC (e.g. `ov2_board_path_open_session`) that:
 *    - creates `ov2_board_path_sessions` for `(room_id, match_seq)`;
 *    - inserts `ov2_board_path_seats` aligned with `ov2_room_members` for that match;
 *    - returns session id written onto the room row.
 * 3. Clients load session (+ optional `seats[]`) by `active_session_id`; use `boardPathClientBootstrappingSession` until hydrated.
 * 4. Gameplay actions go through future engine RPCs; this adapter only reads derived flags (turn, winner, etc.).
 * 5. On match end, server moves room to `settling` / `closed` and clears or freezes session; UI uses `finished` coarse state.
 * ---------------------------------------------------------------------------
 */

/** Coarse lifecycle bands the Board Path shell understands (OV2-aligned). */
export const BOARD_PATH_COARSE = Object.freeze({
  DISCONNECTED: "disconnected",
  LOBBY: "lobby",
  PENDING_START: "pending_start",
  PENDING_STAKES: "pending_stakes",
  ACTIVE: "active",
  FINISHED: "finished",
});

/** Finer lobby / active substates for copy and controls. */
export const BOARD_PATH_LOBBY_DETAIL = Object.freeze({
  WAITING_PLAYERS: "waiting_players",
  NEED_READY: "need_ready",
  READY_TO_START: "ready_to_start",
});

export const BOARD_PATH_ACTIVE_DETAIL = Object.freeze({
  BOOTSTRAPPING_SESSION: "bootstrapping_session",
  /** Room has `active_session_id`; client fetching `session` / `seats`. */
  SESSION_HYDRATING: "session_hydrating",
  IN_MATCH: "in_match",
});

export const BOARD_PATH_MATCH_DETAIL = Object.freeze({
  YOUR_TURN: "your_turn",
  THEIR_TURN: "their_turn",
  UNKNOWN: "unknown",
});

/** Stake + session-bootstrap sub-state for Board Path UI (OV2 wallet_state + room phase). */
export const BOARD_PATH_STAKE_FLOW = Object.freeze({
  IDLE: "idle",
  /** `pending_start` — stake RPC window not active yet; show counts if any edge partial state. */
  PRE_STAKES: "pre_stakes",
  SELF_MUST_COMMIT: "self_must_commit",
  WAITING_PEER_COMMITS: "waiting_peer_commits",
  /** All members committed but session row / id not ready (or transitional `pending_stakes`). */
  ALL_COMMITTED_OPENING_SESSION: "all_committed_opening_session",
  /** `active_session_id` set on room; client still fetching session/seats. */
  SESSION_HYDRATING: "session_hydrating",
  IN_MATCH: "in_match",
});

/**
 * Board Path session row lifecycle (derived from room + session + seats + engine fields).
 * Independent of `BOARD_PATH_STAKE_FLOW` (stake vs session concerns).
 */
export const BOARD_PATH_SESSION_PHASE = Object.freeze({
  /** Not in an active board-path session window (lobby, pending, disconnected, etc.). */
  NONE: "none",
  /** Room `active` but `active_session_id` still null — server opening session. */
  OPENING: "opening",
  /** `active_session_id` set; client has not matched a `session` object yet. */
  HYDRATING: "hydrating",
  /** Session row matched; seats incomplete and/or `turn` / engine not ready for play UI. */
  READY: "ready",
  /** Session + seats (if provided) OK; engine in playable state. */
  ACTIVE: "active",
  /** Session / engine reports end (winner flags or `ended`). */
  FINISHED: "finished",
});

/** Stable control intents — labels via `BOARD_PATH_CONTROL_LABELS` (future handlers key off `intent`). */
export const BOARD_PATH_CONTROL_INTENT = Object.freeze({
  OPEN_ROOMS: "open_rooms",
  REFRESH: "refresh",
  READY_TOGGLE: "ready_toggle",
  LEAVE_TABLE: "leave_table",
  COMMIT_STAKE: "commit_stake",
  WAITING: "waiting",
  STAND_BY: "stand_by",
  STARTING: "starting",
  OPENING_SESSION: "opening_session",
  LOADING_SESSION: "loading_session",
  SYNC_SESSION: "sync_session",
  ROLL: "roll",
  MOVE: "move",
  CHOOSE_TOKEN: "choose_token",
  END_TURN: "end_turn",
  NEW_MATCH: "new_match",
  REMATCH: "rematch",
});

export const BOARD_PATH_CONTROL_LABELS = Object.freeze({
  [BOARD_PATH_CONTROL_INTENT.OPEN_ROOMS]: "Open rooms",
  [BOARD_PATH_CONTROL_INTENT.REFRESH]: "Refresh",
  [BOARD_PATH_CONTROL_INTENT.READY_TOGGLE]: "Ready",
  [BOARD_PATH_CONTROL_INTENT.LEAVE_TABLE]: "Leave table",
  [BOARD_PATH_CONTROL_INTENT.COMMIT_STAKE]: "Commit stake",
  [BOARD_PATH_CONTROL_INTENT.WAITING]: "Waiting…",
  [BOARD_PATH_CONTROL_INTENT.STAND_BY]: "Stand by",
  [BOARD_PATH_CONTROL_INTENT.STARTING]: "Starting…",
  [BOARD_PATH_CONTROL_INTENT.OPENING_SESSION]: "Opening session…",
  [BOARD_PATH_CONTROL_INTENT.LOADING_SESSION]: "Loading session…",
  [BOARD_PATH_CONTROL_INTENT.SYNC_SESSION]: "Sync session…",
  [BOARD_PATH_CONTROL_INTENT.ROLL]: "Roll",
  [BOARD_PATH_CONTROL_INTENT.MOVE]: "Move",
  [BOARD_PATH_CONTROL_INTENT.CHOOSE_TOKEN]: "Choose token",
  [BOARD_PATH_CONTROL_INTENT.END_TURN]: "End turn",
  [BOARD_PATH_CONTROL_INTENT.NEW_MATCH]: "New match",
  [BOARD_PATH_CONTROL_INTENT.REMATCH]: "Rematch",
});

/**
 * Subset of `ov2_rooms` public fields Board Path cares about.
 * @typedef {Object} Ov2BoardPathRoomLike
 * @property {string|null} [id]
 * @property {string} lifecycle_phase
 * @property {number|string} stake_per_seat
 * @property {number|string} match_seq
 * @property {string|null} [active_session_id]
 * @property {string} [product_game_id]
 * @property {string|null} [host_participant_key] — required for local session open authority; future `ov2_rooms` column.
 */

/**
 * Subset of `ov2_room_members` rows.
 * @typedef {Object} Ov2BoardPathMemberLike
 * @property {string} participant_key
 * @property {boolean} [is_ready]
 * @property {string} [wallet_state]
 * @property {string|null} [display_name]
 */

/**
 * Session payload: future `ov2_board_path_sessions` row + UI-friendly engine snapshot.
 * @typedef {Object} Ov2BoardPathSessionLike
 * @property {string|null} [id]
 * @property {number} [version]
 * @property {number} [revision]
 * @property {string|null} [room_id]
 * @property {number} [match_seq]
 * @property {string} [engine_phase]
 * @property {Record<string, unknown>|null} [board]
 * @property {boolean} [you_won]
 * @property {boolean} [opponent_won]
 * @property {{ turnNumber?: number, activeSeatIndex?: number|null, startedAt?: number }} [turnMeta]
 * @property {{ pathLength: number, positions: Record<string, number> }} [boardState]
 * @property {unknown[]} [eventLog]
 * @property {unknown|null} [lastEvent] last entry from `eventLog` when bridged from local session
 * @property {string} [settlement_status]
 * @property {string} [settlementStatus]
 * @property {string|null} [finalized_at]
 * @property {string|null} [finalizedAt]
 * @property {number} [settlement_revision]
 * @property {number} [settlementRevision]
 */

/**
 * @typedef {import("./ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike} Ov2BoardPathSeatRowLike
 */

/**
 * @typedef {Object} Ov2BoardPathSelfLike
 * @property {string} participant_key
 */

/**
 * @typedef {Object} Ov2BoardPathContext
 * @property {Ov2BoardPathRoomLike|null} room
 * @property {Ov2BoardPathMemberLike[]} members
 * @property {Ov2BoardPathSessionLike|null} [session]
 * @property {Ov2BoardPathSeatRowLike[]|null} [seats]
 * @property {Ov2BoardPathSelfLike|null} [self]
 * @property {Record<string, unknown>[]|null} [settlementLines] loaded `ov2_settlement_lines` for current session (Phase 5)
 */

/**
 * @typedef {Object} BoardPathControlSpec
 * @property {keyof typeof BOARD_PATH_CONTROL_INTENT} intent
 * @property {string} label
 * @property {boolean} disabled
 * @property {boolean} muted
 */

/**
 * @typedef {Object} BoardPathViewModel
 * @property {keyof typeof BOARD_PATH_COARSE} coarse
 * @property {keyof typeof BOARD_PATH_LOBBY_DETAIL|null} lobbyDetail
 * @property {keyof typeof BOARD_PATH_ACTIVE_DETAIL|null} activeDetail
 * @property {keyof typeof BOARD_PATH_MATCH_DETAIL|null} matchDetail
 * @property {keyof typeof BOARD_PATH_SESSION_PHASE} sessionPhase
 * @property {0|1|2|3|4|5} contextHydrationTier
 * @property {boolean} [turnDataPartial]
 * @property {string} statusLine
 * @property {string} [turnLine]
 * @property {BoardPathControlSpec} primary
 * @property {BoardPathControlSpec} secondary
 * @property {{ you: number|null, opp: number|null }} tokenSlots
 * @property {{ you: string, opp: string }} playerBadges
 * @property {boolean} youConnected
 * @property {boolean} oppConnected
 * @property {{ round: string, table: string, stake: string }} meta
 * @property {keyof typeof BOARD_PATH_STAKE_FLOW} stakeFlow
 * @property {{ total: number, committed: number, selfCommitted: boolean }} stakeCounts
 * @property {string} stakeSummaryLine
 * @property {{ participantKey: string, displayLabel: string, committed: boolean, isSelf: boolean }[]} membersStakeUi
 * @property {boolean} [seatsComplete]
 * @property {BoardPathGameplayViewModel|null} [gameplay]
 * @property {boolean} [liveSyncEnabled]
 * @property {"idle"|"subscribed"|"refreshing"|"error"} [liveSyncState]
 * @property {number|string|null} [liveRevision]
 * @property {string|null} [sessionIdentity]
 * @property {boolean} [isStale]
 * @property {number|null} [lastSyncAt]
 * @property {{ code?: string, message?: string }|null} [syncError]
 * @property {Object|null} [postFinish]
 * @property {boolean} [rematchAllowed]
 * @property {number} [rematchRequestedCount]
 * @property {number} [rematchEligibleCount]
 * @property {boolean} [selfRequestedRematch]
 * @property {boolean} [selfCanRequestRematch]
 * @property {boolean} [selfCanCancelRematch]
 * @property {boolean} [hostCanStartNextMatch]
 * @property {boolean} [nextMatchPending]
 * @property {string} [nextMatchLabel]
 * @property {string|null} [finishedSessionIdentity]
 * @property {string|null} [activeSessionIdentity]
 * @property {boolean} [sessionTransitioning]
 * @property {{ code?: string, message?: string }|null} [rematchError]
 * @property {boolean} [finalized]
 * @property {string|null} [finalizedAt]
 * @property {string} [settlementStatus]
 * @property {number} [settlementRevision]
 * @property {boolean} [canFinalize]
 * @property {boolean} [hostCanFinalizeSession]
 * @property {boolean} [finalizeBusy]
 * @property {{ code?: string, message?: string }|null} [finalizeError]
 * @property {{ outcome: string, winnerSeatIndex: number|null, winnerParticipantKey: string|null, participantCount: number, settledAmount: number, pot?: number }|null} [settlementSummary]
 * @property {Record<string, unknown>[]} [settlementLinesPreview]
 * @property {string} [settlementStatusLabel]
 * @property {string} [settlementWinnerCompact]
 * @property {string} [postFinishStatusLabel]
 */

/**
 * Read-only gameplay slice derived from session + seats (engine-backed).
 * @typedef {Object} BoardPathGameplaySeatProgress
 * @property {number} seatIndex
 * @property {string} participantKey
 * @property {string} displayLabel
 * @property {number} position
 * @property {number} pathSlot
 * @property {boolean} isLeader
 * @property {boolean} isWinner
 * @property {boolean} isActiveSeat
 * @property {boolean} isSelf
 */

/**
 * @typedef {Object} BoardPathGameplayViewModel
 * @property {"pregame"|"playing"|"ended"} gamePhase
 * @property {string} roomPhase
 * @property {keyof typeof BOARD_PATH_SESSION_PHASE} sessionPhase
 * @property {{ seatIndex: number, participantKey: string, displayLabel: string }|null} activeSeat
 * @property {{ seatIndex: number, participantKey: string, displayLabel: string }|null} selfSeat
 * @property {number} turnNumber
 * @property {number} roundIndex
 * @property {number} pathLength
 * @property {BoardPathGameplaySeatProgress[]} positions
 * @property {{ seatIndex: number, participantKey: string, position: number, displayLabel: string }|null} leader
 * @property {{ seatIndex: number, participantKey: string, displayLabel: string }|null} winner
 * @property {boolean} playable
 * @property {boolean} finished
 * @property {string} statusLabel
 * @property {keyof typeof BOARD_PATH_CONTROL_INTENT} controlIntent
 * @property {string[]} allowedActions
 * @property {string} nextTurnPhaseLabel
 * @property {{ you: number|null, opp: number|null }} tokenSlots
 * @property {boolean} [shapeInvalid]
 * @property {string|null} [shapeIssue]
 * @property {string} turnStep
 * @property {number|null} rollValue
 * @property {boolean} selfCanRoll
 * @property {boolean} selfCanMove
 * @property {boolean} selfCanEndTurn
 * @property {keyof typeof BOARD_PATH_PRIMARY_ACTION} primaryAction
 * @property {string} primaryActionLabel
 * @property {null|"roll"|"move"|"end_turn"} actionPending
 * @property {{ code?: string, message?: string }|null} actionError
 * @property {boolean} showRolledValue
 * @property {string} rolledValueLabel
 */

const PATH_SLOTS = 6;

/**
 * @param {number} progress
 * @param {number} pathLength
 */
function boardPathProgressToSlot(progress, pathLength) {
  const L = Math.max(1, pathLength);
  const p = Math.max(0, Math.min(Number(progress) || 0, L));
  return Math.min(PATH_SLOTS - 1, Math.round((p / L) * (PATH_SLOTS - 1)));
}

/**
 * @param {Ov2BoardPathMemberLike[]} members
 * @param {string} participantKey
 */
function boardPathParticipantDisplayLabel(members, participantKey) {
  const m = Array.isArray(members) ? members.find(x => x.participant_key === participantKey) : null;
  return (m?.display_name && String(m.display_name).trim()) || `…${String(participantKey).slice(0, 4)}`;
}

/**
 * @param {Ov2BoardPathRoomLike|null} room
 * @param {Ov2BoardPathSessionLike} session
 * @param {import("./ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike[]} seats
 * @param {string|null} selfKey
 * @param {Ov2BoardPathMemberLike[]} members
 * @param {BoardPathViewModel} vm
 * @param {{ actionPending?: null|"roll"|"move"|"end_turn", actionError?: { code?: string, message?: string }|null }|null|undefined} actionOpts
 * @returns {BoardPathGameplayViewModel|null}
 */
function buildBoardPathGameplayPayload(room, session, seats, selfKey, members, vm, actionOpts) {
  if (!session?.id || !Array.isArray(seats) || seats.length === 0) return null;

  const shapeInvalid = !session.boardState || typeof session.boardState !== "object";
  const shapeIssue = shapeInvalid ? "Session missing boardState (cannot derive path positions)." : null;

  const pathLength = getBoardPathPathLength(session);
  const posMap = getBoardPathPositionMap(session, seats);
  const order = getBoardPathSeatOrder(session, seats);
  const leader = getBoardPathLeader(session, seats);
  const winner = getBoardPathWinner(session, seats);
  const activeIdx = resolveBoardPathActiveSeatIndex(session);
  const activeRef = getBoardPathActiveSeat(session, seats);
  const gamePhase = /** @type {"pregame"|"playing"|"ended"} */ (
    session.phase === "ended" || session.engine_phase === "ended" ? "ended" : session.phase === "playing" || session.engine_phase === "playing" ? "playing" : "pregame"
  );

  /** @type {BoardPathGameplaySeatProgress[]} */
  const positions = order.map(s => {
    const pk = s.participantKey;
    const pos = posMap[pk] ?? 0;
    const isLeader = Boolean(leader && leader.seatIndex === s.seatIndex);
    const isWinner = Boolean(winner && winner.seatIndex === s.seatIndex);
    return {
      seatIndex: s.seatIndex,
      participantKey: pk,
      displayLabel: boardPathParticipantDisplayLabel(members, pk),
      position: pos,
      pathSlot: boardPathProgressToSlot(pos, pathLength),
      isLeader,
      isWinner,
      isActiveSeat: s.seatIndex === activeIdx,
      isSelf: Boolean(selfKey && pk === selfKey),
    };
  });

  const selfRef = selfKey ? order.find(s => s.participantKey === selfKey) : null;
  const oppRef = selfKey ? order.find(s => s.participantKey !== selfKey) : order[1] || null;

  const tokenSlots = {
    you: selfRef != null ? boardPathProgressToSlot(posMap[selfRef.participantKey] ?? 0, pathLength) : null,
    opp: oppRef != null ? boardPathProgressToSlot(posMap[oppRef.participantKey] ?? 0, pathLength) : null,
  };

  const activeSeat =
    activeRef != null
      ? {
          seatIndex: activeRef.seatIndex,
          participantKey: activeRef.participantKey,
          displayLabel: boardPathParticipantDisplayLabel(members, activeRef.participantKey),
        }
      : null;

  const selfSeat =
    selfRef != null
      ? {
          seatIndex: selfRef.seatIndex,
          participantKey: selfRef.participantKey,
          displayLabel: boardPathParticipantDisplayLabel(members, selfRef.participantKey),
        }
      : null;

  const turnStep = getBoardPathTurnStep(session);
  const rollVal = getBoardPathRollValue(session);
  const selfCanRoll = canBoardPathSeatRoll(session, seats, selfKey);
  const selfCanMove = canBoardPathSeatMove(session, seats, selfKey);
  const selfCanEndTurn = canBoardPathSeatEndTurn(session, seats, selfKey);
  const primaryAction = getBoardPathPrimaryAction(session, seats, selfKey);
  const primaryActionLabel = getBoardPathActionLabel(session, seats, selfKey);

  let controlIntent = vm.primary.intent;
  if (primaryAction === BOARD_PATH_PRIMARY_ACTION.ROLL) controlIntent = BOARD_PATH_CONTROL_INTENT.ROLL;
  else if (primaryAction === BOARD_PATH_PRIMARY_ACTION.MOVE) controlIntent = BOARD_PATH_CONTROL_INTENT.MOVE;
  else if (primaryAction === BOARD_PATH_PRIMARY_ACTION.END_TURN) controlIntent = BOARD_PATH_CONTROL_INTENT.END_TURN;

  const actionPending = actionOpts?.actionPending ?? null;
  const actionError = actionOpts?.actionError ?? null;
  const showRolledValue =
    rollVal != null &&
    (turnStep === BOARD_PATH_TURN_STEP.AWAITING_MOVE || turnStep === BOARD_PATH_TURN_STEP.AWAITING_END);
  const rolledValueLabel = rollVal != null ? `Rolled ${rollVal}` : "";

  return {
    gamePhase,
    roomPhase: room?.lifecycle_phase ?? "—",
    sessionPhase: vm.sessionPhase,
    activeSeat,
    selfSeat,
    turnNumber: getBoardPathTurnNumber(session),
    roundIndex: getBoardPathRoundIndex(session),
    pathLength,
    positions,
    leader: leader
      ? {
          seatIndex: leader.seatIndex,
          participantKey: leader.participantKey,
          position: leader.position,
          displayLabel: boardPathParticipantDisplayLabel(members, leader.participantKey),
        }
      : null,
    winner: winner
      ? {
          seatIndex: winner.seatIndex,
          participantKey: winner.participantKey,
          displayLabel: boardPathParticipantDisplayLabel(members, winner.participantKey),
        }
      : null,
    playable: isBoardPathPlayable(session, seats),
    finished: isBoardPathFinished(session, seats),
    statusLabel: getBoardPathStatusLabel(session, seats, selfKey),
    controlIntent,
    allowedActions: getBoardPathAvailableActions(session, seats, selfKey),
    nextTurnPhaseLabel: getBoardPathNextTurnPhaseLabel(session, seats, selfKey),
    tokenSlots,
    shapeInvalid,
    shapeIssue,
    turnStep,
    rollValue: rollVal,
    selfCanRoll,
    selfCanMove,
    selfCanEndTurn,
    primaryAction,
    primaryActionLabel,
    actionPending,
    actionError,
    showRolledValue,
    rolledValueLabel,
  };
}

/**
 * @param {Ov2BoardPathContext|null|undefined} raw
 * @param {BoardPathViewModel} vm
 * @param {{ actionPending?: null|"roll"|"move"|"end_turn", actionError?: { code?: string, message?: string }|null }|null|undefined} actionOpts
 */
function enrichBoardPathViewModelWithGameplay(raw, vm, actionOpts) {
  const ctx = raw && typeof raw === "object" ? raw : createDisconnectedBoardPathContext();
  const room = ctx.room && typeof ctx.room === "object" ? ctx.room : null;
  const session = ctx.session && typeof ctx.session === "object" ? ctx.session : null;
  const seats = Array.isArray(ctx.seats) ? ctx.seats : null;
  const selfKey = ctx.self?.participant_key?.trim() || null;
  const members = Array.isArray(ctx.members) ? ctx.members : [];
  if (!session?.id || !seats || seats.length === 0) {
    return { ...vm, gameplay: null };
  }
  const gp = buildBoardPathGameplayPayload(room, session, seats, selfKey, members, vm, actionOpts);
  return { ...vm, gameplay: gp };
}

/**
 * @param {Ov2BoardPathSessionLike|null|undefined} session
 * @param {string|null|undefined} selfKey
 * @returns {{ you: number, opp: number|null }|null}
 */
function pathTokenSlotsFromBoardState(session, selfKey) {
  const bs = session?.boardState;
  const L = typeof bs?.pathLength === "number" ? Math.max(1, bs.pathLength) : 30;
  const positions = bs?.positions && typeof bs.positions === "object" ? bs.positions : {};
  const toSlot = raw => {
    const p = Math.max(0, Math.min(Number(raw) || 0, L));
    return Math.min(PATH_SLOTS - 1, Math.round((p / L) * (PATH_SLOTS - 1)));
  };
  if (!selfKey || !Object.prototype.hasOwnProperty.call(positions, selfKey)) {
    return { you: 0, opp: null };
  }
  const oppKey = Object.keys(positions).find(k => k !== selfKey) ?? null;
  return {
    you: toSlot(positions[selfKey]),
    opp: oppKey != null ? toSlot(positions[oppKey]) : null,
  };
}

/**
 * Path tokens are derived only from `session.boardState` (backend-swappable contract).
 * @param {Ov2BoardPathSessionLike|null|undefined} session
 * @param {string|null|undefined} selfKey
 */
function pathSlotsForSessionView(session, selfKey) {
  return pathTokenSlotsFromBoardState(session, selfKey);
}

/**
 * Whether `selfKey` holds the active seat — uses `session.turnMeta` + `seats[]` only (no `engine_state` / members heuristics).
 * @param {Ov2BoardPathSessionLike|null} session
 * @param {import("./ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike[]|null} seats
 * @param {string|null} selfKey
 * @returns {boolean|undefined} undefined when indeterminate (no seats / no active index)
 */
function sessionSelfIsActiveSeat(session, seats, selfKey) {
  if (!session || !Array.isArray(seats) || !selfKey) return undefined;
  const ai = resolveBoardPathActiveSeatIndex(session);
  const row = seats.find(r => Number(r.seat_index) === Number(ai));
  if (!row?.participant_key) return undefined;
  return String(row.participant_key) === String(selfKey);
}

function stakeStats(members, selfKey) {
  const total = Array.isArray(members) ? members.length : 0;
  const committed = Array.isArray(members) ? members.filter(m => m.wallet_state === "committed").length : 0;
  const selfMember = selfKey && Array.isArray(members) ? members.find(m => m.participant_key === selfKey) : null;
  const selfCommitted = selfMember?.wallet_state === "committed";
  return { total, committed, selfCommitted };
}

export function buildMembersStakeUi(members, selfKey) {
  if (!Array.isArray(members)) return [];
  return members.map(m => ({
    participantKey: m.participant_key,
    displayLabel:
      m.participant_key === selfKey
        ? "You"
        : (m.display_name && String(m.display_name).trim()) || `…${String(m.participant_key).slice(0, 4)}`,
    committed: m.wallet_state === "committed",
    isSelf: m.participant_key === selfKey,
  }));
}

/**
 * How much live data the context carries (for loaders / debugging). Not a server field.
 * 0 = no room · 1 = room, no members · 2 = room + members · 3 = + active_session_id · 4 = + matching session row · 5 = + seats[]
 */
export function getBoardPathContextHydrationTier(ctx) {
  if (!ctx || typeof ctx !== "object" || !ctx.room) return 0;
  const members = Array.isArray(ctx.members) ? ctx.members : [];
  if (members.length === 0) return 1;
  const room = ctx.room;
  if (!room.active_session_id) return 2;
  const session = ctx.session && typeof ctx.session === "object" ? ctx.session : null;
  const idOk = Boolean(session?.id && String(session.id) === String(room.active_session_id));
  if (!idOk) return 3;
  if (!Array.isArray(ctx.seats)) return 4;
  return 5;
}

/**
 * Settlement / finalization VM slice (Phase 5). Merged into `buildBoardPathPostFinishSlice` result.
 * @param {Ov2BoardPathContext|null|undefined} rawContext
 * @param {string|null|undefined} hostKey
 * @param {{ finalizeBusy?: boolean, finalizeError?: { code?: string, message?: string }|null, liveDbBoardPath?: boolean }} [hookFlags]
 */
function buildBoardPathSettlementViewSlice(rawContext, hostKey, hookFlags) {
  const ctx = rawContext && typeof rawContext === "object" ? rawContext : createDisconnectedBoardPathContext();
  const room = ctx.room && typeof ctx.room === "object" ? ctx.room : null;
  const session = ctx.session && typeof ctx.session === "object" ? ctx.session : null;
  const seats = Array.isArray(ctx.seats) ? ctx.seats : [];
  const members = Array.isArray(ctx.members) ? ctx.members : [];
  const selfKey = ctx.self?.participant_key?.trim() || null;
  const hk = (hostKey && String(hostKey).trim()) || (room?.host_participant_key && String(room.host_participant_key).trim()) || null;
  const settlementLineRows = Array.isArray(ctx.settlementLines) ? ctx.settlementLines : [];
  const liveDb = Boolean(hookFlags?.liveDbBoardPath);

  const z = {
    finalized: false,
    finalizedAt: null,
    settlementStatus: "pending",
    settlementRevision: 0,
    canFinalize: false,
    hostCanFinalizeSession: false,
    finalizeBusy: Boolean(hookFlags?.finalizeBusy),
    finalizeError: hookFlags?.finalizeError ?? null,
    settlementSummary: null,
    settlementLinesPreview: [],
    settlementStatusLabel: "",
    settlementWinnerCompact: "—",
  };

  if (!room || !session || seats.length === 0 || !selfKey) return z;

  const gst = getBoardPathSettlementState(session, seats, room, members, settlementLineRows);
  const planned = buildBoardPathSettlementLines(session, seats, room);
  const previewFromDb =
    gst.finalized && settlementLineRows.length > 0
      ? settlementLineRows.map(l => ({
          recipient_participant_key: l.recipient_participant_key,
          line_kind: l.line_kind,
          amount: l.amount,
          meta: l.meta,
        }))
      : planned.lines.map(l => ({
          recipient_participant_key: l.participantKey,
          line_kind: l.lineKind,
          amount: l.grossAmount,
          meta: l.metadata,
        }));

  const canFin = canBoardPathFinalizeSession(session, room, selfKey, hk, liveDb);
  const winCompact = gst.winnerParticipantKey
    ? `…${String(gst.winnerParticipantKey).slice(-6)}`
    : gst.outcome === "draw"
      ? "Draw"
      : "—";

  return {
    finalized: gst.finalized,
    finalizedAt: gst.finalizedAt,
    settlementStatus: gst.settlementStatus,
    settlementRevision: gst.settlementRevision,
    canFinalize: canFin,
    hostCanFinalizeSession: canFin,
    finalizeBusy: Boolean(hookFlags?.finalizeBusy),
    finalizeError: hookFlags?.finalizeError ?? null,
    settlementSummary: {
      outcome: gst.outcome,
      winnerSeatIndex: gst.winnerSeatIndex,
      winnerParticipantKey: gst.winnerParticipantKey,
      participantCount: gst.participantCount,
      settledAmount: gst.settledAmount,
      pot: gst.pot,
    },
    settlementLinesPreview: previewFromDb.slice(0, 4),
    settlementStatusLabel: getBoardPathFinalizationLabel(session, seats, room, members, settlementLineRows),
    settlementWinnerCompact: winCompact,
  };
}

/**
 * Post-finish rematch slice for live Board Path (Phase 4) + settlement (Phase 5).
 * @param {Ov2BoardPathContext|null|undefined} rawContext
 * @param {string|null|undefined} hostKey
 * @param {{
 *   rematchBusy?: boolean,
 *   rematchError?: { code?: string, message?: string }|null,
 *   finalizeBusy?: boolean,
 *   finalizeError?: { code?: string, message?: string }|null,
 *   liveDbBoardPath?: boolean,
 * }} [hookFlags]
 */
export function buildBoardPathPostFinishSlice(rawContext, hostKey, hookFlags) {
  const ctx = rawContext && typeof rawContext === "object" ? rawContext : createDisconnectedBoardPathContext();
  const room = ctx.room && typeof ctx.room === "object" ? ctx.room : null;
  const session = ctx.session && typeof ctx.session === "object" ? ctx.session : null;
  const seats = Array.isArray(ctx.seats) ? ctx.seats : [];
  const members = Array.isArray(ctx.members) ? ctx.members : [];
  const selfKey = ctx.self?.participant_key?.trim() || null;
  const hk = (hostKey && String(hostKey).trim()) || (room?.host_participant_key && String(room.host_participant_key).trim()) || null;

  const settlementVm = buildBoardPathSettlementViewSlice(rawContext, hostKey, hookFlags);
  const busy = Boolean(hookFlags?.rematchBusy) || Boolean(hookFlags?.finalizeBusy);
  const rErr = hookFlags?.rematchError ?? null;

  /** @param {Record<string, unknown>|null} r */
  /** @param {Record<string, unknown>|null} s */
  function sessionIdentity(r, s) {
    if (!r || !s?.id) return null;
    const sid = String(s.id);
    const ms = Math.floor(Number(s.match_seq ?? s.matchSeq)) || 0;
    return `${sid}:m${ms}`;
  }

  const empty = {
    ...settlementVm,
    postFinish: null,
    rematchAllowed: false,
    rematchRequestedCount: 0,
    rematchEligibleCount: 0,
    selfRequestedRematch: false,
    selfCanRequestRematch: false,
    selfCanCancelRematch: false,
    hostCanStartNextMatch: false,
    nextMatchPending: false,
    nextMatchLabel: "",
    finishedSessionIdentity: sessionIdentity(room, session),
    activeSessionIdentity:
      room?.active_session_id != null && String(room.active_session_id).trim() !== ""
        ? `${String(room.active_session_id)}:m${Math.floor(Number(room.match_seq)) || 0}`
        : null,
    sessionTransitioning: busy,
    rematchError: rErr,
    postFinishStatusLabel: settlementVm.settlementStatusLabel || "",
  };

  if (!room || !session || !selfKey || seats.length === 0) {
    return empty;
  }

  const st = getBoardPathRematchState(session, room, seats, members, selfKey, hk);
  if (!st.allowed) {
    return {
      ...empty,
      finishedSessionIdentity: sessionIdentity(room, session),
      activeSessionIdentity:
        room?.active_session_id != null && String(room.active_session_id).trim() !== ""
          ? `${String(room.active_session_id)}:m${Math.floor(Number(room.match_seq)) || 0}`
          : null,
      sessionTransitioning: busy,
      rematchError: rErr,
      postFinishStatusLabel: settlementVm.settlementStatusLabel || "",
    };
  }

  const { rematchRequestedCount, rematchEligibleCount } = st;
  const nextMatchPending = rematchRequestedCount < rematchEligibleCount || !st.hostCanStartNextMatch;
  const nextMatchLabel = st.hostCanStartNextMatch
    ? "Everyone ready — host can start next match"
    : `Rematch votes ${rematchRequestedCount}/${rematchEligibleCount}`;

  const postFinishStatusLabel = [settlementVm.settlementStatusLabel, nextMatchLabel].filter(Boolean).join(" · ");

  const pf = {
    active: true,
    rematchAllowed: true,
    rematchRequestedCount,
    rematchEligibleCount,
    selfRequestedRematch: st.selfRequestedRematch,
    selfCanRequestRematch: st.selfCanRequestRematch,
    selfCanCancelRematch: st.selfCanCancelRematch,
    hostCanStartNextMatch: st.hostCanStartNextMatch,
    nextMatchPending,
    nextMatchLabel,
  };

  return {
    ...settlementVm,
    postFinish: pf,
    rematchAllowed: true,
    rematchRequestedCount,
    rematchEligibleCount,
    selfRequestedRematch: st.selfRequestedRematch,
    selfCanRequestRematch: st.selfCanRequestRematch,
    selfCanCancelRematch: st.selfCanCancelRematch,
    hostCanStartNextMatch: st.hostCanStartNextMatch,
    nextMatchPending,
    nextMatchLabel,
    finishedSessionIdentity: sessionIdentity(room, session),
    activeSessionIdentity:
      room?.active_session_id != null && String(room.active_session_id).trim() !== ""
        ? `${String(room.active_session_id)}:m${Math.floor(Number(room.match_seq)) || 0}`
        : null,
    sessionTransitioning: busy,
    rematchError: rErr,
    postFinishStatusLabel,
  };
}

/** @param {keyof typeof BOARD_PATH_CONTROL_INTENT} intent */
function ctrl(intent, disabled, muted) {
  return {
    intent,
    label: BOARD_PATH_CONTROL_LABELS[intent] || String(intent),
    disabled,
    muted,
  };
}

/**
 * @param {Ov2BoardPathSessionLike|null} session
 * @param {import("./ov2BoardPathBootstrapContract").Ov2BoardPathSeatRowLike[]|null} seats
 */
function sessionRowEnded(session, seats) {
  if (!session) return false;
  if (session.you_won || session.opponent_won) return true;
  if (session.engine_state === "ended") return true;
  if (session.engine_phase === "ended" || session.phase === "ended") return true;
  if (Array.isArray(seats) && seats.length > 0 && getBoardPathWinner(session, seats)) return true;
  return false;
}

/** @param {Ov2BoardPathSessionLike|null} session */
function isTurnDataPartial(session, seats, memberCount) {
  if (!session) return true;
  if (sessionRowEnded(session, seats)) return false;
  const phase = session.phase ?? session.engine_phase;
  const seatsOk = Array.isArray(seats) && boardPathSeatsLookComplete(seats, memberCount);
  if (!seatsOk) return true;
  if (phase === "pregame" || phase === "playing") return false;
  return true;
}

function withStake(vm, members, selfKey, stakeFlow, stakeSummaryLine, seatsComplete, tier) {
  const stats = stakeStats(members, selfKey);
  /** @type {BoardPathViewModel} */
  const out = {
    ...vm,
    contextHydrationTier: tier,
    stakeFlow,
    stakeCounts: { total: stats.total, committed: stats.committed, selfCommitted: stats.selfCommitted },
    stakeSummaryLine,
    membersStakeUi: buildMembersStakeUi(members, selfKey),
  };
  if (seatsComplete !== undefined) out.seatsComplete = seatsComplete;
  return out;
}

function nStake(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

function nMatchSeq(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

/** Empty context → disconnected (no room / no self binding). */
export function createDisconnectedBoardPathContext() {
  return /** @type {Ov2BoardPathContext} */ ({
    room: null,
    members: [],
    session: null,
    self: null,
  });
}

/**
 * Derive UI state from an OV2-shaped context. Pure; safe with partial mock data.
 * @param {Ov2BoardPathContext|null|undefined} raw
 * @returns {BoardPathViewModel}
 */
function deriveBoardPathViewModelCore(raw) {
  const ctx = raw && typeof raw === "object" ? raw : createDisconnectedBoardPathContext();
  const room = ctx.room && typeof ctx.room === "object" ? ctx.room : null;
  const members = Array.isArray(ctx.members) ? ctx.members : [];
  const session = ctx.session && typeof ctx.session === "object" ? ctx.session : null;
  const seats = Array.isArray(ctx.seats) ? ctx.seats : null;
  const selfKey = ctx.self?.participant_key?.trim() || null;

  const productId = room?.product_game_id || ONLINE_V2_GAME_KINDS.BOARD_PATH;
  const minPlayers = getOv2MinPlayersForProduct(productId);
  const stake = room ? nStake(room.stake_per_seat) : 0;
  const matchSeq = room ? nMatchSeq(room.match_seq) : 0;
  const roomIdShort = room?.id ? String(room.id).slice(0, 8) : "—";
  const meta = {
    round: matchSeq > 0 ? `M${matchSeq}` : "—",
    table: roomIdShort,
    stake: stake > 0 ? stake.toLocaleString() : "—",
  };

  const tier = getBoardPathContextHydrationTier(ctx);

  if (!room || !selfKey) {
    return vmDisconnected(meta, tier);
  }

  const selfMember = members.find(m => m.participant_key === selfKey) || null;
  const count = members.length;
  const allReady = count > 0 && members.every(m => Boolean(m.is_ready));
  const allCommitted = count > 0 && members.every(m => m.wallet_state === "committed");
  const oppMembers = members.filter(m => m.participant_key !== selfKey);
  const opp = oppMembers[0] || null;
  const phase = room.lifecycle_phase;

  if (phase === ONLINE_V2_ROOM_PHASE.CLOSED || phase === ONLINE_V2_ROOM_PHASE.ABORTED) {
    return vmFinished(meta, selfMember, opp, session, members, selfKey, tier, seats);
  }

  if (phase === ONLINE_V2_ROOM_PHASE.LOBBY) {
    if (count < minPlayers) {
      return vmLobby(
        meta,
        BOARD_PATH_LOBBY_DETAIL.WAITING_PLAYERS,
        selfMember,
        opp,
        stake,
        count,
        minPlayers,
        members,
        selfKey,
        tier
      );
    }
    if (!allReady) {
      return vmLobby(meta, BOARD_PATH_LOBBY_DETAIL.NEED_READY, selfMember, opp, stake, count, minPlayers, members, selfKey, tier);
    }
    return vmLobby(meta, BOARD_PATH_LOBBY_DETAIL.READY_TO_START, selfMember, opp, stake, count, minPlayers, members, selfKey, tier);
  }

  if (phase === ONLINE_V2_ROOM_PHASE.PENDING_START) {
    return vmPendingStart(meta, selfMember, opp, stake, members, selfKey, tier);
  }

  if (phase === ONLINE_V2_ROOM_PHASE.PENDING_STAKES) {
    if (!selfMember || selfMember.wallet_state !== "committed") {
      return vmPendingStakesSelf(meta, selfMember, opp, stake, members, selfKey, tier);
    }
    if (!allCommitted) {
      return vmPendingStakesOthers(meta, selfMember, opp, stake, members, selfKey, tier);
    }
    return vmAllCommittedOpeningSession(meta, selfMember, opp, stake, room, members, selfKey, tier);
  }

  if (phase === ONLINE_V2_ROOM_PHASE.ACTIVE) {
    if (!room.active_session_id) {
      return vmActiveBootstrapping(meta, selfMember, opp, stake, room, members, selfKey, tier);
    }
    if (!boardPathSessionIdMatchesRoom(session, room)) {
      return vmSessionHydrating(meta, selfMember, opp, stake, room, members, selfKey, tier);
    }
    if (sessionRowEnded(session, seats)) {
      return vmFinished(meta, selfMember, opp, session, members, selfKey, tier, seats);
    }
    const seatsComplete = seats == null ? undefined : boardPathSeatsLookComplete(seats, count);
    const turnPartial = isTurnDataPartial(session, seats, count);
    if (seatsComplete === false || turnPartial) {
      return vmSessionReady(meta, selfMember, opp, session, members, selfKey, tier, seatsComplete, turnPartial, seats);
    }
    return vmSessionActive(meta, selfMember, opp, session, members, selfKey, tier, seatsComplete, seats);
  }

  if (phase === ONLINE_V2_ROOM_PHASE.SETTLING) {
    return vmFinished(meta, selfMember, opp, session, members, selfKey, tier, seats);
  }

  return vmDisconnected(meta, tier);
}

/**
 * @param {Ov2BoardPathContext|null|undefined} raw
 * @param {{
 *   actionPending?: null|"roll"|"move"|"end_turn",
 *   actionError?: { code?: string, message?: string }|null,
 *   liveSync?: Partial<{
 *     liveSyncEnabled: boolean,
 *     liveSyncState: "idle"|"subscribed"|"refreshing"|"error",
 *     liveRevision: number|string|null,
 *     sessionIdentity: string|null,
 *     isStale: boolean,
 *     lastSyncAt: number|null,
 *     syncError: { code?: string, message?: string }|null,
 *   }>,
 *   postFinish?: Record<string, unknown>|null,
 * }|null|undefined} [opts]
 * @returns {BoardPathViewModel}
 */
export function deriveBoardPathViewModel(raw, opts) {
  const actionOpts =
    opts && typeof opts === "object"
      ? { actionPending: opts.actionPending, actionError: opts.actionError }
      : null;
  const vm = deriveBoardPathViewModelCore(raw);
  let enriched = enrichBoardPathViewModelWithGameplay(raw, vm, actionOpts);
  const slice = opts && typeof opts === "object" && opts.liveSync && typeof opts.liveSync === "object" ? opts.liveSync : null;
  if (slice) {
    enriched = { ...enriched, ...slice };
  }
  const pf = opts && typeof opts === "object" && opts.postFinish && typeof opts.postFinish === "object" ? opts.postFinish : null;
  if (pf) {
    enriched = { ...enriched, ...pf };
  }
  return enriched;
}

/** @returns {BoardPathViewModel} */
function vmDisconnected(meta, tier) {
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.DISCONNECTED,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine: "No table — open Rooms from the hub to join or create a Board Path table.",
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.OPEN_ROOMS, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.REFRESH, true, true),
      tokenSlots: { you: null, opp: null },
      playerBadges: { you: "Offline", opp: "—" },
      youConnected: false,
      oppConnected: false,
      meta,
    },
    [],
    null,
    BOARD_PATH_STAKE_FLOW.IDLE,
    "No stake — not seated at a table.",
    undefined,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmLobby(meta, lobbyDetail, selfMember, opp, stake, count, minPlayers, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const youConnected = Boolean(selfMember);
  let statusLine = "";
  if (lobbyDetail === BOARD_PATH_LOBBY_DETAIL.WAITING_PLAYERS) {
    statusLine = `Waiting for players (${count}/${minPlayers}). Stake ${stake.toLocaleString()} each when the match starts.`;
  } else if (lobbyDetail === BOARD_PATH_LOBBY_DETAIL.NEED_READY) {
    statusLine = "Everyone must ready up before the host can start.";
  } else {
    statusLine = "Table ready — host can start the match.";
  }

  const { youSlot, oppSlot } = lobbyTokenSlots(lobbyDetail, oppConnected);

  return withStake(
    {
      coarse: BOARD_PATH_COARSE.LOBBY,
      lobbyDetail,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine,
      turnLine: undefined,
      primary: ctrl(
        BOARD_PATH_CONTROL_INTENT.READY_TOGGLE,
        true,
        lobbyDetail !== BOARD_PATH_LOBBY_DETAIL.NEED_READY
      ),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.LEAVE_TABLE, true, true),
      tokenSlots: { you: youSlot, opp: oppSlot },
      playerBadges: {
        you: selfMember?.is_ready ? "Ready" : "Not ready",
        opp: opp ? (opp.is_ready ? "Ready" : "Not ready") : "Waiting…",
      },
      youConnected,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.IDLE,
    `Stake ${stake.toLocaleString()}/seat · locks only after host start + stake phase (not yet).`,
    undefined,
    tier
  );
}

function lobbyTokenSlots(lobbyDetail, oppConnected) {
  if (lobbyDetail === BOARD_PATH_LOBBY_DETAIL.WAITING_PLAYERS && !oppConnected) return { you: 0, opp: null };
  if (lobbyDetail === BOARD_PATH_LOBBY_DETAIL.WAITING_PLAYERS) return { you: 0, opp: 0 };
  return { you: 0, opp: oppConnected ? 0 : null };
}

/** @returns {BoardPathViewModel} */
function vmPendingStart(meta, selfMember, opp, stake, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const { committed, total } = stakeStats(members, selfKey);
  const line = `Host started — stake lock (${stake.toLocaleString()} each) happens in the room; table shows ${committed}/${total} early commits if any.`;
  const stakeLine = `Pre-stake phase · ${committed}/${total} committed on server · use room UI to lock when unlocked`;
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.PENDING_START,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine: line,
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.COMMIT_STAKE, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.WAITING, true, true),
      tokenSlots: { you: 1, opp: oppConnected ? 1 : null },
      playerBadges: {
        you: selfMember?.wallet_state === "committed" ? "Staked" : "Not staked",
        opp: opp ? (opp.wallet_state === "committed" ? "Staked" : "Not staked") : "—",
      },
      youConnected: true,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.PRE_STAKES,
    stakeLine,
    undefined,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmPendingStakesSelf(meta, selfMember, opp, stake, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const { committed, total } = stakeStats(members, selfKey);
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.PENDING_STAKES,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine: `You still need to commit ${stake.toLocaleString()} in the room — ${committed}/${total} seats locked so far.`,
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.COMMIT_STAKE, true, false),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.WAITING, true, true),
      tokenSlots: { you: 1, opp: oppConnected ? 1 : null },
      playerBadges: {
        you: "You · not committed",
        opp: opp ? (opp.wallet_state === "committed" ? "Staked" : "Not committed") : "—",
      },
      youConnected: true,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.SELF_MUST_COMMIT,
    `You: pending · room ${committed}/${total} committed`,
    undefined,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmPendingStakesOthers(meta, selfMember, opp, stake, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const { committed, total } = stakeStats(members, selfKey);
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.PENDING_STAKES,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine: `You are committed — waiting for others (${committed}/${total} locked).`,
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.WAITING, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true),
      tokenSlots: { you: 2, opp: oppConnected ? 1 : null },
      playerBadges: {
        you: "You · staked",
        opp: opp ? (opp.wallet_state === "committed" ? "Staked" : "Not committed") : "—",
      },
      youConnected: true,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.WAITING_PEER_COMMITS,
    `You: locked · room needs ${total - committed} more commit(s)`,
    undefined,
    tier
  );
}

/** Transitional: every member committed while room still reports `pending_stakes` (server about to flip `active`). */
/** @returns {BoardPathViewModel} */
function vmAllCommittedOpeningSession(meta, selfMember, opp, stake, room, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const { total } = stakeStats(members, selfKey);
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.PENDING_STAKES,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.NONE,
      turnDataPartial: undefined,
      statusLine: "All stakes locked on the server — room should become active and open a board path session next.",
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.STARTING, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true),
      tokenSlots: { you: 2, opp: oppConnected ? 2 : null },
      playerBadges: { you: "Staked", opp: oppConnected ? "Staked" : "—" },
      youConnected: true,
      oppConnected,
      meta: { ...meta, table: room?.id ? String(room.id).slice(0, 8) : meta.table },
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.ALL_COMMITTED_OPENING_SESSION,
    `All ${total} committed · session bootstrap next`,
    undefined,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmActiveBootstrapping(meta, selfMember, opp, stake, room, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  const ok = boardPathRoomEligibleForSessionOpen(room, members);
  const statusLine = ok
    ? "Room active — waiting for `active_session_id` and board path session row from server."
    : "Room active but member wallet states look wrong — refresh from server.";
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.ACTIVE,
      lobbyDetail: null,
      activeDetail: BOARD_PATH_ACTIVE_DETAIL.BOOTSTRAPPING_SESSION,
      matchDetail: BOARD_PATH_MATCH_DETAIL.UNKNOWN,
      sessionPhase: BOARD_PATH_SESSION_PHASE.OPENING,
      turnDataPartial: undefined,
      statusLine,
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.OPENING_SESSION, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true),
      tokenSlots: { you: 2, opp: oppConnected ? 2 : null },
      playerBadges: { you: "Staked", opp: oppConnected ? "Staked" : "—" },
      youConnected: true,
      oppConnected,
      meta: {
        ...meta,
        table: room?.active_session_id ? String(room.active_session_id).slice(0, 8) : meta.table,
      },
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.ALL_COMMITTED_OPENING_SESSION,
    ok ? "Bootstrap: RPC should create session + seats, then set active_session_id" : "Bootstrap blocked — fix stake rows",
    undefined,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmSessionHydrating(meta, selfMember, opp, stake, room, members, selfKey, tier) {
  const oppConnected = Boolean(opp);
  return withStake(
    {
      coarse: BOARD_PATH_COARSE.ACTIVE,
      lobbyDetail: null,
      activeDetail: BOARD_PATH_ACTIVE_DETAIL.SESSION_HYDRATING,
      matchDetail: BOARD_PATH_MATCH_DETAIL.UNKNOWN,
      sessionPhase: BOARD_PATH_SESSION_PHASE.HYDRATING,
      turnDataPartial: undefined,
      statusLine:
        "Session id is on the room — loading `ov2_board_path_sessions` / seats (or session object not passed yet).",
      turnLine: undefined,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.LOADING_SESSION, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true),
      tokenSlots: { you: 2, opp: oppConnected ? 2 : null },
      playerBadges: { you: "Staked", opp: oppConnected ? "Staked" : "—" },
      youConnected: true,
      oppConnected,
      meta: {
        ...meta,
        table: room?.active_session_id ? String(room.active_session_id).slice(0, 8) : meta.table,
      },
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.SESSION_HYDRATING,
    "Hydrating: match session id to loaded session + optional seats[]",
    undefined,
    tier
  );
}

/** Session row matches room; seats or turn payload not ready for full play UI. */
/** @returns {BoardPathViewModel} */
function vmSessionReady(meta, selfMember, opp, session, members, selfKey, tier, seatsComplete, turnPartial, seats) {
  const oppConnected = Boolean(opp);
  const { you: yourSlot, opp: oppSlot } = pathSlotsForSessionView(session, selfKey);

  const parts = [];
  if (seatsComplete === false) parts.push("seats incomplete");
  if (turnPartial) parts.push("turn data partial");
  const detail = parts.length ? parts.join(" · ") : "assembling";

  const hasSeats = Boolean(session && Array.isArray(seats) && seats.length > 0);
  const statusLine = hasSeats
    ? `Session loaded — ${detail}. ${getBoardPathStatusLabel(session, seats, selfKey)}`
    : `Session loaded — ${detail}. Controls stay off until engine is ready.`;
  const turnLine = hasSeats
    ? `Turn ${getBoardPathTurnNumber(session)} · ${getBoardPathNextTurnPhaseLabel(session, seats, selfKey)}`
    : undefined;

  const L = hasSeats ? getBoardPathPathLength(session) : 30;
  const pm = hasSeats ? getBoardPathPositionMap(session, seats) : {};
  const youPos = selfKey ? pm[selfKey] ?? 0 : 0;
  const oppPk =
    hasSeats && selfKey ? seats.find(r => String(r.participant_key) !== String(selfKey))?.participant_key : null;
  const oppPos = oppPk ? pm[String(oppPk)] ?? 0 : null;

  return withStake(
    {
      coarse: BOARD_PATH_COARSE.ACTIVE,
      lobbyDetail: null,
      activeDetail: BOARD_PATH_ACTIVE_DETAIL.IN_MATCH,
      matchDetail: BOARD_PATH_MATCH_DETAIL.UNKNOWN,
      sessionPhase: BOARD_PATH_SESSION_PHASE.READY,
      turnDataPartial: Boolean(turnPartial),
      statusLine,
      turnLine,
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.SYNC_SESSION, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true),
      tokenSlots: { you: yourSlot, opp: oppSlot },
      playerBadges: {
        you: hasSeats ? `Space ${youPos}/${L}` : "Loading",
        opp: oppConnected ? (hasSeats && oppPos != null ? `Space ${oppPos}/${L}` : "Loading") : "—",
      },
      youConnected: true,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.IN_MATCH,
    `Session ready phase · ${detail}`,
    seatsComplete,
    tier
  );
}

/** Full in-match UI (session + seats OK, turn not partial). */
/** @returns {BoardPathViewModel} */
function vmSessionActive(meta, selfMember, opp, session, members, selfKey, tier, seatsComplete, seats) {
  const oppConnected = Boolean(opp);
  const { you: yourSlot, opp: oppSlot } = pathSlotsForSessionView(session, selfKey);

  const selfActive = sessionSelfIsActiveSeat(session, seats, selfKey);
  const matchDetail =
    selfActive === true
      ? BOARD_PATH_MATCH_DETAIL.YOUR_TURN
      : selfActive === false
        ? BOARD_PATH_MATCH_DETAIL.THEIR_TURN
        : BOARD_PATH_MATCH_DETAIL.UNKNOWN;

  const seatHint =
    seatsComplete === true ? "Seats OK" : seatsComplete === false ? "Seats incomplete" : "Seats not passed";

  const primary =
    selfActive === true
      ? ctrl(BOARD_PATH_CONTROL_INTENT.ROLL, true, true)
      : ctrl(BOARD_PATH_CONTROL_INTENT.WAITING, true, true);
  const secondary = ctrl(BOARD_PATH_CONTROL_INTENT.STAND_BY, true, true);

  const statusLine = `${getBoardPathStatusLabel(session, seats, selfKey)} · ${seatHint}`;
  const turnLine = `Turn ${getBoardPathTurnNumber(session)} · ${getBoardPathNextTurnPhaseLabel(session, seats, selfKey)}`;

  const L = getBoardPathPathLength(session);
  const pm = getBoardPathPositionMap(session, seats);
  const youPos = selfKey ? pm[selfKey] ?? 0 : 0;
  const oppPk = seats && selfKey ? seats.find(r => String(r.participant_key) !== String(selfKey))?.participant_key : null;
  const oppPos = oppPk ? pm[String(oppPk)] ?? 0 : null;
  const leader = getBoardPathLeader(session, seats);
  const leaderYou = Boolean(leader && selfKey && leader.participantKey === selfKey);
  const leaderOpp = Boolean(leader && oppPk && leader.participantKey === String(oppPk));

  return withStake(
    {
      coarse: BOARD_PATH_COARSE.ACTIVE,
      lobbyDetail: null,
      activeDetail: BOARD_PATH_ACTIVE_DETAIL.IN_MATCH,
      matchDetail,
      sessionPhase: BOARD_PATH_SESSION_PHASE.ACTIVE,
      turnDataPartial: false,
      statusLine,
      turnLine,
      primary,
      secondary,
      tokenSlots: { you: yourSlot, opp: oppSlot },
      playerBadges: {
        you: `Space ${youPos}/${L}${leaderYou ? " · lead" : ""}`,
        opp: oppConnected && oppPos != null ? `Space ${oppPos}/${L}${leaderOpp ? " · lead" : ""}` : "—",
      },
      youConnected: true,
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.IN_MATCH,
    `Stakes settled · session live · ${seatHint.toLowerCase()}`,
    seatsComplete,
    tier
  );
}

/** @returns {BoardPathViewModel} */
function vmFinished(meta, selfMember, opp, session, members, selfKey, tier, seats) {
  const oppConnected = Boolean(opp);
  let youWon = Boolean(session?.you_won);
  let oppWon = Boolean(session?.opponent_won);
  const w =
    session && typeof session === "object" && Array.isArray(seats) && seats.length > 0
      ? getBoardPathWinner(session, seats)
      : null;
  if (!youWon && !oppWon && w && selfKey) {
    youWon = w.participantKey === selfKey;
    oppWon = Boolean(opp && w.participantKey === opp.participant_key);
  }

  let statusLine = "Match finished — board locked.";
  if (youWon) statusLine = "You reached the finish — match finished.";
  else if (oppWon) statusLine = "Opponent finished — match over.";
  else if (w && selfKey && Array.isArray(seats) && seats.length > 0)
    statusLine = getBoardPathStatusLabel(session, seats, selfKey);

  const { you: finYouSlot, opp: finOppSlot } =
    session && selfKey ? pathTokenSlotsFromBoardState(session, selfKey) : { you: PATH_SLOTS - 1, opp: null };

  return withStake(
    {
      coarse: BOARD_PATH_COARSE.FINISHED,
      lobbyDetail: null,
      activeDetail: null,
      matchDetail: null,
      sessionPhase: BOARD_PATH_SESSION_PHASE.FINISHED,
      turnDataPartial: undefined,
      statusLine,
      turnLine: "Final",
      primary: ctrl(BOARD_PATH_CONTROL_INTENT.NEW_MATCH, true, true),
      secondary: ctrl(BOARD_PATH_CONTROL_INTENT.REMATCH, true, true),
      tokenSlots: {
        you: finYouSlot ?? PATH_SLOTS - 1,
        opp: oppConnected ? (finOppSlot ?? PATH_SLOTS - 1) : null,
      },
      playerBadges: { you: youWon ? "Winner" : "Finished", opp: oppConnected ? (oppWon ? "Winner" : "Finished") : "—" },
      youConnected: Boolean(selfMember),
      oppConnected,
      meta,
    },
    members,
    selfKey,
    BOARD_PATH_STAKE_FLOW.IDLE,
    "Stake flow done for this match — settlement handled server-side later",
    undefined,
    tier
  );
}

/**
 * Named mock contexts for build-first / Storybook-style use (no DB).
 * Keys are stable scenario ids for the dev picker.
 */
export const OV2_BOARD_PATH_MOCK_SCENARIOS = {
  disconnected: () => createDisconnectedBoardPathContext(),

  lobby_waiting_players: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000001",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.LOBBY,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: false, wallet_state: "none", display_name: "You" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  lobby_need_ready: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000002",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.LOBBY,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: false, wallet_state: "none", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "none", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  lobby_ready_to_start: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000003",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.LOBBY,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "none", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "none", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  pending_start: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000004",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.PENDING_START,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "none", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "none", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  pending_stakes_need_you: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000005",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.PENDING_STAKES,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "none", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  pending_stakes_waiting: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000006",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.PENDING_STAKES,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "none", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  active_bootstrapping: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000007",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
        host_participant_key: "self-demo",
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  active_your_turn: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000008",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000aa01",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: {
        id: "00000000-0000-4000-8000-00000000aa01",
        version: 1,
        revision: 0,
        engine_phase: "playing",
        turnMeta: { turnNumber: 1, activeSeatIndex: 1, startedAt: 0 },
        boardState: { pathLength: 30, positions: { "opp-demo": 12, "self-demo": 18 } },
        eventLog: [],
        lastEvent: null,
      },
      seats: [
        {
          id: "00000000-0000-4000-8000-00000000aa10",
          session_id: "00000000-0000-4000-8000-00000000aa01",
          seat_index: 0,
          participant_key: "opp-demo",
        },
        {
          id: "00000000-0000-4000-8000-00000000aa11",
          session_id: "00000000-0000-4000-8000-00000000aa01",
          seat_index: 1,
          participant_key: "self-demo",
        },
      ],
      self: { participant_key: "self-demo" },
    }),

  active_their_turn: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-000000000009",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000aa02",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: {
        id: "00000000-0000-4000-8000-00000000aa02",
        version: 1,
        revision: 0,
        engine_phase: "playing",
        turnMeta: { turnNumber: 2, activeSeatIndex: 0, startedAt: 0 },
        boardState: { pathLength: 30, positions: { "opp-demo": 20, "self-demo": 10 } },
        eventLog: [],
        lastEvent: null,
      },
      seats: [
        {
          id: "00000000-0000-4000-8000-00000000aa20",
          session_id: "00000000-0000-4000-8000-00000000aa02",
          seat_index: 0,
          participant_key: "opp-demo",
        },
        {
          id: "00000000-0000-4000-8000-00000000aa21",
          session_id: "00000000-0000-4000-8000-00000000aa02",
          seat_index: 1,
          participant_key: "self-demo",
        },
      ],
      self: { participant_key: "self-demo" },
    }),

  /** Session row + 2 seats; `pregame` + empty `turn` → `SESSION_PHASE.ready` until engine advances. */
  active_pregame_two_seats: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-00000000000e",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000ee01",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: {
        id: "00000000-0000-4000-8000-00000000ee01",
        version: 1,
        revision: 0,
        engine_phase: "pregame",
        turnMeta: { turnNumber: 1, activeSeatIndex: null, startedAt: 0 },
        boardState: { pathLength: 30, positions: { "self-demo": 0, "opp-demo": 0 } },
        eventLog: [],
        lastEvent: null,
      },
      seats: [
        {
          id: "00000000-0000-4000-8000-00000000ee10",
          session_id: "00000000-0000-4000-8000-00000000ee01",
          seat_index: 0,
          participant_key: "self-demo",
        },
        {
          id: "00000000-0000-4000-8000-00000000ee11",
          session_id: "00000000-0000-4000-8000-00000000ee01",
          seat_index: 1,
          participant_key: "opp-demo",
        },
      ],
      self: { participant_key: "self-demo" },
    }),

  finished_you_won: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-00000000000a",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.SETTLING,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000aa03",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: {
        id: "00000000-0000-4000-8000-00000000aa03",
        version: 1,
        revision: 0,
        engine_phase: "ended",
        turnMeta: { turnNumber: 1, activeSeatIndex: null, startedAt: 0 },
        boardState: { pathLength: 30, positions: { "self-demo": 30, "opp-demo": 10 } },
        eventLog: [],
        lastEvent: null,
        you_won: true,
        opponent_won: false,
      },
      self: { participant_key: "self-demo" },
    }),

  /** Transitional OV2 row state: all wallets committed before `active`. */
  pending_stakes_all_committed: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-00000000000b",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.PENDING_STAKES,
        stake_per_seat: 1000,
        match_seq: 0,
        active_session_id: null,
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  /** `active_session_id` set on room; client has not hydrated session object yet. */
  active_session_hydrating: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-00000000000c",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000bb01",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: null,
      self: { participant_key: "self-demo" },
    }),

  /** Session row matches room id; `seats` array short (still loading). */
  active_seats_partial: () =>
    /** @type {Ov2BoardPathContext} */ ({
      room: {
        id: "00000000-0000-4000-8000-00000000000d",
        lifecycle_phase: ONLINE_V2_ROOM_PHASE.ACTIVE,
        stake_per_seat: 1000,
        match_seq: 1,
        active_session_id: "00000000-0000-4000-8000-00000000cc01",
        product_game_id: ONLINE_V2_GAME_KINDS.BOARD_PATH,
      },
      members: [
        { participant_key: "self-demo", is_ready: true, wallet_state: "committed", display_name: "You" },
        { participant_key: "opp-demo", is_ready: true, wallet_state: "committed", display_name: "Opp" },
      ],
      session: {
        id: "00000000-0000-4000-8000-00000000cc01",
        version: 1,
        revision: 0,
        engine_phase: "playing",
        turnMeta: { turnNumber: 1, activeSeatIndex: 0, startedAt: 0 },
        boardState: { pathLength: 30, positions: { "self-demo": 12, "opp-demo": 12 } },
        eventLog: [],
        lastEvent: null,
      },
      seats: [
        {
          id: "00000000-0000-4000-8000-00000000dd01",
          session_id: "00000000-0000-4000-8000-00000000cc01",
          seat_index: 0,
          participant_key: "self-demo",
        },
      ],
      self: { participant_key: "self-demo" },
    }),
};

/** Labels for dev scenario picker (build-first). */
export const OV2_BOARD_PATH_MOCK_SCENARIO_LABELS = Object.freeze({
  disconnected: "Disconnected",
  lobby_waiting_players: "Lobby · waiting players",
  lobby_need_ready: "Lobby · need ready",
  lobby_ready_to_start: "Lobby · ready to start",
  pending_start: "Pending start",
  pending_stakes_need_you: "Pending stakes · you owe",
  pending_stakes_waiting: "Pending stakes · waiting others",
  active_bootstrapping: "Active · session bootstrapping",
  active_your_turn: "Active · your turn",
  active_their_turn: "Active · their turn",
  finished_you_won: "Finished · you won",
  pending_stakes_all_committed: "Pending stakes · all committed (transitional)",
  active_session_hydrating: "Active · session id only (hydrating)",
  active_seats_partial: "Active · session + partial seats",
  active_pregame_two_seats: "Active · pregame + seats (ready phase)",
});

export const OV2_BOARD_PATH_MOCK_SCENARIO_KEYS = /** @type {(keyof typeof OV2_BOARD_PATH_MOCK_SCENARIOS)[]} */ (
  Object.keys(OV2_BOARD_PATH_MOCK_SCENARIOS)
);
