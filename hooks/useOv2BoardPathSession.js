import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_PATH_SESSION_PHASE,
  buildBoardPathPostFinishSlice,
  deriveBoardPathViewModel,
} from "../lib/online-v2/ov2BoardPathAdapter";
import { canSelfAct } from "../lib/online-v2/board-path/ov2BoardPathControlContract";
import {
  boardPathRoomIdIsOfflineFixture,
  isBoardPathSelfHost,
  resolveBoardPathHostParticipantKey,
  shouldGuestHydrateLocalBoardPathSession,
  shouldHostOpenLocalBoardPathSession,
} from "../lib/online-v2/board-path/ov2BoardPathOpenContract";
import {
  fetchBoardPathSessionDetailed,
  fetchOv2RoomMembersForRoom,
  rpcOv2BoardPathCancelRematch,
  rpcOv2BoardPathEndTurnSession,
  rpcOv2BoardPathMoveSession,
  rpcOv2BoardPathFinalizeSession,
  rpcOv2BoardPathFinalizeRoom,
  rpcOv2BoardPathOpenSession,
  rpcOv2BoardPathRequestRematch,
  rpcOv2BoardPathRollSession,
  rpcOv2BoardPathStartNextMatch,
} from "../lib/online-v2/board-path/ov2BoardPathSessionApi";
import {
  normalizeClaimSettlementRpcResult,
  rpcOv2BoardPathClaimSettlement,
} from "../lib/online-v2/board-path/ov2BoardPathSettlementApi";
import { applyBoardPathSettlementClaimLinesToVaultWithTrace } from "../lib/online-v2/board-path/ov2BoardPathSettlementDelivery";
import {
  OV2_BP_LIVE_SYNC_DEBOUNCE_MS,
  OV2_BP_LIVE_SYNC_STATE,
  selectBoardPathBundleAfterFetch,
} from "../lib/online-v2/board-path/ov2BoardPathLiveSync";
import {
  advanceTurnLocal,
  appendEvent,
  BOARD_PATH_MANAGER_PHASE,
  boardPathBundleFromDatabase,
  createLocalEvent,
  deriveBoardPathManagerSessionPhase,
  isSameSession,
  mergeBoardPathBundleIntoContext,
  promoteBoardPathPregameToActiveShell,
  replaceLocalSession,
  syntheticBoardPathBundleForFixtureGuest,
  syntheticBoardPathBundleForFixtureHost,
} from "../lib/online-v2/board-path/ov2BoardPathSessionManager";
import { resolveBoardPathActiveSeatIndex } from "../lib/online-v2/board-path/ov2BoardPathEngine";
import {
  ONLINE_V2_GAME_KINDS,
  ONLINE_V2_MEMBER_WALLET_STATE,
  ONLINE_V2_ROOM_PHASE,
} from "../lib/online-v2/ov2Economy";
import { supabaseMP } from "../lib/supabaseClients";

const BP_SEAT_TONES = /** @type {const} */ (["emerald", "sky", "amber", "violet"]);

function nMatchSeq(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : 0;
}

function explicitLocalFixtureQuery() {
  return (
    typeof window !== "undefined" && /[?&]ov2BpLocalFixture=1(?:&|$)/.test(String(window.location.search || ""))
  );
}

/**
 * Board Path session: DB open + fetch via Supabase; same hook surface for UI.
 *
 * @param {import("../lib/online-v2/ov2BoardPathAdapter").Ov2BoardPathContext | null | undefined} baseContext
 */
