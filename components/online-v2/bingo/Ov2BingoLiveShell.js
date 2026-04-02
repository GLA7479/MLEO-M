"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2RoomIdQueryParam,
  ONLINE_V2_GAME_IDS,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import { useOv2LiveShellFatalRoomRedirect } from "../../../hooks/useOv2LiveShellFatalRoomRedirect";
import { fetchOv2RoomById, fetchOv2RoomMembers, leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { getOv2ParticipantId } from "../../../lib/online-v2/ov2ParticipantId";
import { supabaseMP } from "../../../lib/supabaseClients";
import OnlineV2GamePageShell from "../OnlineV2GamePageShell";
import Ov2BingoScreen from "./Ov2BingoScreen";

function parseRoomQueryParam(q) {
  if (q == null) return null;
  const s = typeof q === "string" ? q : Array.isArray(q) ? q[0] : null;
  if (!s || !String(s).trim()) return null;
  return String(s).trim();
}

/** Bingo-only: suppress accidental text selection / iOS long-press callout; keep inputs editable. */
const OV2_BINGO_NONSELECT_ROOT =
  "select-none [-webkit-touch-callout:none] [-webkit-user-select:none] [&_input]:select-text [&_textarea]:select-text [&_[contenteditable]]:select-text";

/**
 * Route shell: requires `?room=` (Bingo product). No valid room → shared rooms.
 */
export default function Ov2BingoLiveShell() {
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

  const [participantId, setParticipantId] = useState("");
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.BINGO) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Bingo table.");
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
    if (!router.isReady) return;
    if (roomId) return;
    void router.replace("/online-v2/rooms");
  }, [router.isReady, roomId, router]);

  useOv2LiveShellFatalRoomRedirect(router, roomId, loadError);

  useEffect(() => {
    if (typeof window === "undefined" || !roomId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_bingo_shell_room:${roomId}`)
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

  const onLeaveTable = useCallback(async () => {
    if (!roomId || !participantId || leaveBusy) return;
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
  }, [roomId, participantId, room, router, leaveBusy]);

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
      reloadRoomContext: reloadContext,
      onLeaveToLobby: onLeaveTable,
      leaveToLobbyBusy: leaveBusy,
    };
  }, [roomId, room, members, participantId, selfDisplayName, reloadContext, onLeaveTable, leaveBusy]);

  if (!roomId) {
    return (
      <div className={OV2_BINGO_NONSELECT_ROOT}>
        <OnlineV2GamePageShell title="Bingo" showSubtitle={false} infoPanel={null}>
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
            {router.isReady ? "Opening rooms…" : "Loading…"}
          </div>
        </OnlineV2GamePageShell>
      </div>
    );
  }

  return (
    <div className={OV2_BINGO_NONSELECT_ROOT}>
      <OnlineV2GamePageShell
        title="Bingo"
        showSubtitle={false}
        infoPanel={
          <>
            <p>
              Live Bingo for this room. Calls and claims are validated on the server. The host opens the round when the room
              is active and seated players are ready.
            </p>
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
                {leaveBusy ? "Leaving…" : "Leave game"}
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
        ) : room && contextInput ? (
          <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden">
              <Ov2BingoScreen contextInput={contextInput} />
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
            Could not load this Bingo room.
            <Link href="/online-v2/rooms" className="mt-2 block text-xs text-sky-300 underline">
              Back to rooms
            </Link>
          </div>
        )}
      </OnlineV2GamePageShell>
    </div>
  );
}
