import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  applyPreviewMark,
  BINGO_PRIZE_KEYS,
  buildDeck,
  canClaimPrize,
  computePreviewLineCompletion,
  generateCard,
  applyMark,
  isFullComplete,
  isRowComplete,
  makeEmptyMarks,
} from "../lib/online-v2/bingo/ov2BingoEngine";
import {
  callOv2BingoNext,
  claimOv2BingoPrize,
  coalesceOv2BingoLiveSnapshots,
  fetchOv2BingoLiveRoundSnapshot,
  normalizeOv2BingoAuthoritativeSnapshot,
  normalizeMemberRow,
  openOv2BingoSession,
  resolveOv2BingoSeatCard,
  OV2_BINGO_PLAY_MODE,
  OV2_BINGO_PRODUCT_GAME_ID,
  resolveOv2BingoPlayMode,
  subscribeOv2BingoAuthoritativeSnapshot,
} from "../lib/online-v2/bingo/ov2BingoSessionAdapter";
import { creditOnlineV2VaultForSettlementLine } from "../lib/online-v2/onlineV2VaultBridge";
import {
  loadOv2BingoMarks,
  ov2BingoMarksStorageKey,
  reconcileBingoMarksToCalled,
  saveOv2BingoMarks,
} from "../lib/online-v2/bingo/ov2BingoMarksStorage";

/** @typedef {import("../lib/online-v2/bingo/ov2BingoSessionAdapter").Ov2BingoAuthoritativeSnapshot} Ov2BingoAuthoritativeSnapshot */

const OV2_BINGO_POLL_MS = 2500;

function initialRoundState() {
  return {
    marks: makeEmptyMarks(),
    called: /** @type {number[]} */ ([]),
    deckPos: 0,
  };
}

function previewDisabledReason(vm) {
  if (vm.deckRemaining <= 0) return "Deck empty";
  return null;
}

/**
 * @param {null|undefined|{
 *   room?: object,
 *   members?: unknown[],
 *   self?: { participant_key?: string, display_name?: string },
 *   reloadRoomContext?: () => void | Promise<void>,
 * }} baseContext
 */
