"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2RoomIdQueryParam,
  ONLINE_V2_GAME_IDS,
} from "../../../lib/online-v2/onlineV2GameRegistry";
import {
  fetchOv2BingoLiveRoundSnapshot,
  openOv2BingoSession,
} from "../../../lib/online-v2/bingo/ov2BingoSessionAdapter";
import { isOv2QuickMatchRoom } from "../../../lib/online-v2/shared-rooms/ov2QuickMatchUi";
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

  const [participantId, setParticipantId] = useState(() =>
    typeof window !== "undefined" ? getOv2ParticipantId() : ""
  );
  const [room, setRoom] = useState(null);
  const [members, setMembers] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [leaveBusy, setLeaveBusy] = useState(false);
  const [leaveErr, setLeaveErr] = useState("");
  const loadedOnceForRoomRef = useRef(null);
  const qmBingoAutoOpenDoneRef = useRef(false);
  const qmBingoAutoOpenFlightRef = useRef(false);
  const qmBingoAutoOpenFailuresRef = useRef(0);
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
      if (r.product_game_id !== ONLINE_V2_GAME_IDS.BINGO) {
        setRoom(null);
        setMembers([]);
        setLoadError("This room is not a Bingo table.");
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

  const debouncedReloadContext = useOv2DebouncedReload(() => {
    void reloadContext();
  }, 400);

  useEffect(() => {
    loadedOnceForRoomRef.current = null;
  }, [roomId]);

  useEffect(() => {
    qmBingoAutoOpenDoneRef.current = false;
    qmBingoAutoOpenFlightRef.current = false;
    qmBingoAutoOpenFailuresRef.current = 0;
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    void reloadContext();
  }, [roomId, reloadContext]);

  useEffect(() => {
    if (!roomId || !room || !participantId) return undefined;
    if (!isOv2QuickMatchRoom(room)) return undefined;
    if (String(room.product_game_id || "").trim() !== ONLINE_V2_GAME_IDS.BINGO) return undefined;
    if (String(room.status || "").toUpperCase() !== "IN_GAME") return undefined;
    if (String(room.lifecycle_phase || "").trim() !== "active") return undefined;
    const hostPk = String(room.host_participant_key || "").trim();
    const myPk = String(participantId || "").trim();
    if (!hostPk || !myPk || hostPk !== myPk) return undefined;
    if (qmBingoAutoOpenDoneRef.current || qmBingoAutoOpenFlightRef.current) return undefined;
    if (qmBingoAutoOpenFailuresRef.current >= 8) return undefined;

    let cancelled = false;
    void (async () => {
      qmBingoAutoOpenFlightRef.current = true;
      try {
        const snap = await fetchOv2BingoLiveRoundSnapshot(roomId, { viewerParticipantKey: myPk });
        if (cancelled) return;
        if (snap?.sessionId) {
          qmBingoAutoOpenDoneRef.current = true;
          return;
        }
        const open = await openOv2BingoSession(roomId, myPk);
        if (cancelled) return;
        if (open?.ok) {
          qmBingoAutoOpenDoneRef.current = true;
          qmBingoAutoOpenFailuresRef.current = 0;
          await reloadContext();
        } else {
          qmBingoAutoOpenFailuresRef.current += 1;
        }
      } finally {
        if (!cancelled) qmBingoAutoOpenFlightRef.current = false;
      }
    })();
    return () => {
      cancelled = true;
      qmBingoAutoOpenFlightRef.current = false;
    };
  }, [roomId, room, participantId, reloadContext]);

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
      <div
        className={`${OV2_BINGO_NONSELECT_ROOT} max-h-[var(--app-100vh,100svh)] overflow-hidden overscroll-y-contain`}
      >
        <OnlineV2GamePageShell title="Bingo" showSubtitle={false} infoPanel={null} useAppViewportHeight>
          <div className="flex min-h-0 flex-1 items-center justify-center px-2 text-center text-sm text-zinc-400">
            {router.isReady ? "Opening rooms…" : "Loading…"}
          </div>
        </OnlineV2GamePageShell>
      </div>
    );
  }

  return (
    <div
      className={`${OV2_BINGO_NONSELECT_ROOT} max-h-[var(--app-100vh,100svh)] overflow-hidden overscroll-y-contain`}
    >
      <OnlineV2GamePageShell
        title="Bingo"
        showSubtitle={false}
        useAppViewportHeight
        infoPanel={
          <>
            <div className="space-y-2 text-[11px] leading-snug text-zinc-300">
              <section>
                <p className="font-semibold text-zinc-100">Goal</p>
                <p className="mt-0.5">
                  Mark called numbers on your card and be first to earn a <span className="text-zinc-200">valid server-approved claim</span>{" "}
                  for a <span className="text-zinc-200">row</span> or the <span className="text-zinc-200">full card</span>. Each of those
                  prizes can only be won once per session.
                </p>
              </section>
              <section>
                <p className="font-semibold text-zinc-100">How to play</p>
                <ul className="mt-0.5 list-disc space-y-0.5 pl-4">
                  <li>
                    The room must be <span className="text-zinc-200">active</span>, seated players must{" "}
                    <span className="text-zinc-200">commit stake</span>, and the <span className="text-zinc-200">host</span> opens the
                    Bingo session (at least two seated players).</li>
                  <li>
                    <span className="text-zinc-200">Called numbers are global</span> for the room—the same sequence applies to every
                    card. New calls appear on a server timer (about every ten seconds when the session advances).</li>
                  <li>
                    You must <span className="text-zinc-200">manually tap</span> only numbers that have actually been called to mark
                    your card. Marks are <span className="text-zinc-200">one-way</span> (no undo). The UI does{" "}
                    <span className="text-zinc-200">not</span> auto-mark for you and does <span className="text-zinc-200">not</span> hint
                    that a row or card is “ready”—you need to watch the call list yourself.</li>
                  <li>
                    When your marks truly complete a horizontal row or the entire card using <span className="text-zinc-200">only called</span>{" "}
                    numbers, you must <span className="text-zinc-200">manually declare</span> that prize (Row 1–5 or Full). There is{" "}
                    <span className="text-zinc-200">no auto-claim</span>.</li>
                </ul>
              </section>
              <section>
                <p className="font-semibold text-zinc-100">How to win a prize</p>
                <p className="mt-0.5">
                  The server checks your seat&apos;s card against the official called list.{" "}
                  <span className="text-zinc-200">First valid claim wins</span> that prize key; later claims for the same key are rejected.
                  Claimed prizes cannot be won again in the same session.
                </p>
              </section>
              <section>
                <p className="font-semibold text-zinc-100">Prize amounts (locked)</p>
                <p className="mt-0.5">
                  When the session opens, the server locks the session <span className="text-zinc-200">pot</span> to the sum of committed
                  stakes from seated players. Prizes are fixed shares of that <span className="text-zinc-200">original pot</span> (not
                  “whatever is left”): <span className="text-zinc-200">Row 1 = 15%</span>, <span className="text-zinc-200">Row 2 = 15%</span>,{" "}
                  <span className="text-zinc-200">Row 3 = 15%</span>, <span className="text-zinc-200">Row 4 = 15%</span>,{" "}
                  <span className="text-zinc-200">Row 5 = 15%</span>, <span className="text-zinc-200">Full card = 25%</span> (totals 100%).
                </p>
              </section>
              <section>
                <p className="font-semibold text-zinc-100">Leave</p>
                <p className="mt-0.5">
                  Use <span className="text-zinc-200">Leave game</span> (or Lobby) to exit the room. Mid-session stake and membership
                  changes follow the server rules for your room.
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
          <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-contain">
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden overscroll-y-contain">
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
