"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ONLINE_V2_GAME_IDS } from "../../../lib/online-v2/onlineV2GameRegistry";
import { fetchOv2RoomById, fetchOv2RoomMembers } from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2LudoScreen from "./Ov2LudoScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

/**
 * Route shell: loads OV2 room row when `?room=` is present (product_game_id must match).
 * **Live Ludo match session / RPC is not implemented** — with a room, the board stays read-only until an
 * `Ov2LudoAuthoritativeSnapshot` is supplied via fetch/subscribe (see `lib/online-v2/ludo/ov2LudoSessionAdapter.js`).
 * Without `?room=`, the screen is local preview only.
 */
export default function Ov2LudoLiveShell() {
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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.LUDO) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Ludo table.");
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

  const subtitle = roomId
    ? room?.title
      ? `${room.title} · match not live yet`
      : loading
        ? "Loading…"
        : "Ludo · room"
    : "Ludo · local preview only";

  return (
    <OnlineV2GamePageShell
      title="Ludo"
      subtitle={subtitle}
      infoPanel={
        <>
          <p>
            <strong className="text-amber-200">Not live-authoritative yet.</strong> Without a room, you get a local board
            preview only. With a room, the lobby row loads for navigation — Ludo match state, RPC turns, and vault flows
            still require backend work (see <code className="text-zinc-400">ov2LudoSessionAdapter.js</code>).
          </p>
          {roomId ? (
            <p className="mt-2 text-[11px] text-zinc-500">
              <Link href="/online-v2/rooms" className="text-sky-300 underline">
                Lobby
              </Link>
              {" · "}
              <button type="button" className="text-sky-300 underline" onClick={() => void reloadContext()}>
                Refresh
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
        <Ov2LudoScreen contextInput={contextInput} />
      )}
    </OnlineV2GamePageShell>
  );
}
