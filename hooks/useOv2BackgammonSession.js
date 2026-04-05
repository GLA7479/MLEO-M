import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2BackgammonSnapshot,
  OV2_BACKGAMMON_PRODUCT_GAME_ID,
  requestOv2BackgammonCancelRematch,
  requestOv2BackgammonMove,
  requestOv2BackgammonRequestRematch,
  requestOv2BackgammonRoll,
  requestOv2BackgammonStartNextMatch,
  subscribeOv2BackgammonSnapshot,
} from "../lib/online-v2/backgammon/ov2BackgammonSessionAdapter";
import { requestOv2BackgammonClaimSettlement } from "../lib/online-v2/backgammon/ov2BackgammonSettlement";
import { applyBoardPathSettlementClaimLinesToVault } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2BackgammonSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const isHost = Boolean(room?.host_participant_key && selfKey && room.host_participant_key === selfKey);

  const [snap, setSnap] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_BACKGAMMON_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2BackgammonSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(s ?? null);
    })();
    const unsub = subscribeOv2BackgammonSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setSnap(s);
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey]);

  useEffect(() => {
    if (!snap || String(snap.phase || "").toLowerCase() !== "finished" || !roomId || !selfKey) return;
    const sid = String(snap.sessionId || "").trim();
    if (!sid || vaultFinishedRef.current === sid) return;
    vaultFinishedRef.current = sid;
    void (async () => {
      try {
        const claim = await requestOv2BackgammonClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVault(claim.lines, OV2_BACKGAMMON_PRODUCT_GAME_ID);
        } else if (!claim.ok) {
          vaultFinishedRef.current = null;
        }
      } catch {
        vaultFinishedRef.current = null;
      }
      await readOnlineV2Vault({ fresh: true }).catch(() => {});
    })();
  }, [snap, roomId, selfKey]);

  const roll = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return;
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2BackgammonRoll(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Roll failed");
        return;
      }
      if (r.snapshot) setSnap(r.snapshot);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap]);

  const move = useCallback(
    async (fromPt, toPt, die) => {
      if (!roomId || !selfKey || !snap) return;
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2BackgammonMove(roomId, selfKey, fromPt, toPt, die, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Move failed");
          return;
        }
        if (r.snapshot) setSnap(r.snapshot);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap]
  );

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2BackgammonRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2BackgammonCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2BackgammonStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const board = snap?.board && typeof snap.board === "object" ? snap.board : {};
    const pts = Array.isArray(board.pts) ? board.pts.map(x => Number(x)) : [];
    const bar = Array.isArray(board.bar) ? board.bar.map(x => Number(x)) : [0, 0];
    const off = Array.isArray(board.off) ? board.off.map(x => Number(x)) : [0, 0];
    const diceAvail = Array.isArray(board.diceAvail) ? board.diceAvail.map(x => Number(x)) : [];
    return {
      phase,
      pts,
      bar,
      off,
      dice: board.dice,
      diceAvail,
      turnSeat: snap?.turnSeat ?? null,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      canClientRoll: snap?.canClientRoll === true,
      canClientMove: snap?.canClientMove === true,
      readOnly: snap?.boardViewReadOnly === true,
      revision: snap?.revision ?? 0,
    };
  }, [snap]);

  return {
    snapshot: snap,
    vm,
    busy,
    err,
    setErr,
    roll,
    move,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
