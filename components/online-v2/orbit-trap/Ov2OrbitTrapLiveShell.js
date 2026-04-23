"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2RoomIdQueryParam,
  ONLINE_V2_GAME_IDS,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import { useOv2DebouncedReload } from "../../../hooks/useOv2DebouncedReload";
import { useOv2LiveShellFatalRoomRedirect } from "../../../hooks/useOv2LiveShellFatalRoomRedirect";
import {
  fetchOv2RoomById,
  fetchOv2RoomLedgerForViewer,
  leaveOv2RoomWithForfeitRetry,
  Ov2RoomRpcError,
} from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import {
  fetchOv2OrbitTrapSnapshotDetailed,
  requestOv2OrbitTrapApplyAction,
  requestOv2OrbitTrapOpenSession,
  subscribeOv2OrbitTrapSnapshot,
} from "../../../lib/online-v2/orbit-trap/ov2OrbitTrapSessionApi";
import { supabaseMP } from "../../../lib/supabaseClients";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2OrbitTrapScreen from "./Ov2OrbitTrapScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

/**
 * Orbit Trap — shared-room live shell (Phase 4: authoritative session + Realtime).
 */
export default function Ov2OrbitTrapLiveShell() {
  const router = useRouter();
  const [bootRoomId, setBootRoomId] = useState(null);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("room");
    setBootRoomId(raw && raw.trim() ? raw.trim() : null);
  }, []);

  const routerRoomId = router.isReady ? parseRoomQueryParam(router.query.room) : null;
  const rawRoomId = router.isReady ? routerRoomId : bootRoomId;
  const roomId = rawRoomId && isOv2RoomIdQueryParam(rawRoomId) ? String(rawRoomId).trim() : null;

  const [participantId, setParticipantId] = useState(() =>
    typeof window !== "undefined" ? getOv2ParticipantId() : ""
  );
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState("");
  const [openBusy, setOpenBusy] = useState(false);
  const [openErr, setOpenErr] = useState("");
  const [authSnap, setAuthSnap] = useState(null);
  const [authLoading, setAuthLoading] = useState(false);
  const authSnapRef = useRef(null);
  const loadedOnceForRoomRef = useRef(null);
  const leaveInFlightRef = useRef(false);
  const selfDisplayName = useMemo(() => {
    const mine = members.find(m => String(m?.participant_key || "") === String(participantId || ""));
    return String(mine?.display_name || "").trim();
  }, [members, participantId]);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  useEffect(() => {
    authSnapRef.current = authSnap;
  }, [authSnap]);

  const reloadContext = useCallback(async () => {
    if (!roomId) return;
    const pk = String(participantId || "").trim();
    if (!pk) return;
    setLoadError("");
    const firstForRoom = loadedOnceForRoomRef.current !== roomId;
    if (firstForRoom) setLoading(true);
    try {
      const { room: r, members: m } = await fetchOv2RoomLedgerForViewer(roomId, { viewer_participant_key: pk });
      if (!r) {
        setRoom(null);
        setMembers([]);
        setLoadError("Room not found.");
        return;
      }
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.ORBIT_TRAP) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not an Orbit Trap table.");
        return;
      }
      setRoom(r);
      setMembers(m);
      loadedOnceForRoomRef.current = roomId;
    } catch (e) {
      setLoadError(e?.message || String(e));
      const softLedger =
        e instanceof Ov2RoomRpcError && e.code === "room_not_found_or_invalid_credentials";
      if (!softLedger) {
        setRoom(null);
        setMembers([]);
      }
    } finally {
      if (firstForRoom) setLoading(false);
    }
  }, [roomId, participantId]);

  const debouncedReloadContext = useOv2DebouncedReload(() => {
    void reloadContext();
  }, 400);

  const onSessionRefresh = useCallback(
    async (_previousSessionId, _rpcNewSessionId, _options) => {
      await reloadContext();
    },
    [reloadContext]
  );

  useEffect(() => {
    loadedOnceForRoomRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void reloadContext();
  }, [roomId, reloadContext]);

  useEffect(() => {
    if (!router.isReady) return;
    if (roomId) return;
    void router.replace("/online-v2/rooms");
  }, [router.isReady, roomId, router]);

  useOv2LiveShellFatalRoomRedirect(router, roomId, loadError);

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return undefined;
    const ch = supabaseMP
      .channel(`ov2-orbit-trap-shell-room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_rooms", filter: `id=eq.${roomId}` },
        () => {
          debouncedReloadContext();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ov2_room_members", filter: `room_id=eq.${roomId}` },
        () => {
          debouncedReloadContext();
        }
      )
      .subscribe();
    return () => {
      void ch.unsubscribe();
    };
  }, [roomId, debouncedReloadContext]);

  const liveSessionId =
    room && typeof room === "object" && room.active_session_id != null && String(room.active_session_id).trim() !== ""
      ? String(room.active_session_id).trim()
      : null;

  useEffect(() => {
    if (!roomId || !participantId || !liveSessionId) {
      setAuthSnap(null);
      setAuthLoading(false);
      return undefined;
    }
    setAuthLoading(true);
    const unsub = subscribeOv2OrbitTrapSnapshot(roomId, {
      participantKey: participantId,
      activeSessionId: liveSessionId,
      onSnapshot: s => {
        setAuthSnap(prev => {
          if (!prev || s.revision >= prev.revision) return s;
          return prev;
        });
        setAuthLoading(false);
      },
      onError: () => {
        setAuthLoading(false);
      },
    });
    return unsub;
  }, [roomId, participantId, liveSessionId]);

  const isRoomMember = useMemo(
    () => Boolean(participantId && members.some(m => m.participant_key === participantId)),
    [members, participantId]
  );
  const seatedCount = useMemo(() => members.filter(m => m?.seat_index != null && m?.seat_index !== "").length, [members]);
  const seatedAllCommitted = useMemo(() => {
    const seated = members.filter(m => m?.seat_index != null && m?.seat_index !== "");
    if (seated.length === 0) return true;
    return seated.every(m => String(m?.wallet_state || "").trim() === "committed");
  }, [members]);
  const roomLifecycle =
    room && typeof room === "object" && room.lifecycle_phase != null ? String(room.lifecycle_phase).trim() : "";
  const roomStatusUpper = room && typeof room === "object" && room.status != null ? String(room.status).trim().toUpperCase() : "";
  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  const showStakePhaseAfterRematchHint = useMemo(
    () =>
      Boolean(
        room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.ORBIT_TRAP &&
          !room.active_session_id &&
          (roomLifecycle === "pending_stakes" || roomLifecycle === "pending_start")
      ),
    [room, roomLifecycle]
  );

  const canShellHostOpen = useMemo(
    () =>
      Boolean(
        participantId &&
          isHost &&
          isRoomMember &&
          room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.ORBIT_TRAP &&
          !room.active_session_id &&
          roomStatusUpper === "IN_GAME" &&
          seatedCount >= 2 &&
          seatedCount <= 4
      ),
    [room, participantId, isHost, isRoomMember, roomStatusUpper, seatedCount]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (!room || room.product_game_id !== ONLINE_V2_GAME_IDS.ORBIT_TRAP) return "";
    if (room.active_session_id) return "Match already opened.";
    if (roomStatusUpper !== "IN_GAME") return "Room must be in play before opening a session.";
    if (!isRoomMember) return "Join the room first.";
    if (!isHost) return "Only room host can open session.";
    if (seatedCount < 2) return "Need at least two seated players.";
    if (seatedCount > 4) return "Orbit Trap supports at most four seated players.";
    if (!seatedAllCommitted) return "All seated players must commit stake.";
    return "";
  }, [room, roomStatusUpper, isRoomMember, isHost, seatedCount, seatedAllCommitted]);

  const onShellOpen = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpen || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const canon = await fetchOv2RoomById(roomId, { viewerParticipantKey: participantId });
      const ms = Number(canon?.match_seq);
      if (!Number.isFinite(ms)) {
        setOpenErr("Could not read room match sequence. Refresh and retry.");
        return;
      }
      const res = await requestOv2OrbitTrapOpenSession(roomId, participantId, { expectedRoomMatchSeq: Math.floor(ms) });
      if (!res.ok) {
        setOpenErr(res.error || "Could not open session.");
        return;
      }
      await reloadContext();
    } catch (e) {
      setOpenErr(e?.message || String(e));
    } finally {
      setOpenBusy(false);
    }
  }, [roomId, participantId, canShellHostOpen, shellOpenDisabledReason, reloadContext]);

  const onAuthoritativeAction = useCallback(
    async action => {
      if (!roomId || !participantId) return { ok: false, error: "Missing room or participant" };
      const res = await requestOv2OrbitTrapApplyAction(roomId, participantId, action, {
        expectedRevision: authSnapRef.current?.revision ?? null,
      });
      if (!res.ok && res.code === "REVISION_MISMATCH") {
        const { snapshot: fresh } = await fetchOv2OrbitTrapSnapshotDetailed(roomId, { participantKey: participantId });
        if (fresh) setAuthSnap(fresh);
      }
      if (res.ok && res.snapshot) {
        setAuthSnap(res.snapshot);
      }
      return res;
    },
    [roomId, participantId]
  );

  const onLeaveTable = useCallback(async () => {
    if (!roomId || !participantId || leaveInFlightRef.current) return;
    leaveInFlightRef.current = true;
    setLeaveErr("");
    setLeaveBusy(true);
    try {
      await leaveOv2RoomWithForfeitRetry({
        room,
        room_id: roomId,
        participant_key: participantId,
      });
      clearOv2SharedLastRoomSessionKey();
      await router.replace("/online-v2/rooms");
    } catch (e) {
      setLeaveErr(e?.message || String(e) || "Could not leave.");
    } finally {
      leaveInFlightRef.current = false;
      setLeaveBusy(false);
    }
  }, [roomId, participantId, room, router]);

  const contextInput = useMemo(() => {
    if (!roomId) return null;
    if (!room) return null;
    return {
      room,
      members,
      self: {
        participant_key: participantId,
        display_name: selfDisplayName,
      },
      onLeaveToLobby: onLeaveTable,
      leaveToLobbyBusy: leaveBusy,
    };
  }, [roomId, room, members, participantId, selfDisplayName, onLeaveTable, leaveBusy]);

  if (!roomId) {
    return (
      <OnlineV2GamePageShell title="Orbit Trap" showSubtitle={false} infoPanel={null} chromePreset="ov2_board">
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
          {router.isReady ? "Opening rooms…" : "Loading…"}
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Orbit Trap"
      showSubtitle={false}
      chromePreset="ov2_board"
      infoPanel={
        <>
          <div className="space-y-0 text-[11px] leading-relaxed text-zinc-400">
            <section className="border-b border-white/[0.05] py-2.5 first:pt-0 last:border-b-0 last:pb-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Rules (MVP)</p>
              <p className="mt-1.5 text-zinc-400/95">
                2–4 players, rings + Core. Collect two orbs, start your turn on the inner ring, then enter the Core to
                win. Moves, rotations, and locks are validated on the server; you choose among the legal options shown
                here.
              </p>
            </section>
            <section className="py-2.5 last:pb-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-500">Authority</p>
              <p className="mt-1.5 text-zinc-400/95">
                Snapshot + Realtime on <span className="font-mono text-zinc-500">ov2_orbit_trap_sessions</span>.
                Settlement / rematch / Quick Match are deferred.
              </p>
            </section>
          </div>
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-3 text-[11px] text-zinc-500">
            <Link
              href="/online-v2/rooms"
              className="font-medium text-sky-300/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-200"
            >
              Lobby
            </Link>
            <span className="text-zinc-600" aria-hidden>
              ·
            </span>
            <button
              type="button"
              className="font-medium text-sky-300/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-200"
              onClick={() => void reloadContext()}
            >
              Refresh
            </button>
            <span className="text-zinc-600" aria-hidden>
              ·
            </span>
            <button
              type="button"
              disabled={leaveBusy || !participantId}
              className="font-medium text-sky-300/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-200 disabled:opacity-45"
              onClick={() => void onLeaveTable()}
            >
              {leaveBusy ? "Leaving…" : "Leave table"}
            </button>
            {leaveErr ? <span className="w-full text-[10px] text-red-300/95">{leaveErr}</span> : null}
          </p>
        </>
      }
    >
      {roomId && loadError && !room ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
          <p className="text-sm text-red-200">{loadError}</p>
          <Link href="/online-v2/rooms" className="text-xs text-sky-300 underline">
            Back to rooms
          </Link>
        </div>
      ) : roomId && loading && !room ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm text-zinc-400">Loading room…</p>
          <Link
            href="/online-v2/rooms"
            className="text-[11px] font-semibold text-sky-300/90 underline decoration-sky-500/30 underline-offset-2"
          >
            Back to lobby
          </Link>
        </div>
      ) : (
        <div className="flex w-full min-h-0 flex-1 flex-col justify-start overflow-x-hidden overflow-y-hidden">
          {showStakePhaseAfterRematchHint ? (
            <div className="flex min-h-[3.25rem] shrink-0 flex-col justify-center gap-1.5 border-b border-amber-500/20 bg-gradient-to-r from-amber-950/35 to-amber-950/10 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:min-h-[3.5rem] sm:py-2">
              <p className="text-[10px] leading-snug text-amber-100/90 sm:text-[11px]">
                <span className="font-semibold text-amber-200/95">Next round:</span> commit entry again in the room
                lobby. When the room is in play, the host can open Orbit Trap here.
              </p>
              <Link
                href="/online-v2/rooms"
                className="inline-flex w-fit items-center rounded-lg border border-amber-500/30 bg-gradient-to-b from-amber-900/40 to-amber-950/70 px-2.5 py-1 text-[10px] font-semibold text-amber-50/95 shadow-sm transition hover:from-amber-900/55 sm:text-xs"
              >
                Open room lobby
              </Link>
            </div>
          ) : null}
          {canShellHostOpen ? (
            <div className="flex min-h-[3rem] shrink-0 flex-col justify-center gap-1 border-b border-white/[0.06] py-1">
              <button
                type="button"
                disabled={openBusy || Boolean(shellOpenDisabledReason)}
                title={shellOpenDisabledReason || undefined}
                onClick={() => void onShellOpen()}
                className="rounded-lg border border-emerald-500/20 bg-gradient-to-b from-emerald-950/75 to-emerald-950 py-1.5 text-[10px] font-semibold text-emerald-100/88 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),inset_0_-2px_4px_rgba(0,0,0,0.35)] transition active:scale-[0.98] disabled:opacity-40 sm:text-xs"
              >
                {openBusy ? "Opening…" : "Open match (host)"}
              </button>
              {shellOpenDisabledReason ? <p className="min-h-[1rem] text-[10px] text-zinc-500">{shellOpenDisabledReason}</p> : null}
              {openErr ? <p className="text-[10px] text-red-300/95">{openErr}</p> : null}
            </div>
          ) : null}
          {!liveSessionId && !canShellHostOpen && roomStatusUpper === "IN_GAME" ? (
            <div className="flex min-h-[2.75rem] shrink-0 flex-col justify-center gap-1 border-b border-amber-500/25 bg-gradient-to-r from-amber-950/40 to-amber-950/10 px-2 py-1.5 text-[10px] text-amber-100/90 sm:text-[11px]">
              <p>
                <span className="font-semibold text-amber-200/95">Session:</span> waiting for host to open the match.
                Board preview below is non-authoritative until <span className="font-mono">active_session_id</span> is
                set.
              </p>
            </div>
          ) : null}
          <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col justify-start overflow-x-hidden overflow-y-hidden">
            <Ov2OrbitTrapScreen
              key={liveSessionId || "ov2-orbit-trap-no-session"}
              contextInput={contextInput}
              liveSessionId={liveSessionId}
              onSessionRefresh={onSessionRefresh}
              authoritativeSnapshot={authSnap}
              authorityLoading={authLoading}
              onAuthoritativeAction={onAuthoritativeAction}
            />
          </div>
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
