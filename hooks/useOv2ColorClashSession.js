import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  fetchOv2ColorClashSnapshot,
  OV2_COLORCLASH_PRODUCT_GAME_ID,
  requestOv2ColorClashDrawCard,
  requestOv2ColorClashMarkTurnTimeout,
  requestOv2ColorClashPassAfterDraw,
  requestOv2ColorClashPlayCard,
  requestOv2ColorClashRequestRematch,
  requestOv2ColorClashCancelRematch,
  requestOv2ColorClashStartNextMatch,
  subscribeOv2ColorClashSnapshot,
} from "../lib/online-v2/colorclash/ov2ColorClashSessionAdapter";
import { humanizeOv2ColorClashError } from "../lib/online-v2/colorclash/ov2ColorClashPlayLogic";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";
import { requestOv2ColorClashClaimSettlement } from "../lib/online-v2/colorclash/ov2ColorClashSettlement";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ONLINE_V2_GAME_KINDS } from "../lib/online-v2/ov2Economy";

/** @param {string} sessionId @param {number|null} seat */
function ov2CcSurgeUsedStorageKey(sessionId, seat) {
  return `ov2_cc_surge_used_${sessionId}_${seat}`;
}

/**
 * Legacy fallback only (pre-migration snapshots without surge fields).
 * @param {string} sessionId @param {number|null} seat
 */
function readOv2CcSurgeUsedStorageFallback(sessionId, seat) {
  if (typeof window === "undefined" || !sessionId || seat == null || !Number.isInteger(seat)) return false;
  try {
    return window.sessionStorage.getItem(ov2CcSurgeUsedStorageKey(sessionId, seat)) === "1";
  } catch {
    return false;
  }
}

/**
 * Authoritative: parity_state.surgeUsed from snapshot (`surgeUsedForYou` / `surgeUsedBySeat`).
 * @param {Record<string, unknown>|null|undefined} snap
 * @returns {boolean|null} null if snapshot has no surge fields (use legacy fallback)
 */
function surgeUsedForMeFromSnapshot(snap) {
  if (!snap || typeof snap !== "object") return /** @type {boolean|null} */ (null);
  const suy = /** @type {{ surgeUsedForYou?: unknown, surgeUsedBySeat?: unknown, mySeat?: unknown }} */ (snap);
  if (suy.surgeUsedForYou === true || suy.surgeUsedForYou === false) {
    return suy.surgeUsedForYou === true;
  }
  if (suy.surgeUsedForYou === "true" || suy.surgeUsedForYou === 1) return true;
  if (suy.surgeUsedForYou === "false" || suy.surgeUsedForYou === 0) return false;
  const seat = suy.mySeat != null && Number.isInteger(Number(suy.mySeat)) ? Number(suy.mySeat) : null;
  const map = suy.surgeUsedBySeat;
  if (map && typeof map === "object" && !Array.isArray(map) && seat != null && seat >= 0 && seat <= 3) {
    const v = /** @type {Record<string, unknown>} */ (map)[String(seat)] ?? /** @type {Record<number, unknown>} */ (map)[seat];
    if (v === true || v === "true" || v === 1) return true;
    if (v === false || v === "false" || v === 0) return false;
  }
  return null;
}

