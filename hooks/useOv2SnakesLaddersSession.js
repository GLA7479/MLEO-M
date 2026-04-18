import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OV2_LUDO_PLAY_MODE,
  resolveOv2LudoMySeatFromRoomMembers,
  resolveOv2LudoPlayMode,
} from "../lib/online-v2/ludo/ov2LudoSessionAdapter";
import {
  fetchOv2SnakesLaddersAuthoritativeSnapshot,
  OV2_SNAKES_LADDERS_PRODUCT_GAME_ID,
  requestOv2SnakesLaddersCompleteMove,
  requestOv2SnakesLaddersHandleDoubleTimeout,
  requestOv2SnakesLaddersMarkMissedTurn,
  requestOv2SnakesLaddersOfferDouble,
  requestOv2SnakesLaddersRespondDouble,
  requestOv2SnakesLaddersRoll,
  subscribeOv2SnakesLaddersAuthoritativeSnapshot,
} from "../lib/online-v2/snakes-ladders/ov2SnakesLaddersSessionAdapter";
import { supabaseMP } from "../lib/supabaseClients";
import { readOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { applyBoardPathSettlementClaimLinesToVaultAndConfirm } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import { requestOv2SnakesLaddersClaimSettlement } from "../lib/online-v2/snakes-ladders/ov2SnakesLaddersSettlement";
import { ov2PreferNewerSnapshot } from "../lib/online-v2/ov2PreferNewerSnapshot";

const OV2_SL_LIVE_ROLL_MIN_MS = 2000;
const OV2_SL_DICE_FACE_HOLD_MS = 1200;

function sleepMs(ms) {
  return new Promise(resolve => {
    if (typeof window === "undefined") {
      resolve();
      return;
    }
    window.setTimeout(resolve, ms);
  });
}

function parseSeatIndex(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0 || n > 3) return null;
  return n;
}

/** @param {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null|undefined} snap */
function snapshotResolvedRollFace(snap) {
  if (!snap) return null;
  const raw = snap.board?.dice ?? snap.dice ?? snap.board?.lastDice ?? snap.lastDice;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 && n <= 6 ? n : null;
}

/**
 * OV2 Snakes & Ladders — session hook (parity with `useOv2LudoSession` for double / turn / vault).
 *
 * @param {null|undefined|{ room?: object, members?: unknown[], self?: { participant_key?: string } }} baseContext
 */
