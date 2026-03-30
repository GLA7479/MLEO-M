import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buildBoardPathPostFinishSlice, deriveBoardPathViewModel } from "../lib/online-v2/ov2BoardPathAdapter";
import { resolveBoardPathActions } from "../lib/online-v2/board-path/ov2BoardPathActionContract";
import {
  BOARD_PATH_GAMEPLAY_ACTION_SURFACE_OFF,
  deriveBoardPathGameplayActionSurface,
} from "../lib/online-v2/board-path/ov2BoardPathGameplayActionSurface";
import {
  BOARD_PATH_POST_MATCH_ACTION_SURFACE_OFF,
  deriveBoardPathPostMatchActionSurface,
} from "../lib/online-v2/board-path/ov2BoardPathPostMatchActionSurface";
import { canSelfAct } from "../lib/online-v2/board-path/ov2BoardPathControlContract";
import {
  boardPathRoomIdIsOfflineFixture,
  isBoardPathSelfHost,
  resolveBoardPathHostParticipantKey,
  shouldGuestHydrateLocalBoardPathSession,
  shouldHostOpenLocalBoardPathSession,
} from "../lib/online-v2/board-path/ov2BoardPathOpenContract";
import {
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
  boardPathBundleFromDatabase,
  createLocalEvent,
  isSameSession,
  mergeBoardPathBundleIntoContext,
  promoteBoardPathPregameToActiveShell,
  replaceLocalSession,
  syntheticBoardPathBundleForFixtureGuest,
  syntheticBoardPathBundleForFixtureHost,
} from "../lib/online-v2/board-path/ov2BoardPathSessionManager";
import { resolveBoardPathActiveSeatIndex } from "../lib/online-v2/board-path/ov2BoardPathEngine";
import { buildOv2BoardPathVM } from "../lib/online-v2/board-path/ov2BoardPathVmBuilder";
import {
  buildOnlineV2EconomyEventKey,
  clampSuggestedOnlineV2Stake,
  ONLINE_V2_GAME_KINDS,
  ONLINE_V2_ROOM_PHASE,
} from "../lib/online-v2/ov2Economy";
import { debitOnlineV2Vault } from "../lib/online-v2/onlineV2VaultBridge";
import { commitOv2RoomStake } from "../lib/online-v2/ov2RoomsApi";
import {
  normalizeBoardPathHookCaughtError,
  refreshBoardPathRoomBundleAfterAction,
} from "../lib/online-v2/board-path/ov2BoardPathHookActions";
import {
  BOARD_PATH_BUNDLE_SYNC_STATE,
  fetchBoardPathLiveCoordinatedBundle,
} from "../lib/online-v2/board-path/ov2BoardPathBundleCoordinator";
import { canHostAttemptBoardPathSessionOpenRpc } from "../lib/online-v2/board-path/ov2BoardPathSessionOpenFollowUp";
import { supabaseMP } from "../lib/supabaseClients";

const BP_SEAT_TONES = /** @type {const} */ (["emerald", "sky", "amber", "violet"]);

function ov2StakeDebitLocalKey(roomId, matchSeq, participantKey) {
  return `ov2_bp_stake_debit:${String(roomId)}:${String(Math.floor(Number(matchSeq) || 0))}:${String(participantKey)}`;
}

/**
 * Merge public room fields returned from stake / session RPCs into `roomSessionPatch`.
 * @param {Record<string, unknown>|null|undefined} rm
 */
