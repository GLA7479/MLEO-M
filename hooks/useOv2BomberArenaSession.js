import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import {
  fetchOv2BomberArenaAuthoritativeSnapshot,
  OV2_BOMBER_ARENA_PRODUCT_GAME_ID,
  requestOv2BomberArenaPlayerStep,
  subscribeOv2BomberArenaAuthoritativeSnapshot,
} from "../lib/online-v2/bomber-arena/ov2BomberArenaSessionAdapter";
import { requestOv2BomberArenaClaimSettlement } from "../lib/online-v2/bomber-arena/ov2BomberArenaSettlement";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

/**
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2BomberArenaSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  const [authoritativeSnapshot, setAuthoritativeSnapshot] = useState(/** @type {Record<string, unknown>|null} */ (null));
  const [stepBusy, setStepBusy] = useState(false);
  const [stepError, setStepError] = useState("");
  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const vaultFinishedRefreshForSessionRef = useRef(/** @type {string|null} */ (null));
  const vaultSettleEmptyPollsRef = useRef(0);
  const vaultClaimInFlightRef = useRef(false);
  const clientTickRef = useRef(0);

  useEffect(() => {
    setAuthoritativeSnapshot(null);
    setStepError("");
    clientTickRef.current = 0;
    vaultFinishedRefreshForSessionRef.current = null;
    vaultSettleEmptyPollsRef.current = 0;
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (!roomId || activeSessionKey === "") return;
    setAuthoritativeSnapshot(null);
    setStepError("");
    clientTickRef.current = 0;
    vaultFinishedRefreshForSessionRef.current = null;
    vaultSettleEmptyPollsRef.current = 0;
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_BOMBER_ARENA_PRODUCT_GAME_ID) {
      setAuthoritativeSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const snap = await fetchOv2BomberArenaAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setAuthoritativeSnapshot(prev => /** @type {Record<string, unknown>|null} */ (ov2PreferNewerSnapshot(prev, snap)));
    })();
    const unsub = subscribeOv2BomberArenaAuthoritativeSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setAuthoritativeSnapshot(prev => /** @type {Record<string, unknown>|null} */ (ov2PreferNewerSnapshot(prev, s)));
      },
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey]);

  const phaseLower = useMemo(
    () => String(authoritativeSnapshot?.phase || "").trim().toLowerCase(),
    [authoritativeSnapshot]
  );
  const isPlaying = phaseLower === "playing";
  const isFinished = phaseLower === "finished";

  const sessionId = useMemo(
    () => (authoritativeSnapshot?.sessionId != null ? String(authoritativeSnapshot.sessionId).trim() : ""),
    [authoritativeSnapshot]
  );

  const mySeat = useMemo(() => {
    const raw = authoritativeSnapshot?.mySeat;
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Number(raw);
    return Number.isInteger(n) && (n === 0 || n === 1) ? n : null;
  }, [authoritativeSnapshot]);

  const turnSeat = useMemo(() => {
    const b = authoritativeSnapshot?.board;
    if (b && typeof b === "object" && "turnSeat" in b) {
      const n = Number(/** @type {Record<string, unknown>} */ (b).turnSeat);
      if (n === 0 || n === 1) return n;
    }
    const t = Number(authoritativeSnapshot?.turnSeat);
    return t === 0 || t === 1 ? t : 0;
  }, [authoritativeSnapshot]);

  const isMyTurn = useMemo(() => {
    if (mySeat == null || !isPlaying) return false;
    return mySeat === turnSeat;
  }, [mySeat, isPlaying, turnSeat]);

  const simTicksRemaining = useMemo(() => {
    const raw = authoritativeSnapshot?.simTicksRemaining;
    if (raw === null || raw === undefined || raw === "") return null;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? Math.max(0, n) : null;
  }, [authoritativeSnapshot]);

  const rulesPhase = useMemo(() => {
    const s = String(authoritativeSnapshot?.rulesPhase ?? "").replace(/^"+|"+$/g, "").trim();
    if (s === "sudden_death" || s === "normal" || s === "finished") return s;
    const b = authoritativeSnapshot?.board;
    if (b && typeof b === "object" && "rulesPhase" in b) {
      const t = String(/** @type {Record<string, unknown>} */ (b).rulesPhase || "").trim();
      if (t === "sudden_death" || t === "normal") return t;
    }
    return "normal";
  }, [authoritativeSnapshot]);

  const suddenDeathBombRadius = useMemo(() => {
    const raw = authoritativeSnapshot?.suddenDeathBombRadius;
    const n = Math.floor(Number(raw));
    return n === 1 || n === 2 ? n : null;
  }, [authoritativeSnapshot]);

  const canWait = useMemo(() => authoritativeSnapshot?.canWait === true, [authoritativeSnapshot]);

  const legalMoveCount = useMemo(() => {
    const raw = authoritativeSnapshot?.legalMoveCount;
    const n = Math.floor(Number(raw));
    return Number.isFinite(n) ? Math.max(0, Math.min(4, n)) : null;
  }, [authoritativeSnapshot]);

  const lastAction = useMemo(() => {
    const la = authoritativeSnapshot?.lastAction;
    return la && typeof la === "object" ? /** @type {Record<string, unknown>} */ (la) : null;
  }, [authoritativeSnapshot]);

  const finishReason = useMemo(() => {
    if (!isFinished) return "";
    const fr = authoritativeSnapshot?.finishReason;
    const s = typeof fr === "string" ? fr.replace(/^"+|"+$/g, "").trim() : "";
    return s || "";
  }, [authoritativeSnapshot, isFinished]);

  const sendStep = useCallback(
    async action => {
      if (!roomId || !selfKey || !sessionId) {
        setStepError("Not connected to a match.");
        return;
      }
      if (!isPlaying) return;
      if (!isMyTurn) {
        setStepError("Not your turn.");
        return;
      }
      clientTickRef.current += 1;
      const tick = clientTickRef.current;
      setStepBusy(true);
      setStepError("");
      try {
        const res = await requestOv2BomberArenaPlayerStep(roomId, sessionId, selfKey, action, tick);
        if (res.ok && res.snapshot) {
          setAuthoritativeSnapshot(prev => /** @type {Record<string, unknown>|null} */ (ov2PreferNewerSnapshot(prev, res.snapshot)));
        } else {
          const errMsg = String(res.error || "Move rejected");
          if (res.code === "BAD_WAIT") {
            setStepError("You still have a legal move — cannot pass.");
          } else {
            setStepError(errMsg);
          }
          if (res.code === "NOT_PLAYING" || errMsg.toLowerCase().includes("not active")) {
            const snap = await fetchOv2BomberArenaAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
            if (snap) {
              setAuthoritativeSnapshot(prev => /** @type {Record<string, unknown>|null} */ (ov2PreferNewerSnapshot(prev, snap)));
              const ph = String(snap.phase || "").trim().toLowerCase();
              if (ph === "finished") setStepError("");
            }
          }
        }
      } catch (e) {
        setStepError(e instanceof Error ? e.message : String(e));
      } finally {
        setStepBusy(false);
      }
    },
    [roomId, selfKey, sessionId, isPlaying, isMyTurn]
  );

  const submitMove = useCallback(
    (dx, dy) => {
      void sendStep({ type: "move", dx, dy });
    },
    [sendStep]
  );

  const submitBomb = useCallback(() => {
    void sendStep({ type: "bomb" });
  }, [sendStep]);

  const submitWait = useCallback(() => {
    void sendStep({ type: "wait" });
  }, [sendStep]);

  useEffect(() => {
    if (!isFinished || !authoritativeSnapshot) return;
    if (roomProductId !== OV2_BOMBER_ARENA_PRODUCT_GAME_ID) return;
    const sid = sessionId;
    if (!sid || !roomId || !selfKey) return;
    if (vaultFinishedRefreshForSessionRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2BomberArenaClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
            claim.lines,
            OV2_BOMBER_ARENA_PRODUCT_GAME_ID,
            roomId,
            selfKey
          );
          vaultSettleEmptyPollsRef.current = 0;
          vaultFinishedRefreshForSessionRef.current = sid;
          setVaultClaimError("");
        } else if (!claim.ok) {
          vaultSettleEmptyPollsRef.current = 0;
          setVaultClaimError(String(claim.message || "Could not update balance."));
        } else if (claim.idempotent === true) {
          vaultSettleEmptyPollsRef.current = 0;
          vaultFinishedRefreshForSessionRef.current = sid;
          setVaultClaimError("");
        } else {
          const n = (vaultSettleEmptyPollsRef.current += 1);
          if (n >= 45) {
            vaultSettleEmptyPollsRef.current = 0;
            setVaultClaimError("Settlement is still preparing. Tap Retry.");
          } else {
            window.setTimeout(() => setVaultClaimRetryTick(t => t + 1), Math.min(1200, 280 + n * 40));
          }
        }
      } catch (e) {
        setVaultClaimError(e instanceof Error ? e.message : String(e));
      } finally {
        vaultClaimInFlightRef.current = false;
        await readOnlineV2Vault({ fresh: true }).catch(() => {});
        setVaultClaimBusy(false);
      }
    })();
  }, [isFinished, authoritativeSnapshot, roomProductId, sessionId, roomId, selfKey, vaultClaimRetryTick]);

  const retryVaultClaim = useCallback(() => {
    vaultFinishedRefreshForSessionRef.current = null;
    vaultSettleEmptyPollsRef.current = 0;
    vaultClaimInFlightRef.current = false;
    setVaultClaimError("");
    setVaultClaimRetryTick(t => t + 1);
  }, []);

  return {
    authoritativeSnapshot,
    phaseLower,
    isPlaying,
    isFinished,
    sessionId,
    mySeat,
    turnSeat,
    isMyTurn,
    simTicksRemaining,
    rulesPhase,
    suddenDeathBombRadius,
    canWait,
    legalMoveCount,
    lastAction,
    finishReason,
    stepBusy,
    stepError,
    setStepError,
    submitMove,
    submitBomb,
    submitWait,
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
  };
}
