"use client";

import Link from "next/link";
import { useId, useState } from "react";
import Layout from "../Layout";
import { OnlineV2GameOverlay, OV2_HUD_CHROME_BTN } from "./OnlineV2GameHudOverlays";
import OnlineV2ReservedAdSlot from "./OnlineV2ReservedAdSlot";
import OnlineV2VaultStrip from "./OnlineV2VaultStrip";

/**
 * Shared OV2 game frame: compact HUD controls + centered title/subtitle + flex game body + reserved ad slot.
 * Info/Menu overlays are scoped to the game body so the shell chrome stays reachable.
 */
export default function OnlineV2GamePageShell({
  title,
  subtitle,
  children,
  infoPanel = null,
  menuPanel = null,
  showSubtitle = true,
  /** Bingo / iOS: use --app-100vh from _app visualViewport instead of raw 100dvh */
  useAppViewportHeight = false,
  /**
   * Optional immersive chrome for specific routes only (default unchanged for all other games).
   * `cc_live_table`: compact header, darker frame, more viewport for the table body.
   * `c21_flat`: solid page bg, no header rule, subtle reserved-ad strip (21 Challenge only).
   */
  chromePreset = "default",
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

  const subtitleText = typeof subtitle === "string" ? subtitle.trim() : "";
  const shouldRenderSubtitle = showSubtitle && Boolean(subtitleText);
  const isCcLiveTable = chromePreset === "cc_live_table";
  const isC21Flat = chromePreset === "c21_flat";

  const mainHeightClass = useAppViewportHeight
    ? "h-[var(--app-100vh,100svh)] max-h-[var(--app-100vh,100svh)] min-h-0 overscroll-y-contain"
    : "h-[100dvh] max-h-[100dvh] min-h-0";

  return (
    <Layout title={title}>
      <main
        className={`online-v2-game-main ${mainHeightClass} overflow-hidden text-white ${
          isCcLiveTable
            ? "bg-gradient-to-b from-[#030506] via-[#06090c] to-[#030506]"
            : isC21Flat
              ? "bg-[#030506]"
              : "bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950"
        }`}
        style={{
          paddingTop: isCcLiveTable ? "max(4px, env(safe-area-inset-top))" : "max(8px, env(safe-area-inset-top))",
          paddingBottom: isCcLiveTable ? "max(4px, env(safe-area-inset-bottom))" : "max(8px, env(safe-area-inset-bottom))",
        }}
      >
        <div
          className={
            isCcLiveTable
              ? "mx-auto flex h-full w-full min-h-0 max-w-2xl flex-col gap-1 overflow-hidden px-2 md:max-w-5xl md:gap-1 md:px-3 lg:max-w-6xl lg:gap-1.5 lg:px-5 xl:max-w-7xl xl:px-7 2xl:max-w-7xl"
              : "mx-auto flex h-full w-full min-h-0 max-w-2xl flex-col gap-2 px-2 md:max-w-4xl md:gap-2 md:px-3 lg:max-w-5xl lg:gap-2.5 lg:px-5 xl:max-w-6xl xl:px-7 2xl:max-w-7xl"
          }
        >
          <header
            className={`shrink-0 ${
              isCcLiveTable
                ? "border-b border-white/[0.04] pb-1 pt-0.5"
                : isC21Flat
                  ? "pb-0.5 pt-1 md:pb-0.5"
                  : "border-b border-white/[0.06] pb-0.5 pt-1 md:pb-0.5"
            }`}
          >
            {isCcLiveTable ? (
              <div className="flex items-center gap-2">
                <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
                  <Link href="/online-v2" className={OV2_HUD_CHROME_BTN}>
                    Hub
                  </Link>
                  <OnlineV2VaultStrip compact />
                </div>
                <div className="min-w-0 flex-1 px-1 text-center">
                  <h1 className="truncate text-[11px] font-semibold leading-tight tracking-wide text-zinc-500 sm:text-xs">
                    <span className="text-zinc-200">{title}</span>
                    {shouldRenderSubtitle ? (
                      <span className="font-normal text-zinc-500"> · {subtitleText}</span>
                    ) : null}
                  </h1>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1 sm:gap-1.5">
                  <button type="button" onClick={openInfo} className={OV2_HUD_CHROME_BTN} aria-label="Game info and rules">
                    Info
                  </button>
                  <button type="button" onClick={openMenu} className={OV2_HUD_CHROME_BTN} aria-label="Game menu">
                    Menu
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-1.5 sm:gap-2">
                  <div className="flex items-center gap-1.5">
                    <Link href="/online-v2" className={OV2_HUD_CHROME_BTN}>
                      Hub
                    </Link>
                    <OnlineV2VaultStrip compact />
                  </div>
                  <div className="flex items-center justify-end gap-1.5 sm:gap-1.5">
                    <button type="button" onClick={openInfo} className={OV2_HUD_CHROME_BTN} aria-label="Game info and rules">
                      Info
                    </button>
                    <button type="button" onClick={openMenu} className={OV2_HUD_CHROME_BTN} aria-label="Game menu">
                      Menu
                    </button>
                  </div>
                </div>
                <div className="-mt-3 flex justify-center">
                  <div className="mx-auto flex min-w-0 max-w-full flex-col items-center">
                    <h1 className="max-w-full truncate text-center text-2xl font-black leading-tight tracking-tight text-white sm:text-2xl lg:text-2xl">
                      {title}
                    </h1>
                    {shouldRenderSubtitle ? (
                      <p className="mt-0.5 max-w-full truncate text-center text-[10px] font-medium leading-tight text-zinc-400 sm:text-[11px]">
                        {subtitleText}
                      </p>
                    ) : null}
                  </div>
                </div>
              </>
            )}
          </header>

          <div
            className={`relative min-h-0 flex-1 overflow-x-hidden overflow-y-hidden ${useAppViewportHeight ? "overscroll-y-contain" : ""}`}
          >
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

          <OnlineV2ReservedAdSlot variant={isC21Flat ? "subtle" : "default"} />
        </div>
      </main>
    </Layout>
  );
}
