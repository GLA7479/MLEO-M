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
import { requestOv2LudoOpenSession } from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import {
  fetchOv2RoomLedgerForViewer,
  leaveOv2RoomWithForfeitRetry,
  Ov2RoomRpcError,
} from "../../../lib/online-v2/ov2RoomsApi";
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
 * Route shell: requires `?room=` (Ludo product). No room → redirect to shared rooms.
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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.LUDO) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Ludo table.");
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
          if (r.product_game_id !== ONLINE_V2_GAME_IDS.LUDO) {
            setRoom(null);
            setMembers([]);
            setLoadError("This room is not a Ludo table.");
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
      .channel(`ov2_ludo_shell_room:${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ov2_rooms", filter: `id=eq.${roomId}` },
        () => {
          debouncedReloadContext();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "ov2_room_members", filter: `room_id=eq.${roomId}` },
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
  const seatedAllCommitted = useMemo(() => {
    const seated = members.filter(m => m?.seat_index != null);
    if (seated.length === 0) return true;
    return seated.every(m => String(m?.wallet_state || "").trim() === "committed");
  }, [members]);
  const roomLifecycle =
    room && typeof room === "object" && room.lifecycle_phase != null ? String(room.lifecycle_phase).trim() : "";
  const isHost = useMemo(
    () => Boolean(room && participantId && room.host_participant_key === participantId),
    [room, participantId]
  );

  /** Room returned to stake phase; host opens next match when lifecycle is `active` again. */
  const showStakePhaseAfterRematchHint = useMemo(
    () =>
      Boolean(
        room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.LUDO &&
          !room.active_session_id &&
          (roomLifecycle === "pending_stakes" || roomLifecycle === "pending_start")
      ),
    [room, roomLifecycle]
  );

  const canShellHostOpenLudo = useMemo(
    () =>
      Boolean(
        participantId &&
          isHost &&
          isRoomMember &&
          room &&
          room.product_game_id === ONLINE_V2_GAME_IDS.LUDO &&
          !room.active_session_id &&
          roomLifecycle === "active" &&
          seatedCount >= 2 &&
          seatedCount <= 4
      ),
    [room, participantId, isHost, isRoomMember, roomLifecycle, seatedCount]
  );

  const shellOpenDisabledReason = useMemo(() => {
    if (!room || room.product_game_id !== ONLINE_V2_GAME_IDS.LUDO) return "";
    if (room.active_session_id) return "Match already opened.";
    if (roomLifecycle !== "active") return "Room must be active (all members committed stakes) before opening a Ludo session.";
    if (!isRoomMember) return "Join the room first.";
    if (!isHost) return "Only room host can open session.";
    if (seatedCount < 2) return "Need at least two seated players.";
    if (seatedCount > 4) return "At most four seated players.";
    if (!seatedAllCommitted) return "All seated players must commit stakes before opening.";
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
      clearOv2SharedLastRoomSessionKey();
      await router.replace("/online-v2/rooms");
    } catch (e) {
      setLeaveErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setLeaveBusy(false);
    }
  }, [roomId, participantId, room, router]);

  const onShellOpenLudo = useCallback(async () => {
    if (!roomId || !participantId || !canShellHostOpenLudo || shellOpenDisabledReason) return;
    setOpenBusy(true);
    setOpenErr("");
    try {
      const res = await requestOv2LudoOpenSession(roomId, participantId, {
        presenceLeaderKey: participantId,
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
  }, [roomId, participantId, canShellHostOpenLudo, shellOpenDisabledReason, reloadContext]);

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
      <OnlineV2GamePageShell title="Ludo" showSubtitle={false} infoPanel={null}>
        <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
          {router.isReady ? "Opening rooms…" : "Loading…"}
        </div>
      </OnlineV2GamePageShell>
    );
  }

  return (
    <OnlineV2GamePageShell
      title="Ludo"
      showSubtitle={false}
      infoPanel={
        <>
          <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
            <section>
              <p className="font-semibold text-zinc-100">Goal</p>
              <p className="mt-0.5">
                Move all four of your pieces around the board into your home before anyone else. You can also win if you are
                the last active seat after eliminations, a double decline, or a forfeit leaves only you in the match.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">How to play</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                <li>The room must be <span className="text-zinc-200">active</span> and every seated player must{" "}
                  <span className="text-zinc-200">commit stake</span> in the lobby. The <span className="text-zinc-200">host</span>{" "}
                  opens the Ludo table here when 2–4 seats are filled.</li>
                <li>On your turn, <span className="text-zinc-200">roll</span> (server-authoritative), then{" "}
                  <span className="text-zinc-200">move</span> a legal piece. Extra turns apply when the rules allow (e.g. captures /
                  finishes), as enforced by the server.</li>
                <li>
                  <span className="text-zinc-200">Offer double</span> on your turn to raise the stake multiplier; the next seat must{" "}
                  <span className="text-zinc-200">accept</span> or <span className="text-zinc-200">decline</span>. Declining ends the
                  match with the <span className="text-zinc-200">proposer</span> as winner. Each seat can only start one double offer
                  per double cycle.</li>
                <li>
                  Watch the <span className="text-zinc-200">turn timer</span>. Missing your turn adds strikes;{" "}
                  <span className="text-zinc-200">three strikes</span> removes you from the live match.</li>
                <li>After a finished match, seated players can toggle <span className="text-zinc-200">rematch</span>; the host{" "}
                  <span className="text-zinc-200">starts the next match</span>, then everyone must <span className="text-zinc-200">commit stake again</span> in the room lobby before opening Ludo again.</li>
              </ul>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">How to win</p>
              <p className="mt-0.5">
                The match ends with a single <span className="text-zinc-200">winner seat</span> when someone finishes all pieces,
                or when the server declares a result after strikes, double decline, or forfeit (as applicable).
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Stake &amp; payout</p>
              <p className="mt-0.5">
                Everyone risks the room&apos;s <span className="text-zinc-200">stake per seat</span>. The finished match records a{" "}
                <span className="text-zinc-200">prize pool</span> and <span className="text-zinc-200">loss per seat</span>; the
                winner receives <span className="text-zinc-200">net credit</span> (pool minus the winner&apos;s seat loss share) via
                settlement lines. After the match shows <span className="text-zinc-200">finished</span>, the app delivers your vault
                credit by claiming those lines automatically when you&apos;re on this screen.
              </p>
            </section>
            <section>
              <p className="font-semibold text-zinc-100">Leave / forfeit</p>
              <p className="mt-0.5">
                <span className="text-zinc-200">Leave table</span> during a live match may require a server{" "}
                <span className="text-zinc-200">forfeit</span> (shared rooms in play). You are removed from the session; if only one
                player remains, they win. Use the lobby link after leaving if you need to commit stake for a rematch.
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
            <div className="flex shrink-0 flex-col gap-1.5 border-b border-amber-500/25 bg-amber-950/20 px-2 py-2">
              <p className="text-[10px] leading-snug text-amber-100/95 sm:text-[11px]">
                <strong className="font-semibold">Next round:</strong> everyone must{" "}
                <span className="text-amber-50">commit stake</span> again in the room lobby. When the room is active,
                the host can open the Ludo table here.
              </p>
              <Link
                href="/online-v2/rooms"
                className="inline-flex w-fit items-center rounded-md border border-amber-400/50 bg-amber-900/35 px-2.5 py-1 text-[10px] font-semibold text-amber-50 hover:bg-amber-900/50 sm:text-xs"
              >
                Open room lobby (commit stake)
              </Link>
            </div>
          ) : null}
          {canShellHostOpenLudo ? (
            <div className="flex shrink-0 flex-col gap-1 border-b border-white/[0.08] pb-1 pt-1">
              <button
                type="button"
                disabled={openBusy || Boolean(shellOpenDisabledReason)}
                title={shellOpenDisabledReason || undefined}
                onClick={() => void onShellOpenLudo()}
                className="rounded-md border border-emerald-500/40 bg-emerald-950/40 py-1.5 text-[10px] font-bold text-emerald-100 disabled:opacity-40 sm:text-xs"
              >
                {openBusy ? "Opening…" : "Open Ludo match (host)"}
              </button>
              {shellOpenDisabledReason ? (
                <p className="text-[10px] text-zinc-500">{shellOpenDisabledReason}</p>
              ) : null}
              {openErr ? <p className="text-[10px] text-red-300">{openErr}</p> : null}
            </div>
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">
            <Ov2LudoScreen
              key={room?.active_session_id ? String(room.active_session_id) : "ov2-ludo-no-session"}
              contextInput={contextInput}
              onSessionRefresh={reloadContextUntilSessionChanges}
            />
          </div>
        </div>
      )}
    </OnlineV2GamePageShell>
  );
}
