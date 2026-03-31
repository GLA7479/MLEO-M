/**
 * OV2 Ludo — **session adapter** (single boundary between network/RPC state and UI).
 *
 * Responsibilities:
 * - Play-mode resolution, seat hints from `ov2_room_members`, snapshot normalization.
 * - Supabase RPC + Realtime (`ov2_ludo_*` migrations). **Safe when SQL is not applied** — missing RPC/tables → `null` / soft errors.
 *
 * Do not put React hooks here. Do not import the board view. Pure JS only.
 */

import { supabaseMP as supabase } from "../../supabaseClients";

/** Product id on `ov2_rooms.product_game_id` for this vertical slice. */
export const OV2_LUDO_PRODUCT_GAME_ID = "ov2_ludo";

/** @typedef {{ room?: object|null, members?: unknown[], self?: { participant_key?: string } }} Ov2LudoContextInput */

/**
 * Board payload carried inside snapshots — same logical shape as {@link createInitialBoard} in `ov2LudoEngine.js`
 * (`seatCount`, `activeSeats`, `turnSeat`, `dice`, `lastDice`, `pieces`, `finished`, `winner`, optional `extraTurn`).
 *
 * @typedef {Object} Ov2LudoBoardState
 * @property {number} seatCount
 * @property {number[]} activeSeats
 * @property {number|null} turnSeat
 * @property {number|null} dice — current face after roll, awaiting move (or null between actions per server rules)
 * @property {number|null} lastDice
 * @property {Record<string, number[]>} pieces — keys `"0"`..`"3"`, values piece positions per engine
 * @property {Record<string, number>} finished
 * @property {number|null} winner
 * @property {boolean} [extraTurn]
 */

/**
 * Single source of truth for **future** live Ludo UI once RPC + Realtime exist.
 * Server owns dice RNG, turn order, move validation, finish, and settlement.
 *
 * @typedef {Object} Ov2LudoAuthoritativeSnapshot
 * @property {string|number} revision — monotonic version / logical clock for optimistic concurrency (required when live)
 * @property {string} sessionId — authoritative match/session row id
 * @property {string} roomId — OV2 room id this session belongs to
 * @property {string} phase — e.g. `lobby` | `playing` | `finished` | `cancelled` (exact enum = SQL contract)
 * @property {number[]} activeSeats — seat indices in play for this match (subset of 0..3)
 * @property {number|null} mySeat — this client’s assigned ring seat, or null if spectator / not seated / unknown
 * @property {Ov2LudoBoardState} board — authoritative board; must match engine semantics consumed by `ov2LudoBoardView`
 * @property {number|null} turnSeat — whose turn (redundant with `board.turnSeat` if kept in sync; snapshot may duplicate for clarity)
 * @property {number|null} dice — mirror of `board.dice` when server exposes it at snapshot root
 * @property {number|null} lastDice
 * @property {number|null} winnerSeat — mirror of `board.winner` when finished
 * @property {boolean} canClientRoll — server: “this client may invoke roll RPC now”
 * @property {boolean} canClientMovePiece — server: “this client may invoke move RPC now”
 * @property {boolean} boardViewReadOnly — aggregate UX flag: no dice/piece interaction (spectator, finished, wrong phase, etc.)
 * @property {Ov2LudoLastActionMeta|null} [lastAction] — optional audit / animation hints
 * @property {number[]|null} [legalMovablePieceIndices] — optional server list of movable piece indices for `mySeat`’s turn; if omitted, client may derive via `listMovablePieces` on `board`
 * @property {number|null} [turnDeadline] — epoch ms deadline for current turn
 * @property {Record<string, unknown>|null} [doubleState] — old parity double state payload
 * @property {Record<string, unknown>|null} [result] — old parity result payload
 * @property {Record<string, number>|null} [missedTurns] — old parity missed-turn counters by seat/player key
 */

/**
 * @typedef {Object} Ov2LudoLastActionMeta
 * @property {'roll'|'move'|'pass'|'finish'|string} type
 * @property {number} [bySeat]
 * @property {number} [pieceIndex]
 * @property {number} [diceValue]
 * @property {string} [at] — ISO timestamp from server
 */

export const OV2_LUDO_PLAY_MODE = Object.freeze({
  /** No OV2 room in context — local sandbox only (`ov2LudoLocalPreview.js`). */
  PREVIEW_LOCAL: "preview_local",
  /** Room row present; no authoritative snapshot yet — UI read-only, honest placeholder. */
  LIVE_ROOM_NO_MATCH_YET: "live_room_no_match_yet",
  /** Non-null {@link Ov2LudoAuthoritativeSnapshot} for this room — interactive when snapshot flags allow. */
  LIVE_MATCH_ACTIVE: "live_match_active",
});

