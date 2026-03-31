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
 * Presence leader opens the live session once 2–4 seats are claimed; snapshot fetch + Realtime
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
  const [presenceMembers, setPresenceMembers] = useState([]);
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

  useEffect(() => {
    if (typeof window === "undefined" || !roomId || !participantId) return undefined;
    const ch = supabaseMP
      .channel(`ov2_ludo_live_presence:${roomId}`)
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

  const seatedCount = useMemo(() => members.filter(m => m.seat_index != null).length, [members]);
  const presenceLeaderKey = useMemo(() => {
    const roster = (Array.isArray(presenceMembers) ? presenceMembers : [])
      .slice()
      .sort((a, b) => {
        const an = String(a.display_name || "").trim();
        const bn = String(b.display_name || "").trim();
        if (an && bn) {
          if (an !== bn) return an.localeCompare(bn);
          return String(a.participant_key || "").localeCompare(String(b.participant_key || ""));
        }
        if (an && !bn) return -1;
        if (!an && bn) return 1;
        return String(a.participant_key || "").localeCompare(String(b.participant_key || ""));
      });
    return roster[0]?.participant_key || null;
  }, [presenceMembers]);

  const canShellHostOpenLudo = useMemo(
    () =>
      Boolean(
        room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.LUDO &&
          !room.active_session_id &&
          participantId &&
          presenceLeaderKey === participantId &&
          isRoomMember
      ),
    [room, participantId, presenceLeaderKey, isRoomMember]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (seatedCount < 2) return "Need at least two seated players.";
    if (seatedCount > 4) return "At most four seated players.";
    if (presenceLeaderKey !== participantId) return "Only current leader can open.";
    return "";
  }, [seatedCount, presenceLeaderKey, participantId]);

  const onShellOpenLudo = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpenLudo || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const res = await requestOv2LudoOpenSession(roomId, participantId, {
        presenceLeaderKey: presenceLeaderKey || "",
      });
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
  }, [roomId, participantId, canShellHostOpenLudo, shellOpenDisabledReason, reloadContext, presenceLeaderKey]);

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
    };
  }, [roomId, room, members, participantId]);

  return (
    <OnlineV2GamePageShell
      title="Ludo"
      showSubtitle={false}
      infoPanel={
        <>
          <p>
            Without <code className="text-zinc-400">?room=</code> this page is a <strong className="text-amber-200">local preview</strong> only.
            With a Ludo room, the current <strong className="text-zinc-200">presence leader</strong> opens the live match once 2–4 seats are claimed;
            turns and dice are enforced by the server.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-zinc-400">
            <li>In-room with no active session: board is read-only and the presence leader opens the match.</li>
            <li>After session opens: board becomes live-authoritative with server-owned turn/dice/moves.</li>
            <li>Without a room query: board stays local preview.</li>
          </ul>
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
