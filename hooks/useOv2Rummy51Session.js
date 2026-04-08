import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import {
  cancelOv2Rummy51Rematch,
  fetchOv2Rummy51Snapshot,
  normalizeOv2Rummy51Snapshot,
  ov2Rummy51DrawDiscard,
  ov2Rummy51DrawStock,
  ov2Rummy51SubmitTurn,
  ov2Rummy51UndoDiscardDraw,
  OV2_RUMMY51_PRODUCT_GAME_ID,
  requestOv2Rummy51Rematch,
  startOv2Rummy51NextMatch,
  subscribeOv2Rummy51Session,
} from "../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import { requestOv2Rummy51ClaimSettlement } from "../lib/online-v2/rummy51/ov2Rummy51Settlement";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

/**
 * @param {null|undefined|{
 *   room?: object,
 *   members?: unknown[],
 *   self?: { participant_key?: string, display_name?: string },
 *   reloadRoomContext?: () => void | Promise<void>,
 * }} baseContext
 */
export function useOv2Rummy51Session(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const reloadRoomContext = baseContext?.reloadRoomContext;

  /** @type {ReturnType<typeof normalizeOv2Rummy51Snapshot>|null} */
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const [snapshotLoadError, setSnapshotLoadError] = useState("");

  const refresh = useCallback(async () => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) return;
    setSnapshotLoadError("");
    const r = await fetchOv2Rummy51Snapshot(roomId);
    if (r.ok)
      setSnapshot(prev => ov2PreferNewerSnapshot(prev, r.snapshot ? normalizeOv2Rummy51Snapshot(r.snapshot) : null));
    else setSnapshotLoadError(String(r.error || "Could not load match."));
  }, [roomId, roomProductId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) {
      setSnapshot(null);
      setSnapshotLoadError("");
      return undefined;
    }
    let cancelled = false;
    setSnapshotLoadError("");
    void (async () => {
      const r = await fetchOv2Rummy51Snapshot(roomId);
      if (cancelled) return;
      if (r.ok)
        setSnapshot(prev =>
          ov2PreferNewerSnapshot(prev, r.snapshot ? normalizeOv2Rummy51Snapshot(r.snapshot) : null)
        );
      else setSnapshotLoadError(String(r.error || "Could not load match."));
    })();
    const unsub = subscribeOv2Rummy51Session(roomId, snap => {
      if (!cancelled)
        setSnapshot(prev => ov2PreferNewerSnapshot(prev, snap && typeof snap === "object" ? normalizeOv2Rummy51Snapshot(snap) : snap));
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, activeSessionKey]);

  const applySnapshot = useCallback(s => {
    if (!s || typeof s !== "object") return;
    const next = normalizeOv2Rummy51Snapshot(s);
    setSnapshot(prev => ov2PreferNewerSnapshot(prev, next));
  }, []);

  const vaultFinishedRefreshForSessionRef = useRef(/** @type {string|null} */ (null));
  const vaultClaimInFlightRef = useRef(false);

  useEffect(() => {
    vaultFinishedRefreshForSessionRef.current = null;
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) return;
    if (String(snapshot?.phase || "").trim().toLowerCase() !== "finished") return;
    const sid = String(snapshot?.sessionId || "").trim();
    if (!sid || !selfKey) return;
    if (vaultFinishedRefreshForSessionRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2Rummy51ClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
            claim.lines,
            OV2_RUMMY51_PRODUCT_GAME_ID,
            roomId,
            selfKey
          );
          vaultFinishedRefreshForSessionRef.current = sid;
          setVaultClaimError("");
        } else if (!claim.ok) {
          setVaultClaimError(String(claim.error || claim.message || "Could not update balance."));
        } else {
          vaultFinishedRefreshForSessionRef.current = sid;
        }
      } catch (e) {
        setVaultClaimError(e instanceof Error ? e.message : String(e));
      } finally {
        vaultClaimInFlightRef.current = false;
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [roomId, roomProductId, snapshot?.phase, snapshot?.sessionId, selfKey, vaultClaimRetryTick]);

  const retryVaultClaim = useCallback(() => {
    vaultFinishedRefreshForSessionRef.current = null;
    vaultClaimInFlightRef.current = false;
    setVaultClaimError("");
    setVaultClaimRetryTick(t => t + 1);
  }, []);

  const drawStock = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
    if (busy) return { ok: false, error: "busy" };
    setBusy(true);
    setActionError("");
    try {
      const r = await ov2Rummy51DrawStock(roomId, selfKey, snapshot.revision);
      if (!r.ok) {
        setActionError(r.error || "Draw failed");
        return r;
      }
      if (r.snapshot) applySnapshot(r.snapshot);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snapshot, applySnapshot, busy]);

  const drawDiscard = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
    if (busy) return { ok: false, error: "busy" };
    setBusy(true);
    setActionError("");
    try {
      const r = await ov2Rummy51DrawDiscard(roomId, selfKey, snapshot.revision);
      if (!r.ok) {
        setActionError(r.error || "Draw failed");
        return r;
      }
      if (r.snapshot) applySnapshot(r.snapshot);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snapshot, applySnapshot, busy]);

  const undoDiscardDraw = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
    if (busy) return { ok: false, error: "busy" };
    setBusy(true);
    setActionError("");
    try {
      const r = await ov2Rummy51UndoDiscardDraw(roomId, selfKey, snapshot.revision);
      if (!r.ok) {
        setActionError(r.error || "Could not return discard");
        return r;
      }
      if (r.snapshot) applySnapshot(r.snapshot);
      return { ok: true };
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snapshot, applySnapshot, busy]);

  const submitTurn = useCallback(
    async payload => {
      if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
      if (busy) return { ok: false, error: "busy" };
      setBusy(true);
      setActionError("");
      try {
        const r = await ov2Rummy51SubmitTurn(roomId, selfKey, payload, snapshot.revision);
        if (!r.ok) {
          setActionError(r.error || "Submit failed");
          return r;
        }
        if (r.snapshot) applySnapshot(r.snapshot);
        return { ok: true };
      } catch (e) {
        const msg = e?.message || String(e);
        setActionError(msg);
        return { ok: false, error: msg };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snapshot, applySnapshot, busy]
  );

  const isMyTurn = useMemo(
    () => Boolean(selfKey && snapshot?.turnParticipantKey && snapshot.turnParticipantKey === selfKey),
    [selfKey, snapshot?.turnParticipantKey]
  );

  const hasActiveSession = Boolean(room?.active_session_id);
  const phase = snapshot?.phase != null ? String(snapshot.phase) : "";
  const isPlaying = phase === "playing";
  const isFinished = phase === "finished";

  const hostKey = room?.host_participant_key != null ? String(room.host_participant_key) : "";
  const isHost = Boolean(selfKey && hostKey && selfKey === hostKey);

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2Rummy51Rematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return cancelOv2Rummy51Rematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return startOv2Rummy51NextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  return {
    snapshot,
    members,
    room,
    selfKey,
    busy,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    snapshotLoadError,
    actionError,
    setActionError,
    refresh,
    drawStock,
    drawDiscard,
    undoDiscardDraw,
    submitTurn,
    isMyTurn,
    hasActiveSession,
    isPlaying,
    isFinished,
    isHost,
    requestRematch,
    cancelRematch,
    startNextMatch,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
    productId: OV2_RUMMY51_PRODUCT_GAME_ID,
  };
}