/** @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext */
export function useOv2ColorClashSession(baseContext) {
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
    if (!roomId || roomProductId !== OV2_COLORCLASH_PRODUCT_GAME_ID) {
      setSnap(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const s = await fetchOv2ColorClashSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setSnap(prev => ov2PreferNewerSnapshot(prev, s ?? null));
    })();
    const unsub = subscribeOv2ColorClashSnapshot(roomId, {
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
        const claim = await requestOv2ColorClashClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          if (!vaultLinesAppliedForSessionRef.current.has(sid)) {
            await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
              claim.lines,
              ONLINE_V2_GAME_KINDS.COLOR_CLASH,
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
    if (!roomId || !selfKey || roomProductId !== OV2_COLORCLASH_PRODUCT_GAME_ID) return undefined;
    const s = snap;
    const phase = s ? String(s.phase || "").toLowerCase() : "";
    if (phase !== "playing") return undefined;
    const dl = s.turnDeadline != null ? Number(s.turnDeadline) : NaN;
    const sid = String(s.sessionId || "").trim();
    if (!sid || !Number.isFinite(dl)) return undefined;
    const turnSeat = s.turnSeat != null ? Number(s.turnSeat) : NaN;
    const tp = s.turnPhase != null ? String(s.turnPhase) : "";
    if (!Number.isInteger(turnSeat) || turnSeat < 0 || turnSeat > 3) return undefined;
    const turnKey = `${sid}|${dl}|${turnSeat}|${tp || "play"}`;
    if (processedTurnTimeoutKeysRef.current.has(turnKey)) return undefined;
    const ms = Math.max(0, dl - Date.now());
    const t = window.setTimeout(() => {
      void (async () => {
        if (processedTurnTimeoutKeysRef.current.has(turnKey)) return;
        const cur = snapRef.current;
        if (!cur) return;
        const ph = String(cur.phase || "").toLowerCase();
        if (ph !== "playing") return;
        const vdl = cur.turnDeadline != null ? Number(cur.turnDeadline) : NaN;
        const vsid = String(cur.sessionId || "").trim();
        const vts = cur.turnSeat != null ? Number(cur.turnSeat) : NaN;
        const vtp = cur.turnPhase != null ? String(cur.turnPhase) : "";
        const vkey = `${vsid}|${vdl}|${vts}|${vtp || "play"}`;
        if (vkey !== turnKey || Date.now() < vdl) return;
        const revBefore = cur.revision != null ? Number(cur.revision) : NaN;
        const r = await requestOv2ColorClashMarkTurnTimeout(roomId, selfKey, {
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
  }, [roomId, selfKey, roomProductId, snap?.sessionId, snap?.turnDeadline, snap?.turnSeat, snap?.phase, snap?.revision, snap?.turnPhase]);

  const drawCard = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2ColorClashDrawCard(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(humanizeOv2ColorClashError(r.code, r.error || "Draw failed"));
        return { ok: false, code: r.code };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(humanizeOv2ColorClashError(undefined, e instanceof Error ? e.message : String(e)));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const passAfterDraw = useCallback(async () => {
    if (!roomId || !selfKey || !snap) return { ok: false };
    if (busy) return { ok: false };
    setBusy(true);
    setErr("");
    try {
      const r = await requestOv2ColorClashPassAfterDraw(roomId, selfKey, { revision: snap.revision });
      if (!r.ok) {
        setErr(humanizeOv2ColorClashError(r.code, r.error || "Pass failed"));
        return { ok: false, code: r.code };
      }
      if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
      return { ok: true };
    } catch (e) {
      setErr(humanizeOv2ColorClashError(undefined, e instanceof Error ? e.message : String(e)));
      return { ok: false };
    } finally {
      setBusy(false);
    }
  }, [roomId, selfKey, snap, busy]);

  const playCard = useCallback(
    async (card, chosenColor, opts) => {
      if (!roomId || !selfKey || !snap) return { ok: false };
      if (busy) return { ok: false };
      setBusy(true);
      setErr("");
      try {
        const secondCard = opts?.secondCard != null && typeof opts.secondCard === "object" ? opts.secondCard : null;
        const r = await requestOv2ColorClashPlayCard(roomId, selfKey, card, {
          revision: snap.revision,
          chosenColor: chosenColor != null ? chosenColor : null,
          secondCard,
          secondChosenColor: opts?.secondChosenColor != null ? opts.secondChosenColor : null,
        });
        if (!r.ok) {
          setErr(humanizeOv2ColorClashError(r.code, r.error || "Play failed"));
          return { ok: false, code: r.code };
        }
        if (r.snapshot) setSnap(prev => ov2PreferNewerSnapshot(prev, r.snapshot));
        return { ok: true };
      } catch (e) {
        setErr(humanizeOv2ColorClashError(undefined, e instanceof Error ? e.message : String(e)));
        return { ok: false };
      } finally {
        setBusy(false);
      }
    },
    [roomId, selfKey, snap, busy]
  );

  const requestRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2ColorClashRequestRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const cancelRematch = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false };
    return requestOv2ColorClashCancelRematch(roomId, selfKey);
  }, [roomId, selfKey]);

  const startNextMatch = useCallback(
    async expectedMatchSeq => {
      if (!roomId || !selfKey) return { ok: false };
      return requestOv2ColorClashStartNextMatch(roomId, selfKey, expectedMatchSeq);
    },
    [roomId, selfKey]
  );

  const vm = useMemo(() => {
    const phase = snap ? String(snap.phase || "").toLowerCase() : "";
    const missed = snap?.missedTurns && typeof snap.missedTurns === "object" ? snap.missedTurns : {};
    const m = [0, 1, 2, 3].map(i => Math.max(0, Math.min(3, Number(missed[String(i)] ?? missed[i] ?? 0) || 0)));
    const turnDeadline = snap?.turnDeadline != null && Number.isFinite(Number(snap.turnDeadline)) ? Number(snap.turnDeadline) : null;
    const turnTimeLeftMs = phase === "playing" && turnDeadline != null ? Math.max(0, turnDeadline - nowMs) : null;
    const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
    const sid = snap?.sessionId != null ? String(snap.sessionId) : "";
    const mySeat = snap?.mySeat != null && Number.isInteger(Number(snap.mySeat)) ? Number(snap.mySeat) : null;
    const fromServer = surgeUsedForMeFromSnapshot(snap);
    const surgeUsedForMe =
      fromServer != null
        ? fromServer
        : sid.length > 0 && mySeat != null && readOv2CcSurgeUsedStorageFallback(sid, mySeat);
    const turnPhase = snap?.turnPhase != null ? String(snap.turnPhase) : "";
    const surgeAvailableForMe =
      phase === "playing" && mySeat != null && snap?.turnSeat === mySeat && turnPhase === "play" && !surgeUsedForMe;
    const wildLockAppliesToMe =
      mySeat != null &&
      snap?.lockForSeat != null &&
      Number(snap.lockForSeat) === mySeat &&
      snap?.lockedColor != null &&
      Number.isFinite(Number(snap.lockedColor));
    return {
      phase,
      turnSeat: snap?.turnSeat ?? null,
      turnPhase: snap?.turnPhase ?? "",
      mySeat: snap?.mySeat ?? null,
      winnerSeat: snap?.winnerSeat ?? null,
      revision: snap?.revision ?? 0,
      sessionId: snap?.sessionId != null ? String(snap.sessionId) : "",
      turnDeadline,
      turnTimeLeftSec,
      missedStreakBySeat: { 0: m[0], 1: m[1], 2: m[2], 3: m[3] },
      stockCount: snap?.stockCount ?? 0,
      discardCount: snap?.discardCount ?? 0,
      topDiscard: snap?.topDiscard ?? null,
      currentColor: snap?.currentColor ?? null,
      direction: snap?.direction ?? 1,
      handCounts: snap?.handCounts && typeof snap.handCounts === "object" ? snap.handCounts : {},
      eliminated: snap?.eliminated && typeof snap.eliminated === "object" ? snap.eliminated : {},
      activeSeats: Array.isArray(snap?.activeSeats) ? snap.activeSeats : [],
      playerCount: snap?.playerCount ?? 2,
      myHand: Array.isArray(snap?.myHand) ? snap.myHand : [],
      /** @type {Record<string, unknown>[]|null} */
      pendingDrawForYou: Array.isArray(snap?.pendingDrawForYou) ? snap.pendingDrawForYou : null,
      clashCount: snap?.clashCount != null ? Math.max(0, Math.min(4, Math.floor(Number(snap.clashCount)))) : 0,
      lockedColor: snap?.lockedColor != null && Number.isFinite(Number(snap.lockedColor)) ? Math.floor(Number(snap.lockedColor)) : null,
      lockForSeat:
        snap?.lockForSeat != null && Number.isFinite(Number(snap.lockForSeat)) ? Math.floor(Number(snap.lockForSeat)) : null,
      lockExpiresAfterNextTurn: snap?.lockExpiresAfterNextTurn === true,
      wildLockAppliesToMe,
      surgeUsedForMe,
      surgeAvailableForMe,
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
    drawCard,
    passAfterDraw,
    playCard,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq: room?.match_seq != null ? Number(room.match_seq) : null,
  };
}