export function useOv2SnakesLaddersSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const roomLifecycle = room?.lifecycle_phase != null ? String(room.lifecycle_phase) : null;
  const activeSessionKey =
    room?.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id)
      : "";
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;

  /** @type {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null} */
  const [authoritativeSnapshot, setAuthoritativeSnapshot] = useState(null);
  const [presentKeys, setPresentKeys] = useState([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const authoritativeSnapshotRef = useRef(/** @type {import("../lib/online-v2/ludo/ov2LudoSessionAdapter").Ov2LudoAuthoritativeSnapshot|null} */ (null));
  const processedExpiredTurnKeysRef = useRef(new Set());
  const processedDoubleExpiryKeysRef = useRef(new Set());
  const vaultDoubleMultRef = useRef(/** @type {{ sessionId: string, mult: number } | null} */ (null));
  const vaultFinishedRefreshForSessionRef = useRef(/** @type {string|null} */ (null));
  const slVaultSettleEmptyPollsRef = useRef(0);
  const vaultClaimInFlightRef = useRef(false);
  const doubleRpcInFlightRef = useRef(false);
  const [doubleRpcBusy, setDoubleRpcBusy] = useState(false);
  const [doubleRpcErr, setDoubleRpcErr] = useState("");
  const [vaultClaimError, setVaultClaimError] = useState("");
  const [vaultClaimRetryTick, setVaultClaimRetryTick] = useState(0);
  const [diceRolling, setDiceRolling] = useState(false);
  const [liveSpinTick, setLiveSpinTick] = useState(1);
  const [liveRollServerFace, setLiveRollServerFace] = useState(/** @type {number|null} */ (null));
  const [liveDiceRevealHold, setLiveDiceRevealHold] = useState(/** @type {{ face: number, until: number } | null} */ (null));

  useEffect(() => {
    authoritativeSnapshotRef.current = authoritativeSnapshot;
  }, [authoritativeSnapshot]);

  useEffect(() => {
    setAuthoritativeSnapshot(null);
    processedExpiredTurnKeysRef.current.clear();
    processedDoubleExpiryKeysRef.current.clear();
    setLiveDiceRevealHold(null);
    setLiveRollServerFace(null);
    vaultDoubleMultRef.current = null;
    vaultFinishedRefreshForSessionRef.current = null;
    slVaultSettleEmptyPollsRef.current = 0;
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
    doubleRpcInFlightRef.current = false;
    setDoubleRpcBusy(false);
    setDoubleRpcErr("");
  }, [roomId]);

  useEffect(() => {
    if (!roomId || activeSessionKey === "") return;
    setAuthoritativeSnapshot(null);
    processedExpiredTurnKeysRef.current.clear();
    processedDoubleExpiryKeysRef.current.clear();
    setLiveDiceRevealHold(null);
    setLiveRollServerFace(null);
    vaultDoubleMultRef.current = null;
    vaultFinishedRefreshForSessionRef.current = null;
    slVaultSettleEmptyPollsRef.current = 0;
    setVaultClaimBusy(false);
    setVaultClaimError("");
    setVaultClaimRetryTick(0);
    vaultClaimInFlightRef.current = false;
    doubleRpcInFlightRef.current = false;
    setDoubleRpcBusy(false);
    setDoubleRpcErr("");
  }, [roomId, activeSessionKey]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) {
      setAuthoritativeSnapshot(null);
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const snap = await fetchOv2SnakesLaddersAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
      if (!cancelled) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, snap ?? null));
    })();

    const unsub = subscribeOv2SnakesLaddersAuthoritativeSnapshot(roomId, {
      participantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, s));
      },
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [roomId, roomProductId, selfKey, activeSessionKey]);

  useEffect(() => {
    if (!roomId || !selfKey || roomProductId !== OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) return undefined;
    const channel = supabaseMP
      .channel(`ov2_snakes_ladders_presence:${roomId}`)
      .on("presence", { event: "sync" }, () => {
        const st = channel.presenceState();
        const all = Object.values(st).flat();
        const keys = all
          .map(r => (r && typeof r === "object" && "participant_key" in r ? String(r.participant_key || "").trim() : ""))
          .filter(Boolean);
        setPresentKeys(keys);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await channel.track({ participant_key: selfKey, at: new Date().toISOString() });
        }
      });
    return () => {
      void supabaseMP.removeChannel(channel);
      setPresentKeys([]);
    };
  }, [roomId, selfKey, roomProductId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const t = window.setInterval(() => {
      setNowMs(Date.now());
    }, 250);
    return () => window.clearInterval(t);
  }, []);

  const playMode = useMemo(() => {
    const ctx = roomId ? { room: { id: roomId } } : null;
    return resolveOv2LudoPlayMode(ctx, authoritativeSnapshot);
  }, [roomId, authoritativeSnapshot]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    if (roomProductId !== OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) return;
    const sid = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sid) return;
    const mult = Math.max(1, Number(authoritativeSnapshot.doubleState?.value ?? 1) || 1);
    const prev = vaultDoubleMultRef.current;
    if (prev && prev.sessionId === sid && mult > prev.mult) {
      void readOnlineV2Vault({ fresh: true }).catch(() => {});
    }
    vaultDoubleMultRef.current = { sessionId: sid, mult };
  }, [playMode, authoritativeSnapshot, roomProductId]);

  const [vaultClaimBusy, setVaultClaimBusy] = useState(false);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    if (roomProductId !== OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) return;
    if (String(authoritativeSnapshot.phase || "").trim().toLowerCase() !== "finished") return;
    const sid = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sid || !roomId || !selfKey) return;
    if (vaultFinishedRefreshForSessionRef.current === sid) return;
    if (vaultClaimInFlightRef.current) return;
    vaultClaimInFlightRef.current = true;
    setVaultClaimBusy(true);
    setVaultClaimError("");
    void (async () => {
      try {
        const claim = await requestOv2SnakesLaddersClaimSettlement(roomId, selfKey);
        if (claim.ok && Array.isArray(claim.lines) && claim.lines.length > 0) {
          await applyBoardPathSettlementClaimLinesToVaultAndConfirm(
            claim.lines,
            OV2_SNAKES_LADDERS_PRODUCT_GAME_ID,
            roomId,
            selfKey
          );
          slVaultSettleEmptyPollsRef.current = 0;
          vaultFinishedRefreshForSessionRef.current = sid;
          setVaultClaimError("");
        } else if (!claim.ok) {
          slVaultSettleEmptyPollsRef.current = 0;
          setVaultClaimError(String(claim.message || "Could not update balance."));
        } else if (claim.idempotent === true) {
          slVaultSettleEmptyPollsRef.current = 0;
          vaultFinishedRefreshForSessionRef.current = sid;
          setVaultClaimError("");
        } else {
          const n = (slVaultSettleEmptyPollsRef.current += 1);
          if (n >= 45) {
            slVaultSettleEmptyPollsRef.current = 0;
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
  }, [playMode, authoritativeSnapshot, roomProductId, roomId, selfKey, vaultClaimRetryTick]);

  const retryVaultClaim = useCallback(() => {
    vaultFinishedRefreshForSessionRef.current = null;
    slVaultSettleEmptyPollsRef.current = 0;
    vaultClaimInFlightRef.current = false;
    setVaultClaimError("");
    setVaultClaimRetryTick(t => t + 1);
  }, []);

  const liveMySeat = useMemo(() => {
    if (authoritativeSnapshot?.mySeat != null) return authoritativeSnapshot.mySeat;
    return resolveOv2LudoMySeatFromRoomMembers(members, selfKey);
  }, [authoritativeSnapshot, members, selfKey]);

  const interactionTier = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && authoritativeSnapshot && authoritativeSnapshot.boardViewReadOnly !== true) {
      return "live_authoritative";
    }
    return "none";
  }, [playMode, authoritativeSnapshot]);

  useEffect(() => {
    if (!liveDiceRevealHold) return;
    if (nowMs < liveDiceRevealHold.until) return;
    setLiveDiceRevealHold(null);
  }, [nowMs, liveDiceRevealHold]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !diceRolling) return undefined;
    if (liveRollServerFace != null) return undefined;
    const id = window.setInterval(() => {
      setLiveSpinTick(prev => {
        let n = prev;
        for (let i = 0; i < 8 && n === prev; i++) {
          n = 1 + Math.floor(Math.random() * 6);
        }
        return n;
      });
    }, 85);
    return () => window.clearInterval(id);
  }, [playMode, diceRolling, liveRollServerFace]);

  const liveDiceDisplayValue = useMemo(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE) return undefined;
    if (diceRolling) return liveSpinTick;
    if (liveDiceRevealHold != null && nowMs < liveDiceRevealHold.until) {
      return liveDiceRevealHold.face;
    }
    return undefined;
  }, [playMode, diceRolling, liveSpinTick, liveDiceRevealHold, nowMs]);

  const refreshAuthoritativeSnapshot = useCallback(async () => {
    if (!roomId || roomProductId !== OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) return null;
    const snap = await fetchOv2SnakesLaddersAuthoritativeSnapshot(roomId, { participantKey: selfKey ?? "" });
    if (snap) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, snap));
    return snap ?? null;
  }, [roomId, roomProductId, selfKey]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return;
    const poll = window.setInterval(() => {
      void (async () => {
        const snap = await fetchOv2SnakesLaddersAuthoritativeSnapshot(roomId || "", { participantKey: selfKey ?? "" });
        if (snap) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, snap));
      })();
    }, 2000);
    return () => window.clearInterval(poll);
  }, [playMode, authoritativeSnapshot, roomId, selfKey]);

  const phaseLine = useMemo(() => {
    if (playMode === OV2_LUDO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET) {
      if (roomProductId === OV2_SNAKES_LADDERS_PRODUCT_GAME_ID) {
        if (roomLifecycle === "active" && !activeSessionKey) {
          return "Match stakes are locked — waiting for the host to open the Snakes & Ladders session.";
        }
        if (roomLifecycle && roomLifecycle !== "active") {
          return `Room is ${roomLifecycle} — open a live match once the room is active and the host starts.`;
        }
        return "Snakes & Ladders room — no live session yet (host opens when 2–4 players are seated).";
      }
      return "Room open — no authoritative match loaded.";
    }
    if (authoritativeSnapshot?.phase === "finished") {
      return "Match finished — authoritative result from server.";
    }
    return "Live match — server-owned dice and moves.";
  }, [playMode, authoritativeSnapshot, roomProductId, roomLifecycle, activeSessionKey]);

  const rollDice = useCallback(async () => {
    if (interactionTier !== "live_authoritative") return;
    if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
    const t0 = typeof Date.now === "function" ? Date.now() : 0;
    setLiveRollServerFace(null);
    setDiceRolling(true);
    try {
      const res = await requestOv2SnakesLaddersRoll(roomId, authoritativeSnapshot.sessionId, {
        revision: authoritativeSnapshot.revision,
        participantKey: selfKey,
      });
      const face = res.ok && res.snapshot ? snapshotResolvedRollFace(res.snapshot) : null;
      if (face != null) {
        setLiveRollServerFace(face);
        setLiveSpinTick(face);
      }
      const wait = Math.max(0, OV2_SL_LIVE_ROLL_MIN_MS - (Date.now() - t0));
      await sleepMs(wait);
      if (res.ok && res.snapshot) {
        setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
        const snap = res.snapshot;
        const bd = snap.board?.dice;
        const hasDice = bd != null && bd !== "" && !Number.isNaN(Number(bd));
        if (!hasDice && face != null) {
          setLiveDiceRevealHold({ face, until: Date.now() + OV2_SL_DICE_FACE_HOLD_MS });
        }
      }
    } finally {
      setLiveRollServerFace(null);
      setDiceRolling(false);
    }
  }, [interactionTier, roomId, selfKey, authoritativeSnapshot]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId) return;
    if (authoritativeSnapshot.phase !== "playing") return;
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    const liveTurnSeat = parseSeatIndex(authoritativeSnapshot.board?.turnSeat);
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    if (!sessionId || liveTurnSeat == null || !Number.isFinite(deadline)) return;
    if (!Array.isArray(authoritativeSnapshot.board?.activeSeats) || !authoritativeSnapshot.board.activeSeats.includes(liveTurnSeat)) {
      return;
    }
    const turnMember = members.find(m => Number(m?.seat_index) === Number(liveTurnSeat)) || null;
    const turnParticipantKey = turnMember?.participant_key ? String(turnMember.participant_key).trim() : "";
    if (!turnParticipantKey || presentKeys.includes(turnParticipantKey)) return;
    const turnKey = `${sessionId}|${liveTurnSeat}|${deadline}|playing`;
    if (processedExpiredTurnKeysRef.current.has(turnKey)) return;
    const runMissedTurn = async () => {
      if (processedExpiredTurnKeysRef.current.has(turnKey)) return;
      const snap = authoritativeSnapshotRef.current;
      if (!snap || snap.phase !== "playing") return;
      const verifySeat = parseSeatIndex(snap.board?.turnSeat);
      const verifyDeadline = Number(snap.turnDeadline);
      const verifySessionId = String(snap.sessionId || "").trim();
      const verifyKey =
        verifySessionId && verifySeat != null && Number.isFinite(verifyDeadline)
          ? `${verifySessionId}|${verifySeat}|${verifyDeadline}|playing`
          : null;
      if (verifyKey !== turnKey || Date.now() < verifyDeadline) return;
      if (!Array.isArray(snap.board?.activeSeats) || !snap.board.activeSeats.includes(verifySeat)) return;
      const verifyMember = members.find(m => Number(m?.seat_index) === Number(verifySeat)) || null;
      const verifyParticipantKey = verifyMember?.participant_key ? String(verifyMember.participant_key).trim() : "";
      if (!verifyParticipantKey || presentKeys.includes(verifyParticipantKey)) return;
      const res = await requestOv2SnakesLaddersMarkMissedTurn(roomId, verifySeat, {
        revision: snap.revision,
        participantKey: verifyParticipantKey,
        isGone: true,
      });
      if (res.ok) {
        processedExpiredTurnKeysRef.current.add(turnKey);
        if (res.snapshot) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
        else await refreshAuthoritativeSnapshot();
      } else {
        await refreshAuthoritativeSnapshot();
      }
    };
    const ms = Math.max(0, deadline - Date.now());
    const timer = window.setTimeout(() => {
      void runMissedTurn();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playMode, authoritativeSnapshot, roomId, members, presentKeys, refreshAuthoritativeSnapshot]);

  useEffect(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot || !roomId) return;
    const dbl = authoritativeSnapshot.doubleState;
    const awaiting = dbl && dbl.awaiting != null ? Number(dbl.awaiting) : null;
    const expiresAt = dbl && dbl.expires_at != null ? Number(dbl.expires_at) : null;
    if (awaiting == null || expiresAt == null || Number.isNaN(expiresAt)) return;
    const timeoutKey = `${String(authoritativeSnapshot.sessionId || "")}|${awaiting}|${expiresAt}`;
    if (processedDoubleExpiryKeysRef.current.has(timeoutKey)) return;
    const runDoubleTimeout = async () => {
      if (processedDoubleExpiryKeysRef.current.has(timeoutKey)) return;
      const res = await requestOv2SnakesLaddersHandleDoubleTimeout(roomId, awaiting, {
        revision: authoritativeSnapshot.revision,
      });
      if (res.ok) {
        processedDoubleExpiryKeysRef.current.add(timeoutKey);
        if (res.snapshot) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
        else await refreshAuthoritativeSnapshot();
      } else {
        await refreshAuthoritativeSnapshot();
      }
    };
    const ms = expiresAt - Date.now();
    if (ms <= 0) {
      void runDoubleTimeout();
      return;
    }
    const timer = window.setTimeout(() => {
      void runDoubleTimeout();
    }, ms);
    return () => window.clearTimeout(timer);
  }, [playMode, authoritativeSnapshot, roomId, refreshAuthoritativeSnapshot]);

  const completeMove = useCallback(async () => {
    if (interactionTier !== "live_authoritative") return;
    if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
    const res = await requestOv2SnakesLaddersCompleteMove(roomId, authoritativeSnapshot.sessionId, {
      revision: authoritativeSnapshot.revision,
      participantKey: selfKey,
    });
    if (res.ok && res.snapshot) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
  }, [interactionTier, roomId, selfKey, authoritativeSnapshot]);

  const activeSeatsLive = useMemo(() => {
    if (!Array.isArray(authoritativeSnapshot?.board?.activeSeats)) return [];
    return authoritativeSnapshot.board.activeSeats
      .map(s => parseSeatIndex(s))
      .filter(s => s != null);
  }, [authoritativeSnapshot?.board?.activeSeats]);
  const turnSeatParsed = parseSeatIndex(authoritativeSnapshot?.board?.turnSeat ?? null);
  const turnSeat = turnSeatParsed != null && activeSeatsLive.includes(turnSeatParsed) ? turnSeatParsed : null;
  const turnDeadline = authoritativeSnapshot?.turnDeadline ?? null;
  const authoritativeTurnKey = useMemo(() => {
    if (playMode !== OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE || !authoritativeSnapshot) return null;
    if (authoritativeSnapshot.phase !== "playing") return null;
    if (authoritativeSnapshot.boardViewReadOnly === true) return null;
    const sessionId = String(authoritativeSnapshot.sessionId || "").trim();
    const deadline = Number(authoritativeSnapshot.turnDeadline);
    if (!sessionId || turnSeat == null || !Number.isFinite(deadline)) return null;
    if (!activeSeatsLive.includes(turnSeat)) return null;
    return `${sessionId}|${turnSeat}|${deadline}|playing`;
  }, [playMode, authoritativeSnapshot, turnSeat, activeSeatsLive]);
  const turnTimeLeftMs = authoritativeTurnKey != null ? Math.max(0, Number(turnDeadline) - nowMs) : null;
  const turnTimeLeftSec = turnTimeLeftMs != null ? Math.ceil(turnTimeLeftMs / 1000) : null;
  const isTurnTimerActive = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && turnTimeLeftMs != null && turnTimeLeftMs > 0;
  const isMyTurnLive = playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE && liveMySeat != null && turnSeat === liveMySeat;

  const doubleState = authoritativeSnapshot?.doubleState ?? null;
  const currentMultiplier = Math.max(1, Number(doubleState?.value || 1) || 1);
  const doubleProposedBySeat = parseSeatIndex(doubleState?.proposed_by);
  const doubleAwaitingRaw = parseSeatIndex(doubleState?.awaiting);
  const doubleAwaitingSeat =
    doubleAwaitingRaw != null && activeSeatsLive.includes(doubleAwaitingRaw) ? doubleAwaitingRaw : null;
  const doublePendingSeats = Array.isArray(doubleState?.pending)
    ? doubleState.pending.map(s => parseSeatIndex(s)).filter(s => s != null)
    : [];
  const isDoublePending =
    playMode === OV2_LUDO_PLAY_MODE.LIVE_MATCH_ACTIVE &&
    authoritativeSnapshot?.phase === "playing" &&
    doubleAwaitingSeat != null;
  const doubleExpiresAt =
    doubleState?.expires_at != null && Number.isFinite(Number(doubleState.expires_at))
      ? Number(doubleState.expires_at)
      : null;
  const doubleTimeLeftMs =
    isDoublePending && doubleExpiresAt != null ? Math.max(0, doubleExpiresAt - nowMs) : null;
  const doubleTimeLeftSec = doubleTimeLeftMs != null ? Math.ceil(doubleTimeLeftMs / 1000) : null;
  const isDoubleTimerActive = doubleTimeLeftMs != null && doubleTimeLeftMs > 0;

  const doublePendingPrevRef = useRef(false);
  useEffect(() => {
    const p = Boolean(isDoublePending);
    if (doublePendingPrevRef.current && !p) setDoubleRpcErr("");
    doublePendingPrevRef.current = p;
  }, [isDoublePending]);

  const doubleInitiationsRecord = useMemo(() => {
    const d = authoritativeSnapshot?.doubleInitiations;
    if (!d || typeof d !== "object" || Array.isArray(d)) return {};
    return /** @type {Record<string, unknown>} */ (d);
  }, [authoritativeSnapshot?.doubleInitiations]);
  const myDoubleOfferCount =
    liveMySeat != null
      ? Math.max(0, Math.floor(Number(doubleInitiationsRecord[String(liveMySeat)] ?? 0) || 0))
      : 0;
  const isDoubleOfferCapped = myDoubleOfferCount >= 2;
  const isAtDoubleMultiplierCap = currentMultiplier >= 16;

  const seatStrikeCountMap = useMemo(() => {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0 };
    const raw = authoritativeSnapshot?.missedTurns;
    if (!raw || typeof raw !== "object") return out;
    const byParticipant = new Map(
      members.map(m => [String(m?.participant_key || ""), parseSeatIndex(m?.seat_index)]).filter(([k]) => k)
    );
    for (const [k, v] of Object.entries(raw)) {
      const strikes = Math.max(0, Number(v) || 0);
      if (!strikes) continue;
      const seatFromKey = parseSeatIndex(k);
      if (seatFromKey != null) {
        out[seatFromKey] = Math.max(out[seatFromKey], strikes);
        continue;
      }
      const seat = byParticipant.get(String(k));
      if (seat != null) {
        out[seat] = Math.max(out[seat], strikes);
      }
    }
    return out;
  }, [authoritativeSnapshot?.missedTurns, members]);

  const eliminatedSeats = useMemo(() => {
    return [0, 1, 2, 3].filter(seat => Number(seatStrikeCountMap[seat] || 0) >= 3 && !activeSeatsLive.includes(seat));
  }, [activeSeatsLive, seatStrikeCountMap]);

  const strikeDisplayMap = useMemo(() => {
    const out = { 0: 0, 1: 0, 2: 0, 3: 0 };
    for (const seat of [0, 1, 2, 3]) {
      const strikes = Number(seatStrikeCountMap?.[seat] || 0);
      out[seat] = Math.max(0, Math.min(3, strikes));
    }
    return out;
  }, [seatStrikeCountMap]);

  const statusLine = useMemo(() => {
    if (authoritativeSnapshot?.phase === "finished" && authoritativeSnapshot?.result?.winner != null) {
      return `Match finished — winner Seat ${Number(authoritativeSnapshot.result.winner) + 1}.`;
    }
    if (eliminatedSeats.length > 0) {
      return `Seat ${eliminatedSeats.map(s => Number(s) + 1).join(", ")} eliminated after 3 missed turns.`;
    }
    if (doubleExpiresAt != null && !isDoublePending && doubleExpiresAt <= nowMs) {
      return "Double response timed out — resolving.";
    }
    return "";
  }, [authoritativeSnapshot?.phase, authoritativeSnapshot?.result, eliminatedSeats, isDoublePending, doubleExpiresAt, nowMs]);

  const offerDouble = useCallback(async () => {
    if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
    if (doubleRpcInFlightRef.current) return;
    doubleRpcInFlightRef.current = true;
    setDoubleRpcBusy(true);
    setDoubleRpcErr("");
    try {
      const res = await requestOv2SnakesLaddersOfferDouble(roomId, authoritativeSnapshot.sessionId, {
        revision: authoritativeSnapshot.revision,
        participantKey: selfKey,
      });
      if (res.ok && res.snapshot) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
      else setDoubleRpcErr(String(res.error || "Offer double failed."));
    } catch (e) {
      setDoubleRpcErr(e instanceof Error ? e.message : String(e));
    } finally {
      doubleRpcInFlightRef.current = false;
      setDoubleRpcBusy(false);
    }
  }, [roomId, selfKey, authoritativeSnapshot?.sessionId, authoritativeSnapshot?.revision]);

  const respondDouble = useCallback(
    async answer => {
      if (!roomId || !selfKey || !authoritativeSnapshot?.sessionId) return;
      if (doubleRpcInFlightRef.current) return;
      doubleRpcInFlightRef.current = true;
      setDoubleRpcBusy(true);
      setDoubleRpcErr("");
      try {
        const res = await requestOv2SnakesLaddersRespondDouble(roomId, authoritativeSnapshot.sessionId, answer, {
          revision: authoritativeSnapshot.revision,
          participantKey: selfKey,
        });
        if (res.ok && res.snapshot) setAuthoritativeSnapshot(prev => ov2PreferNewerSnapshot(prev, res.snapshot));
        else setDoubleRpcErr(String(res.error || "Respond double failed."));
      } catch (e) {
        setDoubleRpcErr(e instanceof Error ? e.message : String(e));
      } finally {
        doubleRpcInFlightRef.current = false;
        setDoubleRpcBusy(false);
      }
    },
    [roomId, selfKey, authoritativeSnapshot?.sessionId, authoritativeSnapshot?.revision]
  );

  const displayBoard = authoritativeSnapshot?.board ?? { activeSeats: [], turnSeat: null, dice: null, positions: {} };

  const canRoll = useMemo(() => {
    if (interactionTier !== "live_authoritative" || !authoritativeSnapshot) return false;
    return authoritativeSnapshot.canClientRoll === true && !diceRolling;
  }, [interactionTier, authoritativeSnapshot, diceRolling]);

  const canCompleteMove = useMemo(() => {
    if (interactionTier !== "live_authoritative" || !authoritativeSnapshot) return false;
    return authoritativeSnapshot.canClientMovePiece === true && !diceRolling;
  }, [interactionTier, authoritativeSnapshot, diceRolling]);

  const winnerSeat =
    displayBoard.winner != null
      ? displayBoard.winner
      : authoritativeSnapshot?.winnerSeat != null
        ? authoritativeSnapshot.winnerSeat
        : null;

  return {
    vaultClaimBusy,
    vaultClaimError,
    retryVaultClaim,
    doubleRpcBusy,
    doubleRpcErr,
    vm: {
      playMode,
      interactionTier,
      liveMySeat,
      board: displayBoard,
      diceRolling,
      liveDiceDisplayValue,
      doubleCycleUsedSeats: authoritativeSnapshot?.doubleCycleUsedSeats ?? [],
      doubleInitiations: doubleInitiationsRecord,
      myDoubleOfferCount,
      isDoubleOfferCapped,
      isAtDoubleMultiplierCap,
      matchPhase: authoritativeSnapshot?.phase ?? null,
      phaseLine,
      boardViewReadOnly: authoritativeSnapshot?.boardViewReadOnly === true,
      turnSeat,
      turnDeadline,
      authoritativeTurnKey,
      turnTimeLeftMs,
      turnTimeLeftSec,
      isTurnTimerActive,
      isMyTurnLive,
      doubleState,
      currentMultiplier,
      doubleProposedBySeat,
      doubleAwaitingSeat,
      doublePendingSeats,
      isDoublePending,
      doubleTimeLeftMs,
      doubleTimeLeftSec,
      isDoubleTimerActive,
      result: authoritativeSnapshot?.result ?? null,
      missedTurns: authoritativeSnapshot?.missedTurns ?? null,
      seatStrikeCountMap,
      strikeDisplayMap,
      eliminatedSeats,
      statusLine,
      sessionId: authoritativeSnapshot?.sessionId != null ? String(authoritativeSnapshot.sessionId).trim() : "",
    },
    rollDice,
    completeMove,
    canRoll,
    canCompleteMove,
    offerDouble,
    respondDouble,
  };
}