function boardPathRoomPatchFromRpcRoom(rm) {
  if (!rm || typeof rm !== "object") return {};
  const r = /** @type {Record<string, unknown>} */ (rm);
  /** @type {Record<string, unknown>} */
  const out = {};
  if (typeof r.lifecycle_phase === "string") out.lifecycle_phase = r.lifecycle_phase;
  if (r.active_session_id != null && String(r.active_session_id).trim() !== "") {
    out.active_session_id = String(r.active_session_id);
  }
  if (r.match_seq != null) out.match_seq = r.match_seq;
  if (r.pot_locked != null) out.pot_locked = r.pot_locked;
  if (r.stake_per_seat != null) out.stake_per_seat = r.stake_per_seat;
  if (typeof r.settlement_status === "string") out.settlement_status = r.settlement_status;
  if (r.settlement_revision != null) out.settlement_revision = r.settlement_revision;
  if (r.finalized_at !== undefined) out.finalized_at = r.finalized_at;
  if (r.finalized_match_seq != null) out.finalized_match_seq = r.finalized_match_seq;
  return out;
}

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
  const [actionPending, setActionPending] = useState(
    /** @type {null|"roll"|"move"|"end_turn"|"commit_stake"} */ (null)
  );
  const [actionError, setActionError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [liveSyncState, setLiveSyncState] = useState(
    /** @type {"idle"|"subscribed"|"refreshing"|"error"} */ (OV2_BP_LIVE_SYNC_STATE.IDLE)
  );
  const [liveSyncError, setLiveSyncError] = useState(/** @type {{ code?: string, message?: string }|null} */ (null));
  const [lastSyncAt, setLastSyncAt] = useState(/** @type {number|null} */ (null));
  /** Last completed coordinated bundle fetch (ready, partial, or failed terminal). */
  const [lastBundleSyncAt, setLastBundleSyncAt] = useState(/** @type {number|null} */ (null));
  const [bundleSyncState, setBundleSyncState] = useState(
    /** @type {(typeof BOARD_PATH_BUNDLE_SYNC_STATE)[keyof typeof BOARD_PATH_BUNDLE_SYNC_STATE]} */ (
      BOARD_PATH_BUNDLE_SYNC_STATE.IDLE
    )
  );
  const [bundleSyncError, setBundleSyncError] = useState(
    /** @type {{ code?: string, message?: string }|null} */ (null)
  );
  const [sessionOpenBusy, setSessionOpenBusy] = useState(false);
  const [sessionOpenError, setSessionOpenError] = useState(
    /** @type {{ code?: string, message?: string }|null} */ (null)
  );
  const [lastSessionOpenAt, setLastSessionOpenAt] = useState(/** @type {number|null} */ (null));
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

  /**
   * @param {{ ok: true, session: Record<string, unknown>, seats: Record<string, unknown>[], activeSessionId: string, roomMatchSeq: number, settlementLines?: unknown[], boardPathSessions?: unknown[], roomSettlementLines?: unknown[], room?: Record<string, unknown> }} detailed
   * @param {unknown[]|null|undefined} memberRowsForHydrate — when an array, used instead of `membersRef` for this apply only.
   */
  const applyDetailedToState = useCallback((detailed, memberRowsForHydrate) => {
    const r = roomRef.current;
    const hk = hostKeyRef.current || selfKey;
    if (!r?.id || !selfKey) return null;
    const mem = Array.isArray(memberRowsForHydrate) ? memberRowsForHydrate : membersRef.current;
    if (String(detailed.session.id) !== String(detailed.activeSessionId)) {
      setSessionSyncFault({
        code: "SESSION_ID_MISMATCH",
        message: "Session id does not match room active_session_id from server.",
      });
      return null;
    }
    if (mem.length > 0 && detailed.seats.length === 0) {
      setSessionSyncFault({
        code: "MISSING_SEATS",
        message: "Session has no seat rows; check the server or refresh.",
      });
      return null;
    }
    const b = boardPathBundleFromDatabase(r, mem, selfKey, detailed.session, detailed.seats, hk);
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

  /** Canonical live bundle path: coordinated fetch (session API + members) + apply. */
  const coordinatedFetchAndApply = useCallback(async () => {
    const r = roomRef.current;
    if (!r?.id || !selfKey || boardPathRoomIdIsOfflineFixture(String(r.id))) {
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.IDLE);
      setBundleSyncError(null);
      return null;
    }
    const roomIdAtStart = String(r.id);
    const matchSeqAtStart = nMatchSeq(r.match_seq);

    const wave = ++fetchWaveRef.current;
    setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.LOADING_BUNDLE);
    setBundleSyncError(null);
    setLiveSyncState(prev =>
      prev === OV2_BP_LIVE_SYNC_STATE.ERROR ? prev : OV2_BP_LIVE_SYNC_STATE.REFRESHING
    );

    const markTerminal = () => {
      setLastBundleSyncAt(Date.now());
    };

    const abortBundleLoadIdentity = () => {
      markTerminal();
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.IDLE);
      setBundleSyncError(null);
    };

    try {
      const pack = await fetchBoardPathLiveCoordinatedBundle(supabaseMP, roomIdAtStart);
      if (wave !== fetchWaveRef.current) return null;
      if (String(roomRef.current?.id) !== roomIdAtStart || nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart) {
        abortBundleLoadIdentity();
        return null;
      }

      const { detailed, members } = pack;

      if (!detailed.ok) {
        markTerminal();
        if (detailed.code === "NO_ACTIVE_SESSION_ID") {
          setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_PARTIAL);
          setBundleSyncError(null);
        } else {
          setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_FAILED);
          setBundleSyncError({ code: detailed.code, message: detailed.message });
        }
        return null;
      }

      if (
        String(roomRef.current?.id) !== roomIdAtStart ||
        nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart
      ) {
        abortBundleLoadIdentity();
        return null;
      }

      const membersOk = Array.isArray(members);
      const out = applyDetailedToState(detailed, membersOk ? members : undefined);
      if (wave !== fetchWaveRef.current) return null;
      if (String(roomRef.current?.id) !== roomIdAtStart) {
        abortBundleLoadIdentity();
        return null;
      }

      markTerminal();

      if (out == null) {
        setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_PARTIAL);
        setBundleSyncError(null);
        return null;
      }

      if (!membersOk) {
        setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_PARTIAL);
        setBundleSyncError({
          code: "MEMBERS_FETCH_FAILED",
          message: "Members list failed to load; session data may be stale until retry.",
        });
        return out;
      }

      setLiveMembersOverride(members);
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_READY);
      setBundleSyncError(null);
      return out;
    } catch (e) {
      if (wave !== fetchWaveRef.current) return null;
      if (
        String(roomRef.current?.id) !== roomIdAtStart ||
        nMatchSeq(roomRef.current?.match_seq) !== matchSeqAtStart
      ) {
        abortBundleLoadIdentity();
        return null;
      }
      const msg = e?.message || String(e);
      console.error("coordinatedFetchAndApply", e);
      markTerminal();
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_FAILED);
      setBundleSyncError({ code: "BUNDLE_COORDINATOR_EXCEPTION", message: msg });
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

  const canRetryBundleSync = useMemo(
    () =>
      Boolean(
        liveSyncEnabled &&
          roomId &&
          (bundleSyncState === BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_FAILED ||
            bundleSyncState === BOARD_PATH_BUNDLE_SYNC_STATE.BUNDLE_PARTIAL)
      ),
    [liveSyncEnabled, roomId, bundleSyncState]
  );

  const retryBundleSync = useCallback(() => {
    if (!canRetryBundleSync) return;
    void coordinatedFetchAndApply();
  }, [canRetryBundleSync, coordinatedFetchAndApply]);

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
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.IDLE);
      setBundleSyncError(null);
      setLastBundleSyncAt(null);
      setSessionOpenBusy(false);
      setSessionOpenError(null);
      setLastSessionOpenAt(null);
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
      setBundleSyncState(BOARD_PATH_BUNDLE_SYNC_STATE.IDLE);
      setBundleSyncError(null);
      setLastBundleSyncAt(null);
      setSessionOpenBusy(false);
      setSessionOpenError(null);
      setLastSessionOpenAt(null);
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
    if (aid != null) setSessionOpenError(null);
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

  const effectiveMembersRef = useRef(effectiveMembers);
  effectiveMembersRef.current = effectiveMembers;

  const canAttemptSessionOpen = useMemo(
    () =>
      Boolean(
        typeof rpcOv2BoardPathOpenSession === "function" &&
          canHostAttemptBoardPathSessionOpenRpc({
            roomId,
            room: roomForPhase,
            members: effectiveMembers,
            selfKey,
            sessionOpenBusy: false,
          })
      ),
    [roomId, roomForPhase, effectiveMembers, selfKey]
  );

  const canRetrySessionOpen = useMemo(
    () => Boolean(sessionOpenError && canAttemptSessionOpen && !sessionOpenBusy),
    [sessionOpenError, canAttemptSessionOpen, sessionOpenBusy]
  );

  const attemptSessionOpen = useCallback(async () => {
    if (sessionOpenBusy) return;
    if (!canAttemptSessionOpen && !canRetrySessionOpen) return;
    if (typeof rpcOv2BoardPathOpenSession !== "function") return;
    const rid = roomId;
    const pk = selfKey;
    if (!rid || !pk || boardPathRoomIdIsOfflineFixture(rid)) return;
    if (
      !canHostAttemptBoardPathSessionOpenRpc({
        roomId: rid,
        room: roomForPhaseRef.current,
        members: effectiveMembersRef.current,
        selfKey: pk,
        sessionOpenBusy: false,
      })
    )
      return;

    setSessionOpenBusy(true);
    setSessionOpenError(null);
    try {
      const raw = await rpcOv2BoardPathOpenSession(supabaseMP, rid, pk);
      if (!raw || raw.ok !== true) {
        const msg =
          typeof raw?.message === "string"
            ? raw.message
            : "Could not open Board Path session (server rejected or RPC error).";
        const code = typeof raw?.code === "string" ? raw.code : "OPEN_SESSION_FAILED";
        setSessionOpenError({ code, message: msg });
        return;
      }
      if (!raw.session || typeof raw.session !== "object") {
        setSessionOpenError({
          code: "OPEN_SESSION_EMPTY",
          message: "Open session returned no session payload.",
        });
        return;
      }
      setSessionOpenError(null);
      await coordinatedFetchAndApply();
    } catch (e) {
      console.error("ov2_board_path_open_session", e);
      setSessionOpenError({
        code: "OPEN_SESSION_EXCEPTION",
        message: e?.message || String(e),
      });
    } finally {
      setSessionOpenBusy(false);
      setLastSessionOpenAt(Date.now());
    }
  }, [
    sessionOpenBusy,
    canAttemptSessionOpen,
    canRetrySessionOpen,
    roomId,
    selfKey,
    coordinatedFetchAndApply,
  ]);

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

  const legacyVm = useMemo(
    () =>
      deriveBoardPathViewModel(mergedContext, {
        actionPending,
        actionError,
        liveSync: liveSyncVmSlice,
        postFinish: postFinishVmSlice,
      }),
    [mergedContext, actionPending, actionError, liveSyncVmSlice, postFinishVmSlice]
  );

  /** Single post-success refresh: room slice + members + session + seats (best-effort; may no-op on races). */
  const refreshAfterBoardPathAction = useCallback(async () => {
    return refreshBoardPathRoomBundleAfterAction(coordinatedFetchAndApply);
  }, [coordinatedFetchAndApply]);

  const liveRoomEligibleForStake = Boolean(
    roomId && selfKey && !boardPathRoomIdIsOfflineFixture(roomId)
  );

  const commitStakeImpl = useCallback(async () => {
    const rid = roomId;
    const pk = selfKey;
    if (!rid || !pk || boardPathRoomIdIsOfflineFixture(rid)) return;

    const r = roomForPhaseRef.current;
    if (!r || String(r.lifecycle_phase || "") !== ONLINE_V2_ROOM_PHASE.PENDING_STAKES) return;

    const selfMem = (membersRef.current || []).find(m => m.participant_key === pk);
    if (!selfMem || selfMem.wallet_state === "committed") return;

    setActionPending("commit_stake");
    setActionError(null);
    try {
      const stake = clampSuggestedOnlineV2Stake(r.stake_per_seat);
      const idem = buildOnlineV2EconomyEventKey("commit", rid, pk, r.match_seq, "v1");
      let stakeOut;
      try {
        stakeOut = await commitOv2RoomStake({
          room_id: rid,
          participant_key: pk,
          idempotency_key: idem,
        });
      } catch (e) {
        setActionError(normalizeBoardPathHookCaughtError(e));
        return;
      }

      const patch = boardPathRoomPatchFromRpcRoom(
        stakeOut?.room && typeof stakeOut.room === "object" ? stakeOut.room : null
      );
      if (Object.keys(patch).length > 0) {
        setRoomSessionPatch(prev => ({
          ...(prev && typeof prev === "object" ? prev : {}),
          ...patch,
        }));
      }
      if (Array.isArray(stakeOut?.members)) setLiveMembersOverride(stakeOut.members);

      const gameId =
        typeof r.product_game_id === "string" && r.product_game_id.trim() !== ""
          ? r.product_game_id
          : ONLINE_V2_GAME_KINDS.BOARD_PATH;

      const debitKey =
        typeof window !== "undefined" ? ov2StakeDebitLocalKey(rid, r.match_seq, pk) : null;
      const debitAlreadyDone =
        Boolean(debitKey) &&
        typeof window !== "undefined" &&
        window.localStorage.getItem(/** @type {string} */ (debitKey)) === "1";
      if (!debitAlreadyDone) {
        const debit = await debitOnlineV2Vault(stake, gameId);
        if (!debit?.ok) {
          setActionError({
            code: "VAULT_DEBIT_FAILED",
            message:
              debit?.error ||
              "Vault debit failed after the server recorded your stake. Tap Commit again to retry the debit, or sync your balance.",
          });
          await refreshAfterBoardPathAction();
          return;
        }
        if (debitKey && typeof window !== "undefined") {
          try {
            window.localStorage.setItem(debitKey, "1");
          } catch {
            // ignore quota / access
          }
        }
      }

      await refreshAfterBoardPathAction();
    } catch (e) {
      setActionError(normalizeBoardPathHookCaughtError(e));
    } finally {
      setActionPending(null);
    }
  }, [roomId, selfKey, refreshAfterBoardPathAction]);

  const commitStake = liveRoomEligibleForStake ? commitStakeImpl : undefined;

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
        await refreshAfterBoardPathAction();
      } catch (e) {
        const revRaw = bundleRef.current?.localSession?.revision;
        actionErrorAtRevisionRef.current = revRaw != null ? Number(revRaw) || 0 : null;
        setActionError(normalizeBoardPathHookCaughtError(e));
      } finally {
        setActionPending(null);
      }
    },
    [liveDbBoardPath, roomId, selfKey, refreshAfterBoardPathAction]
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
        await refreshAfterBoardPathAction();
      } catch (e) {
        const n = normalizeBoardPathHookCaughtError(e);
        setRematchError({ code: n.code === "ACTION_EXCEPTION" ? "REMATCH_EXCEPTION" : n.code, message: n.message });
      } finally {
        setRematchBusy(false);
      }
    },
    [liveDbBoardPath, roomId, selfKey, refreshAfterBoardPathAction]
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
      await refreshAfterBoardPathAction();
    } catch (e) {
      const n = normalizeBoardPathHookCaughtError(e);
      setRematchError({ code: n.code === "ACTION_EXCEPTION" ? "REMATCH_EXCEPTION" : n.code, message: n.message });
    } finally {
      setRematchBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, refreshAfterBoardPathAction]);

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
      await refreshAfterBoardPathAction();
    } catch (e) {
      const n = normalizeBoardPathHookCaughtError(e);
      setFinalizeError({ code: n.code === "ACTION_EXCEPTION" ? "FINALIZE_EXCEPTION" : n.code, message: n.message });
    } finally {
      setFinalizeBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, isHost, refreshAfterBoardPathAction]);

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
      await refreshAfterBoardPathAction();
    } catch (e) {
      const n = normalizeBoardPathHookCaughtError(e);
      setRoomFinalizeError({
        code: n.code === "ACTION_EXCEPTION" ? "ROOM_FINALIZE_EXCEPTION" : n.code,
        message: n.message,
      });
    } finally {
      setRoomFinalizeBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, isHost, refreshAfterBoardPathAction]);

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
        await refreshAfterBoardPathAction();
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
      await refreshAfterBoardPathAction();
    } catch (e) {
      setSettlementClaimLastTouch(null);
      const n = normalizeBoardPathHookCaughtError(e);
      setSettlementClaimError({ code: n.code === "ACTION_EXCEPTION" ? "CLAIM_EXCEPTION" : n.code, message: n.message });
    } finally {
      setSettlementClaimBusy(false);
    }
  }, [liveDbBoardPath, roomId, selfKey, refreshAfterBoardPathAction]);

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
      typeof pathLenRaw === "number" && !Number.isNaN(pathLenRaw) ? Math.max(1, Math.floor(pathLenRaw)) : null;
    return rows.map((row, i) => {
      const pk = String(row.participant_key);
      const rawP =
        pathLen != null && Object.prototype.hasOwnProperty.call(posMap, pk) ? posMap[pk] : undefined;
      const pn = typeof rawP === "number" ? rawP : Number(rawP);
      const progress =
        pathLen != null && Number.isFinite(pn) ? Math.max(0, Math.min(Math.floor(pn), pathLen)) : null;
      return {
        id: row.id,
        sessionId: row.session_id,
        seatIndex: row.seat_index ?? i,
        participantKey: pk,
        displayName: pk,
        isHost: false,
        isReady: true,
        isSelf: pk === selfKey,
        tokenColor: BP_SEAT_TONES[i % BP_SEAT_TONES.length],
        progress,
        finished: pathLen != null && progress != null ? progress >= pathLen : false,
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

  const boardPathActionCallbacks = useMemo(
    () => ({
      commitStake,
      chooseToken: undefined,
      rollTurn,
      moveTurn,
      endTurn,
      claimSettlement,
      requestRematch,
      cancelRematch,
      startNewMatch: startNextMatch,
      finalizeSession,
      finalizeRoom,
    }),
    [
      commitStake,
      rollTurn,
      moveTurn,
      endTurn,
      claimSettlement,
      requestRematch,
      cancelRematch,
      startNextMatch,
      finalizeSession,
      finalizeRoom,
    ]
  );

  const vmCore = useMemo(() => {
    const ctxSess = mergedContext?.session ?? null;
    const hasSettlement =
      String(ctxSess?.settlement_status || ctxSess?.settlementStatus || "") === "finalized" ||
      String(roomForPhase?.settlement_status || "") === "finalized";
    const isBlocked = Boolean(sessionSyncFault);

    const unified = buildOv2BoardPathVM({
      room: roomForPhase,
      members: effectiveMembers,
      session: ctxSess,
      seats: Array.isArray(mergedContext?.seats) ? mergedContext.seats : [],
      localParticipantKey: selfKey,
      sessionState: legacyVm.sessionState,
      flags: { hasSettlement, isBlocked },
    });

    return {
      ...legacyVm,
      ...unified,
      seatRows: seats,
      uiSelfSeat: selfSeat,
      uiActiveSeat: activeSeat,
      localBundle: bundle,
      localSession: bundle?.localSession ?? null,
      didSelfInitiateOpen,
      blockError: sessionSyncFault,
      isBlocked,
      canSelfAct: canSelfActFlag,
      liveDbBoardPath,
      commitStakeBusy: actionPending === "commit_stake",
      bundleSyncState,
      bundleSyncError,
      canRetryBundleSync,
      lastBundleSyncAt,
      canAttemptSessionOpen,
      canRetrySessionOpen,
      sessionOpenBusy,
      sessionOpenError,
      lastSessionOpenAt,
    };
  }, [
    legacyVm,
    roomForPhase,
    mergedContext?.session,
    mergedContext?.seats,
    effectiveMembers,
    selfKey,
    sessionSyncFault,
    seats,
    selfSeat,
    activeSeat,
    canSelfActFlag,
    didSelfInitiateOpen,
    bundle,
    liveDbBoardPath,
    actionPending,
    bundleSyncState,
    bundleSyncError,
    canRetryBundleSync,
    lastBundleSyncAt,
    canAttemptSessionOpen,
    canRetrySessionOpen,
    sessionOpenBusy,
    sessionOpenError,
    lastSessionOpenAt,
  ]);

  const boardPathActions = useMemo(
    () => (vmCore ? resolveBoardPathActions(vmCore, boardPathActionCallbacks) : null),
    [vmCore, boardPathActionCallbacks]
  );

  const turnActionPending = useMemo(
    () =>
      actionPending === "roll" || actionPending === "move" || actionPending === "end_turn"
        ? actionPending
        : null,
    [actionPending]
  );

  const gameplayActionSurface = useMemo(
    () =>
      vmCore && boardPathActions
        ? deriveBoardPathGameplayActionSurface(vmCore, boardPathActions, turnActionPending)
        : BOARD_PATH_GAMEPLAY_ACTION_SURFACE_OFF,
    [vmCore, boardPathActions, turnActionPending]
  );

  const postMatchActionSurface = useMemo(
    () =>
      vmCore && boardPathActions
        ? deriveBoardPathPostMatchActionSurface(vmCore, boardPathActions)
        : BOARD_PATH_POST_MATCH_ACTION_SURFACE_OFF,
    [vmCore, boardPathActions]
  );

  const vm = useMemo(
    () =>
      vmCore ? { ...vmCore, ...gameplayActionSurface, ...postMatchActionSurface } : vmCore,
    [vmCore, gameplayActionSurface, postMatchActionSurface]
  );

  return {
    mergedContext,
    vm,
    boardPathActions,
    gameplayActionSurface,
    postMatchActionSurface,
    localBundle: bundle,
    localSession: bundle?.localSession ?? null,
    localSeats: bundle?.localSeats ?? null,
    didSelfInitiateOpen,
    debugAdvanceTurn,
    debugEmitEvent,
    sessionSyncFault,
    liveDbBoardPath,
    commitStake,
    /** Explicit: no separate token-picker RPC yet — UI uses `moveTurn` when `chooseToken` is absent (`ov2BoardPathActionContract`). */
    chooseToken: undefined,
    rollTurn: liveDbBoardPath ? rollTurn : undefined,
    moveTurn: liveDbBoardPath ? moveTurn : undefined,
    endTurn: liveDbBoardPath ? endTurn : undefined,
    actionPending,
    actionError,
    refreshAfterBoardPathAction,
    bundleSyncState,
    bundleSyncError,
    lastBundleSyncAt,
    canRetryBundleSync,
    retryBundleSync,
    canAttemptSessionOpen,
    canRetrySessionOpen,
    sessionOpenBusy,
    sessionOpenError,
    lastSessionOpenAt,
    attemptSessionOpen,
    liveSyncEnabled,
    liveSyncState,
    liveRevision,
    sessionIdentity,
    lastSyncAt,
    liveSyncError,
    requestRematch: liveDbBoardPath ? requestRematch : undefined,
    cancelRematch: liveDbBoardPath ? cancelRematch : undefined,
    startNextMatch: liveDbBoardPath ? startNextMatch : undefined,
    /** Alias for action-contract `startNewMatch`. */
    startNewMatch: liveDbBoardPath ? startNextMatch : undefined,
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
