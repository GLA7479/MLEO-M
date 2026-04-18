import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2FlipGridSnapshot,
  OV2_FLIPGRID_PRODUCT_GAME_ID,
  requestOv2FlipGridMarkTurnTimeout,
  requestOv2FlipGridOfferDouble,
  requestOv2FlipGridPlayMove,
  requestOv2FlipGridRequestRematch,
  requestOv2FlipGridCancelRematch,
  requestOv2FlipGridRespondDouble,
  requestOv2FlipGridStartNextMatch,
  subscribeOv2FlipGridSnapshot,
} from "../lib/online-v2/flipgrid/ov2FlipGridSessionAdapter";
import { requestOv2FlipGridClaimSettlement } from "../lib/online-v2/flipgrid/ov2FlipGridSettlement";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2FlipGridSession(baseContext) {
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
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const vaultFinishedRef = useRef(/** @type {string|null} */ (null));
  const vaultLinesAppliedForSessionRef = useRef(/** @type {Set<string>} */ (new Set()));
  const snapRef = useRef(/** @type {typeof snap} */ (null));
  const processedTurnTimeoutKeysRef = useRef(/** @type {Set<string>} */ (new Set()));
  const vaultClaimInFlightRef = useRef(false);

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedTurnTimeoutKeysRef.current.clear();
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    snapRef.current = snap;
  }, [snap]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const id = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_FLIPGRID_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2FlipGridSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s ?? null));
    })();
    const unsub = subscribeOv2FlipGridSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s));
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
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2FlipGridClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
              claim.lines,
              ONLINE_V2_GAME_KINDS.FLIPGRID,
              roomId,
              selfKey
            );
            vaultLinesAppliedForSessionRef.current.add(sid);
          }
          vaultFinishedRef.current = sid;
          setVaultClaimError("");
        } else if (!claim.ok) {
          setVaultClaimError(String(claim.error || claim.message || "Could not update balance."));
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

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_FLIPGRID_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    if (!s || String(s.phase || "").toLowerCase() !== "playing") return undefined;
    const dl = s.turnDeadline != null ? Number(s.turnDeadline) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(dl)) return undefined;
    const turnSeat = s.turnSeat != null ? Number(s.turnSeat) : NaN;
    const pd = s.pendingDouble && typeof s.pendingDouble === "object" ? s.pendingDouble : null;
    const dlSeat = pd?.responder_seat != null ? Number(pd.responder_seat) : turnSeat;
    if (!Number.isInteger(dlSeat) || (dlSeat !== 0 && dlSeat !== 1)) return undefined;
    const turnKey = `${sid}|${dl}|${dlSeat}|${pd ? "dbl" : "mv"}`;
    if (processedTurnTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTurnTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur || String(cur.phase || "").toLowerCase() !== "playing") return;
        const vdl = cur.turnDeadline != null ? Number(cur.turnDeadline) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vPd = cur.pendingDouble && typeof cur.pendingDouble === "object" ? cur.pendingDouble : null;
        const vDlSeat = vPd?.responder_seat != null ? Number(vPd.responder_seat) : Number(cur.turnSeat);
        const vkey = `${vsid}|${vdl}|${vDlSeat}|${vPd ? "dbl" : "mv"}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2FlipGridMarkTurnTimeout(roomId, selfKey, {
          revision: cur.revision,
        });
        if (r.ok && r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        const sn = r.snapshot && typeof r.snapshot === "object" ? r.snapshot : null;
        const revAfter = sn?.revision != null ? Number(sn.revision) : NaN;
        const phaseAfter = sn ? String(sn.phase || "").toLowerCase() : "";
        if (
          r.ok &&
          sn &&
          (phaseAfter === "finished" || (Number.isFinite(revBefore) && Number.isFinite(revAfter) && revAfter !== revBefore))
        ) {
          processedTurnTimeoutKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [
    roomId,
    selfKey,
    roomProductId,
    snap?.sessionId,
    snap?.turnDeadline,
    snap?.turnSeat,
    snap?.phase,
    snap?.revision,
    snap?.pendingDouble,
  ]);

  const playCell = useCallback(
    async (row, col) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2FlipGridPlayMove(roomId, selfKey, row, col, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Move failed");
          return { ok: false };
        }
        if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        return { ok: true };
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap, busy]
  );

  const offerDouble = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2FlipGridOfferDouble(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Could not propose stake increase");
        return { ok: false };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const respondDouble = useCallback(
    async accept => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2FlipGridRespondDouble(roomId, selfKey, accept, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Response failed");
          return { ok: false };
        }
        if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        return { ok: true };
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap, busy]
  );

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2FlipGridRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2FlipGridCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2FlipGridStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m0 = Math.max(0, Math.min(3, Number(missed["0"] ?? missed[0] ?? 0) || 0));
    const m1 = Math.max(0, Math.min(3, Number(missed["1"] ?? missed[1] ?? 0) || 0));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const turnTimeLeftMs =
      phase === "playing" && turnDeadline != null ? Math.max(0, turnDeadline - nowMs) : null;
    const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
    const dc = snap?.discCounts && typeof snap.discCounts === "object" ? snap.discCounts : { 0: 0, 1: 0 };
    return {
      phase,
      turnSeat: snap?.turnSeat ?? null,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftSec,
      missedStreakBySeat: { 0: m0, 1: m1 },
      cells: Array.isArray(snap?.cells) ? snap.cells : [],
      discCounts: { 0: Number(dc[0]) || 0, 1: Number(dc[1]) || 0 },
      turnHolderLegalMoveCount: snap?.turnHolderLegalMoveCount ?? null,
      stakeMultiplier: snap?.stakeMultiplier ?? 1,
      doublesAccepted: snap?.doublesAccepted ?? 0,
      pendingDouble: snap?.pendingDouble ?? null,
      canOfferDouble: snap?.canOfferDouble === true,
      mustRespondDouble: snap?.mustRespondDouble === true,
    };
  }, [snap, nowMs]);

  return {
    snapshot: snap,
    vm,
    busy,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    err,
    setErr,
    playCell,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
