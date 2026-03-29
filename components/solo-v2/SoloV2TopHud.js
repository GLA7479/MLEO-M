import { Children } from "react";
import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";
import SoloV2GiftButton from "./SoloV2GiftButton";

/** Compact pill controls — readable tap area via padding, not chunky squares. */
const HUD_CHROME_BTN =
  "inline-flex h-8 shrink-0 touch-manipulation select-none items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] px-3 text-[11px] font-medium text-white/90 shadow-sm shadow-black/15 transition-colors hover:border-white/18 hover:bg-white/[0.1] active:bg-white/[0.14] sm:px-3.5 sm:text-xs lg:h-7 lg:min-h-[28px] lg:px-2.5 lg:text-[10px]";

/**
 * Shared Solo V2 top shell — layout is fixed; title/subtitle/stats/gift data come from props.
 * Left: Back + Gift · Center: title, subtitle, compact stats · Right: Info, Menu (+ optional slot).
 */
export default function SoloV2TopHud({
  title,
  subtitle = "",
  mobileHeaderBreathingRoom = false,
  onBack,
  onOpenInfo,
  onOpenMenu,
  rightSlot = null,
  /** Shared vault display (formatted inside shell). Omit to hide vault segment. */
  headerVaultBalance = null,
  /** Game-specific stats fragments (e.g. Play / Win), rendered after vault with separators. */
  topGameStatsSlot = null,
  /** Vault + two stats as one compact grouped row (expects slot fragment: stat, dot, stat). */
  stableTripleTopSummary = false,
  giftCount = 0,
  giftMax = 5,
  giftEnabled = false,
  giftLoading = false,
  onGiftClick,
  giftTitle = "Gifts",
  giftNextGiftAt = null,
  giftRegenMs = null,
}) {
  const showVault = headerVaultBalance !== null && headerVaultBalance !== undefined;
  const statsParts = topGameStatsSlot ? Children.toArray(topGameStatsSlot) : [];
  const useStableTriple =
    stableTripleTopSummary && showVault && topGameStatsSlot && statsParts.length >= 3;

  const summaryRowTypography = mobileHeaderBreathingRoom
    ? "mt-1 text-[13px] leading-snug sm:mt-0.5 sm:leading-tight lg:mt-0.5 lg:text-[12px] lg:leading-tight"
    : "mt-0.5 text-[13px] leading-tight lg:text-[12px]";
  const summaryRowTone =
    "w-full min-w-0 text-zinc-500 [-ms-overflow-style:none] [scrollbar-width:none] sm:text-[15px] lg:text-[13px] [&::-webkit-scrollbar]:hidden";

  return (
    <header
      className={`grid w-full shrink-0 grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 sm:gap-x-3 sm:py-2 lg:gap-x-2 lg:gap-y-0 lg:py-1 ${
        mobileHeaderBreathingRoom ? "py-2" : "py-1.5"
      }`}
    >
      <div className="relative z-10 flex shrink-0 items-center gap-1.5 pt-0.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className={HUD_CHROME_BTN}
            aria-label="Back to arcade"
          >
            Back
          </button>
        ) : null}
        <SoloV2GiftButton
          giftCount={giftCount}
          giftMax={giftMax}
          giftEnabled={giftEnabled}
          giftLoading={giftLoading}
          onGiftClick={onGiftClick}
          giftTitle={giftTitle}
          giftNextGiftAt={giftNextGiftAt}
          giftRegenMs={giftRegenMs}
        />
      </div>

      <div
        className={`relative z-0 min-w-0 justify-self-center px-1 text-center ${
          mobileHeaderBreathingRoom ? "mt-2.5 sm:mt-0 lg:mt-0" : ""
        }`}
      >
        <h1
          className={
            mobileHeaderBreathingRoom
              ? "truncate text-lg font-extrabold leading-snug tracking-tight text-white sm:text-lg sm:leading-normal lg:text-base lg:leading-tight"
              : "truncate text-base font-extrabold tracking-tight text-white sm:text-lg lg:text-base"
          }
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={
              mobileHeaderBreathingRoom
                ? "truncate text-[13px] leading-snug text-zinc-400 sm:text-sm sm:leading-normal lg:text-[11px] lg:leading-snug"
                : "truncate text-xs text-zinc-400 sm:text-sm lg:text-[11px]"
            }
          >
            {subtitle}
          </p>
        ) : null}
        {showVault || topGameStatsSlot ? (
          useStableTriple ? (
            <div
              className={`flex flex-nowrap items-center justify-center gap-x-1 overflow-x-auto overscroll-x-contain whitespace-nowrap sm:gap-x-1.5 lg:gap-x-1 ${summaryRowTone} ${summaryRowTypography}`}
            >
              <span className="inline-flex shrink-0 items-baseline gap-0.5 whitespace-nowrap text-zinc-500">
                <span>Vault</span>
                <span className="font-semibold tabular-nums text-emerald-300/95">
                  {formatCompactNumber(headerVaultBalance)}
                </span>
              </span>
              <span className="shrink-0 text-zinc-600" aria-hidden>
                ·
              </span>
              {statsParts[0]}
              {statsParts[1]}
              {statsParts[2]}
            </div>
          ) : (
            <div
              className={`flex flex-nowrap items-center justify-center gap-x-1.5 overflow-x-auto overscroll-x-contain whitespace-nowrap sm:gap-x-2 lg:gap-x-1 ${summaryRowTone} ${summaryRowTypography}`}
            >
              {showVault ? (
                <span className="shrink-0">
                  Vault{" "}
                  <span className="font-semibold tabular-nums text-emerald-300/95">
                    {formatCompactNumber(headerVaultBalance)}
                  </span>
                </span>
              ) : null}
              {showVault && topGameStatsSlot ? (
                <span className="shrink-0 text-zinc-600" aria-hidden>
                  ·
                </span>
              ) : null}
              {topGameStatsSlot}
            </div>
          )
        ) : null}
      </div>

      <div className="relative z-10 flex shrink-0 items-center justify-end gap-1 pt-0.5">
        <button
          type="button"
          onClick={onOpenInfo}
          className={HUD_CHROME_BTN}
          aria-label="Help and statistics"
        >
          Info
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          className={HUD_CHROME_BTN}
          aria-label="Open menu"
        >
          Menu
        </button>
        {rightSlot}
      </div>
    </header>
  );
}
