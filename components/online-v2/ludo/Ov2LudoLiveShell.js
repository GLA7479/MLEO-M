"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ONLINE_V2_GAME_IDS } from "../../../lib/online-v2/onlineV2GameRegistry";
import { requestOv2LudoOpenSession } from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import { fetchOv2RoomById, fetchOv2RoomMembers } from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../../lib/supabaseClients";
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
 * Host opens the live session via `requestOv2LudoOpenSession` when the room is active; snapshot fetch + Realtime
 * drive `LIVE_MATCH_ACTIVE` in `useOv2LudoSession`. Without `?room=`, the screen is local preview only.
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
  const [openBusy, setOpenBusy] = useState(false);
  const [openErr, setOpenErr] = useState("");
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

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_ludo_shell_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ov2_rooms", filter: `id=eq.${roomId}` },
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

  const isHostUser = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  const committedCount = useMemo(() => members.filter(m => m.wallet_state === "committed").length, [members]);

  const canShellHostOpenLudo = useMemo(
    () =>
      Boolean(
        room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.LUDO &&
          room.lifecycle_phase === "active" &&
          !room.active_session_id &&
          isHostUser &&
          isRoomMember
      ),
    [room, isHostUser, isRoomMember]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (committedCount < 2) return "Need at least two committed players.";
    if (committedCount > 4) return "At most four committed players.";
    return "";
  }, [committedCount]);

  const onShellOpenLudo = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpenLudo || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const res = await requestOv2LudoOpenSession(roomId, participantId);
      if (!res.ok) {
        setOpenErr(res.error || "Could not open Ludo session.");
        return;
      }
      await reloadContext();
    } catch (e) {
      setOpenErr(e?.message || String(e));
    } finally {
      setOpenBusy(false);
    }
  }, [roomId, participantId, canShellHostOpenLudo, shellOpenDisabledReason, reloadContext]);

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

  const subtitle = useMemo(() => {
    if (!roomId) return "Ludo · local preview only";
    if (loading && !room) return "Loading…";
    if (!room) return "Ludo · room";
    const t = room.title ? String(room.title) : "";
    if (room.active_session_id) return t ? `${t} · live table` : "Live table";
    if (room.lifecycle_phase === "active") return t ? `${t} · open match from host` : "Waiting for host to open match";
    return t ? `${t} · ${room.lifecycle_phase}` : "Ludo · room";
  }, [roomId, loading, room]);

  return (
    <OnlineV2GamePageShell
      title="Ludo"
      subtitle={subtitle}
      infoPanel={
        <>
          <p>
            Without <code className="text-zinc-400">?room=</code> this page is a <strong className="text-amber-200">local preview</strong> only.
            With a Ludo room, the host opens the live match after the room is <strong className="text-zinc-200">active</strong> and 2–4 players have{" "}
            <strong className="text-zinc-200">committed</strong> stakes; turns and dice are enforced by the server.
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
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          {canShellHostOpenLudo ? (
            <div className="flex shrink-0 flex-col gap-1 border-b border-white/[0.08] pb-1">
              <button
                type="button"
                disabled={openBusy || Boolean(shellOpenDisabledReason)}
                title={shellOpenDisabledReason || undefined}
                onClick={() => void onShellOpenLudo()}
                className="rounded-md border border-emerald-500/40 bg-emerald-950/40 py-1.5 text-[10px] font-bold text-emerald-100 disabled:opacity-40 sm:text-xs"
              >
                {openBusy ? "Opening…" : "Open Ludo match (host)"}
              </button>
              {openErr ? <p className="text-[10px] text-red-300">{openErr}</p> : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Ov2LudoScreen contextInput={contextInput} />
          </div>
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
