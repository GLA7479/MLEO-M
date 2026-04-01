"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ONLINE_V2_GAME_IDS } from "../../../lib/online-v2/onlineV2GameRegistry";
import { openOv2Rummy51Session } from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import { fetchOv2RoomById, fetchOv2RoomMembers, leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../../lib/supabaseClients";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2Rummy51Screen from "./Ov2Rummy51Screen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

/**
 * `?room=` loads OV2 room + members; live Rummy 51 session is authoritative via RPC + Realtime.
 * Without `?room=`, only a short secondary note is shown — no confusing “preview match” copy.
 */
export default function Ov2Rummy51LiveShell() {
  const router = useRouter();
  const [bootRoomId, setBootRoomId] = useState(null);
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("room");
    setBootRoomId(raw && raw.trim() ? raw.trim() : null);
  }, []);

  const routerRoomId = router.isReady ? parseRoomQueryParam(router.query.room) : null;
  const roomId = router.isReady ? routerRoomId : bootRoomId;

  const [participantId, setParticipantId] = useState("");
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [openBusy, setOpenBusy] = useState(false);
  const [openErr, setOpenErr] = useState("");
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState("");
  const loadedOnceForRoomRef = useRef(null);

  const selfDisplayName = useMemo(() => {
    const mine = members.find(m => String(m?.participant_key || "") === String(participantId || ""));
    return String(mine?.display_name || "").trim();
  }, [members, participantId]);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  const reloadContext = useCallback(async () => {
    if (!roomId) return;
    setLoadError("");
    const firstForRoom = loadedOnceForRoomRef.current !== roomId;
    if (firstForRoom) setLoading(true);
    try {
      const r = await fetchOv2RoomById(roomId);
      if (!r) {
        setRoom(null);
        setMembers([]);
        setLoadError("Room not found.");
        return;
      }
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.RUMMY51) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Rummy 51 table.");
        return;
      }
      setRoom(r);
      const m = await fetchOv2RoomMembers(roomId);
      setMembers(m);
      loadedOnceForRoomRef.current = roomId;
    } catch (e) {
      setLoadError(e?.message || String(e));
      setRoom(null);
      setMembers([]);
    } finally {
      if (firstForRoom) setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    loadedOnceForRoomRef.current = null;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void reloadContext();
  }, [roomId, reloadContext]);

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_r51_shell_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ov2_rooms", filter: `id=eq.${roomId}` },
        () => {
          void reloadContext();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ov2_room_members", filter: `room_id=eq.${roomId}` },
        () => {
          void reloadContext();
        }
      )
      .subscribe();
    return () => {
      void ch.unsubscribe();
    };
  }, [roomId, reloadContext]);

  const isRoomMember = useMemo(
    () => Boolean(participantId && members.some(m => m.participant_key === participantId)),
    [members, participantId]
  );

  const seatedCount = useMemo(() => {
    return members.filter(m => {
      const si = m?.seat_index;
      if (si === null || si === undefined || si === "") return false;
      const n = Number(si);
      return Number.isInteger(n) && n >= 0 && n <= 3;
    }).length;
  }, [members]);

  const seatedAllCommitted = useMemo(() => {
    const seated = members.filter(m => {
      const si = m?.seat_index;
      if (si === null || si === undefined || si === "") return false;
      const n = Number(si);
      return Number.isInteger(n) && n >= 0 && n <= 3;
    });
    if (seated.length === 0) return true;
    return seated.every(m => String(m?.wallet_state || "").trim() === "committed");
  }, [members]);

  const roomLifecycle =
    room && typeof room === "object" && room.lifecycle_phase != null ? String(room.lifecycle_phase).trim() : "";

  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  const canShellHostOpen = useMemo(
    () =>
      Boolean(
        participantId &&
          isHost &&
          isRoomMember &&
          room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.RUMMY51 &&
          !room.active_session_id &&
          roomLifecycle === "active" &&
          seatedCount >= 2 &&
          seatedCount <= 4 &&
          seatedAllCommitted
      ),
    [room, participantId, isHost, isRoomMember, roomLifecycle, seatedCount, seatedAllCommitted]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (!room || room.product_game_id !== ONLINE_V2_GAME_IDS.RUMMY51) return "";
    if (room.active_session_id) return "Match already opened.";
    if (roomLifecycle !== "active") return "Room must be active (stakes committed) before opening.";
    if (!isRoomMember) return "Join the room from the lobby first.";
    if (!isHost) return "Only the host can open the session.";
    if (seatedCount < 2) return "Need at least two seated players.";
    if (seatedCount > 4) return "At most four players.";
    if (!seatedAllCommitted) return "Every seated player must commit stake.";
    return "";
  }, [room, roomLifecycle, isRoomMember, isHost, seatedCount, seatedAllCommitted]);

  const onLeaveTable = useCallback(async () => {
    if (!roomId || !participantId) return;
    setLeaveErr("");
    setLeaveBusy(true);
    try {
      await leaveOv2RoomWithForfeitRetry({
        room,
        room_id: roomId,
        participant_key: participantId,
      });
      try {
        window.sessionStorage.removeItem("ov2_shared_last_room_id_v1");
      } catch {
        // ignore
      }
      await router.replace("/online-v2/rooms");
    } catch (e) {
      setLeaveErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setLeaveBusy(false);
    }
  }, [roomId, participantId, room, router]);

  const onShellOpen = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpen || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const res = await openOv2Rummy51Session(roomId, participantId);
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
    if (!roomId || !room) return null;
    return {
      room,
      members,
      self: {
        participant_key: participantId,
        display_name: selfDisplayName,
      },
      reloadRoomContext: reloadContext,
      onLeaveToLobby: onLeaveTable,
      leaveToLobbyBusy: leaveBusy,
    };
  }, [roomId, room, members, participantId, selfDisplayName, reloadContext, onLeaveTable, leaveBusy]);

  const showStakeHint = Boolean(
    room &&
      room.product_game_id === ONLINE_V2_GAME_IDS.RUMMY51 &&
      !room.active_session_id &&
      (roomLifecycle === "pending_stakes" || roomLifecycle === "pending_start")
  );

  return (
    <OnlineV2GamePageShell
      title="Rummy 51"
      showSubtitle={false}
      infoPanel={
        roomId ? (
          <>
            <p>
              Live table for room <span className="font-mono text-zinc-300">{roomId.slice(0, 8)}…</span>. Turns, melds, and
              scoring are enforced on the server.
            </p>
            <p className="mt-2 text-[11px] text-zinc-500">
              <Link href="/online-v2/rooms" className="text-sky-300 underline">
                Lobby
              </Link>
              {" · "}
              <button type="button" className="text-sky-300 underline" onClick={() => void reloadContext()}>
                Refresh room
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
        ) : (
          <p className="text-[11px] text-zinc-500">
            <strong className="text-zinc-300">Live play</strong> uses <span className="font-mono">/ov2-rummy51?room=…</span>{" "}
            from the lobby. Open a Rummy 51 room there first.
          </p>
        )
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
          {showStakeHint ? (
            <div className="flex shrink-0 flex-col gap-1.5 border-b border-amber-500/25 bg-amber-950/20 px-2 py-2">
              <p className="text-[10px] leading-snug text-amber-100/95 sm:text-[11px]">
                <strong className="font-semibold">Next match:</strong> commit stake in the room lobby. When the room is
                active, the host can open Rummy 51 here.
              </p>
              <Link
                href="/online-v2/rooms"
                className="inline-flex w-fit items-center rounded-md border border-amber-400/50 bg-amber-900/35 px-2.5 py-1 text-[10px] font-semibold text-amber-50 hover:bg-amber-900/50 sm:text-xs"
              >
                Open lobby
              </Link>
            </div>
          ) : null}
          {canShellHostOpen ? (
            <div className="flex shrink-0 flex-col gap-1 border-b border-white/[0.08] pb-1 pt-1">
              <button
                type="button"
                disabled={openBusy || Boolean(shellOpenDisabledReason)}
                title={shellOpenDisabledReason || undefined}
                onClick={() => void onShellOpen()}
                className="rounded-md border border-violet-500/40 bg-violet-950/40 py-1.5 text-[10px] font-bold text-violet-100 disabled:opacity-40 sm:text-xs"
              >
                {openBusy ? "Opening…" : "Open Rummy 51 match (host)"}
              </button>
              {shellOpenDisabledReason ? <p className="text-[10px] text-zinc-500">{shellOpenDisabledReason}</p> : null}
              {openErr ? <p className="text-[10px] text-red-300">{openErr}</p> : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden px-0.5 pb-0.5 pt-0">
            <Ov2Rummy51Screen contextInput={contextInput} />
          </div>
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
