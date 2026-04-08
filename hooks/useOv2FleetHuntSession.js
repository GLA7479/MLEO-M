import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOv2UiPreviewOptional } from "../lib/online-v2/dev/Ov2UiPreviewContext";
import {
  fetchOv2FleetHuntSnapshot,
  OV2_FLEET_HUNT_PRODUCT_GAME_ID,
  requestOv2FleetHuntFireShot,
  requestOv2FleetHuntLockPlacement,
  requestOv2FleetHuntMarkTurnTimeout,
  requestOv2FleetHuntOfferDouble,
  requestOv2FleetHuntRandomPlacement,
  requestOv2FleetHuntRespondDouble,
  requestOv2FleetHuntRequestRematch,
  requestOv2FleetHuntCancelRematch,
  requestOv2FleetHuntStartNextMatch,
  requestOv2FleetHuntSubmitPlacement,
  subscribeOv2FleetHuntSnapshot,
} from "../lib/online-v2/fleethunt/ov2FleetHuntSessionAdapter";
import { requestOv2FleetHuntClaimSettlement } from "../lib/online-v2/fleethunt/ov2FleetHuntSettlement";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2FleetHuntSession(baseContext) {
  const preview = useOv2UiPreviewOptional("fleethunt");
  if (preview) return preview;
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
  const processedTimeoutKeysRef = useRef(/** @type {Set<string>} */ (new Set()));
  const vaultClaimInFlightRef = useRef(false);

  useEffect(() => {
    setSnap(null);
    vaultFinishedRef.current = null;
    vaultLinesAppliedForSessionRef.current.clear();
    processedTimeoutKeysRef.current.clear();
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
    if (!roomId || roomProductId !== OV2_FLEET_HUNT_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2FleetHuntSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s ?? null));
    })();
    const unsub = subscribeOv2FleetHuntSnapshot(roomId, {
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
        const claim = await requestOv2FleetHuntClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
              claim.lines,
              ONLINE_V2_GAME_KINDS.FLEET_HUNT,
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
    if (!roomId || !selfKey || roomProductId !== OV2_FLEET_HUNT_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    const phase = s ? String(s.phase || "").toLowerCase() : "";
    if (phase !== "placement") return undefined;
    const sid = String(s.sessionId || "").trim();
    if (!sid) return undefined;
    const dl = s.placementDl && typeof s.placementDl === "object" ? s.placementDl : {};
    const t0 = dl["0"] != null ? Number(dl["0"]) : NaN;
    const t1 = dl["1"] != null ? Number(dl["1"]) : NaN;
    const candidates = [];
    if (!s.lock0 && Number.isFinite(t0)) candidates.push(t0);
    if (!s.lock1 && Number.isFinite(t1)) candidates.push(t1);
    if (!candidates.length) return undefined;
    const nextDl = Math.min(...candidates);
    const turnKey = `${sid}|placement|${nextDl}|${s.revision ?? 0}`;
    if (processedTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, nextDl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur) return;
        const ph = String(cur.phase || "").toLowerCase();
        if (ph !== "placement") return;
        const vsid = String(cur.sessionId || "").trim();
        const vdl = cur.placementDl && typeof cur.placementDl === "object" ? cur.placementDl : {};
        const vt0 = vdl["0"] != null ? Number(vdl["0"]) : NaN;
        const vt1 = vdl["1"] != null ? Number(vdl["1"]) : NaN;
        const vc = [];
        if (!cur.lock0 && Number.isFinite(vt0)) vc.push(vt0);
        if (!cur.lock1 && Number.isFinite(vt1)) vc.push(vt1);
        if (!vc.length) return;
        const vnext = Math.min(...vc);
        if (vnext !== nextDl || Date.now() < vnext) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2FleetHuntMarkTurnTimeout(roomId, selfKey, {
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
          processedTimeoutKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [
    roomId,
    selfKey,
    roomProductId,
    snap?.sessionId,
    snap?.phase,
    snap?.revision,
    snap?.lock0,
    snap?.lock1,
    snap?.placementDl,
  ]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_FLEET_HUNT_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    const phase = s ? String(s.phase || "").toLowerCase() : "";
    if (phase !== "battle") return undefined;
    const dl = s.turnDeadline != null ? Number(s.turnDeadline) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(dl)) return undefined;
    const turnKey = `${sid}|battle|${dl}|${s.revision ?? 0}`;
    if (processedTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur) return;
        const ph = String(cur.phase || "").toLowerCase();
        if (ph !== "battle") return;
        const vdl = cur.turnDeadline != null ? Number(cur.turnDeadline) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vkey = `${vsid}|battle|${vdl}|${cur.revision ?? 0}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2FleetHuntMarkTurnTimeout(roomId, selfKey, {
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
          processedTimeoutKeysRef.current.add(turnKey);
        }
      })();
    }, ms);
    return () => window.clearTimeout(t);
  }, [roomId, selfKey, roomProductId, snap?.sessionId, snap?.turnDeadline, snap?.phase, snap?.revision]);

  const submitPlacement = useCallback(
    async ships => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const r = await requestOv2FleetHuntSubmitPlacement(roomId, selfKey, ships, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Placement failed");
          return { ok: false, code: r.code };
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

  const randomPlacement = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2FleetHuntRandomPlacement(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Random placement failed");
        return { ok: false, code: r.code };
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

  const lockPlacement = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2FleetHuntLockPlacement(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Could not lock placement");
        return { ok: false, code: r.code };
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

  const fireShot = useCallback(
    async (r, c) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const res = await requestOv2FleetHuntFireShot(roomId, selfKey, r, c, { revision: snap.revision });
        if (!res.ok) {
          setErr(res.error || "Shot failed");
          return { ok: false, code: res.code };
        }
        if (res.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
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
      const r = await requestOv2FleetHuntOfferDouble(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(r.error || "Double offer failed");
        return { ok: false, code: r.code };
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
        const r = await requestOv2FleetHuntRespondDouble(roomId, selfKey, accept, { revision: snap.revision });
        if (!r.ok) {
          setErr(r.error || "Response failed");
          return { ok: false, code: r.code };
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
    return requestOv2FleetHuntRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2FleetHuntCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2FleetHuntStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m0 = Math.max(0, Math.min(3, Number(missed["0"] ?? missed[0] ?? 0) || 0));
    const m1 = Math.max(0, Math.min(3, Number(missed["1"] ?? missed[1] ?? 0) || 0));
    const pm = snap?.placementMissed && typeof snap.placementMissed === "object" ? snap.placementMissed : {};
    const p0 = Math.max(0, Math.min(3, Number(pm["0"] ?? pm[0] ?? 0) || 0));
    const p1 = Math.max(0, Math.min(3, Number(pm["1"] ?? pm[1] ?? 0) || 0));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const placementDl = snap?.placementDl && typeof snap.placementDl === "object" ? snap.placementDl : {};
    const mySeat = snap?.mySeat;
    const myPlDl =
      mySeat === 0 || mySeat === 1
        ? placementDl[String(mySeat)] != null && Number.isFinite(Number(placementDl[String(mySeat)]))
          ? Number(placementDl[String(mySeat)])
          : null
        : null;
    const placementTimeLeftSec =
      phase === "placement" && myPlDl != null ? Math.max(0, Math.ceil((myPlDl - nowMs) / 1000)) : null;
    const turnTimeLeftSec =
      phase === "battle" && turnDeadline != null ? Math.max(0, Math.ceil((turnDeadline - nowMs) / 1000)) : null;
    return {
      phase,
      turnSeat: snap?.turnSeat ?? null,
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftSec,
      placementTimeLeftSec,
      missedStreakBySeat: { 0: m0, 1: m1 },
      placementMissStreakBySeat: { 0: p0, 1: p1 },
      lock0: snap?.lock0 ?? false,
      lock1: snap?.lock1 ?? false,
      shots0: Array.isArray(snap?.shots0) ? snap.shots0 : [],
      shots1: Array.isArray(snap?.shots1) ? snap.shots1 : [],
      myShips: Array.isArray(snap?.myShips) ? snap.myShips : [],
      stakeMultiplier: snap?.stakeMultiplier ?? 1,
      doublesAccepted: snap?.doublesAccepted ?? 0,
      pendingDouble: snap?.pendingDouble ?? null,
      canOfferDouble: snap?.canOfferDouble === true,
      mustRespondDouble: snap?.mustRespondDouble === true,
      result: snap?.result ?? null,
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
    submitPlacement,
    randomPlacement,
    lockPlacement,
    fireShot,
    offerDouble,
    respondDouble,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
