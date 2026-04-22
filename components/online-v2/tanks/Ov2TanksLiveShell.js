"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2RoomIdQueryParam,
  ONLINE_V2_GAME_IDS,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import { useOv2DebouncedReload } from "../../../hooks/useOv2DebouncedReload";
import { useOv2LiveShellFatalRoomRedirect } from "../../../hooks/useOv2LiveShellFatalRoomRedirect";
import {
  fetchOv2RoomLedgerForViewer,
  leaveOv2RoomWithForfeitRetry,
  Ov2RoomRpcError,
} from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../../lib/supabaseClients";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2TanksScreen from "./Ov2TanksScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

export default function Ov2TanksLiveShell() {
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

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  const reloadContext = useCallback(async () => {
    if (!roomId) return;
    const pk = String(participantId || "").trim();
    if (!pk) return;
    setLoadError("");
    setLoading(true);
    try {
      const { room: r, members: m } = await fetchOv2RoomLedgerForViewer(roomId, { viewer_participant_key: pk });
      if (!r) {
        setRoom(null);
        setMembers([]);
        setLoadError("Room not found.");
        return;
      }
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.TANKS) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Tanks table.");
        return;
      }
      setRoom(r);
      setMembers(m);
    } catch (e) {
      setLoadError(e?.message || String(e));
      const softLedger =
        e instanceof Ov2RoomRpcError && e.code === "room_not_found_or_invalid_credentials";
      if (!softLedger) {
        setRoom(null);
        setMembers([]);
      }
    } finally {
      setLoading(false);
    }
  }, [roomId, participantId]);

  const debouncedReloadContext = useOv2DebouncedReload(() => {
    void reloadContext();
  }, 400);

  useEffect(() => {
    void reloadContext();
  }, [reloadContext]);

  useEffect(() => {
    if (!router.isReady) return;
    if (roomId) return;
    void router.replace("/online-v2/rooms");
  }, [router.isReady, roomId, router]);

  useOv2LiveShellFatalRoomRedirect(router, roomId, loadError);

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_tanks_shell_room:${roomId}`)
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
      clearOv2SharedLastRoomSessionKey();
      await router.replace("/online-v2/rooms");
    } catch (e) {
      setLeaveErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setLeaveBusy(false);
    }
  }, [roomId, participantId, room, router]);

  const selfDisplayName = useMemo(() => {
    const mine = members.find(m => String(m?.participant_key || "") === String(participantId || ""));
    return String(mine?.display_name || "").trim();
  }, [members, participantId]);

  if (!roomId) {
    return (
      <OnlineV2GamePageShell title="Tanks" showSubtitle={false} infoPanel={null} chromePreset="ov2_board">
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
          {router.isReady ? "Opening rooms…" : "Loading…"}
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Tanks"
      showSubtitle={false}
      chromePreset="ov2_board"
      infoPanel={
        <div className="space-y-2 text-[11px] text-zinc-400">
          <p>V1 — side-view tanks, server sim, 30s turn timer, stakes settle via claim after the match.</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-white/[0.06] pt-2">
            <Link href="/online-v2/rooms" className="font-medium text-sky-300/90 underline">
              Lobby
            </Link>
            <span className="text-zinc-600">·</span>
            <button type="button" className="font-medium text-sky-300/90 underline" onClick={() => void reloadContext()}>
              Refresh
            </button>
            <span className="text-zinc-600">·</span>
            <button
              type="button"
              disabled={leaveBusy || !participantId}
              className="font-medium text-sky-300/90 underline disabled:opacity-45"
              onClick={() => void onLeaveTable()}
            >
              {leaveBusy ? "Leaving…" : "Leave table"}
            </button>
            {selfDisplayName ? <span className="w-full text-zinc-500">Playing as {selfDisplayName}</span> : null}
            {leaveErr ? <span className="w-full text-[10px] text-red-300/95">{leaveErr}</span> : null}
          </p>
        </div>
      }
    >
      {loadError && !room ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 px-2 text-center">
          <p className="text-sm text-red-200">{loadError}</p>
          <Link href="/online-v2/rooms" className="text-xs text-sky-300 underline">
            Back to rooms
          </Link>
        </div>
      ) : loading && !room ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
          <p className="text-sm text-zinc-400">Loading room…</p>
        </div>
      ) : (
        <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
          <Ov2TanksScreen
            roomId={roomId}
            participantId={participantId}
            room={room}
            onLeaveTable={() => void onLeaveTable()}
            leaveBusy={leaveBusy}
            leaveErr={leaveErr}
          />
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
