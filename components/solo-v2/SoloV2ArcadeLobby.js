import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Layout from "../Layout";
import { isSoloV2Enabled } from "../../lib/solo-v2/featureFlags";
import { SOLO_V2_LOBBY_GAMES } from "../../lib/solo-v2/lobbyConfig";
import SoloV2LobbyGrid from "./SoloV2LobbyGrid";
import SoloV2LobbyPager from "./SoloV2LobbyPager";
import SoloV2ReservedAdSlot from "./SoloV2ReservedAdSlot";
import SoloV2StatusPanel from "./SoloV2StatusPanel";

const PAGE_SIZE = 4;

export default function SoloV2ArcadeLobby() {
  const [pageIndex, setPageIndex] = useState(0);
  const v2Enabled = isSoloV2Enabled();

  const pageCount = Math.max(1, Math.ceil(SOLO_V2_LOBBY_GAMES.length / PAGE_SIZE));

  const pageGames = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return SOLO_V2_LOBBY_GAMES.slice(start, start + PAGE_SIZE);
  }, [pageIndex]);

  useEffect(() => {
    const safePageIndex = Math.min(pageIndex, pageCount - 1);
    if (safePageIndex !== pageIndex) {
      setPageIndex(safePageIndex);
    }
  }, [pageCount, pageIndex]);

  return (
    <Layout title="Arcade Solo V2">
      <main
        className="h-[100dvh] max-h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full max-w-2xl min-h-0 flex-col gap-2 px-2">
          <header className="flex shrink-0 items-center justify-between gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2">
            <Link
              href="/mining"
              className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
            >
              Back
            </Link>
            <div className="min-w-0 flex-1 text-center">
              <h1 className="truncate text-sm font-extrabold sm:text-base">Arcade Solo V2</h1>
              <p className="truncate text-[11px] text-zinc-300">Mobile-first lobby foundation</p>
            </div>
            <div className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-zinc-200">
              {SOLO_V2_LOBBY_GAMES.length} games
            </div>
          </header>

          {!v2Enabled ? (
            <SoloV2StatusPanel
              status="unavailable"
              details="Solo V2 feature flag is disabled. This lobby remains isolated and does not fall back to legacy flow."
            />
          ) : (
            <SoloV2StatusPanel
              status="pending_migration"
              details="Lobby is available. Backend migrations and full game flows may still be pending."
            />
          )}

          <section className="min-h-0 flex-1 overflow-hidden rounded-xl border border-white/10 bg-black/20 p-2">
            {v2Enabled ? (
              <SoloV2LobbyGrid games={pageGames} />
            ) : (
              <div className="flex h-full items-center justify-center text-center text-sm text-zinc-300">
                Solo V2 is currently disabled.
              </div>
            )}
          </section>

          {v2Enabled ? <SoloV2LobbyPager pageCount={pageCount} pageIndex={pageIndex} onChange={setPageIndex} /> : null}

          <SoloV2ReservedAdSlot label="Reserved Ad Slot" />
        </div>
      </main>
    </Layout>
  );
}