/**
 * Sandbox-only: which ring seat index the human drives in `PREVIEW_LOCAL`.
 * Not a database seat claim. Replaced by `mySeat` from {@link Ov2LudoAuthoritativeSnapshot} when live.
 */
export const OV2_LUDO_PREVIEW_CONTROLLED_SEAT_INDEX = 0;

/**
 * @param {Ov2LudoContextInput|null|undefined} baseContext
 * @param {Ov2LudoAuthoritativeSnapshot|null|undefined} authoritativeSnapshot — when non-null, session is live for UI branching
 * @returns {(typeof OV2_LUDO_PLAY_MODE)[keyof typeof OV2_LUDO_PLAY_MODE]}
 */
export function resolveOv2LudoPlayMode(baseContext, authoritativeSnapshot = null) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  if (!roomId) return OV2_LUDO_PLAY_MODE.PREVIEW_LOCAL;
  if (authoritativeSnapshot == null) return OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET;
  return OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE;
}

/**
 * ## Live seat resolution contract (pre-SQL)
 *
 * - **Seat index** is an integer 0..3 matching `board.activeSeats` / `pieces` keys — the ring position in engine space,
 *   not arbitrary user ids.
 * - **Source of truth (future):** a Ludo-specific seat table or columns on match/session rows linking
 *   `participant_key` (or profile id) → `seat_index` for a given `session_id`. Room membership alone does not imply a seat.
 * - **Before a seat exists:** `mySeat === null` — UI treats the user as not playing this match (spectator or waiting).
 * - **In room but not in match:** still `mySeat === null` until the server assigns a seat for the active session.
 * - **Resolved null:** never fabricate a seat client-side; board stays read-only or spectator mode from snapshot flags.
 *
 * @param {unknown[]} members — room member rows from OV2 API (shape TBD by schema)
 * @param {string|null} selfParticipantKey — this device’s `participant_key`
 * @returns {number|null} Lobby `seat_index` on the member row (0..3) when set; else null. Prefer `snapshot.mySeat` when live.
 */
export function resolveOv2LudoMySeatFromRoomMembers(members, selfParticipantKey) {
  const pk = selfParticipantKey != null ? String(selfParticipantKey).trim() : "";
  if (!pk || !Array.isArray(members)) return null;
  const row = members.find(m => m && typeof m === "object" && String(m.participant_key) === pk);
  if (!row || row.seat_index == null) return null;
  const si = Number(row.seat_index);
  if (!Number.isInteger(si) || si < 0 || si > 3) return null;
  return si;
}

/**
 * Pre-session seat strip: seated members in the same order as `ov2_ludo_open_session`
 * (`seat_index ASC`, then `participant_key`). Up to four slots; empty slots show "—".
 *
 * @param {unknown[]} members
 * @param {string|null} selfParticipantKey
 * @returns {{ labels: string[], selfRingIndex: number|null }}
 */
export function buildLudoLobbySeatStripFromMembers(members, selfParticipantKey) {
  const pk = selfParticipantKey != null ? String(selfParticipantKey).trim() : "";
  const seated = (Array.isArray(members) ? members : [])
    .filter(m => m && typeof m === "object" && m.seat_index != null)
    .sort((a, b) => {
      const as = a.seat_index != null && a.seat_index !== "" ? Number(a.seat_index) : null;
      const bs = b.seat_index != null && b.seat_index !== "" ? Number(b.seat_index) : null;
      const aOk = as != null && Number.isFinite(as);
      const bOk = bs != null && Number.isFinite(bs);
      if (aOk && bOk && as !== bs) return as - bs;
      if (aOk && !bOk) return -1;
      if (!aOk && bOk) return 1;
      return String(a.participant_key || "").localeCompare(String(b.participant_key || ""));
    })
    .slice(0, 4);

  const labels = [0, 1, 2, 3].map(i => {
    const m = seated[i];
    if (!m) return `Seat ${i + 1} · —`;
    const name = String(m.display_name || "Player").trim() || "Player";
    return `Seat ${i + 1} · ${name}`;
  });

  let selfRingIndex = null;
  if (pk) {
    const idx = seated.findIndex(m => String(m.participant_key) === pk);
    if (idx >= 0) selfRingIndex = idx;
  }

  return { labels, selfRingIndex };
}

/**
 * @param {Ov2LudoAuthoritativeSnapshot|null|undefined} snapshot
 * @returns {Ov2LudoBoardState|null}
 */
