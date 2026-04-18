import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Layout from "../Layout";
import ArcadeShellGameCard from "../arcade-shell/ArcadeShellGameCard";
import ArcadeShellModal from "../arcade-shell/ArcadeShellModal";
import {
  ARCADE_SHELL_BG,
  ARCADE_SHELL_DESKTOP_GAMES_PER_GROUP,
  ARCADE_SHELL_MOBILE_GAMES_PER_GROUP,
  ARCADE_SHELL_MOBILE_GROUPS,
  ARCADE_SHELL_SWIPE_INTENT_RATIO,
  ARCADE_SHELL_SWIPE_THRESHOLD_PX,
} from "../arcade-shell/ArcadeShellConstants";
import { isSoloV2Enabled } from "../../lib/solo-v2/featureFlags";
import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";
import { formatMsAsMmSs } from "../../lib/solo-v2/formatMsAsMmSs";
import { SOLO_V2_LOBBY_GAMES } from "../../lib/solo-v2/lobbyConfig";
import {
  readQuickFlipSharedVaultBalance,
  subscribeQuickFlipSharedVault,
} from "../../lib/solo-v2/quickFlipLocalVault";
import { SOLO_V2_GIFT_MAX, SOLO_V2_GIFT_REGEN_MS, SOLO_V2_GIFT_ROUND_STAKE } from "../../lib/solo-v2/soloV2GiftStorage";
import { useSoloV2GiftShellState } from "../../lib/solo-v2/useSoloV2GiftShellState";
import SoloV2GameUserMenuContent from "./SoloV2GameUserMenuContent";
import SoloV2StatusPanel from "./SoloV2StatusPanel";

const MAX_GROUP_INDEX = ARCADE_SHELL_MOBILE_GROUPS.length - 1;

