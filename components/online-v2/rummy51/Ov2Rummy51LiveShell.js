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
import { openOv2Rummy51Session } from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import { fetchOv2RoomById, fetchOv2RoomMembers, leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import {
  formatSeatedStakeBlockers,
  seatedPlayersNotStakeCommitted,
} from "../../../lib/online-v2/shared-rooms/ov2SharedRoomStakeFromLedger";
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
 * No room → redirect to shared rooms.
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
  const rawRoomId = router.isReady ? routerRoomId : bootRoomId;
  const roomId = rawRoomId && isOv2RoomIdQueryParam(rawRoomId) ? String(rawRoomId).trim() : null;

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
    if (!router.isReady) return;
    if (roomId) return;
    void router.replace("/online-v2/rooms");
  }, [router.isReady, roomId, router]);

  useOv2LiveShellFatalRoomRedirect(router, roomId, loadError);

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

  const isSharedOv2Room = Number(room?.shared_schema_version) === 1;
  const sharedInGame =
    isSharedOv2Room && String(room?.status || "").toUpperCase() === "IN_GAME";

  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  /** Session exists on `ov2_rooms.active_session_id` — set only after `openOv2Rummy51Session` succeeds. */
  const canShellHostOpen = useMemo(
    () =>
      Boolean(
        participantId &&
          isHost &&
          isRoomMember &&
          room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.RUMMY51 &&
          !room.active_session_id &&
          seatedCount >= 2 &&
          seatedCount <= 4 &&
          seatedAllCommitted &&
          (roomLifecycle === "active" || sharedInGame)
      ),
    [room, participantId, isHost, isRoomMember, roomLifecycle, seatedCount, seatedAllCommitted, sharedInGame]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (!room || room.product_game_id !== ONLINE_V2_GAME_IDS.RUMMY51) return "";
    if (room.active_session_id) return "Match already opened.";
    if (roomLifecycle !== "active" && !sharedInGame) {
      return "Room must be active (stakes committed) or shared room must be in game before opening.";
    }
    if (!isRoomMember) return "Join the room from the lobby first.";
    if (!isHost) return "Only the host can open the session.";
    if (seatedCount < 2) return "Need at least two seated players.";
    if (seatedCount > 4) return "At most four players.";
    if (!seatedAllCommitted) {
      const b = seatedPlayersNotStakeCommitted(members);
      const detail = b.length ? ` ${formatSeatedStakeBlockers(b)}` : "";
      return `Every seated player must commit stake.${detail}`;
    }
    return "";
  }, [room, roomLifecycle, sharedInGame, isRoomMember, isHost, seatedCount, seatedAllCommitted, members]);

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

  const onShellOpen = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpen || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      await reloadContext();
      const freshMembers = await fetchOv2RoomMembers(roomId);
      setMembers(freshMembers);
      const blockers = seatedPlayersNotStakeCommitted(freshMembers);
      if (blockers.length) {
        setOpenErr(`All seated players must commit stakes. ${formatSeatedStakeBlockers(blockers)}`);
        return;
      }
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

  const showNonHostWaitingForSession = Boolean(
    room &&
      room.product_game_id === ONLINE_V2_GAME_IDS.RUMMY51 &&
      !room.active_session_id &&
      isRoomMember &&
      !isHost
  );

  if (!roomId) {
    return (
      <OnlineV2GamePageShell title="Rummy 51" showSubtitle={false} infoPanel={null}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
          {router.isReady ? "Opening rooms…" : "Loading…"}
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Rummy 51"
      showSubtitle={false}
      infoPanel={
        <>
          <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
            <section>
              <p className="font-semibold text-zinc-100">Goal</p>
              <p className="mt-0.5">
                Win the <span className="text-zinc-200">match</span> by being the last player who is not{" "}
                <span className="text-zinc-200">eliminated</span>. Elimination happens when your running penalty total reaches{" "}
                <span className="text-zinc-200">251</span> or more.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">How to play</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                <li>
                  <span className="text-zinc-200">2–4</span> seated players. The host opens the match when the room is{" "}
                  <span className="text-zinc-200">active</span> and stakes are <span className="text-zinc-200">committed</span>.</li>
                <li>
                  On your turn: <span className="text-zinc-200">draw</span> from the stock or take the face-up{" "}
                  <span className="text-zinc-200">discard</span> (follow on-screen controls). If you take the discard, you must play
                  that card into melds on the same turn.</li>
                <li>
                  Lay <span className="text-zinc-200">melds</span> (runs or sets of at least three cards). The first time you lay
                  cards from your hand in a round, those new melds must total at least <span className="text-zinc-200">51 points</span>{" "}
                  (server-validated).</li>
                <li>
                  Add to existing table melds when allowed, then <span className="text-zinc-200">discard</span> one card to end your
                  turn.</li>
                <li>
                  When someone <span className="text-zinc-200">goes out</span> (empty hand), everyone else scores a{" "}
                  <span className="text-zinc-200">round penalty</span>: <span className="text-zinc-200">100</span> if you never opened
                  this round, otherwise the sum of card penalties left in your hand (jokers count extra). Penalties add to your running
                  total; at <span className="text-zinc-200">251+</span> you are eliminated. A new round deals until the match ends.</li>
              </ul>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">How to win</p>
              <p className="mt-0.5">
                The server ends the match when only <span className="text-zinc-200">one</span> non-eliminated player remains. That
                player is the match winner (even if rounds were won by different people along the way).
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Stake &amp; payout</p>
              <p className="mt-0.5">
                Each player commits the same <span className="text-zinc-200">stake per seat</span>. The table shows the{" "}
                <span className="text-zinc-200">full pool</span> as stake × seat count when the match finishes. Settlement credits the
                winner with <span className="text-zinc-200">net winnings</span> (pool minus one stake share); other players receive
                bookkeeping loss lines. The client applies vault credits automatically after <span className="text-zinc-200">finished</span>{" "}
                when you are on this screen.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Leave / forfeit</p>
              <p className="mt-0.5">
                Leaving during an active playing match may require a server <span className="text-zinc-200">forfeit</span>: you take a
                penalty like a lost round (including the <span className="text-zinc-200">100</span> flat penalty if you had not opened
                this hand), can be eliminated at <span className="text-zinc-200">251+</span>, and the table updates for everyone else.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Important</p>
              <p className="mt-0.5">
                All melds, draws, and scoring are enforced on the server—illegal plays are rejected with an error message.
              </p>
            </section>
          </div>
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
                <strong className="font-semibold">Stake phase:</strong> commit stake in the room lobby. When the room is
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
          {showNonHostWaitingForSession ? (
            <div className="shrink-0 border-b border-cyan-500/25 bg-cyan-950/20 px-2 py-2 text-[10px] leading-snug text-cyan-100 sm:text-[11px]">
              <strong className="font-semibold text-cyan-50">Waiting for host</strong> — there is no live session yet (
              <span className="font-mono text-cyan-200/90">active_session_id</span> is empty). This screen will load the table
              automatically after the host opens the match. If you landed here early, use{" "}
              <button type="button" className="text-sky-300 underline" onClick={() => void reloadContext()}>
                Refresh room
              </button>{" "}
              or return to the shared room until the host finishes opening.
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
