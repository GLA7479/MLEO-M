import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2SnakesSnapshot,
  OV2_SNAKES_PRODUCT_GAME_ID,
  requestOv2SnakesRoll,
  subscribeOv2SnakesSnapshot,
} from "../lib/online-v2/snakes-and-ladders/ov2SnakesSessionApi";
import { requestOv2SnakesClaimSettlement } from "../lib/online-v2/snakes-and-ladders/ov2SnakesSettlement";
import { applyOv2SettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/ov2SettlementVaultDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";
import { fetchOv2SnakesBoardEdgesFromDb } from "../lib/online-v2/snakes-and-ladders/ov2SnakesBoardEdgesFetch";
import {
  OV2_SNAKES_BOARD_EDGES,
  ov2SnakesCellAfterDice,
  ov2SnakesClassifyEdge,
} from "../lib/online-v2/snakes-and-ladders/ov2SnakesBoardEdges";

/** Hold on ladder foot / snake head before showing the slide endpoint (ms). */
const OV2_SNAKES_EDGE_HOLD_MS = 980;
/** Keep pawn on final cell after edge before clearing motion overlay (ms). */
const OV2_SNAKES_EDGE_LAND_MS = 1200;
/** Delay between each step along the dice path (ms). */
const OV2_SNAKES_WALK_STEP_MS = 88;
/** Pause on final dice cell when there is no ladder/snake (ms). */
const OV2_SNAKES_WALK_SETTLE_MS = 160;

/** @param {any} snap */
function readSeatPos(snap, seat) {
  const b = snap?.board?.positions;
  if (!b || typeof b !== "object") return null;
  const v = b[String(seat)] ?? b[seat];
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/** @returns {number|null} seat index if exactly one position changed between snapshots */
function findSingleMovedSeat(prev, next) {
  /** @type {number[]} */
  const changed = [];
  for (let si = 0; si <= 3; si += 1) {
    const a = readSeatPos(prev, si);
    const b = readSeatPos(next, si);
    if (a !== b) changed.push(si);
  }
  return changed.length === 1 ? changed[0] : null;
}

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2SnakesSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  const [snap, setSnap] = useState(null);
  const [boardEdges, setBoardEdges] = useState(OV2_SNAKES_BOARD_EDGES);
  const boardEdgesRef = useRef(OV2_SNAKES_BOARD_EDGES);
  const [err, setErr] = useState("");
  const [rollBusy, setRollBusy] = useState(false);
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const [pawnMotion, setPawnMotion] = useState(
    /** @type {null | { key: number, seat: number, displayCell: number, phase: 'walk' | 'edge_hold' | 'edge_land', preCell: number, finalCell: number, kind: 'ladder' | 'snake' | null }} */ (null)
  );
  const pawnWalkTimersRef = useRef(/** @type {number[]} */ ([]));
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));
  const vaultLinesAppliedForSessionRef = useRef(/** @type {Set<string>} */ (new Set()));
  const snapRef = useRef(/** @type {typeof snap} */ (null));
  const vaultClaimInFlightRef = useRef(false);
  const rollInFlightRef = useRef(false);
  /** Dedupes local roll + realtime both scheduling walk for the same `revision`. */
  const lastWalkRevisionRef = useRef(/** @type {number|null} */ (null));

  const clearPawnWalkTimers = useCallback(() => {
    pawnWalkTimersRef.current.forEach(id => window.clearTimeout(id));
    pawnWalkTimersRef.current = [];
  }, []);

  const applySnapIfNewer = useCallback((/** @type {any} */ nextSnap) => {
    if (!nextSnap) return;
    setSnap(prev => {
      const merged = ov2PreferNewerSnapshot(prev, nextSnap);
      snapRef.current = merged;
      return merged;
    });
  }, []);

  const schedulePawnWalkFromPrevNext = useCallback(
    (/** @type {any} */ prev, /** @type {any} */ next, /** @type {number} */ seat) => {
      if (!prev || !next || seat < 0 || seat > 3) return;
      const nextRev = next.revision != null ? Number(next.revision) : NaN;
      if (!Number.isFinite(nextRev)) return;
      if (lastWalkRevisionRef.current === nextRev) return;

      const dice = next.lastRoll != null ? Math.floor(Number(next.lastRoll)) : null;
      if (dice == null || dice < 1 || dice > 6) return;
      const oldP = readSeatPos(prev, seat);
      const newP = readSeatPos(next, seat);
      if (oldP == null || newP == null || oldP === newP) return;
      const preCell = ov2SnakesCellAfterDice(oldP, dice);
      if (preCell == null) return;

      lastWalkRevisionRef.current = nextRev;
      clearPawnWalkTimers();

      /** @type {number[]} */
      const path = [];
      for (let c = oldP + 1; c <= preCell; c += 1) path.push(c);
      const kind =
        preCell !== newP ? ov2SnakesClassifyEdge(preCell, newP, boardEdgesRef.current) : null;
      const key = Date.now();
      const pushTid = /** @param {number} tid */ tid => {
        pawnWalkTimersRef.current.push(tid);
      };
      setPawnMotion({
        key,
        seat,
        displayCell: oldP,
        phase: "walk",
        preCell,
        finalCell: newP,
        kind,
      });
      path.forEach((cell, i) => {
        const tid = window.setTimeout(() => {
          setPawnMotion(cur => (cur && cur.key === key ? { ...cur, displayCell: cell, phase: "walk" } : cur));
        }, (i + 1) * OV2_SNAKES_WALK_STEP_MS);
        pushTid(tid);
      });
      const afterWalk = path.length * OV2_SNAKES_WALK_STEP_MS;
      if (kind && preCell !== newP) {
        pushTid(
          window.setTimeout(() => {
            setPawnMotion(cur =>
              cur && cur.key === key ? { ...cur, displayCell: preCell, phase: "edge_hold" } : cur
            );
          }, afterWalk)
        );
        pushTid(
          window.setTimeout(() => {
            setPawnMotion(cur =>
              cur && cur.key === key ? { ...cur, displayCell: newP, phase: "edge_land" } : cur
            );
          }, afterWalk + OV2_SNAKES_EDGE_HOLD_MS)
        );
        pushTid(
          window.setTimeout(() => {
            setPawnMotion(cur => (cur && cur.key === key ? null : cur));
          }, afterWalk + OV2_SNAKES_EDGE_HOLD_MS + OV2_SNAKES_EDGE_LAND_MS)
        );
      } else {
        pushTid(
          window.setTimeout(() => {
            setPawnMotion(cur => (cur && cur.key === key ? null : cur));
          }, afterWalk + OV2_SNAKES_WALK_SETTLE_MS)
        );
      }
    },
    [clearPawnWalkTimers]
  );

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
    rollInFlightRef.current = false;
    lastWalkRevisionRef.current = null;
    clearPawnWalkTimers();
    setPawnMotion(null);
    setBoardEdges(OV2_SNAKES_BOARD_EDGES);
    boardEdgesRef.current = OV2_SNAKES_BOARD_EDGES;
  }, [roomId, activeSessionKey, clearPawnWalkTimers]);

  useEffect(() => {
    boardEdgesRef.current = boardEdges;
  }, [boardEdges]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_SNAKES_PRODUCT_GAME_ID) {
      setSnap(null);
      clearPawnWalkTimers();
      setPawnMotion(null);
      setBoardEdges(OV2_SNAKES_BOARD_EDGES);
      boardEdgesRef.current = OV2_SNAKES_BOARD_EDGES;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const [snapRes, edgesRes] = await Promise.all([
        fetchOv2SnakesSnapshot(roomId, { participantKey: selfKey ?? "" }),
        fetchOv2SnakesBoardEdgesFromDb(),
      ]);
      if (!cancelled) {
        applySnapIfNewer(snapRes ?? null);
        if (edgesRes.ok && edgesRes.edges) {
          setBoardEdges(edgesRes.edges);
          boardEdgesRef.current = edgesRes.edges;
        } else if (process.env.NODE_ENV === "development") {
          // Bundled map must match deployed `ov2_snakes_board_edges()` or visuals can disagree with rolls.
          console.warn(
            "[useOv2SnakesSession] ov2_snakes_board_edges RPC failed; using bundled fallback.",
            edgesRes.error || ""
          );
        }
      }
    })();
    const unsub = subscribeOv2SnakesSnapshot(roomId, {
      participantKey: selfKey ?? "",
      activeSessionId: activeSessionKey || null,
      onSnapshot: s => {
        if (cancelled) return;
        const prev = snapRef.current;
        if (
          prev &&
          s &&
          prev.revision != null &&
          s.revision != null &&
          Number(s.revision) > Number(prev.revision) &&
          String(prev.phase || "").toLowerCase() === "playing" &&
          String(s.phase || "").toLowerCase() === "playing"
        ) {
          const movedSeat = findSingleMovedSeat(prev, s);
          if (movedSeat != null) {
            schedulePawnWalkFromPrevNext(prev, s, movedSeat);
          }
        }
        applySnapIfNewer(s);
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey, applySnapIfNewer, clearPawnWalkTimers, schedulePawnWalkFromPrevNext]);

  useEffect(
    () => () => {
      clearPawnWalkTimers();
    },
    [clearPawnWalkTimers]
  );

  useEffect(() => {
    if (!snap || String(snap.phase || "").toLowerCase() !== "finished" || !roomId || !selfKey) return;
    const sid = String(snap.sessionId || "").trim();
    if (!sid || vaultFinishedRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2SnakesClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyOv2SettlementClaimLinesToVaultAndConfirm(
              claim.lines,
              ONLINE_V2_GAME_KINDS.SNAKES_AND_LADDERS,
              roomId,
              selfKey
            );
            vaultLinesAppliedForSessionRef.current.add(sid);
          }
          vaultFinishedRef.current = sid;
          setVaultClaimError("");
        } else if (!claim.ok) {
          setVaultClaimError(String(claim.message || claim.error || "Could not update balance."));
        } else {
          vaultFinishedRef.current = sid;
        }
      } catch (e) {
        setVaultClaimError(e instanceof Error ? e.message : String(e));
      } finally {
        vaultClaimInFlightRef.current = false;
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [snap, roomId, selfKey, vaultClaimRetryTick]);

  const retryVaultClaim = useCallback(() => {
    vaultFinishedRef.current = null;
    vaultClaimInFlightRef.current = false;
    setVaultClaimError("");
    setVaultClaimRetryTick(t => t + 1);
  }, []);

  const roll = useCallback(async () => {
    if (!roomId || !selfKey || rollInFlightRef.current) return { ok: false, error: "busy" };
    clearPawnWalkTimers();
    rollInFlightRef.current = true;
    setRollBusy(true);
    setErr("");
    try {
      const cur = snapRef.current;
      const rev = cur?.revision != null && Number.isFinite(Number(cur.revision)) ? Math.floor(Number(cur.revision)) : null;
      const idk =
        (BigInt(Date.now()) << 20n) +
        BigInt(Math.floor(Math.random() * (2 ** 20 - 1))) +
        1n;
      const r = await requestOv2SnakesRoll(roomId, selfKey, idk, { expectedRevision: rev });
      if (!r.ok) {
        const msg = r.error || "Roll failed";
        setErr(msg);
        return { ok: false, error: msg, code: r.code };
      }
      if (r.snapshot) {
        const prev = snapRef.current;
        const next = r.snapshot;
        if (!r.idempotent && prev && next && next.lastRoll != null) {
          const roller = prev.turnSeat != null ? Math.floor(Number(prev.turnSeat)) : null;
          if (roller != null && roller >= 0 && roller <= 3) {
            schedulePawnWalkFromPrevNext(prev, next, roller);
          }
        }
        applySnapIfNewer(r.snapshot);
      }
      return { ok: true, idempotent: r.idempotent === true };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg);
      return { ok: false, error: msg };
    } finally {
      rollInFlightRef.current = false;
      setRollBusy(false);
    }
  }, [roomId, selfKey, applySnapIfNewer, clearPawnWalkTimers, schedulePawnWalkFromPrevNext]);

  const out = useMemo(
    () => ({
      snap,
      err,
      rollBusy,
      roll,
      vaultClaimBusy,
      vaultClaimError,
      retryVaultClaim,
      pawnMotion,
      boardEdges,
    }),
    [snap, err, rollBusy, roll, vaultClaimBusy, vaultClaimError, retryVaultClaim, pawnMotion, boardEdges]
  );

  return out;
}