export default function SoloV2ArcadeLobby() {
  const v2Enabled = isSoloV2Enabled();
  const giftShell = useSoloV2GiftShellState();

  const [vaultBalance, setVaultBalance] = useState(0);
  const [vaultReadable, setVaultReadable] = useState(false);
  const [mobileGroupIndex, setMobileGroupIndex] = useState(0);
  const [desktopGroupIndex, setDesktopGroupIndex] = useState(0);
  const [showLobbyInfoModal, setShowLobbyInfoModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [giftTick, setGiftTick] = useState(0);

  const touchStartRef = useRef({ x: 0, y: 0, active: false, blocked: false });

  const refreshVault = useCallback(async () => {
    const result = await readQuickFlipSharedVaultBalance();
    if (result?.ok) {
      setVaultBalance(Number(result.balance) || 0);
      setVaultReadable(true);
    } else {
      setVaultReadable(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    refreshVault();
    const unsub = subscribeQuickFlipSharedVault(({ balance }) => {
      if (cancelled) return;
      setVaultBalance(Number(balance) || 0);
      setVaultReadable(true);
    });
    const onVisibility = () => {
      if (!document.hidden) {
        refreshVault();
        giftShell.refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [giftShell, refreshVault]);

  useEffect(() => {
    const id = window.setInterval(() => setGiftTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  const giftCountdownMs = useMemo(() => {
    void giftTick;
    const maxed = giftShell.giftCount >= giftShell.giftMax;
    const next = giftShell.giftNextGiftAt;
    if (maxed || next == null) return 0;
    return Math.max(0, Number(next) - Date.now());
  }, [giftShell.giftCount, giftShell.giftMax, giftShell.giftNextGiftAt, giftTick]);

  const cardGames = useMemo(
    () =>
      SOLO_V2_LOBBY_GAMES.map((g) => ({
        key: g.key,
        title: g.title,
        emoji: g.emoji,
        description: g.aboutHint ?? g.shortDescription,
        reward: g.rewardHint,
        href: g.route,
        color: g.accent,
        comingSoon: g.status !== "live",
        sessionCostText: g.sessionCostHint,
        howToPlayText: g.howToPlayHint,
      })),
    []
  );

  const mobileGroupGames = useMemo(() => {
    const start = mobileGroupIndex * ARCADE_SHELL_MOBILE_GAMES_PER_GROUP;
    return cardGames.slice(start, start + ARCADE_SHELL_MOBILE_GAMES_PER_GROUP);
  }, [cardGames, mobileGroupIndex]);

  const desktopGroupGames = useMemo(() => {
    const start = desktopGroupIndex * ARCADE_SHELL_DESKTOP_GAMES_PER_GROUP;
    return cardGames.slice(start, start + ARCADE_SHELL_DESKTOP_GAMES_PER_GROUP);
  }, [cardGames, desktopGroupIndex]);

  function setMobileGroupIndexClamped(nextIndexOrUpdater) {
    setMobileGroupIndex((prev) => {
      const nextIndex =
        typeof nextIndexOrUpdater === "function" ? nextIndexOrUpdater(prev) : nextIndexOrUpdater;
      return Math.max(0, Math.min(MAX_GROUP_INDEX, nextIndex));
    });
  }

  function handlePagerTouchStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    const interactiveStart = e.target?.closest?.("button, a, input, textarea, select, [role='button']");
    touchStartRef.current = {
      x: t.clientX,
      y: t.clientY,
      active: true,
      blocked: Boolean(interactiveStart),
    };
  }

  function handlePagerTouchEnd(e) {
    const start = touchStartRef.current;
    touchStartRef.current = { x: 0, y: 0, active: false, blocked: false };
    if (!start.active || start.blocked) return;
    const t = e.changedTouches?.[0];
    if (!t) return;

    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    if (adx < ARCADE_SHELL_SWIPE_THRESHOLD_PX) return;
    if (adx <= ady * ARCADE_SHELL_SWIPE_INTENT_RATIO) return;

    if (dx < 0) {
      setMobileGroupIndexClamped((prev) => prev + 1);
    } else {
      setMobileGroupIndexClamped((prev) => prev - 1);
    }
  }

  const vaultLabel = vaultReadable ? formatCompactNumber(vaultBalance) : "…";

  return (
    <Layout title="MLEO — Arcade Solo V2">
      <main
        className="relative text-white max-md:h-[100dvh] max-md:max-h-[100dvh] max-md:overflow-hidden md:flex md:h-[100dvh] md:max-h-[100dvh] md:min-h-0 md:flex-col md:overflow-hidden"
        style={{ background: ARCADE_SHELL_BG }}
      >
        {/* Mobile shell — classes aligned with `pages/arcade.js` */}
        <div className="flex h-[100dvh] max-h-[100dvh] min-h-0 flex-col gap-1 overflow-hidden px-2 pb-[max(0.2rem,env(safe-area-inset-bottom))] pt-2 md:hidden">
          <header className="flex-shrink-0 space-y-1.5 rounded-xl border border-white/20 bg-black/40 px-2.5 py-2 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <Link
                href="/mining"
                className="shrink-0 whitespace-nowrap rounded-full border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/20"
              >
                ← BACK
              </Link>
              <div className="min-w-0 flex-1 px-1 text-center">
                <h1 className="truncate text-[15px] font-extrabold leading-tight tracking-tight sm:text-base">
                  🎮 MLEO Arcade
                </h1>
                <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/75">
                  Vault • gifts • Solo V2 games
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLobbyInfoModal(true)}
                  className="rounded-lg border border-purple-400/45 bg-purple-500/30 px-2 py-1 text-[11px] font-bold text-purple-100"
                >
                  Info
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(true)}
                  className="rounded-lg border border-white/25 bg-white/10 p-1.5 hover:bg-white/20"
                  title="Settings"
                >
                  <div className="flex flex-col gap-0.5">
                    <div className="h-0.5 w-3.5 bg-white" />
                    <div className="h-0.5 w-3.5 bg-white" />
                    <div className="h-0.5 w-3.5 bg-white" />
                  </div>
                </button>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowVaultModal(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-white/25 bg-white/10 px-2.5 py-1 text-[11px] font-semibold"
              >
                <span>💰</span>
                <span className="tabular-nums text-emerald-400">{vaultLabel}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowGiftModal(true)}
                className="inline-flex max-w-[58%] items-center gap-1 rounded-lg border border-amber-500/40 bg-gradient-to-r from-amber-600/30 to-orange-600/30 px-2.5 py-1 text-[11px] font-semibold"
              >
                <span>🎁</span>
                <span className="truncate text-amber-200">
                  {giftShell.giftCount}/{giftShell.giftMax}
                </span>
                {giftShell.giftCount < giftShell.giftMax && giftCountdownMs > 0 ? (
                  <span className="shrink-0 text-[9px] text-amber-300/90">
                    {formatMsAsMmSs(giftCountdownMs)}
                  </span>
                ) : null}
              </button>
            </div>
          </header>

          <div className="mb-1 mt-1 flex flex-shrink-0 justify-center gap-1 px-0.5">
            {ARCADE_SHELL_MOBILE_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setMobileGroupIndex(g.id)}
                aria-label={`Games ${g.shortLabel}`}
                className={`max-w-[4.5rem] flex-1 rounded-lg border py-1 text-[11px] font-extrabold transition-all ${
                  mobileGroupIndex === g.id
                    ? "border-amber-400/70 bg-amber-500/40 text-amber-50 shadow-sm"
                    : "border-white/15 bg-white/5 text-white/85"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div
            className="flex min-h-0 w-full min-w-0 flex-1 flex-col"
            onTouchStart={handlePagerTouchStart}
            onTouchEnd={handlePagerTouchEnd}
          >
            <section
              className="grid h-[90%] min-h-0 w-full shrink-0 grid-cols-3 grid-rows-3 gap-x-0.5 gap-y-px"
              aria-label="Games"
            >
              {v2Enabled ? (
                mobileGroupGames.map((game, idx) => (
                  <ArcadeShellGameCard
                    key={`${mobileGroupIndex}-${game.key}-${idx}`}
                    title={game.title}
                    emoji={game.emoji}
                    description={game.description}
                    reward={game.reward}
                    href={game.href}
                    color={game.color}
                    comingSoon={game.comingSoon}
                    compact
                    sessionCostText={game.sessionCostText}
                    howToPlayText={game.howToPlayText}
                  />
                ))
              ) : (
                <div className="col-span-3 row-span-3 min-h-0 overflow-auto rounded-md border border-white/10 bg-black/30 p-2">
                  <SoloV2StatusPanel
                    status="unavailable"
                    details="Solo V2 feature flag is disabled. This lobby stays isolated from legacy arcade flows."
                  />
                </div>
              )}
              {v2Enabled
                ? Array.from({
                    length: Math.max(
                      0,
                      ARCADE_SHELL_MOBILE_GAMES_PER_GROUP - mobileGroupGames.length
                    ),
                  }).map((_, i) => (
                    <div
                      key={`pad-${i}`}
                      className="min-h-0 min-w-0 rounded-md border border-white/5 bg-white/[0.02]"
                      aria-hidden
                    />
                  ))
                : null}
            </section>
            <div
              className="mobile-arcade-grid-undergap min-h-2 max-h-8 flex-1 shrink-0 basis-0"
              aria-hidden
            />
          </div>

          <footer className="mobile-arcade-footer flex-shrink-0 flex-col gap-1 border-t border-white/20 pt-1">
            <div
              id="arcade-v2-mobile-ad-slot"
              data-ad-slot="arcade-v2-mobile-footer"
              className="mx-auto flex h-[50px] w-full shrink-0 items-center justify-center rounded-lg border border-dashed border-white/25 bg-black/25"
              aria-label="Advertisement"
            />
          </footer>
        </div>

        {/* Desktop shell */}
        <div className="mx-auto hidden min-h-0 w-full max-w-[72rem] flex-1 flex-col overflow-hidden px-3 pb-2 pt-1.5 md:flex">
          <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-white/10 pb-1.5">
            <div className="flex justify-start">
              <Link
                href="/mining"
                className="shrink-0 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-bold hover:bg-white/20"
              >
                ← BACK
              </Link>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowVaultModal(true)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all hover:border-white/30 hover:bg-white/[0.14]"
              >
                <span>💰</span>
                <span className="tabular-nums text-emerald-400">
                  {vaultReadable ? `${formatCompactNumber(vaultBalance)} MLEO` : "…"}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowGiftModal(true)}
                className="inline-flex max-w-[min(100%,14rem)] cursor-pointer items-center gap-1.5 rounded-full border border-amber-500/35 bg-gradient-to-r from-amber-600/25 to-orange-600/20 px-2.5 py-1 text-[11px] font-semibold shadow-sm transition-all hover:border-amber-400/50 hover:from-amber-600/35"
              >
                <span>🎁</span>
                <span className="truncate text-amber-200">
                  {giftShell.giftCount}/{giftShell.giftMax} Gifts
                </span>
                {giftShell.giftCount < giftShell.giftMax && giftCountdownMs > 0 ? (
                  <span className="shrink-0 text-[10px] text-amber-300/90">
                    {formatMsAsMmSs(giftCountdownMs)}
                  </span>
                ) : null}
              </button>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLobbyInfoModal(true)}
                className="rounded-lg border border-purple-400/45 bg-purple-500/25 px-2.5 py-1 text-xs font-bold text-purple-100 hover:bg-purple-500/35"
              >
                Info
              </button>
              <button
                type="button"
                onClick={() => setShowSettingsModal(true)}
                className="rounded-lg border border-white/20 bg-white/10 p-1.5 transition-all hover:bg-white/20"
                title="Settings"
              >
                <div className="flex flex-col gap-0.5">
                  <div className="h-0.5 w-3.5 bg-white" />
                  <div className="h-0.5 w-3.5 bg-white" />
                  <div className="h-0.5 w-3.5 bg-white" />
                </div>
              </button>
            </div>
          </div>

          <header className="shrink-0 pt-1.5 text-center">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-amber-300">
              <span className="inline-block h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-400" />
              Live • Solo V2
            </div>
            <h1 className="mb-0.5 text-2xl font-extrabold tracking-tight lg:text-3xl">🎮 MLEO Arcade</h1>
            <p className="mx-auto max-w-lg px-2 text-xs leading-snug text-white/85 lg:text-[13px]">
              Solo V2 mini-games use server-sealed sessions. Spend in-app vault MLEO or use timed gift rounds
              (each gift covers a fixed stake — see in-game). This hub lists every Solo V2 route in one place.
            </p>
          </header>

          <div className="flex shrink-0 justify-center gap-2 px-1 py-1">
            {ARCADE_SHELL_MOBILE_GROUPS.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setDesktopGroupIndex(g.id)}
                aria-label={`Desktop games page ${g.label}`}
                className={`max-w-[5rem] flex-1 rounded-lg border py-1.5 text-xs font-extrabold transition-all ${
                  desktopGroupIndex === g.id
                    ? "border-amber-400/70 bg-amber-500/40 text-amber-50 shadow-sm"
                    : "border-white/15 bg-white/5 text-white/85 hover:bg-white/10"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <section
              className="mx-auto grid h-full w-full max-w-5xl grid-cols-4 gap-2 [grid-template-rows:repeat(2,minmax(0,1fr))]"
              aria-label="Games"
            >
              {v2Enabled ? (
                desktopGroupGames.map((game, idx) => (
                  <div key={`d-${desktopGroupIndex}-${game.key}-${idx}`} className="min-h-0 min-w-0">
                    <ArcadeShellGameCard
                      title={game.title}
                      emoji={game.emoji}
                      description={game.description}
                      reward={game.reward}
                      href={game.href}
                      color={game.color}
                      comingSoon={game.comingSoon}
                      lobby
                      sessionCostText={game.sessionCostText}
                      howToPlayText={game.howToPlayText}
                    />
                  </div>
                ))
              ) : (
                <div className="col-span-4 row-span-2 flex min-h-0 items-center justify-center rounded-xl border border-white/10 bg-black/25 p-4">
                  <SoloV2StatusPanel
                    status="unavailable"
                    details="Solo V2 feature flag is disabled. This lobby stays isolated from legacy arcade flows."
                  />
                </div>
              )}
              {v2Enabled
                ? Array.from({
                    length: Math.max(
                      0,
                      ARCADE_SHELL_DESKTOP_GAMES_PER_GROUP - desktopGroupGames.length
                    ),
                  }).map((_, i) => (
                    <div
                      key={`d-pad-${desktopGroupIndex}-${i}`}
                      className="min-h-0 min-w-0 rounded-xl border border-white/5 bg-white/[0.02]"
                      aria-hidden
                    />
                  ))
                : null}
            </section>
          </div>

          <footer className="mt-1 flex shrink-0 flex-col items-stretch justify-center border-t border-white/10 pt-2">
            <div
              id="arcade-v2-desktop-ad-slot"
              data-ad-slot="arcade-v2-desktop-footer"
              className="mx-auto flex h-[90px] w-full max-w-[728px] shrink-0 items-center justify-center rounded-lg border border-dashed border-white/25 bg-black/25"
              aria-label="Advertisement"
            />
          </footer>
        </div>
      </main>

      {showLobbyInfoModal && (
        <ArcadeShellModal
          open={showLobbyInfoModal}
          onClose={() => setShowLobbyInfoModal(false)}
          title="ℹ️ Arcade Solo V2"
          sheetOnMobile
        >
          <div className="mx-auto max-w-4xl rounded-2xl border-2 border-yellow-500/30 bg-yellow-500/10 p-4 sm:p-6">
            <div className="flex items-start gap-3 sm:gap-4">
              <div className="shrink-0 text-2xl sm:text-3xl">⚠️</div>
              <div>
                <h3 className="mb-2 text-lg font-bold text-yellow-300 sm:text-xl">Important</h3>
                <ul className="space-y-2 text-xs text-white/90 sm:text-sm">
                  <li>
                    • <strong>Gifts:</strong> up to {SOLO_V2_GIFT_MAX} stored; one accrues every{" "}
                    {SOLO_V2_GIFT_REGEN_MS / 3600000}h when below the cap (client clock). Each gift covers{" "}
                    {SOLO_V2_GIFT_ROUND_STAKE} MLEO of stake for supported gift flows.
                  </li>
                  <li>
                    • <strong>Vault:</strong> balance shown here follows the same in-app vault stream used by Solo
                    V2 settlement helpers (read via Solo V2 vault bridge, not legacy arcade page code).
                  </li>
                  <li>
                    • <strong>Games:</strong> tap ℹ️ on a tile for that mode&apos;s short description; full rules and
                    stakes are inside each route.
                  </li>
                  {!v2Enabled ? (
                    <li>
                      • <strong>Status:</strong> Solo V2 is currently disabled by feature flag — tiles are hidden on
                      mobile; desktop shows a status panel instead of the grid.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </div>
          <div className="mx-auto mt-4 max-w-4xl rounded-2xl border border-white/10 bg-black/30 p-6 text-center sm:p-8">
            <h3 className="mb-3 text-xl font-bold">🏆 Play Responsibly</h3>
            <p className="mx-auto max-w-2xl text-sm leading-relaxed text-white/80">
              Solo V2 is built for fair, server-sealed outcomes. Treat vault MLEO and gifts as in-app progression
              tools — pace yourself and use each game&apos;s on-board help if you need a refresher.
            </p>
          </div>
        </ArcadeShellModal>
      )}

      {showVaultModal && (
        <ArcadeShellModal open={showVaultModal} onClose={() => setShowVaultModal(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
              <h2 className="mb-3 text-xl font-bold">Your MLEO Vault</h2>
              <div className="mb-2 text-sm opacity-70">Balance (Solo V2 bridge)</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl">💰</span>
                <span className="text-2xl font-bold text-emerald-400">
                  {vaultReadable ? `${formatCompactNumber(vaultBalance)} MLEO` : "Unavailable"}
                </span>
              </div>
            </div>
            <div>
              <h3 className="mb-3 text-lg font-bold">How this hub uses it</h3>
              <div className="space-y-3 text-sm text-zinc-300">
                <p>
                  Solo V2 games debit and credit through their own settlement paths. This lobby only{" "}
                  <strong>displays</strong> the current vault snapshot so you can jump into a mode with context.
                </p>
                <p>Balances update after sessions settle; if reads fail, the chip may show an ellipsis or Unavailable.</p>
              </div>
            </div>
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 p-4">
              <div className="text-sm text-blue-300">
                <strong>Tip:</strong> open any game to place a stake; return here any time to pick another Solo V2
                route.
              </div>
            </div>
          </div>
        </ArcadeShellModal>
      )}

      {showGiftModal && (
        <ArcadeShellModal open={showGiftModal} onClose={() => setShowGiftModal(false)}>
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-center">
              <h2 className="mb-3 text-xl font-bold">Gift rounds</h2>
              <div className="mb-2 text-sm opacity-70">Current gifts</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl">🎁</span>
                <span className="text-2xl font-bold text-amber-400">
                  {giftShell.giftCount}/{giftShell.giftMax}
                </span>
              </div>
              {giftShell.giftCount < giftShell.giftMax && giftCountdownMs > 0 ? (
                <div className="mt-2 text-xs text-amber-300">
                  Next gift in: {formatMsAsMmSs(giftCountdownMs)}
                </div>
              ) : null}
            </div>
            <div>
              <h3 className="mb-3 text-lg font-bold">How gifts work (Solo V2)</h3>
              <div className="space-y-3 text-sm text-zinc-300">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⏰</span>
                  <div>
                    <div className="font-semibold text-white">Accrual</div>
                    <div>
                      While below {SOLO_V2_GIFT_MAX} gifts, a timer grants another gift every{" "}
                      {SOLO_V2_GIFT_REGEN_MS / 3600000} hour(s) (stored locally until a server ledger replaces it).
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">📊</span>
                  <div>
                    <div className="font-semibold text-white">Cap</div>
                    <div>Gifts do not bank past {SOLO_V2_GIFT_MAX}; spend them in supported Solo V2 modes.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">🎯</span>
                  <div>
                    <div className="font-semibold text-white">Stake coverage</div>
                    <div>Each gift currently maps to {SOLO_V2_GIFT_ROUND_STAKE} MLEO of entry coverage where enabled.</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-4">
              <div className="text-sm text-green-300">
                <strong>Pro tip:</strong> use gifts to rehearse a new Solo V2 board before committing larger vault
                stakes.
              </div>
            </div>
          </div>
        </ArcadeShellModal>
      )}

      {showSettingsModal && (
        <ArcadeShellModal open={showSettingsModal} onClose={() => setShowSettingsModal(false)}>
          <SoloV2GameUserMenuContent vaultBalance={vaultBalance} onClose={() => setShowSettingsModal(false)} />
        </ArcadeShellModal>
      )}
    </Layout>
  );
}
