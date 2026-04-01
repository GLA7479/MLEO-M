import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import {
  claimOv2Seat,
  hostStartOv2Room,
  leaveOv2Room,
  releaseOv2Seat,
} from "../../../lib/online-v2/room-api/ov2SharedRoomsApi";
import { requestOv2LudoOpenSession } from "../../../lib/online-v2/ludo/ov2LudoSessionAdapter";
import {
  fetchOv2Rummy51Snapshot,
  openOv2Rummy51Session,
} from "../../../lib/online-v2/rummy51/ov2Rummy51SessionAdapter";
import { useOv2SharedRoom } from "../../../hooks/useOv2SharedRoom";
import Ov2SharedSeatGrid from "./Ov2SharedSeatGrid";

export default function Ov2SharedRoomScreen({
  roomId,
  participantId,
  displayName,
  gameTitleById,
  onExitRoom,
}) {
  const router = useRouter();
  const { room, members, me, isHost, loading, error, isEjected, reload, lastLoadedAt } = useOv2SharedRoom({
    roomId,
    participantKey: participantId,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [runtimeHandoff, setRuntimeHandoff] = useState(null);
  const [autoExitPending, setAutoExitPending] = useState(false);
  const [launchingLive, setLaunchingLive] = useState(false);
  const didRouteToLiveRef = useRef(false);

  const joinedCount = useMemo(() => members.length, [members]);
  const isLudoRoom = room?.product_game_id === "ov2_ludo";
  const isRummy51Room = room?.product_game_id === "ov2_rummy51";
  const liveRuntimeId = room?.active_runtime_id || room?.active_session_id || null;
  const rummySessionId = room?.active_session_id || null;

  async function onClaimSeat(seatIndex) {
    setBusy(true);
    setMsg("");
    try {
      await claimOv2Seat({ room_id: roomId, participant_key: participantId, seat_index: seatIndex });
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onReleaseSeat() {
    setBusy(true);
    setMsg("");
    try {
      await releaseOv2Seat({ room_id: roomId, participant_key: participantId });
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onLeave() {
    setBusy(true);
    setMsg("");
    try {
      await leaveOv2Room({ room_id: roomId, participant_key: participantId });
      onExitRoom();
    } catch (e) {
      setMsg(e?.message || String(e));
      setBusy(false);
    }
  }

  async function onHostStart() {
    setBusy(true);
    setMsg("");
    try {
      const out = await hostStartOv2Room({
        room_id: roomId,
        host_participant_key: participantId,
      });
      setRuntimeHandoff(out.runtime_handoff || null);
      if (isLudoRoom) {
        const open = await requestOv2LudoOpenSession(roomId, participantId, {
          presenceLeaderKey: participantId,
        });
        if (!open?.ok) {
          setMsg(open?.error || "Could not open Ludo session.");
          return;
        }
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        await router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
        return;
      }
      if (isRummy51Room) {
        const open = await openOv2Rummy51Session(roomId, participantId);
        if (!open?.ok) {
          setMsg(open?.error || "Could not open Rummy 51 session.");
          return;
        }
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        await router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
        return;
      }
      await reload();
    } catch (e) {
      setMsg(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!isEjected) {
      setAutoExitPending(false);
      return;
    }
    setAutoExitPending(true);
    const t = setTimeout(() => {
      onExitRoom();
    }, 900);
    return () => clearTimeout(t);
  }, [isEjected, onExitRoom]);

  useEffect(() => {
    if (didRouteToLiveRef.current) return;
    if (room?.status !== "IN_GAME") return;
    if (!liveRuntimeId) return;
    if (isLudoRoom) {
      didRouteToLiveRef.current = true;
      setLaunchingLive(true);
      void router.push(`/ov2-ludo?room=${encodeURIComponent(roomId)}`);
      return;
    }
    if (isRummy51Room) {
      if (rummySessionId) {
        didRouteToLiveRef.current = true;
        setLaunchingLive(true);
        void router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
        return;
      }
      let cancelled = false;
      void fetchOv2Rummy51Snapshot(roomId).then(r => {
        if (cancelled || didRouteToLiveRef.current) return;
        const phase = r.ok && r.snapshot ? String(r.snapshot.phase || "") : "";
        if (phase === "playing" || phase === "finished") {
          didRouteToLiveRef.current = true;
          setLaunchingLive(true);
          void router.push(`/ov2-rummy51?room=${encodeURIComponent(roomId)}`);
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [isLudoRoom, isRummy51Room, room?.status, liveRuntimeId, rummySessionId, roomId, router, lastLoadedAt]);

  if (isEjected || autoExitPending) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4">
        <div className="text-sm font-bold text-red-100">Room is closed</div>
        <p className="mt-1 text-xs text-red-200">This room is no longer active. Returning to the lobby...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onExitRoom}
          className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Back
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void reload()}
          className="rounded border border-white/20 px-2 py-1 text-[11px] text-zinc-300"
        >
          Refresh
        </button>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/25 p-3">
        <div className="text-base font-bold text-white">{room?.title || "Room"}</div>
        <div className="text-xs text-zinc-400">
          {gameTitleById[room?.product_game_id] || room?.product_game_id} • {room?.visibility_mode} • {joinedCount} players
        </div>
        <div className="mt-1 text-[11px] text-zinc-500">
          {room?.min_players}-{room?.max_players} players • status {room?.status}
          {room?.requires_password ? " • password" : ""}
        </div>
        {room?.join_code ? <div className="mt-1 text-[11px] text-zinc-300">Code: {room.join_code}</div> : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/10 bg-black/20 p-2">
        <div className="mb-2 text-xs font-semibold text-zinc-400">Players</div>
        <ul className="space-y-1.5">
          {members.map(m => (
            <li key={m.id} className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-xs text-zinc-100">
              {m.display_name || "Player"}
              {m.id === room?.host_member_id ? " • host" : ""}
              {m.participant_key === participantId ? " • you" : ""}
              {m.seat_index != null ? ` • seat ${Number(m.seat_index) + 1}` : ""}
            </li>
          ))}
        </ul>
      </div>

      {room ? (
        <Ov2SharedSeatGrid
          room={room}
          members={members}
          participantId={participantId}
          busy={busy}
          onClaimSeat={onClaimSeat}
          onReleaseSeat={onReleaseSeat}
        />
      ) : null}

      {runtimeHandoff ? (
        !isLudoRoom ? (
        <div className="rounded-xl border border-sky-500/30 bg-sky-950/25 p-3 text-xs text-sky-100">
          <div className="font-bold">Runtime handoff ready</div>
          <div className="mt-1">Runtime ID: {runtimeHandoff.active_runtime_id}</div>
          <div>Policy: {runtimeHandoff.economy_entry_policy}</div>
          <div className="mt-1 text-sky-200/80">Runtime migration is pending in a later phase.</div>
        </div>
        ) : null
      ) : null}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void onLeave()}
          className="flex-1 rounded-lg border border-red-500/30 bg-red-950/30 py-2 text-xs font-semibold text-red-100 disabled:opacity-45"
        >
          Leave room
        </button>
        <button
          type="button"
          disabled={busy || !isHost || room?.status !== "OPEN"}
          onClick={() => void onHostStart()}
          className="flex-1 rounded-lg border border-emerald-500/40 bg-emerald-900/40 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
        >
          Start
        </button>
      </div>

      {loading ? <p className="text-[11px] text-zinc-500">Loading room...</p> : null}
      {launchingLive ? (
        <p className="text-[11px] text-sky-300">
          {isRummy51Room ? "Opening live Rummy 51 game..." : "Opening live Ludo game..."}
        </p>
      ) : null}
      {error ? <p className="text-[11px] text-red-300">{error}</p> : null}
      {msg ? <p className="text-[11px] text-amber-200">{msg}</p> : null}
      {displayName ? null : <p className="text-[11px] text-zinc-500">Set your display name to continue.</p>}
      {me ? null : <p className="text-[11px] text-zinc-500">You are not currently joined in this room.</p>}
    </div>
  );
}