export function mapAuthoritativeSnapshotToBoard(snapshot) {
  if (!snapshot?.board || typeof snapshot.board !== "object") return null;
  return snapshot.board;
}

/**
 * @param {unknown} err
 * @returns {boolean}
 */
export function isOv2LudoBackendUnavailableError(err) {
  const code = err && typeof err === "object" ? /** @type {{ code?: string }} */ (err).code : undefined;
  const msg = String(err && typeof err === "object" && "message" in err ? err.message : err || "").toLowerCase();
  if (code === "PGRST202" || code === "42P01" || code === "42704" || code === "42883") return true;
  if (msg.includes("does not exist") || msg.includes("schema cache") || msg.includes("undefined table")) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} raw
 * @returns {Ov2LudoAuthoritativeSnapshot|null}
 */
export function normalizeAuthoritativeSnapshot(raw) {
  if (!raw || typeof raw !== "object") return null;
  const board = raw.board;
  if (!board || typeof board !== "object") return null;

  const myRaw = raw.mySeat;
  let mySeat = null;
  if (myRaw !== null && myRaw !== undefined && myRaw !== "null") {
    const n = Number(myRaw);
    if (Number.isInteger(n) && n >= 0 && n <= 3) mySeat = n;
  }

  let legal = null;
  if (Array.isArray(raw.legalMovablePieceIndices)) {
    legal = raw.legalMovablePieceIndices.map(x => Number(x)).filter(x => Number.isInteger(x) && x >= 0 && x <= 3);
  }

  const diceRaw = raw.dice;
  const dice =
    diceRaw === null || diceRaw === undefined || diceRaw === "null" ? null : Number(diceRaw);
  const lastDiceRaw = raw.lastDice;
  const lastDiceSnap =
    lastDiceRaw === null || lastDiceRaw === undefined || lastDiceRaw === "null" ? null : Number(lastDiceRaw);

  const winnerRaw = raw.winnerSeat;
  const winnerSeat =
    winnerRaw === null || winnerRaw === undefined || winnerRaw === "null" ? null : Number(winnerRaw);

  return {
    revision: raw.revision != null ? Number(raw.revision) : 0,
    sessionId: String(raw.sessionId ?? ""),
    roomId: String(raw.roomId ?? ""),
    phase: String(raw.phase ?? ""),
    activeSeats: Array.isArray(raw.activeSeats) ? raw.activeSeats.map(x => Number(x)) : [],
    mySeat,
    board: /** @type {Ov2LudoBoardState} */ (board),
    turnSeat: raw.turnSeat != null ? Number(raw.turnSeat) : null,
    dice: dice != null && !Number.isNaN(dice) ? dice : null,
    lastDice: lastDiceSnap != null && !Number.isNaN(lastDiceSnap) ? lastDiceSnap : null,
    winnerSeat: winnerSeat != null && !Number.isNaN(winnerSeat) ? winnerSeat : null,
    canClientRoll: raw.canClientRoll === true,
    canClientMovePiece: raw.canClientMovePiece === true,
    boardViewReadOnly: raw.boardViewReadOnly === true,
    legalMovablePieceIndices: legal,
    turnDeadline:
      raw.turnDeadline == null || Number.isNaN(Number(raw.turnDeadline)) ? null : Number(raw.turnDeadline),
    doubleState: raw.doubleState && typeof raw.doubleState === "object" ? /** @type {Record<string, unknown>} */ (raw.doubleState) : null,
    doubleCycleUsedSeats: Array.isArray(raw.doubleCycleUsedSeats)
      ? raw.doubleCycleUsedSeats.map(x => Number(x)).filter(x => Number.isInteger(x) && x >= 0 && x <= 3)
      : [],
    result: raw.result && typeof raw.result === "object" ? /** @type {Record<string, unknown>} */ (raw.result) : null,
    missedTurns:
      raw.missedTurns && typeof raw.missedTurns === "object"
        ? /** @type {Record<string, number>} */ (raw.missedTurns)
        : null,
  };
}

function parseRollMoveRpcPayload(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true && d.snapshot) {
    const snap = normalizeAuthoritativeSnapshot(/** @type {Record<string, unknown>} */ (d.snapshot));
    if (!snap) return { ok: false, error: "Invalid snapshot" };
    return { ok: true, snapshot: snap };
  }
  if (d.ok === false) {
    const msg = typeof d.message === "string" ? d.message : "Request failed";
    const code = typeof d.code === "string" ? d.code : undefined;
    return { ok: false, error: msg, code };
  }
  return { ok: false, error: "Invalid response" };
}

// --- Read path (RPC + Realtime) ---

