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
import { isOv2UiPreviewsEnabled } from "../../lib/online-v2/dev/ov2UiPreviewMocks";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
import {
  OV2_SHARED_DISPLAY_NAME_KEY,
  readOv2SharedDisplayName,
  writeOv2SharedDisplayName,
} from "../../lib/online-v2/ov2SharedDisplayName";
import { getOv2RoomSnapshot } from "../../lib/online-v2/room-api/ov2SharedRoomsApi";
import OnlineV2ReservedAdSlot from "./OnlineV2ReservedAdSlot";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";
import Ov2SharedLobbyScreen from "./shared-rooms/Ov2SharedLobbyScreen";
import Ov2SharedRoomScreen from "./shared-rooms/Ov2SharedRoomScreen";

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
  const [displayName, setDisplayName] = useState(() =>
    typeof window === "undefined" ? "" : readOv2SharedDisplayName(),
  );
  const [selectedRoomId, setSelectedRoomId] = useState(null);
  const sessionResumeTriedRef = useRef(false);
  /** After `exitRoom`, Next may still expose old `?room=` briefly; avoid snapping back into the room. */
  const lastExitedRoomIdRef = useRef(null);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  useEffect(() => {
    writeOv2SharedDisplayName(displayName || "");
  }, [displayName]);

  useEffect(() => {
    const onStorage = e => {
      if (e.key !== OV2_SHARED_DISPLAY_NAME_KEY || e.storageArea !== window.localStorage) return;
      setDisplayName(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

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
    router.replace({ pathname: "/online-v2/rooms", query: {} }, undefined, { shallow: true });
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
        if (!snap?.room) {
          clearOv2SharedLastRoomSessionKey();
          return;
        }
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
        } else {
          clearOv2SharedLastRoomSessionKey();
        }
      })
      .catch(() => {
        clearOv2SharedLastRoomSessionKey();
      });
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
          paddingTop: "max(6px, env(safe-area-inset-top))",
          paddingBottom: "max(6px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-col gap-1 overflow-hidden px-2 md:max-w-4xl md:gap-1.5 md:px-4 lg:max-w-5xl lg:px-6 xl:max-w-6xl xl:gap-2 xl:px-8 2xl:max-w-7xl">
          <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2.5 py-2 shadow-[0_8px_28px_rgba(0,0,0,0.3)] backdrop-blur-sm md:rounded-2xl md:px-3 md:py-2 lg:gap-2 lg:px-4 lg:py-2.5 xl:px-5">
            <Link
              href="/online-v2"
              className="inline-flex shrink-0 touch-manipulation items-center justify-center rounded-lg border border-white/20 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white lg:px-3 lg:py-1.5 lg:text-sm"
            >
              Back
            </Link>
            <div className="min-w-0 flex-1 px-1 text-center leading-tight">
              <h1 className="truncate text-sm font-extrabold tracking-tight text-white sm:text-base lg:text-lg xl:text-xl">
                Shared rooms
              </h1>
              <p className="mt-0.5 truncate text-[11px] text-zinc-300 md:hidden">Play with others</p>
              <div className="mt-0.5 hidden min-w-0 items-center justify-center gap-2 md:flex">
                <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">Play with others</p>
                {isOv2UiPreviewsEnabled() ? <span className="h-3 w-px bg-white/15" aria-hidden /> : null}
                {isOv2UiPreviewsEnabled() ? (
                  <Link
                    href="/online-v2/game-ui-previews"
                    className="truncate text-[10px] font-semibold text-amber-400/95 underline decoration-amber-500/35 underline-offset-2 lg:text-[11px]"
                  >
                    UI previews
                  </Link>
                ) : null}
              </div>
              {isOv2UiPreviewsEnabled() ? (
                <div className="mt-0.5 md:hidden">
                  <Link
                    href="/online-v2/game-ui-previews"
                    className="text-[9px] font-semibold text-amber-400/90 underline decoration-amber-500/30 underline-offset-1"
                  >
                    UI previews
                  </Link>
                </div>
              ) : null}
            </div>
            <OnlineV2VaultStrip />
          </header>

          <section
            className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-black/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] md:bg-black/20"
            aria-label="Rooms content"
          >
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
          </section>

          <footer className="shrink-0 rounded-2xl border border-white/[0.06] bg-black/20 px-1 py-0.5 shadow-[0_-8px_32px_rgba(0,0,0,0.25)] md:border-white/10 md:bg-black/25">
            <OnlineV2ReservedAdSlot variant="subtle" minHeightClass="min-h-10 md:min-h-11" className="rounded-xl border-0 bg-transparent py-1" />
          </footer>
        </div>
      </main>
    </Layout>
  );
}
