import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Layout from "../Layout";
import {
  clearOv2SharedLastRoomSessionKey,
  isOv2ActiveSharedProductId,
  isOv2RoomIdQueryParam,
  ONLINE_V2_SHARED_LOBBY_GAMES,
  OV2_SHARED_LAST_ROOM_SESSION_KEY,
} from "../../lib/online-v2/onlineV2GameRegistry";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
import { getOv2RoomSnapshot } from "../../lib/online-v2/room-api/ov2SharedRoomsApi";
import OnlineV2ReservedAdSlot from "./OnlineV2ReservedAdSlot";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";
import Ov2SharedLobbyScreen from "./shared-rooms/Ov2SharedLobbyScreen";
import Ov2SharedRoomScreen from "./shared-rooms/Ov2SharedRoomScreen";

const OV2_DISPLAY_NAME_KEY = "ov2_display_name_v1";

function isOv2HubEnabled() {
  if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_ONLINE_V2_ENABLED === "false") {
    return false;
  }
  return true;
}

export default function OnlineV2RoomsScreen() {
  const router = useRouter();
  const enabled = isOv2HubEnabled();
  const [participantId, setParticipantId] = useState(() =>
    typeof window !== "undefined" ? getOv2ParticipantId() : ""
  );
  const [displayName, setDisplayName] = useState(() => {
    if (typeof window === "undefined") return "";
    try {
      return window.localStorage.getItem(OV2_DISPLAY_NAME_KEY) || "";
    } catch {
      return "";
    }
  });
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const sessionResumeTriedRef = useRef(false);
  /** After `exitRoom`, Next may still expose old `?room=` briefly; avoid snapping back into the room. */
  const lastExitedRoomIdRef = useRef(null);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OV2_DISPLAY_NAME_KEY, displayName || "");
  }, [displayName]);

  const enterRoom = useCallback(
    roomId => {
      if (!roomId) return;
      lastExitedRoomIdRef.current = null;
      setSelectedRoomId(roomId);
      try {
        window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
      } catch {
        // ignore
      }
      router.replace({ pathname: "/online-v2/rooms", query: { room: roomId } }, undefined, { shallow: true });
    },
    [router]
  );

  const exitRoom = useCallback(() => {
    sessionResumeTriedRef.current = true;
    clearOv2SharedLastRoomSessionKey();
    setSelectedRoomId(prev => {
      if (prev) lastExitedRoomIdRef.current = prev;
      return null;
    });
    router.replace("/online-v2/rooms", undefined, { shallow: true });
  }, [router]);

  useEffect(() => {
    if (!router.isReady) return;

    const q = router.query.room;
    const fromQuery = Array.isArray(q) ? q[0] : q;

    if (!(typeof fromQuery === "string" && isOv2RoomIdQueryParam(fromQuery))) {
      lastExitedRoomIdRef.current = null;
    }

    if (typeof fromQuery === "string" && fromQuery.length > 0 && !isOv2RoomIdQueryParam(fromQuery)) {
      sessionResumeTriedRef.current = true;
      clearOv2SharedLastRoomSessionKey();
      setSelectedRoomId(null);
      void router.replace({ pathname: "/online-v2/rooms" }, undefined, { shallow: true });
      return;
    }

    if (typeof fromQuery === "string" && isOv2RoomIdQueryParam(fromQuery)) {
      const qid = fromQuery.trim();
      if (lastExitedRoomIdRef.current && lastExitedRoomIdRef.current === qid) {
        return;
      }
      lastExitedRoomIdRef.current = null;
      setSelectedRoomId(qid);
      try {
        window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, qid);
      } catch {
        // ignore
      }
      return;
    }

    if (selectedRoomId) return;
    if (!participantId) return;
    if (sessionResumeTriedRef.current) return;

    let last = null;
    try {
      last = window.sessionStorage.getItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
    } catch {
      sessionResumeTriedRef.current = true;
      return;
    }
    if (!last) {
      sessionResumeTriedRef.current = true;
      return;
    }
    if (!isOv2RoomIdQueryParam(last)) {
      clearOv2SharedLastRoomSessionKey();
      sessionResumeTriedRef.current = true;
      return;
    }

    sessionResumeTriedRef.current = true;
    void getOv2RoomSnapshot({ room_id: last, viewer_participant_key: participantId })
      .then(snap => {
        const productId = snap?.room?.product_game_id;
        if (!isOv2ActiveSharedProductId(productId)) {
          clearOv2SharedLastRoomSessionKey();
          return;
        }
        const me = snap.members?.find(m => m.participant_key === participantId);
        const st = me?.member_state;
        if (
          me &&
          (st === "joined" || st === "disconnected" || st === null || st === undefined)
        ) {
          lastExitedRoomIdRef.current = null;
          setSelectedRoomId(last);
          router.replace({ pathname: "/online-v2/rooms", query: { room: last } }, undefined, { shallow: true });
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `router` identity can churn and retrigger this effect; we only react to query/participant/selection.
  }, [router.isReady, router.query.room, participantId, selectedRoomId]);

  const gameTitleById = useMemo(() => {
    const out = {};
    for (const g of ONLINE_V2_SHARED_LOBBY_GAMES) out[g.id] = g.title;
    return out;
  }, []);

  return (
    <Layout title="Online V2 — Rooms">
      <main
        className="online-v2-rooms-main flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-2 overflow-hidden px-2 md:max-w-4xl md:px-4 lg:max-w-5xl lg:gap-2 lg:px-6 xl:max-w-6xl xl:gap-2.5 xl:px-8 2xl:max-w-7xl">
          <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2 md:px-3 lg:px-4 lg:py-2.5 xl:px-5">
            <Link
              href="/online-v2"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white lg:px-3 lg:py-1.5 lg:text-sm"
            >
              Back
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-sm font-extrabold sm:text-base lg:text-lg xl:text-xl">
                Shared rooms
              </h1>
              <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">Play with others</p>
            </div>
            <OnlineV2VaultStrip />
          </header>

          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {!enabled ? (
              <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
                Online V2 is disabled.
              </div>
            ) : selectedRoomId ? (
              <Ov2SharedRoomScreen
                roomId={selectedRoomId}
                participantId={participantId}
                displayName={displayName}
                gameTitleById={gameTitleById}
                onExitRoom={exitRoom}
              />
            ) : (
              <Ov2SharedLobbyScreen
                participantId={participantId}
                displayName={displayName}
                onDisplayNameChange={setDisplayName}
                onEnterRoom={enterRoom}
              />
            )}
          </div>

          <OnlineV2ReservedAdSlot variant="subtle" />
        </div>
      </main>
    </Layout>
  );
}