/**
 * @param {string} roomId
 * @param {{ signal?: AbortSignal, participantKey?: string|null }} [_opts]
 * @returns {Promise<Ov2LudoAuthoritativeSnapshot|null>}
 */
export async function fetchOv2LudoAuthoritativeSnapshot(roomId, _opts) {
  if (!roomId) return null;
  const participantKey = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_get_snapshot", {
      p_room_id: roomId,
      p_participant_key: participantKey,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return null;
      return null;
    }
    if (!data || typeof data !== "object") return null;
    const body = /** @type {Record<string, unknown>} */ (data);
    if (body.ok !== true || !body.snapshot) return null;
    return normalizeAuthoritativeSnapshot(/** @type {Record<string, unknown>} */ (body.snapshot));
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return null;
    return null;
  }
}

/**
 * @typedef {Object} Ov2LudoSnapshotSubscriptionHandlers
 * @property {string|null} [participantKey]
 * @property {(snapshot: Ov2LudoAuthoritativeSnapshot) => void} onSnapshot
 * @property {(err: Error) => void} [onError]
 */

/**
 * @param {string} roomId
 * @param {Ov2LudoSnapshotSubscriptionHandlers} handlers
 * @returns {() => void} unsubscribe
 */
export function subscribeOv2LudoAuthoritativeSnapshot(roomId, handlers) {
  if (!roomId || typeof handlers?.onSnapshot !== "function") {
    return () => {};
  }
  const pk = handlers.participantKey != null ? String(handlers.participantKey).trim() : "";
  let cancelled = false;

  const pushLatest = async () => {
    if (cancelled) return;
    const snap = await fetchOv2LudoAuthoritativeSnapshot(roomId, { participantKey: pk });
    if (snap && !cancelled) handlers.onSnapshot(snap);
  };

  try {
    const channel = supabase
      .channel(`ov2-ludo:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_ludo_sessions", filter: `room_id=eq.${roomId}` },
        () => {
          void pushLatest();
        }
      )
      .subscribe((status, err) => {
        if (status === "CHANNEL_ERROR" && handlers.onError) {
          handlers.onError(err instanceof Error ? err : new Error(String(err ?? "Realtime error")));
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  } catch (e) {
    if (handlers.onError) {
      handlers.onError(e instanceof Error ? e : new Error(String(e)));
    }
    return () => {};
  }
}

/** @deprecated Use {@link fetchOv2LudoAuthoritativeSnapshot}. */
export async function fetchOv2LudoLiveSessionSnapshot() {
  return null;
}

/** @deprecated Use in-memory cache next to subscribe pipeline when implemented. */
export function getOv2LudoLiveSessionSnapshotCached() {
  return null;
}

// --- Write path (RPC boundaries; server validates all rules) ---

/**
 * @typedef {Object} Ov2LudoRpcResult
 * @property {boolean} ok
 * @property {string} [error]
 * @property {Ov2LudoAuthoritativeSnapshot} [snapshot] — optional fresh snapshot after mutation
 */

/**
 * @typedef {{ revision?: string|number, participantKey?: string|null }} Ov2LudoRpcOpts
 */

/**
 * Room host opens first session.
 * @param {string} roomId
 * @param {string} participantKey
 * @param {{ presenceLeaderKey?: string|null }} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoOpenSession(roomId, participantKey, _opts) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  const leader = _opts?.presenceLeaderKey != null ? String(_opts.presenceLeaderKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  if (!leader) return { ok: false, error: "presence leader key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_open_session", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_presence_leader_key: leader,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo backend not available (migrations not applied?)" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function parseLudoIntentOkPayload(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) {
    return { ok: true, idempotent: d.idempotent === true };
  }
  if (d.ok === false) {
    const msg = typeof d.message === "string" ? d.message : "Request failed";
    const code = typeof d.code === "string" ? d.code : undefined;
    return { ok: false, error: msg, code };
  }
  return { ok: false, error: "Invalid response" };
}

function parseLudoStartNextMatchPayload(data) {
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid response" };
  }
  const d = /** @type {Record<string, unknown>} */ (data);
  if (d.ok === true) {
    return {
      ok: true,
      matchSeq: d.match_seq != null ? Number(d.match_seq) : undefined,
      room: d.room && typeof d.room === "object" ? /** @type {Record<string, unknown>} */ (d.room) : undefined,
      members: Array.isArray(d.members) ? /** @type {unknown[]} */ (d.members) : undefined,
    };
  }
  if (d.ok === false) {
    const msg = typeof d.message === "string" ? d.message : "Request failed";
    const code = typeof d.code === "string" ? d.code : undefined;
    return { ok: false, error: msg, code, ready: d.ready, eligible: d.eligible };
  }
  return { ok: false, error: "Invalid response" };
}

/**
 * Seated committed member requests rematch after the active session is finished.
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<{ ok: boolean, idempotent?: boolean, error?: string, code?: string }>}
 */
export async function requestOv2LudoRequestRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_request_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo rematch backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseLudoIntentOkPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo rematch backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Withdraw rematch request (finished session only).
 * @param {string} roomId
 * @param {string} participantKey
 * @returns {Promise<{ ok: boolean, idempotent?: boolean, error?: string, code?: string }>}
 */
export async function requestOv2LudoCancelRematch(roomId, participantKey) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_cancel_rematch", {
      p_room_id: roomId,
      p_participant_key: pk,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo rematch backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseLudoIntentOkPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo rematch backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Host only: all seated committed players must have requested rematch; resets room to pending_stakes.
 * @param {string} roomId
 * @param {string} participantKey
 * @param {number|null|undefined} expectedMatchSeq
 * @returns {Promise<{ ok: boolean, error?: string, code?: string, matchSeq?: number, room?: Record<string, unknown>, members?: unknown[], ready?: unknown, eligible?: unknown }>}
 */
export async function requestOv2LudoStartNextMatch(roomId, participantKey, expectedMatchSeq) {
  const pk = participantKey != null ? String(participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_start_next_match", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_match_seq:
        expectedMatchSeq != null && Number.isFinite(Number(expectedMatchSeq)) ? Math.floor(Number(expectedMatchSeq)) : null,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo rematch backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseLudoStartNextMatchPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo rematch backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId — unused server-side today; kept for API stability
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoRollDice(roomId, sessionId, _opts) {
  void sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_roll", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @param {number} pieceIndex
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoMovePiece(roomId, sessionId, pieceIndex, _opts) {
  void sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_move", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_piece_index: pieceIndex,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) {
      if (isOv2LudoBackendUnavailableError(error)) return { ok: false, error: "Ludo backend not available" };
      return { ok: false, error: error.message || String(error) };
    }
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    if (isOv2LudoBackendUnavailableError(e)) return { ok: false, error: "Ludo backend not available" };
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoOfferDouble(roomId, sessionId, _opts) {
  void sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_offer_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @param {"accept"|"decline"} answer
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoRespondDouble(roomId, sessionId, answer, _opts) {
  void sessionId;
  const pk = _opts?.participantKey != null ? String(_opts.participantKey).trim() : "";
  if (!roomId || !pk) return { ok: false, error: "room_id and participant_key required" };
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_respond_double", {
      p_room_id: roomId,
      p_participant_key: pk,
      p_answer: answer,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {number} turnSeat
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoMarkMissedTurn(roomId, turnSeat, _opts) {
  const rev = _opts?.revision;
  const turnParticipantKey =
    _opts && "participantKey" in _opts && _opts.participantKey != null ? String(_opts.participantKey).trim() : "";
  const isGone = _opts && "isGone" in _opts ? _opts.isGone === true : false;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_mark_missed_turn", {
      p_room_id: roomId,
      p_turn_seat: Number(turnSeat),
      p_turn_participant_key: turnParticipantKey,
      p_turn_is_gone: isGone,
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {number} expiredSeat
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoHandleDoubleTimeout(roomId, expiredSeat, _opts) {
  const rev = _opts?.revision;
  try {
    const { data, error } = await supabase.rpc("ov2_ludo_handle_double_timeout", {
      p_room_id: roomId,
      p_expired_seat: Number(expiredSeat),
      p_expected_revision: rev != null && rev !== "" ? Number(rev) : null,
    });
    if (error) return { ok: false, error: error.message || String(error) };
    return parseRollMoveRpcPayload(data);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @param {Ov2LudoRpcOpts} [_opts]
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoPassTurnAfterRoll(roomId, sessionId, _opts) {
  void roomId;
  void sessionId;
  void _opts;
  return { ok: false, error: "Not implemented — auto-pass is server-side in ov2_ludo_roll." };
}

/**
 * @param {string} roomId
 * @param {string} sessionId
 * @returns {Promise<Ov2LudoRpcResult>}
 */
export async function requestOv2LudoResign(roomId, sessionId) {
  void roomId;
  void sessionId;
  return { ok: false, error: "Not implemented." };
}

/**
 * SQL: `015_ov2_ludo_schema.sql`, `016_ov2_ludo_rpcs.sql`, `017_ov2_ludo_realtime.sql`.
 */
