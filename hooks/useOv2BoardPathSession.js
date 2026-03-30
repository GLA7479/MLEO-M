import { useEffect, useMemo, useRef, useState } from "react";
import {
  BOARD_PATH_SESSION_PHASE,
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
  fetchBoardPathSession,
  rpcOv2BoardPathOpenSession,
} from "../lib/online-v2/board-path/ov2BoardPathSessionApi";
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
  const bundleRef = useRef(null);
  bundleRef.current = bundle;

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
      activeSid != null && String(activeSid).trim() !== "" ? String(activeSid) : null;
    const ms = nMatchSeq(matchSeq);

    if (!roomId || !selfKey) {
      setBundle(null);
      setRoomSessionPatch(null);
      identityPrevRef.current = { roomId, selfKey, matchSeq: ms };
      return;
    }

    const prevId = identityPrevRef.current;
    const identityShift =
      (prevId.roomId != null && prevId.roomId !== roomId) ||
      (prevId.selfKey != null && prevId.selfKey !== selfKey) ||
      (prevId.matchSeq >= 0 && prevId.matchSeq !== ms);

    if (identityShift) {
      setBundle(null);
      setRoomSessionPatch(null);
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
  }, [roomId, selfKey, matchSeq, activeSid]);

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
        if (cancelled || !raw || raw.ok !== true) return;
        const session = raw.session;
        const seatsRaw = raw.seats;
        const seats = Array.isArray(seatsRaw) ? seatsRaw : [];
        if (!session || typeof session !== "object") return;
        const b = boardPathBundleFromDatabase(room, members, selfKey, session, seats, selfKey);
        if (!b || cancelled) return;
        setRoomSessionPatch({ active_session_id: String(session.id) });
        setBundle(prev => {
          if (prev != null && isSameSession(prev.localSession, b.localSession)) return prev;
          return b;
        });
      } catch (e) {
        console.error("ov2_board_path_open_session", e);
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
    (async () => {
      try {
        const fetched = await fetchBoardPathSession(supabaseMP, String(room.id));
        if (cancelled || !fetched?.session) return;
        if (String(fetched.session.id) !== String(room.active_session_id)) return;
        const hk = hostKey || selfKey;
        const b = boardPathBundleFromDatabase(room, members, selfKey, fetched.session, fetched.seats, hk);
        if (!b || cancelled) return;
        setBundle(prev => {
          if (prev != null && isSameSession(prev.localSession, b.localSession)) return prev;
          return b;
        });
      } catch (e) {
        console.error("fetchBoardPathSession", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [room, roomId, members, selfKey, memberSig, activeSid, hostKey]);

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

  const mergedContext = useMemo(
    () => mergeBoardPathBundleIntoContext(baseContext || { room: null, members: [], self: null }, bundle, roomSessionPatch),
    [baseContext, bundle, roomSessionPatch]
  );

  const vm = useMemo(() => deriveBoardPathViewModel(mergedContext), [mergedContext]);

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
    return {
      ...s,
      phase: s.phase ?? s.engine_phase,
    };
  }, [bundle?.localSession, mergedContext?.session]);

  const seats = useMemo(() => {
    if (bundle?.localSeats?.length) return bundle.localSeats;
    const s = mergedContext?.session;
    const rows = mergedContext?.seats;
    if (!s?.id || !Array.isArray(rows) || rows.length === 0 || !selfKey) return null;
    return rows.map((row, i) => ({
      id: row.id,
      sessionId: row.session_id,
      seatIndex: row.seat_index ?? i,
      participantKey: row.participant_key,
      displayName: `…${String(row.participant_key).slice(0, 4)}`,
      isHost: false,
      isReady: true,
      isSelf: row.participant_key === selfKey,
      tokenColor: BP_SEAT_TONES[i % BP_SEAT_TONES.length],
      progress: 0,
      finished: false,
      connected: true,
    }));
  }, [bundle?.localSeats, mergedContext?.session, mergedContext?.seats, selfKey]);

  const selfSeat = useMemo(() => (seats?.length && selfKey ? seats.find(x => x.isSelf) ?? null : null), [seats, selfKey]);

  const activeSeat = useMemo(() => {
    if (!seats?.length || !session) return null;
    const idx = session.turnMeta?.activeSeatIndex ?? null;
    if (idx == null) return null;
    return seats.find(x => x.seatIndex === idx) ?? null;
  }, [seats, session]);

  const sessionPhase = vm.sessionPhase;

  const canSelfActFlag = useMemo(() => canSelfAct(session, selfSeat), [session, selfSeat]);

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
  };
}
