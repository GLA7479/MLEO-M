import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2Rummy51Snapshot,
  normalizeOv2Rummy51Snapshot,
  ov2Rummy51DrawDiscard,
  ov2Rummy51DrawStock,
  ov2Rummy51SubmitTurn,
  ov2Rummy51UndoDiscardDraw,
  OV2_RUMMY51_PRODUCT_GAME_ID,
  requestOv2Rummy51Rematch,
  cancelOv2Rummy51Rematch,
  startOv2Rummy51NextMatch,
  subscribeOv2Rummy51Session,
} from "../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";

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

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    setBusy(true);
    setActionError("");
    try {
      const r = await requestOv2Rummy51Rematch(roomId, selfKey);
      if (!r.ok) setActionError(r.error || "Rematch request failed");
      await refresh();
      void reloadRoomContext?.();
      return r;
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, refresh, reloadRoomContext]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    setBusy(true);
    setActionError("");
    try {
      const r = await cancelOv2Rummy51Rematch(roomId, selfKey);
      if (!r.ok) setActionError(r.error || "Cancel failed");
      await refresh();
      void reloadRoomContext?.();
      return r;
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, refresh, reloadRoomContext]);

  const startNextMatch = useCallback(async () => {
    if (!roomId || !selfKey || !room) return { ok: false };
    setBusy(true);
    setActionError("");
    try {
      const seq = room.match_seq != null ? Number(room.match_seq) : null;
      const r = await startOv2Rummy51NextMatch(roomId, selfKey, seq);
      if (!r.ok) setActionError(r.error || "Could not start next match");
      await refresh();
      void reloadRoomContext?.();
      return r;
    } catch (e) {
      const msg = e?.message || String(e);
      setActionError(msg);
      return { ok: false, error: msg };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, room, refresh, reloadRoomContext]);

  const isMyTurn = useMemo(
    () => Boolean(selfKey && snapshot?.turnParticipantKey && snapshot.turnParticipantKey === selfKey),
    [selfKey, snapshot?.turnParticipantKey]
  );

  const hasActiveSession = Boolean(room?.active_session_id);
  const phase = snapshot?.phase != null ? String(snapshot.phase) : "";
  const isPlaying = phase === "playing";
  const isFinished = phase === "finished";

  const rematchCounts = useMemo(() => {
    let eligible = 0;
    let ready = 0;
    for (const m of members) {
      if (!m || typeof m !== "object") continue;
      if (m.seat_index == null || m.seat_index === "") continue;
      if (String(m.wallet_state || "") !== "committed") continue;
      eligible += 1;
      const meta = m.meta && typeof m.meta === "object" ? m.meta : null;
      const r51 = meta?.rummy51 && typeof meta.rummy51 === "object" ? meta.rummy51 : null;
      if (r51?.rematch_requested === true) ready += 1;
    }
    return { eligible, ready };
  }, [members]);

  const hostKey = room?.host_participant_key != null ? String(room.host_participant_key) : "";
  const isHost = Boolean(selfKey && hostKey && selfKey === hostKey);

  return {
    snapshot,
    members,
    room,
    selfKey,
    busy,
    actionError,
    setActionError,
    refresh,
    drawStock,
    drawDiscard,
    undoDiscardDraw,
    submitTurn,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isMyTurn,
    hasActiveSession,
    isPlaying,
    isFinished,
    rematchCounts,
    isHost,
    productId: OV2_RUMMY51_PRODUCT_GAME_ID,
  };
}