export function useOv2BingoSession(baseContext) {
  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const roomProductId = room?.product_game_id != null ? String(room.product_game_id) : null;
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const reloadRoomContext = baseContext?.reloadRoomContext;

  /** @type {Ov2BingoAuthoritativeSnapshot|null} */
  const [liveSnapshot, setLiveSnapshot] = useState(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const callInFlightRef = useRef(false);
  const lastAutoCallKeyRef = useRef(/** @type {string|null} */ (null));

  const playMode = useMemo(() => {
    return resolveOv2BingoPlayMode(
      roomId ? { room: { id: roomId } } : null,
      liveSnapshot
    );
  }, [roomId, liveSnapshot]);

  const previewSeed = `${roomId ?? "no-room"}:ov2-bingo-preview:v1`;
  const previewCard = useMemo(() => generateCard(previewSeed), [previewSeed]);
  const previewDeck = useMemo(() => buildDeck(previewSeed), [previewSeed]);

  const [previewRound, setPreviewRound] = useState(initialRoundState);
  const [liveMarks, setLiveMarks] = useState(() => makeEmptyMarks());
  const loadedMarksStorageKeyRef = useRef("");

  useEffect(() => {
    setPreviewRound(initialRoundState());
  }, [previewSeed]);

  const marksStorageKey = useMemo(() => {
    if (!roomId || !selfKey || !liveSnapshot?.sessionId) return "";
    return ov2BingoMarksStorageKey(roomId, liveSnapshot.sessionId, selfKey);
  }, [roomId, selfKey, liveSnapshot?.sessionId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_BINGO_PRODUCT_GAME_ID) {
      setLiveSnapshot(null);
      lastAutoCallKeyRef.current = null;
      return undefined;
    }
    let cancelled = false;
    void (async () => {
      const snap = await fetchOv2BingoLiveRoundSnapshot(roomId, { viewerParticipantKey: selfKey ?? "" });
      if (!cancelled) {
        if (!snap) setLiveSnapshot(null);
        else setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, snap, selfKey ?? ""));
      }
    })();

    const unsub = subscribeOv2BingoAuthoritativeSnapshot(roomId, {
      viewerParticipantKey: selfKey ?? "",
      onSnapshot: s => {
        if (!cancelled) setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, s, selfKey ?? ""));
      },
    });

    const poll =
      typeof window !== "undefined"
        ? window.setInterval(() => {
            void (async () => {
              const snap = await fetchOv2BingoLiveRoundSnapshot(roomId, { viewerParticipantKey: selfKey ?? "" });
              if (!cancelled && snap) {
                setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, snap, selfKey ?? ""));
              }
            })();
          }, OV2_BINGO_POLL_MS)
        : 0;

    return () => {
      cancelled = true;
      unsub();
      if (typeof window !== "undefined" && poll) window.clearInterval(poll);
    };
  }, [roomId, roomProductId, selfKey]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const t = window.setInterval(() => setNowMs(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const walkoverVaultKeyRef = useRef("");

  useEffect(() => {
    walkoverVaultKeyRef.current = "";
  }, [roomId]);

  useEffect(() => {
    if (!roomId || roomProductId !== OV2_BINGO_PRODUCT_GAME_ID) return;
    if (!liveSnapshot || !selfKey) return;
    if (String(liveSnapshot.sessionPhase || "").toLowerCase() !== "finished") return;
    const w = liveSnapshot.walkoverPayoutAmount;
    if (w == null || !Number.isFinite(Number(w)) || Number(w) <= 0) return;
    if (String(liveSnapshot.winner?.participantKey || "").trim() !== selfKey) return;
    const sid = String(liveSnapshot.sessionId || "").trim();
    if (!sid) return;
    const k = `${sid}:${w}`;
    if (walkoverVaultKeyRef.current === k) return;
    walkoverVaultKeyRef.current = k;
    const idem = `ov2:bingo:walkover:${sid}`;
    void creditOnlineV2VaultForSettlementLine(Math.floor(Number(w)), OV2_BINGO_PRODUCT_GAME_ID, idem);
  }, [
    roomId,
    roomProductId,
    liveSnapshot,
    selfKey,
  ]);

  const myLiveSeatIndex = useMemo(() => {
    if (!liveSnapshot || !selfKey) return null;
    const m = liveSnapshot.members.find(mm => mm.participantKey === selfKey);
    return m?.seatIndex ?? null;
  }, [liveSnapshot, selfKey]);

  const liveCard = useMemo(() => {
    if (!liveSnapshot || myLiveSeatIndex == null) return null;
    return resolveOv2BingoSeatCard(
      liveSnapshot.deckCardsBySeat,
      liveSnapshot.seed,
      liveSnapshot.roundId,
      myLiveSeatIndex
    );
  }, [liveSnapshot, myLiveSeatIndex]);

  useEffect(() => {
    const activeLive =
      playMode === OV2_BINGO_PLAY_MODE.LIVE_MATCH_ACTIVE && Boolean(marksStorageKey) && Boolean(liveCard);

    if (!activeLive) {
      if (playMode !== OV2_BINGO_PLAY_MODE.LIVE_MATCH_ACTIVE) {
        loadedMarksStorageKeyRef.current = "";
      }
      if (!marksStorageKey || !liveCard) {
        setLiveMarks(makeEmptyMarks());
      }
      return;
    }

    const called = liveSnapshot?.calledNumbers ?? [];
    if (loadedMarksStorageKeyRef.current !== marksStorageKey) {
      loadedMarksStorageKeyRef.current = marksStorageKey;
      const raw = loadOv2BingoMarks(marksStorageKey);
      const base = raw && raw.length === 25 ? [...raw] : makeEmptyMarks();
      // Avoid stripping persisted marks while `called` is still empty (e.g. first snapshot after refresh).
      setLiveMarks(called.length > 0 ? reconcileBingoMarksToCalled(liveCard, base, called) : base);
      return;
    }

    setLiveMarks(prev =>
      called.length > 0 ? reconcileBingoMarksToCalled(liveCard, prev, called) : prev
    );
  }, [playMode, marksStorageKey, liveCard, liveSnapshot?.calledNumbers]);

  const nextCallDue = useMemo(() => {
    if (!liveSnapshot?.nextCallAtIso) return true;
    const t = Date.parse(liveSnapshot.nextCallAtIso);
    if (!Number.isFinite(t)) return true;
    return nowMs >= t;
  }, [liveSnapshot, nowMs]);

  const canCallNextNow = useMemo(() => {
    if (!liveSnapshot || !nextCallDue) return false;
    return Boolean(liveSnapshot.canCallNext);
  }, [liveSnapshot, nextCallDue]);

  useEffect(() => {
    if (!roomId) return;
    if (playMode !== OV2_BINGO_PLAY_MODE.LIVE_MATCH_ACTIVE || !liveSnapshot || !selfKey) return;
    if (liveSnapshot.sessionPhase !== "playing") return;
    if (!canCallNextNow || callInFlightRef.current) return;

    const key = `${liveSnapshot.sessionId}:${liveSnapshot.revision}:${liveSnapshot.deckPosition}`;
    if (lastAutoCallKeyRef.current === key) return;

    callInFlightRef.current = true;
    lastAutoCallKeyRef.current = key;
    void (async () => {
      try {
        const r = await callOv2BingoNext(roomId, selfKey, liveSnapshot.revision);
        if (r.ok && "snapshot" in r && r.snapshot) {
          setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, r.snapshot, selfKey));
        } else {
          lastAutoCallKeyRef.current = null;
        }
      } catch {
        lastAutoCallKeyRef.current = null;
      } finally {
        callInFlightRef.current = false;
      }
    })();
  }, [playMode, liveSnapshot, selfKey, roomId, canCallNextNow]);

  const callNextPreviewNumber = useCallback(() => {
    setPreviewRound(prev => {
      if (prev.deckPos >= previewDeck.length) return prev;
      const n = previewDeck[prev.deckPos];
      return {
        marks: prev.marks,
        called: [...prev.called, n],
        deckPos: prev.deckPos + 1,
      };
    });
  }, [previewDeck]);

  const resetPreviewRound = useCallback(() => {
    setPreviewRound(initialRoundState());
  }, []);

  const onCellClick = useCallback(
    n => {
      if (playMode === OV2_BINGO_PLAY_MODE.PREVIEW_LOCAL) {
        setPreviewRound(prev => {
          const { marks: next, changed } = applyPreviewMark(previewCard, prev.marks, n, new Set(prev.called));
          if (!changed) return prev;
          return { ...prev, marks: next };
        });
        return;
      }
      if (playMode === OV2_BINGO_PLAY_MODE.LIVE_MATCH_ACTIVE && liveCard && liveSnapshot) {
        const calledSet = new Set(liveSnapshot.calledNumbers ?? []);
        if (!calledSet.has(n)) return;
        setLiveMarks(prev => {
          const { marks: next, changed } = applyMark(liveCard, prev, n);
          if (!changed) return prev;
          const key = ov2BingoMarksStorageKey(roomId ?? "", liveSnapshot.sessionId ?? "", selfKey ?? "");
          if (key) saveOv2BingoMarks(key, next);
          return next;
        });
      }
    },
    [playMode, previewCard, liveCard, liveSnapshot, roomId, selfKey]
  );

  const refreshLiveSnapshot = useCallback(async () => {
    if (!roomId) return;
    const snap = await fetchOv2BingoLiveRoundSnapshot(roomId, { viewerParticipantKey: selfKey ?? "" });
    if (snap) {
      setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, snap, selfKey ?? ""));
    }
  }, [roomId, selfKey]);

  const openSession = useCallback(async () => {
    if (!roomId || !selfKey) return { ok: false, error: "Not ready" };
    const r = await openOv2BingoSession(roomId, selfKey);
    if (r.ok && r.snapshot) {
      setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, r.snapshot, selfKey));
    }
    await refreshLiveSnapshot();
    if (typeof reloadRoomContext === "function") void Promise.resolve(reloadRoomContext());
    return r;
  }, [roomId, selfKey, refreshLiveSnapshot, reloadRoomContext]);

  const callNextManual = useCallback(async () => {
    if (!roomId || !selfKey || !liveSnapshot) return { ok: false, error: "Not ready" };
    const r = await callOv2BingoNext(roomId, selfKey, liveSnapshot.revision);
    if (r.ok && "snapshot" in r && r.snapshot) {
      setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, r.snapshot, selfKey));
    }
    return r;
  }, [roomId, selfKey, liveSnapshot]);

  const claimPrize = useCallback(
    async prizeKey => {
      if (!roomId || !selfKey || !liveSnapshot) return { ok: false, error: "Not ready" };
      const pk = String(prizeKey ?? "").trim();
      const r = await claimOv2BingoPrize(roomId, pk, selfKey, liveSnapshot.revision);
      if (r.ok && "snapshot" in r && r.snapshot) {
        setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, r.snapshot, selfKey));
        const snap = r.snapshot;
        const claims = Array.isArray(snap.claims) ? snap.claims : [];
        const just = claims.filter(c => c.claimedByParticipantKey === selfKey && c.prizeKey === pk).pop();
        const amt = just && typeof just.amount === "number" ? just.amount : Number(just?.amount);
        const cid = just?.id != null ? String(just.id).trim() : "";
        // Must match `ov2_settlement_lines.idempotency_key` from `ov2_bingo_claim_prize` (`ov2:bingo:settle:` || claim id).
        if (cid && Number.isFinite(amt) && amt > 0) {
          const idem = `ov2:bingo:settle:${cid}`;
          void creditOnlineV2VaultForSettlementLine(Math.floor(amt), OV2_BINGO_PRODUCT_GAME_ID, idem);
        }
      }
      await refreshLiveSnapshot();
      return r;
    },
    [roomId, selfKey, liveSnapshot, refreshLiveSnapshot]
  );

  const rebindSnapshotFromServerPayload = useCallback(
    raw => {
      const s = normalizeOv2BingoAuthoritativeSnapshot(raw, { viewerParticipantKey: selfKey ?? "" });
      if (s) setLiveSnapshot(prev => coalesceOv2BingoLiveSnapshots(prev, s, selfKey ?? ""));
    },
    [selfKey]
  );

  const membersVm = useMemo(() => {
    if (liveSnapshot && Array.isArray(liveSnapshot.members)) return liveSnapshot.members;
    return members.map(normalizeMemberRow);
  }, [liveSnapshot, members]);

  const vm = useMemo(() => {
    if (playMode === OV2_BINGO_PLAY_MODE.LIVE_ROOM_NO_MATCH_YET) {
      const life = room?.lifecycle_phase != null ? String(room.lifecycle_phase) : "";
      const ctxHostPk = room?.host_participant_key != null ? String(room.host_participant_key).trim() : "";
      const ctxIsHost = Boolean(selfKey && ctxHostPk && selfKey === ctxHostPk);
      const allowHostOpenOverride = ctxIsHost && life === "active";
      let phaseLine = "Waiting for the host to open a Bingo match.";
      if (life === "lobby") phaseLine = "Waiting for players — the host must start the match from the lobby.";
      else if (life === "pending_start" || life === "pending_stakes") phaseLine = "Waiting for stake commits from all players.";
      else if (life === "active")
        phaseLine = liveSnapshot?.canOpenSession
          ? "Room is ready — the host can open Bingo when at least two players are seated and staked."
          : "Waiting for the host to open Bingo.";
      /** @type {Record<string, string|null>} */
      const roomNoMatchPrizeDisabled = {};
      for (const pk of BINGO_PRIZE_KEYS) {
        roomNoMatchPrizeDisabled[pk] = "No active Bingo round yet";
      }
      const emptyMarks = makeEmptyMarks();
      return {
        playMode,
        isLive: true,
        card: previewCard,
        marks: emptyMarks,
        called: /** @type {number[]} */ ([]),
        calledSet: new Set(),
        lastCalled: null,
        phaseLine,
        deckRemaining: previewDeck.length,
        deckTotal: previewDeck.length,
        previewLine: { completedRowIndexes: [], hasAnyRow: false, isFull: false },
        authoritativeSnapshot: liveSnapshot,
        revision: liveSnapshot?.revision ?? 0,
        nextCallAtIso: liveSnapshot?.nextCallAtIso ?? null,
        msUntilNextCall: null,
        announcement: null,
        walkoverPayoutAmount: null,
        winner: null,
        availablePrizeKeys: [],
        claims: [],
        membersVm,
        selfClaimedPrizeKeys: [],
        prizeDisabledByKey: roomNoMatchPrizeDisabled,
        roomLifecyclePhase: life || null,
        roomActiveSessionId: room?.active_session_id != null ? String(room.active_session_id) : null,
        callerSeatIndex: liveSnapshot?.callerSeatIndex ?? null,
        callerParticipantKey: liveSnapshot?.callerParticipantKey ?? null,
        sessionPhase: liveSnapshot?.sessionPhase ?? null,
        canOpenSession: liveSnapshot?.canOpenSession ?? false,
        canCallNext: false,
        canCallNextNow: false,
        canClaimAnyPrize: false,
        canRequestRematch: false,
        canCancelRematch: false,
        canStartNextMatch: false,
        cardIsAuthoritative: false,
        disabledReasons: {
          openSession: !selfKey
            ? "No participant id"
            : liveSnapshot && !liveSnapshot.canOpenSession && !allowHostOpenOverride
              ? "Cannot open now"
              : null,
          callNext: "Calls start after the host opens the round.",
          claim: "No live match",
          rematch: "No finished match",
          startNextMatch: "Not host or not ready",
        },
      };
    }

    if (playMode === OV2_BINGO_PLAY_MODE.PREVIEW_LOCAL) {
      const linePreview = computePreviewLineCompletion(previewRound.marks);
      const previewCalledSet = new Set(previewRound.called);
      const previewLast = previewRound.called.length ? previewRound.called[previewRound.called.length - 1] : null;
      let phaseLine = "Open Shared rooms to play Bingo online.";
      /** @type {Record<string, string|null>} */
      const previewPrizeDisabled = {};
      for (const pk of BINGO_PRIZE_KEYS) {
        previewPrizeDisabled[pk] = "Not in a live Bingo room";
      }

      return {
        playMode,
        isLive: false,
        card: previewCard,
        marks: previewRound.marks,
        called: previewRound.called,
        calledSet: previewCalledSet,
        lastCalled: previewLast,
        phaseLine,
        deckRemaining: Math.max(0, previewDeck.length - previewRound.deckPos),
        deckTotal: previewDeck.length,
        previewLine: linePreview,
        authoritativeSnapshot: liveSnapshot,
        revision: liveSnapshot?.revision ?? 0,
        nextCallAtIso: liveSnapshot?.nextCallAtIso ?? null,
        msUntilNextCall: null,
        announcement: null,
        walkoverPayoutAmount: null,
        winner: null,
        availablePrizeKeys: [],
        claims: [],
        membersVm,
        selfClaimedPrizeKeys: [],
        prizeDisabledByKey: previewPrizeDisabled,
        roomLifecyclePhase: null,
        roomActiveSessionId: null,
        callerSeatIndex: liveSnapshot?.callerSeatIndex ?? null,
        callerParticipantKey: liveSnapshot?.callerParticipantKey ?? null,
        sessionPhase: liveSnapshot?.sessionPhase ?? null,
        canOpenSession: false,
        canCallNext: false,
        canCallNextNow: false,
        canClaimAnyPrize: false,
        canRequestRematch: false,
        canCancelRematch: false,
        canStartNextMatch: false,
        cardIsAuthoritative: false,
        disabledReasons: {
          openSession: "Not connected to a room",
          callNext: "Not connected to a room",
          claim: "No live match",
          rematch: "No finished match",
          startNextMatch: "Not host or not ready",
        },
      };
    }

    const snap = liveSnapshot;
    const called = snap?.calledNumbers ?? [];
    const lastCalledLive = snap?.lastNumber ?? (called.length ? called[called.length - 1] : null);
    const deckTotal = snap?.deckTotal ?? 75;
    const deckRem = Math.max(0, deckTotal - (snap?.deckPosition ?? 0));
    let msUntilNextCall = null;
    if (snap?.nextCallAtIso) {
      const t = Date.parse(snap.nextCallAtIso);
      if (Number.isFinite(t)) msUntilNextCall = Math.max(0, t - nowMs);
    }

    const dr = {
      openSession: snap?.canOpenSession ? null : snap?.roomLifecyclePhase !== "active" ? "Room not active" : "Session already active or not eligible",
      callNext: snap?.canCallNext ? (nextCallDue ? null : "Waiting for call timer") : "Only the caller can draw",
      claim: snap?.sessionPhase === "playing" ? (!liveCard ? "No card (seat required)" : null) : "Match not in play",
      rematch: "Rematch not available",
      cancelRematch: "Nothing to cancel",
      startNextMatch: "Not available",
    };

    const selfClaimedPrizeKeys =
      selfKey && snap?.claims?.length
        ? snap.claims.filter(c => c.claimedByParticipantKey === selfKey).map(c => c.prizeKey)
        : [];

    const takenPrizeKeys = new Set((snap?.claims ?? []).map(c => c.prizeKey));
    const existingClaimsForEngine = (snap?.claims ?? []).map(c => ({
      prize_key: c.prizeKey,
      amount: c.amount,
    }));

    /** @type {Record<string, string|null>} */
    const prizeDisabledByKey = {};
    for (const pk of BINGO_PRIZE_KEYS) {
      if (snap?.sessionPhase === "finished") prizeDisabledByKey[pk] = "Match finished";
      else if (dr.claim) prizeDisabledByKey[pk] = dr.claim;
      else if (takenPrizeKeys.has(pk)) prizeDisabledByKey[pk] = "Already claimed";
      else if (!liveCard) prizeDisabledByKey[pk] = "No card (seat required)";
      else if (
        !canClaimPrize({
          prizeKey: pk,
          card: liveCard,
          called,
          existingClaims: existingClaimsForEngine,
        })
      ) {
        prizeDisabledByKey[pk] = "Not eligible yet";
      } else if (pk === "full") {
        prizeDisabledByKey[pk] = isFullComplete(liveMarks) ? null : "Not eligible yet";
      } else {
        const m = /^row([1-5])$/.exec(pk);
        const ri = m ? Number(m[1]) - 1 : -1;
        prizeDisabledByKey[pk] =
          ri >= 0 && isRowComplete(liveMarks, ri) ? null : "Not eligible yet";
      }
    }

    let phaseLine = "Playing — numbers are called on the server.";
    if (snap?.sessionPhase === "playing") phaseLine = "Playing";
    else if (snap?.sessionPhase === "finished") phaseLine = "Finished";

    return {
      playMode,
      isLive: true,
      card: liveCard || previewCard,
      marks: liveMarks,
      called,
      calledSet: new Set(called),
      lastCalled: lastCalledLive,
      phaseLine,
      deckRemaining: deckRem,
      deckTotal,
      previewLine: { completedRowIndexes: [], hasAnyRow: false, isFull: false },
      authoritativeSnapshot: snap,
      revision: snap?.revision ?? 0,
      nextCallAtIso: snap?.nextCallAtIso ?? null,
      msUntilNextCall,
      announcement: null,
      walkoverPayoutAmount: snap?.walkoverPayoutAmount ?? null,
      winner: snap?.winner ?? null,
      availablePrizeKeys: [],
      claims: snap?.claims ?? [],
      membersVm,
      selfClaimedPrizeKeys,
      prizeDisabledByKey,
      roomLifecyclePhase: snap?.roomLifecyclePhase ?? null,
      roomActiveSessionId: snap?.roomActiveSessionId ?? null,
      callerSeatIndex: snap?.callerSeatIndex ?? null,
      callerParticipantKey: snap?.callerParticipantKey ?? null,
      sessionPhase: snap?.sessionPhase ?? null,
      canOpenSession: snap?.canOpenSession ?? false,
      canCallNext: snap?.canCallNext ?? false,
      canCallNextNow,
      canClaimAnyPrize: false,
      canRequestRematch: false,
      canCancelRematch: false,
      canStartNextMatch: false,
      cardIsAuthoritative: Boolean(liveCard),
      disabledReasons: dr,
    };
  }, [
    playMode,
    previewCard,
    previewRound.marks,
    previewRound.called,
    previewRound.deckPos,
    previewDeck.length,
    liveSnapshot,
    liveCard,
    liveMarks,
    canCallNextNow,
    nextCallDue,
    nowMs,
    selfKey,
    room,
    membersVm,
  ]);

  const previewDisableCall = previewDisabledReason({
    deckRemaining: Math.max(0, previewDeck.length - previewRound.deckPos),
  });

  return {
    /** @type {(typeof OV2_BINGO_PLAY_MODE)[keyof typeof OV2_BINGO_PLAY_MODE]} */
    playMode,
    vm,
    liveSnapshot,
    members,
    room,
    selfKey,
    callNextPreviewNumber,
    resetPreviewRound,
    onCellClick,
    onToggleMark: onCellClick,
    previewDisabledReasonCallNext: previewDisableCall,
    actions: {
      refreshLiveSnapshot,
      openSession,
      callNextManual,
      claimPrize,
    },
    rebindSnapshotFromServerPayload,
  };
}
