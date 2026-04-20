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

/** @param {any} snap */
function readSeatPos(snap, seat) {
  const b = snap?.board?.positions;
  if (!b || typeof b !== "object") return null;
  const v = b[String(seat)] ?? b[seat];
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : null;
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
  const [pawnStepMotion, setPawnStepMotion] = useState(/** @type {null | { key: number, seat: number, stage: 1 | 2, preCell: number, finalCell: number, kind: 'ladder' | 'snake' }} */ (null));
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));
  const vaultLinesAppliedForSessionRef = useRef(/** @type {Set<string>} */ (new Set()));
  const snapRef = useRef(/** @type {typeof snap} */ (null));
  const vaultClaimInFlightRef = useRef(false);
  const rollInFlightRef = useRef(false);

  const applySnapIfNewer = useCallback((/** @type {any} */ nextSnap) => {
    if (!nextSnap) return;
    setSnap(prev => ov2PreferNewerSnapshot(prev, nextSnap));
  }, []);

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
    rollInFlightRef.current = false;
    setPawnStepMotion(null);
    setBoardEdges(OV2_SNAKES_BOARD_EDGES);
    boardEdgesRef.current = OV2_SNAKES_BOARD_EDGES;
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    boardEdgesRef.current = boardEdges;
  }, [boardEdges]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    const m = pawnStepMotion;
    if (!m || m.stage !== 1) return undefined;
    const key = m.key;
    const t1 = window.setTimeout(() => {
      setPawnStepMotion(cur => (cur && cur.key === key ? { ...cur, stage: 2 } : cur));
    }, OV2_SNAKES_EDGE_HOLD_MS);
    const t2 = window.setTimeout(() => {
      setPawnStepMotion(cur => (cur && cur.key === key ? null : cur));
    }, OV2_SNAKES_EDGE_HOLD_MS + OV2_SNAKES_EDGE_LAND_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [pawnStepMotion?.key]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_SNAKES_PRODUCT_GAME_ID) {
      setSnap(null);
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
        if (!cancelled) applySnapIfNewer(s);
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey, applySnapIfNewer]);

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
          const dice = Math.floor(Number(next.lastRoll));
          const roller = prev.turnSeat != null ? Math.floor(Number(prev.turnSeat)) : null;
          if (roller != null && roller >= 0 && roller <= 3 && dice >= 1 && dice <= 6) {
            const oldP = readSeatPos(prev, roller);
            const newP = readSeatPos(next, roller);
            if (oldP != null && newP != null && oldP !== newP) {
              const preCell = ov2SnakesCellAfterDice(oldP, dice);
              if (preCell != null && preCell !== newP) {
                const kind = ov2SnakesClassifyEdge(preCell, newP, boardEdgesRef.current);
                if (kind) {
                  setPawnStepMotion({
                    key: Date.now(),
                    seat: roller,
                    stage: 1,
                    preCell,
                    finalCell: newP,
                    kind,
                  });
                }
              }
            }
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
  }, [roomId, selfKey, applySnapIfNewer]);

  const out = useMemo(
    () => ({
      snap,
      err,
      rollBusy,
      roll,
      vaultClaimBusy,
      vaultClaimError,
      retryVaultClaim,
      pawnStepMotion,
      boardEdges,
    }),
    [snap, err, rollBusy, roll, vaultClaimBusy, vaultClaimError, retryVaultClaim, pawnStepMotion, boardEdges]
  );

  return out;
}
