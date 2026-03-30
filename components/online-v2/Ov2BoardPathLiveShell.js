"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ONLINE_V2_GAME_IDS } from "../../lib/online-v2/onlineV2GameRegistry";
import { installOv2BoardPathDevSmoke } from "../../lib/online-v2/ov2BoardPathDevSmoke";
import { fetchOv2RoomById, fetchOv2RoomMembers } from "../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../lib/supabaseClients";
import OnlineV2GamePageShell from "./OnlineV2GamePageShell";
import Ov2BoardPathScreen from "./Ov2BoardPathScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

/**
 * Live Board Path: `?room=<uuid>` loads `ov2_rooms` + `ov2_room_members` and passes real context to the screen.
 * Without `room`, the screen uses offline mock scenarios (unchanged).
 */
export default function Ov2BoardPathLiveShell() {
  const router = useRouter();
  /** Survives hard refresh before `router.isReady` (Next may omit `query.room` on first paint). */
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
  const loadedOnceForRoomRef = useRef(null);

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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.BOARD_PATH) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Board Path table.");
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

  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  useEffect(() => {
    if (!roomId || !room) return;
    const phase = room.lifecycle_phase;
    const hasSid = room.active_session_id != null && String(room.active_session_id).trim() !== "";
    const guestWaitingSid = phase === "active" && !hasSid && !isHost;
    if (!guestWaitingSid) return;
    const t = window.setInterval(() => {
      void reloadContext();
    }, 2500);
    return () => window.clearInterval(t);
  }, [roomId, room, isHost, reloadContext]);

  useEffect(() => {
    if (typeof process === "undefined" || process.env.NODE_ENV !== "development") return;
    if (typeof window === "undefined" || !window.location.search.includes("dev=1")) return;
    installOv2BoardPathDevSmoke(supabaseMP);
  }, []);

  const contextInput = useMemo(() => {
    if (!roomId) return null;
    if (!room) return null;
    return {
      room,
      members,
      self: {
        participant_key: participantId,
        display_name: "",
      },
    };
  }, [roomId, room, members, participantId]);

  const subtitle = roomId ? (room?.title ? `${room.title}` : loading ? "Loading…" : "OV2") : "Path race · OV2";

  return (
    <OnlineV2GamePageShell
      title="Board Path"
      subtitle={subtitle}
      infoPanel={
        <>
          <p>
            Board Path is a shared-path multiplayer race. Full rules, stakes, and round flow will be documented here once
            the engine is connected.
          </p>
          <p className="mt-2 text-zinc-500">Board artwork is illustrative until live match state is wired.</p>
          {roomId ? (
            <p className="mt-2 text-[11px] text-zinc-500">
              Room{" "}
              <Link href="/online-v2/rooms" className="text-sky-300 underline">
                Lobby
              </Link>{" "}
              ·{" "}
              <button
                type="button"
                className="text-sky-300 underline"
                onClick={() => void reloadContext()}
              >
                Refresh table
              </button>
            </p>
          ) : null}
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
        <Ov2BoardPathScreen contextInput={contextInput} />
      )}
    </OnlineV2GamePageShell>
  );
}
