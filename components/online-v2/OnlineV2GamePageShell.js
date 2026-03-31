"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Layout from "../Layout";
import { OnlineV2GameOverlay, OV2_HUD_CHROME_BTN } from "./OnlineV2GameHudOverlays";
import OnlineV2ReservedAdSlot from "./OnlineV2ReservedAdSlot";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";

/**
 * Shared OV2 game frame: compact HUD (Hub · title/vault · Info/Menu) + flex game body + reserved ad slot.
 * Info/Menu overlays are scoped to the game body so the shell chrome stays reachable.
 */
export default function OnlineV2GamePageShell({
  title,
  subtitle,
  children,
  infoPanel = null,
  menuPanel = null,
  showSubtitle = true,
}) {
  const [infoOpen, setInfoOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const infoTitleId = useId();
  const menuTitleId = useId();

  function openInfo() {
    setMenuOpen(false);
    setInfoOpen(true);
  }

  function openMenu() {
    setInfoOpen(false);
    setMenuOpen(true);
  }

  return (
    <Layout title={title}>
      <main
        className="online-v2-game-main h-[100dvh] max-h-[100dvh] overflow-hidden bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 text-white"
        style={{
          paddingTop: "max(8px, env(safe-area-inset-top))",
          paddingBottom: "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div className="mx-auto flex h-full w-full min-h-0 max-w-2xl flex-col gap-1 px-2 md:max-w-4xl md:gap-1 md:px-3 lg:max-w-5xl lg:gap-1.5 lg:px-5 xl:max-w-6xl xl:px-7 2xl:max-w-7xl">
          <header className="relative grid shrink-0 grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-x-1.5 gap-y-0.5 border-b border-white/[0.06] pb-1 pt-0.5 md:gap-x-2.5 md:pb-1.5">
            <div className="z-10 flex items-center gap-1 pt-0.5 sm:gap-1.5">
              <Link
                href="/online-v2"
                className="inline-flex touch-manipulation select-none items-center justify-center rounded-full border border-white/20 bg-white/10 px-2 py-1 text-[10px] font-semibold text-white sm:px-2.5 sm:text-[11px] lg:text-xs"
              >
                Hub
              </Link>
              <OnlineV2VaultStrip compact />
            </div>

            <div
              className="pointer-events-none absolute left-1/2 top-0.5 z-0 w-[min(64vw,20rem)] min-w-0 -translate-x-1/2 text-center"
            >
              <h1
                className="truncate text-lg font-black leading-tight tracking-tight text-white sm:text-xl lg:text-2xl"
              >
                {title}
              </h1>
              {showSubtitle && subtitle ? (
                <p className="truncate text-[10px] leading-tight text-zinc-400 sm:text-[11px] lg:text-xs">{subtitle}</p>
              ) : null}
            </div>

            <div className="z-10 flex items-start justify-end gap-1 pt-0.5 sm:gap-1.5">
              <button type="button" onClick={openInfo} className={OV2_HUD_CHROME_BTN} aria-label="Game info and rules">
                Info
              </button>
              <button type="button" onClick={openMenu} className={OV2_HUD_CHROME_BTN} aria-label="Game menu">
                Menu
              </button>
            </div>
          </header>

          <div className="relative min-h-0 flex-1 overflow-x-hidden overflow-y-hidden">
            {children}

            <OnlineV2GameOverlay
              open={infoOpen}
              title="Info"
              labelledBy={infoTitleId}
              onClose={() => setInfoOpen(false)}
            >
              <p className="mb-2 text-zinc-400">
                Help, rules, and match details for <span className="font-semibold text-zinc-200">{title}</span> will live
                here.
              </p>
              {infoPanel}
            </OnlineV2GameOverlay>

            <OnlineV2GameOverlay
              open={menuOpen}
              title="Menu"
              labelledBy={menuTitleId}
              onClose={() => setMenuOpen(false)}
            >
              <p className="mb-3 text-zinc-400">Navigation and session options (placeholder).</p>
              <nav className="flex flex-col gap-2" aria-label="Game menu links">
                <Link
                  href="/online-v2"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-white/10"
                >
                  Online V2 hub
                </Link>
                <Link
                  href="/online-v2/rooms"
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-white/10"
                >
                  Rooms & lobby
                </Link>
              </nav>
              {menuPanel}
            </OnlineV2GameOverlay>
          </div>

          <OnlineV2ReservedAdSlot />
        </div>
      </main>
    </Layout>
  );
}
