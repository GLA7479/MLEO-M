import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
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
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const reloadRoomContext = baseContext?.reloadRoomContext;

  /** @type {ReturnType<typeof normalizeOv2Rummy51Snapshot>|null} */
  const [snapshot, setSnapshot] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState("");
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) return;
    const r = await fetchOv2Rummy51Snapshot(roomId);
    if (r.ok) setSnapshot(r.snapshot ?? null);
  }, [roomId, roomProductId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) {
      setSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const r = await fetchOv2Rummy51Snapshot(roomId);
      if (!cancelled && r.ok) setSnapshot(r.snapshot ?? null);
    })();
    const unsub = subscribeOv2Rummy51Session(roomId, snap => {
      if (!cancelled) setSnapshot(snap);
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId]);

  const applySnapshot = useCallback(s => {
    if (s && typeof s === "object") setSnapshot(normalizeOv2Rummy51Snapshot(s));
  }, []);

  const vaultFinishedRefreshForSessionRef = useRef(/** @type {string|null} */ (null));

  useEffect(() => {
    vaultFinishedRefreshForSessionRef.current = null;
    setVaultClaimBusy(false);
  }, [roomId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_RUMMY51_PRODUCT_GAME_ID) return;
    if (String(snapshot?.phase || "").trim().toLowerCase() !== "finished") return;
    const sid = String(snapshot?.sessionId || "").trim();
    if (!sid || !selfKey) return;
    if (vaultFinishedRefreshForSessionRef.current === sid) return;
    vaultFinishedRefreshForSessionRef.current = sid;
    setVaultClaimBusy(true);
    void (async () => {
      try {
        const claim = await requestOv2Rummy51ClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_RUMMY51_PRODUCT_GAME_ID);
        } else if (!claim.ok) {
          vaultFinishedRefreshForSessionRef.current = null;
        }
      } catch {
        vaultFinishedRefreshForSessionRef.current = null;
      } finally {
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [roomId, roomProductId, snapshot?.phase, snapshot?.sessionId, selfKey]);

  const drawStock = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
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
  }, [roomId, selfKey, snapshot, applySnapshot]);

  const drawDiscard = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
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
  }, [roomId, selfKey, snapshot, applySnapshot]);

  const undoDiscardDraw = useCallback(async () => {
    if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
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
  }, [roomId, selfKey, snapshot, applySnapshot]);

  const submitTurn = useCallback(
    async payload => {
      if (!roomId || !selfKey || !snapshot) return { ok: false, error: "no session" };
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
    [roomId, selfKey, snapshot, applySnapshot]
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
