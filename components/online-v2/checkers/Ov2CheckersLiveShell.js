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
import { requestOv2CheckersOpenSession } from "../../../lib/online-v2/checkers/ov2CheckersSessionAdapter";
import {
  fetchOv2RoomLedgerForViewer,
  leaveOv2RoomWithForfeitRetry,
  Ov2RoomRpcError,
} from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../../lib/supabaseClients";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2CheckersScreen from "./Ov2CheckersScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

export default function Ov2CheckersLiveShell() {
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
  const [openBusy, setOpenBusy] = useState(false);
  const [openErr, setOpenErr] = useState("");
  const [, setPresenceMembers] = useState([]);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState("");
  const loadedOnceForRoomRef = useRef(null);
  const leaveInFlightRef = useRef(false);
  const selfDisplayName = useMemo(() => {
    const mine = members.find(m => String(m?.participant_key || "") === String(participantId || ""));
    return String(mine?.display_name || "").trim();
  }, [members, participantId]);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.CHECKERS) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Checkers table.");
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

  const reloadContextUntilSessionChanges = useCallback(
    async (previousSessionId, rpcNewSessionId, timeoutMs = 20000, options = {}) => {
      if (!roomId) return { ok: false, error: "no room" };
      const pk = String(participantId || "").trim();
      if (!pk) return { ok: false, error: "no participant" };
      const expectClearedSession = options?.expectClearedSession === true;
      const prev =
        previousSessionId != null && String(previousSessionId).trim() !== "" ? String(previousSessionId).trim() : "";
      const rpcSid =
        rpcNewSessionId != null && String(rpcNewSessionId).trim() !== "" ? String(rpcNewSessionId).trim() : "";
      const start = Date.now();
      setLoadError("");
      try {
        if (!expectClearedSession && rpcSid && rpcSid !== prev) {
          setRoom(row => (row && typeof row === "object" ? { ...row, active_session_id: rpcSid } : row));
        }
        while (Date.now() - start < timeoutMs) {
          const { room: r, members: m } = await fetchOv2RoomLedgerForViewer(roomId, { viewer_participant_key: pk });
          if (!r) {
            setRoom(null);
            setMembers([]);
            setLoadError("Room not found.");
            return { ok: false, error: "Room not found" };
          }
          if (r.product_game_id !== ONLINE_V2_GAME_IDS.CHECKERS) {
            setRoom(null);
            setMembers([]);
            setLoadError("This room is not a Checkers table.");
            return { ok: false, error: "wrong game" };
          }
          const nextId = r.active_session_id != null ? String(r.active_session_id).trim() : "";
          const life = r.lifecycle_phase != null ? String(r.lifecycle_phase).trim() : "";
          setRoom(r);
          setMembers(m);
          loadedOnceForRoomRef.current = roomId;
          if (expectClearedSession) {
            if ((!nextId || nextId === "") && life === "pending_stakes") return { ok: true };
          } else if (nextId) {
            if (rpcSid && nextId === rpcSid) return { ok: true };
            if (!rpcSid && prev && nextId !== prev) return { ok: true };
          }
          await new Promise(res => setTimeout(res, 150));
        }
        setLoadError(
          expectClearedSession
            ? "Timed out waiting for the room to return to stake phase."
            : "Timed out waiting for the new match to start."
        );
        return { ok: false, error: "timeout" };
      } catch (e) {
        const msg = e?.message || String(e);
        setLoadError(msg);
        const softLedger =
          e instanceof Ov2RoomRpcError && e.code === "room_not_found_or_invalid_credentials";
        if (!softLedger) {
          setRoom(null);
          setMembers([]);
        }
        return { ok: false, error: msg };
      }
    },
    [roomId, participantId]
  );

  const debouncedReloadContext = useOv2DebouncedReload(() => {
    void reloadContext();
  }, 400);

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
      .channel(`ov2_ck_shell_room:${roomId}`)
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

  useEffect(() => {
    if (typeof window === "undefined" || !roomId || !participantId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_ck_live_presence:${roomId}`)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState();
        const roster = Object.values(state)
          .flat()
          .map(r => ({
            participant_key:
              r && typeof r === "object" && "participant_key" in r ? String(r.participant_key || "").trim() : "",
            display_name: r && typeof r === "object" && "display_name" in r ? String(r.display_name || "").trim() : "",
          }))
          .filter(r => r.participant_key);
        setPresenceMembers(roster);
      })
      .subscribe(async status => {
        if (status === "SUBSCRIBED") {
          await ch.track({
            participant_key: participantId,
            display_name: selfDisplayName,
            at: new Date().toISOString(),
          });
        }
      });
    return () => {
      void ch.unsubscribe();
      setPresenceMembers([]);
    };
  }, [roomId, participantId, selfDisplayName]);

  const isRoomMember = useMemo(
    () => Boolean(participantId && members.some(m => m.participant_key === participantId)),
    [members, participantId]
  );

  const seatedCount = useMemo(() => members.filter(m => m.seat_index != null && m.seat_index !== "").length, [members]);
  const seatedAllCommitted = useMemo(() => {
    const seated = members.filter(m => m?.seat_index != null && m?.seat_index !== "");
    if (seated.length === 0) return true;
    return seated.every(m => String(m?.wallet_state || "").trim() === "committed");
  }, [members]);
  const roomLifecycle =
    room && typeof room === "object" && room.lifecycle_phase != null ? String(room.lifecycle_phase).trim() : "";
  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  const showStakePhaseAfterRematchHint = useMemo(
    () =>
      Boolean(
        room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.CHECKERS &&
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
          room.product_game_id === ONLINE_V2_GAME_IDS.CHECKERS &&
          !room.active_session_id &&
          roomLifecycle === "active" &&
          seatedCount === 2
      ),
    [room, participantId, isHost, isRoomMember, roomLifecycle, seatedCount]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (!room || room.product_game_id !== ONLINE_V2_GAME_IDS.CHECKERS) return "";
    if (room.active_session_id) return "Match already opened.";
    if (roomLifecycle !== "active") return "Room must be active before opening a session.";
    if (!isRoomMember) return "Join the room first.";
    if (!isHost) return "Only room host can open session.";
    if (seatedCount !== 2) return "Need exactly two seated players.";
    if (!seatedAllCommitted) return "All seated players must commit stake.";
    return "";
  }, [room, roomLifecycle, isRoomMember, isHost, seatedCount, seatedAllCommitted]);

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

  const onShellOpen = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpen || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const res = await requestOv2CheckersOpenSession(roomId, participantId, {
        presenceLeaderKey: participantId,
      });
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
      <OnlineV2GamePageShell title="Checkers" showSubtitle={false} infoPanel={null}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
          {router.isReady ? "Opening rooms…" : "Loading…"}
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Checkers"
      showSubtitle={false}
      infoPanel={
        <>
          <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
            <section>
              <p className="font-semibold text-zinc-100">Rules</p>
              <p className="mt-0.5">
                8×8 on dark squares, forced captures, multi-jump chains on one turn, flying kings. First move branch locks the
                chain until the turn completes. Server is authoritative.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Turns</p>
              <p className="mt-0.5">Tap your piece, then a legal destination. The move submits immediately — no undo.</p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">After the result</p>
              <p className="mt-0.5">
                Settlement runs automatically. Rematch, then host starts the next match and players re-commit stakes in the lobby.
              </p>
            </section>
          </div>
          <p className="mt-2 text-[11px] text-zinc-500">
            <Link href="/online-v2/rooms" className="text-sky-300 underline">
              Lobby
            </Link>
            {" · "}
            <button type="button" className="text-sky-300 underline" onClick={() => void reloadContext()}>
              Refresh
            </button>
            {" · "}
            <button
              type="button"
              disabled={leaveBusy || !participantId}
              className="text-sky-300 underline disabled:opacity-45"
              onClick={() => void onLeaveTable()}
            >
              {leaveBusy ? "Leaving…" : "Leave table"}
            </button>
            {leaveErr ? <span className="ml-1 text-red-300">{leaveErr}</span> : null}
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
        <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-zinc-400">Loading room…</div>
      ) : (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          {showStakePhaseAfterRematchHint ? (
            <div className="flex shrink-0 flex-col gap-1 border-b border-amber-500/25 bg-amber-950/20 px-2 py-1.5 sm:gap-1.5 sm:py-2">
              <p className="text-[10px] leading-snug text-amber-100/95 sm:text-[11px]">
                <strong className="font-semibold">Next round:</strong> commit entry again in the room lobby. When the room is
                active, the host can open Checkers here.
              </p>
              <Link
                href="/online-v2/rooms"
                className="inline-flex w-fit items-center rounded-md border border-amber-400/50 bg-amber-900/35 px-2.5 py-1 text-[10px] font-semibold text-amber-50 hover:bg-amber-900/50 sm:text-xs"
              >
                Open room lobby
              </Link>
            </div>
          ) : null}
          {canShellHostOpen ? (
            <div className="flex shrink-0 flex-col gap-0.5 border-b border-white/[0.08] py-1">
              <button
                type="button"
                disabled={openBusy || Boolean(shellOpenDisabledReason)}
                title={shellOpenDisabledReason || undefined}
                onClick={() => void onShellOpen()}
                className="rounded-md border border-emerald-500/40 bg-emerald-950/40 py-1.5 text-[10px] font-bold text-emerald-100 disabled:opacity-40 sm:text-xs"
              >
                {openBusy ? "Opening…" : "Open match (host)"}
              </button>
              {shellOpenDisabledReason ? <p className="text-[10px] text-zinc-500">{shellOpenDisabledReason}</p> : null}
              {openErr ? <p className="text-[10px] text-red-300">{openErr}</p> : null}
            </div>
          ) : null}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Ov2CheckersScreen
              key={room?.active_session_id ? String(room.active_session_id) : "ov2-ck-no-session"}
              contextInput={contextInput}
              onSessionRefresh={reloadContextUntilSessionChanges}
            />
          </div>
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
