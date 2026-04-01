import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import Layout from "../Layout";
import { ONLINE_V2_REGISTRY } from "../../lib/online-v2/onlineV2GameRegistry";
import { getOv2ParticipantId } from "../../lib/online-v2/ov2ParticipantId";
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
  const enabled = isOv2HubEnabled();
  const [participantId, setParticipantId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState(null);

  useEffect(() => {
    setParticipantId(getOv2ParticipantId());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setDisplayName(window.localStorage.getItem(OV2_DISPLAY_NAME_KEY) || "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OV2_DISPLAY_NAME_KEY, displayName || "");
  }, [displayName]);

  const gameTitleById = useMemo(() => {
    const out = {};
    for (const g of ONLINE_V2_REGISTRY) out[g.id] = g.title;
    return out;
  }, []);

  return (
    <Layout title="Online V2 — Rooms">
      <main
        className="online-v2-rooms-main flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full min-h-0 w-full max-w-2xl flex-1 flex-col gap-2 px-2 md:max-w-4xl md:px-4 lg:max-w-5xl lg:gap-2 lg:px-6 xl:max-w-6xl xl:gap-2.5 xl:px-8 2xl:max-w-7xl">
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
              <p className="truncate text-[11px] text-zinc-300 lg:text-xs xl:text-sm">
                Choose game, join room, claim seat, start
              </p>
            </div>
            <OnlineV2VaultStrip />
          </header>

          {!enabled ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/30 px-3 py-2 text-[11px] text-amber-100">
              Online V2 is disabled.
            </div>
          ) : selectedRoomId ? (
            <Ov2SharedRoomScreen
              roomId={selectedRoomId}
              participantId={participantId}
              displayName={displayName}
              gameTitleById={gameTitleById}
              onExitRoom={() => setSelectedRoomId(null)}
            />
          ) : (
            <Ov2SharedLobbyScreen
              participantId={participantId}
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              onEnterRoom={setSelectedRoomId}
            />
          )}
        </div>
      </main>
    </Layout>
  );
}