export function useOv2BoardPathSession(baseContext) {
  const [bundle, setBundle] = useState(null);
  const [roomSessionPatch, setRoomSessionPatch] = useState(null);
  const [sessionSyncFault, setSessionSyncFault] = useState(null);
  const [actionPending, setActionPending] = useState(/** @type {null|"roll"|"move"|"end_turn"} */ (null));
  const [actionError, setActionError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [liveSyncState, setLiveSyncState] = useState(
    /** @type {"idle"|"subscribed"|"refreshing"|"error"} */ (OV2_BP_LIVE_SYNC_STATE.IDLE)
  );
  const [liveSyncError, setLiveSyncError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [lastSyncAt, setLastSyncAt] = useState(/** @type {number|null} */ (null));
  const [liveMembersOverride, setLiveMembersOverride] = useState(/** @type {unknown[]|null} */ (null));
  const [rematchError, setRematchError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [rematchBusy, setRematchBusy] = useState(false);
  const [settlementLines, setSettlementLines] = useState(/** @type {Record<string, unknown>[]|null} */ (null));
  const [finalizeError, setFinalizeError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [finalizeBusy, setFinalizeBusy] = useState(false);
  const [boardPathSessions, setBoardPathSessions] = useState(/** @type {Record<string, unknown>[]|null} */ (null));
  const [roomSettlementLines, setRoomSettlementLines] = useState(/** @type {Record<string, unknown>[]|null} */ (null));
  const [roomFinalizeError, setRoomFinalizeError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [roomFinalizeBusy, setRoomFinalizeBusy] = useState(false);
  const [settlementClaimError, setSettlementClaimError] = useState(
    /** @type {{ code?: string, message?: string }|null} */ (null)
  );
  const [settlementClaimBusy, setSettlementClaimBusy] = useState(false);
  /** @type {import("../lib/online-v2/board-path/ov2BoardPathSettlementDelivery").SettlementClaimLastTouch|null} */
  const [settlementClaimLastTouch, setSettlementClaimLastTouch] = useState(null);
  const bundleRef = useRef(null);
  bundleRef.current = bundle;
  const fetchWaveRef = useRef(0);
  const debounceTimerRef = useRef(/** @type {ReturnType<typeof setTimeout>|null} */ (null));
  const scheduleDebouncedRefreshRef = useRef(() => {});
  const actionErrorAtRevisionRef = useRef(/** @type {number|null} */ (null));
  const prevAidForActionsRef = useRef(/** @type {string|null} */ (null));

  const room = baseContext?.room && typeof baseContext.room === "object" ? baseContext.room : null;
  const roomId = room?.id != null ? String(room.id) : null;
  const matchSeq = room?.match_seq;
  const lifecyclePhase = room?.lifecycle_phase;
  const activeSid = room?.active_session_id;
  const hostKeyOnRoom = room?.host_participant_key;
  const selfKey = baseContext?.self?.participant_key?.trim() || null;
  const members = Array.isArray(baseContext?.members) ? baseContext.members : [];

  const hostKey = useMemo(
    () => (room ? resolveBoardPathHostParticipantKey(room, members) : null),
    [room, members]
  );

  const isHost = useMemo(
    () => Boolean(selfKey && hostKey && isBoardPathSelfHost(selfKey, hostKey)),
    [selfKey, hostKey]
  );

  const roomRef = useRef(room);
  const membersRef = useRef(members);
  const hostKeyRef = useRef(hostKey);
  roomRef.current = room;
  membersRef.current = members;
  hostKeyRef.current = hostKey;

  const memberSig = useMemo(
    () =>
      members
        .map(m => `${m.participant_key}:${m.wallet_state || ""}:${m.is_ready ? "1" : "0"}`)
        .sort()
        .join("|"),
    [members]
  );

  const roomForPhase = useMemo(() => {
    if (!room) return null;
    return roomSessionPatch ? { ...room, ...roomSessionPatch } : room;
  }, [room, roomSessionPatch]);

  const roomForPhaseRef = useRef(roomForPhase);
  roomForPhaseRef.current = roomForPhase;

  const liveSyncEnabled = useMemo(
    () => Boolean(roomId && selfKey && !boardPathRoomIdIsOfflineFixture(roomId)),
    [roomId, selfKey]
  );
  const liveSyncEnabledRef = useRef(false);
  liveSyncEnabledRef.current = liveSyncEnabled;

  const applyDetailedToState = useCallback(detailed => {
    const r = roomRef.current;
    const hk = hostKeyRef.current || selfKey;
    if (!r?.id || !selfKey) return null;
    if (String(detailed.session.id) !== String(detailed.activeSessionId)) {
      setSessionSyncFault({
        code: "SESSION_ID_MISMATCH",
        message: "Session id does not match room active_session_id from server.",
      });
      return null;
    }
    if (membersRef.current.length > 0 && detailed.seats.length === 0) {
      setSessionSyncFault({
        code: "MISSING_SEATS",
        message: "Session has no seat rows; check the server or refresh.",
      });
      return null;
    }
    const b = boardPathBundleFromDatabase(r, membersRef.current, selfKey, detailed.session, detailed.seats, hk);
    if (!b) {
      setSessionSyncFault({
        code: "HYDRATE_BUNDLE_INVALID",
        message: "Session row loaded but seats are missing or invalid.",
      });
      return null;
    }
    setSessionSyncFault(null);
    setLiveSyncError(null);
    const rm = detailed.room && typeof detailed.room === "object" ? detailed.room : null;
    setRoomSessionPatch(prev => ({
      ...(prev && typeof prev === "object" ? prev : {}),
      active_session_id: String(detailed.activeSessionId),
      match_seq: detailed.roomMatchSeq,
      ...(rm
        ? {
            settlement_status: rm.settlement_status,
            settlement_revision: rm.settlement_revision,
            finalized_at: rm.finalized_at,
            finalized_match_seq: rm.finalized_match_seq,
          }
        : {}),
    }));
    setBundle(prev => {
      const next = selectBoardPathBundleAfterFetch(prev, b);
      return next ?? prev;
    });
    setLastSyncAt(Date.now());
    setSettlementLines(Array.isArray(detailed.settlementLines) ? detailed.settlementLines : []);
    setBoardPathSessions(Array.isArray(detailed.boardPathSessions) ? detailed.boardPathSessions : []);
    setRoomSettlementLines(Array.isArray(detailed.roomSettlementLines) ? detailed.roomSettlementLines : []);
    return b;
  }, [selfKey]);

  const coordinatedFetchAndApply = useCallback(async () => {
    const r = roomRef.current;
    if (!r?.id || !selfKey || boardPathRoomIdIsOfflineFixture(String(r.id))) return null;
    const roomIdAtStart = String(r.id);
    const matchSeqAtStart = nMatchSeq(r.match_seq);

    const wave = ++fetchWaveRef.current;
    setLiveSyncState(prev =>
      prev === OV2_BP_LIVE_SYNC_STATE.ERROR ? prev : OV2_BP_LIVE_SYNC_STATE.REFRESHING
    );

    try {
      const detailed = await fetchBoardPathSessionDetailed(supabaseMP, roomIdAtStart);
      if (wave !== fetchWaveRef.current) return null;
      if (String(roomRef.current?.id) !== roomIdAtStart || nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart)
        return null;

      if (!detailed.ok) {
        if (detailed.code !== "NO_ACTIVE_SESSION_ID") {
          setSessionSyncFault({ code: detailed.code, message: detailed.message });
          setLiveSyncError({ code: detailed.code, message: detailed.message });
        }
        return null;
      }

      if (
        String(roomRef.current?.id) !== roomIdAtStart ||
        nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart
      )
        return null;
      const out = applyDetailedToState(detailed);
      if (wave !== fetchWaveRef.current) return null;
      if (String(roomRef.current?.id) !== roomIdAtStart) return null;
      const mrows = await fetchOv2RoomMembersForRoom(supabaseMP, roomIdAtStart);
      if (wave !== fetchWaveRef.current) return out;
      if (String(roomRef.current?.id) !== roomIdAtStart) return out;
      if (mrows) setLiveMembersOverride(mrows);
      return out;
    } catch (e) {
      if (wave !== fetchWaveRef.current) return null;
      if (
        String(roomRef.current?.id) !== roomIdAtStart ||
        nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart
      )
        return null;
      const msg = e?.message || String(e);
      console.error("coordinatedFetchAndApply", e);
      setSessionSyncFault({
        code: "HYDRATE_EXCEPTION",
        message: msg,
      });
      setLiveSyncError({ code: "REFRESH_EXCEPTION", message: msg });
      return null;
    } finally {
      if (wave === fetchWaveRef.current) {
        setLiveSyncState(prev => {
          if (prev === OV2_BP_LIVE_SYNC_STATE.ERROR) return prev;
          if (!liveSyncEnabledRef.current) return OV2_BP_LIVE_SYNC_STATE.IDLE;
          return OV2_BP_LIVE_SYNC_STATE.SUBSCRIBED;
        });
      }
    }
  }, [selfKey, applyDetailedToState]);

  useEffect(() => {
    scheduleDebouncedRefreshRef.current = () => {
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void coordinatedFetchAndApply();
      }, OV2_BP_LIVE_SYNC_DEBOUNCE_MS);
    };
  }, [coordinatedFetchAndApply]);

  const isDev = typeof window !== "undefined" && window.location.search.includes("dev=1");

  const identityPrevRef = useRef(
    /** @type {{ roomId: string|null, selfKey: string|null, matchSeq: number }} */ ({
      roomId: null,
      selfKey: null,
      matchSeq: -1,
    })
  );

  useEffect(() => {
    const aid =
      roomForPhase?.active_session_id != null && String(roomForPhase.active_session_id).trim() !== ""
        ? String(roomForPhase.active_session_id)
        : null;
    const ms = roomForPhase ? nMatchSeq(roomForPhase.match_seq) : -1;

    if (!roomId || !selfKey) {
      setBundle(null);
      setRoomSessionPatch(null);
      setSessionSyncFault(null);
      setLiveMembersOverride(null);
      setRematchError(null);
      setSettlementLines(null);
      setFinalizeError(null);
      setBoardPathSessions(null);
      setRoomSettlementLines(null);
      setRoomFinalizeError(null);
      setSettlementClaimError(null);
      setSettlementClaimBusy(false);
      setSettlementClaimLastTouch(null);
      identityPrevRef.current = { roomId, selfKey, matchSeq: ms };
      return;
    }

    const prevId = identityPrevRef.current;
    const identityShift =
      (prevId.roomId != null && prevId.roomId !== roomId) || (prevId.selfKey != null && prevId.selfKey !== selfKey);

    if (identityShift) {
      setBundle(null);
      setRoomSessionPatch(null);
      setSessionSyncFault(null);
      setLiveMembersOverride(null);
      setRematchError(null);
      setSettlementLines(null);
      setFinalizeError(null);
      setBoardPathSessions(null);
      setRoomSettlementLines(null);
      setRoomFinalizeError(null);
      setSettlementClaimError(null);
      setSettlementClaimBusy(false);
      setSettlementClaimLastTouch(null);
      identityPrevRef.current = { roomId, selfKey, matchSeq: ms };
      return;
    }

    identityPrevRef.current = { roomId, selfKey, matchSeq: ms };

    setRoomSessionPatch(prevPatch => {
      if (!prevPatch?.active_session_id) return prevPatch;
      if (!aid || String(prevPatch.active_session_id) !== aid) return null;
      return prevPatch;
    });

    setBundle(prev => {
      if (!prev?.localSession) return prev;
      if (String(prev.localSession.roomId) !== String(roomId)) return null;
      if (nMatchSeq(prev.localSession.matchSeq) !== ms) return null;
      const src = prev.localSession.meta?.source;
      if (src === "ov2_db") {
        if (!aid || aid !== String(prev.localSession.id)) return null;
        return prev;
      }
      if (aid != null && aid !== String(prev.localSession.id)) return null;
      return prev;
    });
  }, [roomId, selfKey, roomForPhase]);

  useEffect(() => {
    const aid =
      activeSid != null && String(activeSid).trim() !== "" ? String(activeSid) : null;
    if (prevAidForActionsRef.current === aid) return;
    prevAidForActionsRef.current = aid;
    setActionError(null);
    actionErrorAtRevisionRef.current = null;
    setActionPending(null);
    setRematchError(null);
    setFinalizeError(null);
    setRoomFinalizeError(null);
    setSettlementClaimError(null);
    setSettlementClaimBusy(false);
    setSettlementClaimLastTouch(null);
  }, [activeSid]);

  useEffect(() => {
    if (actionError == null) return;
    const rev = bundle?.localSession?.revision;
    if (rev == null) return;
    const at = actionErrorAtRevisionRef.current;
    if (at == null) return;
    const rn = Number(rev) || 0;
    if (rn > at) {
      setActionError(null);
      actionErrorAtRevisionRef.current = null;
    }
  }, [bundle?.localSession?.revision, bundle?.localSession?.id, actionError]);

  useEffect(() => {
    if (!roomId || boardPathRoomIdIsOfflineFixture(roomId)) return;
    const aid = activeSid;
    const hasAid = aid != null && String(aid).trim() !== "";
    if (hasAid) return;
    setSessionSyncFault(prev => {
      if (!prev) return null;
      const openCodes = new Set([
        "OPEN_SESSION_FAILED",
        "RPC_ERROR",
        "EMPTY",
        "OPEN_SESSION_EMPTY",
        "OPEN_SESSION_BUNDLE_INVALID",
        "OPEN_SESSION_EXCEPTION",
      ]);
      if (openCodes.has(prev.code)) return prev;
      return null;
    });
  }, [roomId, activeSid]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!room || !roomId || !selfKey) return;
    if (!boardPathRoomIdIsOfflineFixture(roomId)) return;
    if (bundleRef.current) return;
    if (shouldHostOpenLocalBoardPathSession(room, members, selfKey)) {
      const next = syntheticBoardPathBundleForFixtureHost(room, members, selfKey);
      if (next) {
        setRoomSessionPatch({ active_session_id: next.localSession.id });
        setBundle(next);
      }
    } else if (shouldGuestHydrateLocalBoardPathSession(room, members, selfKey)) {
      const next = syntheticBoardPathBundleForFixtureGuest(room, members, selfKey);
      if (next) setBundle(next);
    }
  }, [room, roomId, members, selfKey, memberSig, lifecyclePhase, activeSid, hostKeyOnRoom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!room || !roomId || !selfKey) return;
    if (boardPathRoomIdIsOfflineFixture(roomId)) return;
    if (!shouldHostOpenLocalBoardPathSession(room, members, selfKey)) return;
    if (bundleRef.current) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const raw = await rpcOv2BoardPathOpenSession(supabaseMP, roomId, selfKey);
        if (cancelled) return;
        if (!raw || raw.ok !== true) {
          const msg =
            typeof raw?.message === "string"
              ? raw.message
              : "Could not open Board Path session (server rejected or RPC error).";
          const code = typeof raw?.code === "string" ? raw.code : "OPEN_SESSION_FAILED";
          setSessionSyncFault({ code, message: msg });
          return;
        }
        const session = raw.session;
        const seatsRaw = raw.seats;
        const seats = Array.isArray(seatsRaw) ? seatsRaw : [];
        if (!session || typeof session !== "object") {
          setSessionSyncFault({
            code: "OPEN_SESSION_EMPTY",
            message: "Open session returned no session payload.",
          });
          return;
        }
        const b = boardPathBundleFromDatabase(room, members, selfKey, session, seats, selfKey);
        if (!b || cancelled) {
          if (!cancelled) {
            setSessionSyncFault({
              code: "OPEN_SESSION_BUNDLE_INVALID",
              message: "Server session or seats could not be loaded into the client.",
            });
          }
          return;
        }
        setSessionSyncFault(null);
        setRoomSessionPatch({ active_session_id: String(session.id) });
        setBundle(prev => {
          const next = selectBoardPathBundleAfterFetch(prev, b);
          return next ?? prev;
        });
        setLastSyncAt(Date.now());
      } catch (e) {
        console.error("ov2_board_path_open_session", e);
        if (!cancelled) {
          setSessionSyncFault({
            code: "OPEN_SESSION_EXCEPTION",
            message: e?.message || String(e),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room, roomId, members, selfKey, memberSig, lifecyclePhase, activeSid, hostKeyOnRoom]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (roomId && boardPathRoomIdIsOfflineFixture(roomId)) return;
    if (!room?.id || !selfKey || !room.active_session_id) return;
    const cur = bundleRef.current;
    if (cur && String(cur.localSession.id) === String(room.active_session_id)) return undefined;

    let cancelled = false;
    void (async () => {
      await coordinatedFetchAndApply();
      if (cancelled) return;
    })();

    return () => {
      cancelled = true;
    };
  }, [room, roomId, members, selfKey, memberSig, activeSid, hostKey, coordinatedFetchAndApply]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!room || !selfKey || !bundle || bundle.localSession.phase !== "pregame") return;

    const src = bundle.localSession.meta?.source;
    const allowAutoPromote =
      boardPathRoomIdIsOfflineFixture(roomId) ||
      (explicitLocalFixtureQuery() && src === "fixture_dev");
    if (!allowAutoPromote) return undefined;

    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const next = promoteBoardPathPregameToActiveShell(room, members, selfKey, bundleRef.current);
      if (!next || cancelled) return;
      setBundle(prev => {
        if (isSameSession(prev?.localSession, next.localSession)) return prev;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [
    bundle?.localSession?.phase,
    bundle?.localSession?.id,
    bundle?.localSession?.revision,
    bundle?.localSession?.meta?.source,
    room,
    roomId,
    members,
    selfKey,
  ]);

  const effectiveMembers = useMemo(() => {
    if (liveMembersOverride && Array.isArray(liveMembersOverride)) return liveMembersOverride;
    return members;
  }, [liveMembersOverride, members]);

  const mergedContext = useMemo(() => {
    const m = mergeBoardPathBundleIntoContext(
      { ...(baseContext || { room: null, members: [], self: null }), members: effectiveMembers },
      bundle,
      roomSessionPatch
    );
    return {
      ...m,
      settlementLines: settlementLines ?? [],
      boardPathSessions: boardPathSessions ?? [],
      roomSettlementLines: roomSettlementLines ?? [],
    };
  }, [baseContext, bundle, roomSessionPatch, effectiveMembers, settlementLines, boardPathSessions, roomSettlementLines]);

  const liveDbBoardPath = useMemo(
    () =>
      Boolean(
        roomId &&
          selfKey &&
          !boardPathRoomIdIsOfflineFixture(roomId) &&
          bundle?.localSession?.meta?.source === "ov2_db"
      ),
    [roomId, selfKey, bundle?.localSession?.meta?.source]
  );

  const sessionIdentity = useMemo(() => {
    if (!roomId) return null;
    const aid = activeSid != null && String(activeSid).trim() !== "" ? String(activeSid) : "";
    const sid = bundle?.localSession?.id != null ? String(bundle.localSession.id) : "";
    return `${roomId}:${aid}:${sid}`;
  }, [roomId, activeSid, bundle?.localSession?.id]);

  const liveRevision = bundle?.localSession?.revision ?? null;

  const liveSyncVmSlice = useMemo(
    () => ({
      liveSyncEnabled,
      liveSyncState,
      liveRevision,
      sessionIdentity,
      isStale: false,
      lastSyncAt,
      syncError: liveSyncError,
    }),
    [liveSyncEnabled, liveSyncState, liveRevision, sessionIdentity, lastSyncAt, liveSyncError]
  );

  const postFinishVmSlice = useMemo(
    () =>
      buildBoardPathPostFinishSlice(mergedContext, hostKey, {
        rematchBusy,
        rematchError,
        finalizeBusy,
        finalizeError,
        liveDbBoardPath,
        roomFinalizeBusy,
        roomFinalizeError,
        settlementClaimBusy,
        settlementClaimError,
        settlementClaimLastTouch,
      }),
    [
      mergedContext,
      hostKey,
      rematchBusy,
      rematchError,
      finalizeBusy,
      finalizeError,
      liveDbBoardPath,
      roomFinalizeBusy,
      roomFinalizeError,
      settlementClaimBusy,
      settlementClaimError,
      settlementClaimLastTouch,
    ]
  );

  const vm = useMemo(
    () =>
      deriveBoardPathViewModel(mergedContext, {
        actionPending,
        actionError,
        liveSync: liveSyncVmSlice,
        postFinish: postFinishVmSlice,
      }),
    [mergedContext, actionPending, actionError, liveSyncVmSlice, postFinishVmSlice]
  );

  const refreshBundleFromServer = useCallback(async () => {
    return coordinatedFetchAndApply();
  }, [coordinatedFetchAndApply]);

  const runTurnRpc = useCallback(
    async (kind, rpcFn) => {
      if (!liveDbBoardPath || !roomId || !selfKey) return;
      setActionPending(kind);
      setActionError(null);
      try {
        const revRaw = bundleRef.current?.localSession?.revision;
        const rev = revRaw != null ? Number(revRaw) : null;
        const raw = await rpcFn(
          supabaseMP,
          roomId,
          selfKey,
          rev != null && Number.isFinite(rev) ? rev : null
        );
        if (!raw || raw.ok !== true) {
          const code = typeof raw?.code === "string" ? raw.code : "RPC_REJECTED";
          const message =
            typeof raw?.message === "string" ? raw.message : "Server rejected this action.";
          const errRev = bundleRef.current?.localSession?.revision;
          actionErrorAtRevisionRef.current = errRev != null ? Number(errRev) || 0 : null;
          setActionError({ code, message });
          return;
        }
        await refreshBundleFromServer();
      } catch (e) {
        const revRaw = bundleRef.current?.localSession?.revision;
        actionErrorAtRevisionRef.current = revRaw != null ? Number(revRaw) || 0 : null;
        setActionError({
          code: "ACTION_EXCEPTION",
          message: e?.message || String(e),
        });
      } finally {
        setActionPending(null);
      }
    },
    [liveDbBoardPath, roomId, selfKey, refreshBundleFromServer]
  );

  const rollTurn = useCallback(async () => {
    await runTurnRpc("roll", rpcOv2BoardPathRollSession);
  }, [runTurnRpc]);

  const moveTurn = useCallback(async () => {
    await runTurnRpc("move", rpcOv2BoardPathMoveSession);
  }, [runTurnRpc]);

  const endTurn = useCallback(async () => {
    await runTurnRpc("end_turn", rpcOv2BoardPathEndTurnSession);
  }, [runTurnRpc]);

  const runRematchRpc = useCallback(
    async rpcFn => {
      if (!liveDbBoardPath || !roomId || !selfKey) return;
      setRematchBusy(true);
      setRematchError(null);
      try {
        const raw = await rpcFn(supabaseMP, roomId, selfKey);
        if (!raw || raw.ok !== true) {
          const code = typeof raw?.code === "string" ? raw.code : "RPC_REJECTED";
          const message =
            typeof raw?.message === "string" ? raw.message : "Server rejected this action.";
          setRematchError({ code, message });
          return;
        }
        await refreshBundleFromServer();
      } catch (e) {
        setRematchError({
          code: "REMATCH_EXCEPTION",
          message: e?.message || String(e),
        });
      } finally {
        setRematchBusy(false);
      }
    },
    [liveDbBoardPath, roomId, selfKey, refreshBundleFromServer]
  );

  const requestRematch = useCallback(async () => {
    await runRematchRpc(rpcOv2BoardPathRequestRematch);
  }, [runRematchRpc]);

  const cancelRematch = useCallback(async () => {
    await runRematchRpc(rpcOv2BoardPathCancelRematch);
  }, [runRematchRpc]);

  const startNextMatch = useCallback(async () => {
    if (!liveDbBoardPath || !roomId || !selfKey) return;
    const expectedMs = nMatchSeq(roomForPhaseRef.current?.match_seq);
    setRematchBusy(true);
    setRematchError(null);
    try {
      const raw = await rpcOv2BoardPathStartNextMatch(supabaseMP, roomId, selfKey, expectedMs);
      if (!raw || raw.ok !== true) {
        const code = typeof raw?.code === "string" ? raw.code : "RPC_REJECTED";
        const message =
          typeof raw?.message === "string" ? raw.message : "Server rejected this action.";
        setRematchError({ code, message });
        return;
      }
      await refreshBundleFromServer();
    } catch (e) {
      setRematchError({
        code: "REMATCH_EXCEPTION",
        message: e?.message || String(e),
      });
    } finally {
      setRematchBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, refreshBundleFromServer]);

  const finalizeSession = useCallback(async () => {
    if (!liveDbBoardPath || !roomId || !selfKey) return;
    const hk = hostKeyRef.current;
    if (!hk || !isHost) return;
    const sid = bundleRef.current?.localSession?.id;
    if (!sid) return;
    setFinalizeBusy(true);
    setFinalizeError(null);
    try {
      const raw = await rpcOv2BoardPathFinalizeSession(supabaseMP, roomId, String(sid), hk);
      if (!raw || raw.ok !== true) {
        const code = typeof raw?.code === "string" ? raw.code : "RPC_REJECTED";
        const message =
          typeof raw?.message === "string" ? raw.message : "Server rejected finalize.";
        setFinalizeError({ code, message });
        return;
      }
      await refreshBundleFromServer();
    } catch (e) {
      setFinalizeError({
        code: "FINALIZE_EXCEPTION",
        message: e?.message || String(e),
      });
    } finally {
      setFinalizeBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, isHost, refreshBundleFromServer]);

  const finalizeRoom = useCallback(async () => {
    if (!liveDbBoardPath || !roomId || !selfKey) return;
    const hk = hostKeyRef.current;
    if (!hk || !isHost) return;
    setRoomFinalizeBusy(true);
    setRoomFinalizeError(null);
    try {
      const raw = await rpcOv2BoardPathFinalizeRoom(supabaseMP, roomId, hk);
      if (!raw || raw.ok !== true) {
        const code = typeof raw?.code === "string" ? raw.code : "RPC_REJECTED";
        const message =
          typeof raw?.message === "string" ? raw.message : "Server rejected room finalize.";
        setRoomFinalizeError({ code, message });
        return;
      }
      await refreshBundleFromServer();
    } catch (e) {
      setRoomFinalizeError({
        code: "ROOM_FINALIZE_EXCEPTION",
        message: e?.message || String(e),
      });
    } finally {
      setRoomFinalizeBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, isHost, refreshBundleFromServer]);

  const claimSettlement = useCallback(async () => {
    if (!liveDbBoardPath || !roomId || !selfKey) return;
    setSettlementClaimBusy(true);
    setSettlementClaimError(null);
    try {
      const raw = await rpcOv2BoardPathClaimSettlement(supabaseMP, roomId, selfKey);
      const norm = normalizeClaimSettlementRpcResult(raw);
      if (!norm.ok) {
        setSettlementClaimLastTouch(null);
        setSettlementClaimError({
          code: norm.code || "CLAIM_REJECTED",
          message: norm.message || "Settlement claim rejected.",
        });
        return;
      }

      if (norm.lines.length === 0) {
        setSettlementClaimLastTouch({
          at: Date.now(),
          rpcReturnedCount: 0,
          rpcIdempotentEmpty: Boolean(norm.idempotent),
          vaultCreditableAttempted: 0,
          vaultCreditedCount: 0,
          vaultFailedCount: 0,
          vaultSkippedLocalIdemCount: 0,
          vaultGapAfterDbMark: false,
          vaultSuccessAll: true,
          lineResults: [],
        });
        await refreshBundleFromServer();
        return;
      }

      const vaultRows = norm.lines.map(l => ({
        id: l.id,
        amount: l.amount,
        line_kind: l.lineKind,
        idempotency_key: l.idempotencyKey,
        match_seq: l.matchSeq,
      }));
      const trace = await applyBoardPathSettlementClaimLinesToVaultWithTrace(
        vaultRows,
        ONLINE_V2_GAME_KINDS.BOARD_PATH
      );
      const gap = trace.failedLines.length > 0;
      const positives = trace.lineResults.filter(r => r.amount > 0);
      const vaultSuccessAll =
        !gap && positives.every(r => r.outcome === "credited" || r.outcome === "skipped_local_idem");

      setSettlementClaimLastTouch({
        at: Date.now(),
        rpcReturnedCount: norm.lines.length,
        rpcIdempotentEmpty: false,
        vaultCreditableAttempted: positives.length,
        vaultCreditedCount: trace.creditedCount,
        vaultFailedCount: trace.failedLines.length,
        vaultSkippedLocalIdemCount: trace.skippedLocalIdemCount,
        vaultGapAfterDbMark: gap,
        vaultSuccessAll,
        lineResults: trace.lineResults,
      });

      if (trace.failedLines.length > 0) {
        const fl = trace.failedLines[0];
        const partial = trace.creditedCount > 0 || trace.skippedLocalIdemCount > 0;
        setSettlementClaimError({
          code: partial ? "VAULT_GAP_PARTIAL" : "VAULT_GAP_NO_DB_RETRY",
          message:
            trace.failedLines.length === 1
              ? `Vault: ${fl.error}`
              : `Vault: ${trace.failedLines.length} lines failed (${fl.error})`,
        });
      } else {
        setSettlementClaimError(null);
      }
      await refreshBundleFromServer();
    } catch (e) {
      setSettlementClaimLastTouch(null);
      setSettlementClaimError({
        code: "CLAIM_EXCEPTION",
        message: e?.message || String(e),
      });
    } finally {
      setSettlementClaimBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, refreshBundleFromServer]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    if (!liveSyncEnabled || !roomId) {
      setLiveSyncState(OV2_BP_LIVE_SYNC_STATE.IDLE);
      return undefined;
    }

    const aid =
      activeSid != null && String(activeSid).trim() !== "" ? String(activeSid) : null;
    const channelId = `ov2_bp_rt:${roomId}:${aid ?? "noseats"}`;
    const ch = supabaseMP
      .channel(channelId)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_rooms", filter: `id=eq.${roomId}` },
        () => {
          scheduleDebouncedRefreshRef.current();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ov2_board_path_sessions",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          scheduleDebouncedRefreshRef.current();
        }
      );

    if (aid) {
      ch.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "ov2_board_path_seats",
          filter: `session_id=eq.${aid}`,
        },
        () => {
          scheduleDebouncedRefreshRef.current();
        }
      );
    }

    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ov2_room_members",
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        scheduleDebouncedRefreshRef.current();
      }
    );

    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ov2_settlement_lines",
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        scheduleDebouncedRefreshRef.current();
      }
    );

    ch.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "ov2_economy_events",
        filter: `room_id=eq.${roomId}`,
      },
      () => {
        scheduleDebouncedRefreshRef.current();
      }
    );

    ch.subscribe((status, err) => {
      if (status === "SUBSCRIBED") {
        setLiveSyncState(prev =>
          prev === OV2_BP_LIVE_SYNC_STATE.REFRESHING ? prev : OV2_BP_LIVE_SYNC_STATE.SUBSCRIBED
        );
        setLiveSyncError(null);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setLiveSyncState(OV2_BP_LIVE_SYNC_STATE.ERROR);
        const msg =
          (err &&
          typeof err === "object" &&
          "message" in err &&
          typeof /** @type {{ message?: string }} */ (err).message === "string"
            ? /** @type {{ message?: string }} */ (err).message
            : null) || `Realtime ${String(status).toLowerCase().replace(/_/g, " ")}`;
        setLiveSyncError({ code: String(status), message: msg });
      }
    });

    return () => {
      void ch.unsubscribe();
      if (debounceTimerRef.current != null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      setLiveSyncState(OV2_BP_LIVE_SYNC_STATE.IDLE);
    };
  }, [liveSyncEnabled, roomId, activeSid]);

  const managerSessionPhase = useMemo(
    () =>
      deriveBoardPathManagerSessionPhase(
        { ...(baseContext || { room: null, members: [], self: null }), room: roomForPhase },
        bundle,
        selfKey
      ),
    [baseContext, roomForPhase, bundle, selfKey]
  );

  const isOpeningSession =
    managerSessionPhase === BOARD_PATH_MANAGER_PHASE.OPENING && bundle == null && Boolean(room && selfKey);

  const isHydratingSession =
    managerSessionPhase === BOARD_PATH_MANAGER_PHASE.HYDRATING && bundle == null && Boolean(room && selfKey);

  const isGuestWaitingHydrate = Boolean(
    roomForPhase && selfKey && hostKey && !isHost && roomForPhase.active_session_id && bundle == null
  );

  const roomActiveMissingSessionHint = useMemo(() => {
    if (!room || !roomId || boardPathRoomIdIsOfflineFixture(roomId)) return null;
    if (room.lifecycle_phase !== ONLINE_V2_ROOM_PHASE.ACTIVE) return null;
    const allCommitted =
      members.length > 0 && members.every(m => m.wallet_state === ONLINE_V2_MEMBER_WALLET_STATE.COMMITTED);
    if (!allCommitted) return null;
    const aid = room.active_session_id;
    if (aid != null && String(aid).trim() !== "") return null;
    if (isHost && shouldHostOpenLocalBoardPathSession(room, members, selfKey || "")) return null;
    return "Table is active and stakes are locked, but the room has no active session yet. If you are the host, stay on this page while the session opens. Otherwise wait, refresh the lobby, and return.";
  }, [room, roomId, members, selfKey, isHost]);

  const [isStuckWaitingForHost, setStuckWaitingForHost] = useState(false);

  useEffect(() => {
    if (!isGuestWaitingHydrate) {
      setStuckWaitingForHost(false);
      return undefined;
    }
    const t = window.setTimeout(() => setStuckWaitingForHost(true), 2000);
    return () => {
      window.clearTimeout(t);
      setStuckWaitingForHost(false);
    };
  }, [isGuestWaitingHydrate]);

  const isSessionReady = vm.sessionPhase === BOARD_PATH_SESSION_PHASE.READY;

  const didSelfInitiateOpen = Boolean(
    bundle && selfKey && bundle.openMeta.openedByParticipantKey === selfKey
  );

  const session = useMemo(() => {
    if (bundle?.localSession) return bundle.localSession;
    const s = mergedContext?.session;
    if (!s?.id) return null;
    const aid = room?.active_session_id;
    if (aid != null && String(aid).trim() !== "" && String(s.id) !== String(aid)) return null;
    return {
      ...s,
      phase: s.phase ?? s.engine_phase,
    };
  }, [bundle?.localSession, mergedContext?.session, room?.active_session_id]);

  const seats = useMemo(() => {
    if (bundle?.localSeats?.length) return bundle.localSeats;
    const s = mergedContext?.session;
    const rows = mergedContext?.seats;
    const aid = room?.active_session_id;
    if (!s?.id || !Array.isArray(rows) || rows.length === 0 || !selfKey) return null;
    if (aid != null && String(aid).trim() !== "" && String(s.id) !== String(aid)) return null;
    const bs = s.board_state ?? s.boardState;
    const posMap = bs?.positions && typeof bs.positions === "object" ? bs.positions : {};
    const pathLenRaw = bs?.pathLength ?? bs?.path_length;
    const pathLen =
      typeof pathLenRaw === "number" && !Number.isNaN(pathLenRaw)
        ? Math.max(1, Math.floor(pathLenRaw))
        : 30;
    return rows.map((row, i) => {
      const pk = String(row.participant_key);
      const rawP = Object.prototype.hasOwnProperty.call(posMap, pk) ? posMap[pk] : 0;
      const pn = typeof rawP === "number" ? rawP : Number(rawP);
      const progress = Number.isFinite(pn) ? Math.max(0, Math.min(Math.floor(pn), pathLen)) : 0;
      return {
        id: row.id,
        sessionId: row.session_id,
        seatIndex: row.seat_index ?? i,
        participantKey: pk,
        displayName: `…${String(pk).slice(0, 4)}`,
        isHost: false,
        isReady: true,
        isSelf: pk === selfKey,
        tokenColor: BP_SEAT_TONES[i % BP_SEAT_TONES.length],
        progress,
        finished: progress >= pathLen,
        connected: true,
      };
    });
  }, [bundle?.localSeats, mergedContext?.session, mergedContext?.seats, selfKey, room?.active_session_id]);

  const selfSeat = useMemo(() => (seats?.length && selfKey ? seats.find(x => x.isSelf) ?? null : null), [seats, selfKey]);

  const activeSeat = useMemo(() => {
    if (!seats?.length || !session) return null;
    const idx = resolveBoardPathActiveSeatIndex(session);
    return seats.find(x => x.seatIndex === idx) ?? null;
  }, [seats, session]);

  const sessionPhase = vm.sessionPhase;

  const canSelfActFlag = useMemo(() => canSelfAct(session, selfSeat, seats ?? []), [session, selfSeat, seats]);

  const canBoardPathDebugMutate = useMemo(() => {
    if (!isDev || !bundle?.localSession) return false;
    const src = bundle.localSession.meta?.source;
    const localFixtureOnly =
      Boolean(roomId && boardPathRoomIdIsOfflineFixture(roomId)) || src === "fixture_dev";
    return localFixtureOnly;
  }, [isDev, bundle?.localSession, bundle?.localSession?.meta?.source, roomId]);

  const debugAdvanceTurn = useMemo(() => {
    if (!canBoardPathDebugMutate) return undefined;
    return () => {
      const cur = bundleRef.current;
      if (!cur?.localSession || !cur.localSeats?.length || !room || !selfKey) return;
      const next = advanceTurnLocal(cur.localSession, cur.localSeats);
      const b = replaceLocalSession(room, members, selfKey, next, cur.openMeta, cur);
      if (b)
        setBundle(prev => {
          if (isSameSession(prev?.localSession, b.localSession)) return prev;
          return b;
        });
    };
  }, [canBoardPathDebugMutate, room, members, selfKey]);

  const debugEmitEvent = useMemo(() => {
    if (!canBoardPathDebugMutate) return undefined;
    return /** @param {string} type */ type => {
      const cur = bundleRef.current;
      if (!cur?.localSession || !room || !selfKey) return;
      const selfSeatIdx = cur.localSeats?.find(s => s.isSelf)?.seatIndex;
      const evt = createLocalEvent(type, { seat: selfSeatIdx });
      const next = appendEvent(cur.localSession, evt);
      const b = replaceLocalSession(room, members, selfKey, next, cur.openMeta, cur);
      if (b)
        setBundle(prev => {
          if (isSameSession(prev?.localSession, b.localSession)) return prev;
          return b;
        });
    };
  }, [canBoardPathDebugMutate, room, members, selfKey]);

  const lastEvent = useMemo(() => mergedContext?.session?.lastEvent ?? null, [mergedContext?.session]);

  return {
    mergedContext,
    vm,
    localBundle: bundle,
    localSession: bundle?.localSession ?? null,
    localSeats: bundle?.localSeats ?? null,
    managerSessionPhase,
    sessionPhase,
    isOpeningSession,
    isHydratingSession,
    isSessionReady,
    didSelfInitiateOpen,
    isStuckWaitingForHost,
    session,
    seats,
    selfSeat,
    activeSeat,
    canSelfAct: canSelfActFlag,
    debugAdvanceTurn,
    debugEmitEvent,
    lastEvent,
    sessionSyncFault,
    roomActiveMissingSessionHint,
    liveDbBoardPath,
    rollTurn: liveDbBoardPath ? rollTurn : undefined,
    moveTurn: liveDbBoardPath ? moveTurn : undefined,
    endTurn: liveDbBoardPath ? endTurn : undefined,
    actionPending,
    actionError,
    liveSyncEnabled,
    liveSyncState,
    liveRevision,
    sessionIdentity,
    lastSyncAt,
    liveSyncError,
    requestRematch: liveDbBoardPath ? requestRematch : undefined,
    cancelRematch: liveDbBoardPath ? cancelRematch : undefined,
    startNextMatch: liveDbBoardPath ? startNextMatch : undefined,
    rematchBusy,
    rematchError,
    finalizeSession: liveDbBoardPath && isHost ? finalizeSession : undefined,
    finalizeBusy,
    finalizeError,
    finalizeRoom: liveDbBoardPath && isHost ? finalizeRoom : undefined,
    roomFinalizeBusy,
    roomFinalizeError,
    claimSettlement: liveDbBoardPath ? claimSettlement : undefined,
    settlementClaimBusy,
    settlementClaimError,
  };
}
