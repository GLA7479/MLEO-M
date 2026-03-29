import { Children } from "react";
import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";
import SoloV2GiftButton from "./SoloV2GiftButton";

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
  /** Vault + two stats as three fixed columns (expects slot fragment: stat, dot, stat). */
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
    ? "mt-1 text-[13px] leading-snug sm:mt-0.5 sm:leading-tight"
    : "mt-0.5 text-[13px] leading-tight";
  const summaryRowTone =
    "w-full min-w-0 text-zinc-500 [-ms-overflow-style:none] [scrollbar-width:none] sm:text-[15px] [&::-webkit-scrollbar]:hidden";

  return (
    <header
      className={`grid w-full shrink-0 grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 sm:gap-x-3 sm:py-2 ${
        mobileHeaderBreathingRoom ? "py-2" : "py-1.5"
      }`}
    >
      <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
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
        className={`min-w-0 justify-self-center px-1 text-center ${
          mobileHeaderBreathingRoom ? "mt-2.5 sm:mt-0" : ""
        }`}
      >
        <h1
          className={
            mobileHeaderBreathingRoom
              ? "truncate text-lg font-extrabold leading-snug tracking-tight text-white sm:text-lg sm:leading-normal"
              : "truncate text-base font-extrabold tracking-tight text-white sm:text-lg"
          }
        >
          {title}
        </h1>
        {subtitle ? (
          <p
            className={
              mobileHeaderBreathingRoom
                ? "truncate text-[13px] leading-snug text-zinc-400 sm:text-sm sm:leading-normal"
                : "truncate text-xs text-zinc-400 sm:text-sm"
            }
          >
            {subtitle}
          </p>
        ) : null}
        {showVault || topGameStatsSlot ? (
          useStableTriple ? (
            <div
              className={`grid grid-cols-3 gap-x-1 tabular-nums sm:gap-x-2 ${summaryRowTone} ${summaryRowTypography}`}
            >
              <div className="flex min-w-0 items-center justify-center whitespace-nowrap px-0.5 text-center">
                <span className="min-w-0">
                  Vault{" "}
                  <span className="inline-block min-w-[8ch] text-right font-semibold tabular-nums text-emerald-300/95">
                    {formatCompactNumber(headerVaultBalance)}
                  </span>
                </span>
              </div>
              <div className="flex min-w-0 items-center justify-center whitespace-nowrap px-0.5 text-center">
                {statsParts[0]}
              </div>
              <div className="flex min-w-0 items-center justify-center whitespace-nowrap px-0.5 text-center">
                {statsParts[2]}
              </div>
            </div>
          ) : (
            <div
              className={`flex flex-nowrap items-center justify-center gap-x-1.5 overflow-x-auto overscroll-x-contain whitespace-nowrap sm:gap-x-2 ${summaryRowTone} ${summaryRowTypography}`}
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

      <div className="flex shrink-0 items-center justify-end gap-1 pt-0.5">
        <button
          type="button"
          onClick={onOpenInfo}
          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
          aria-label="Help and statistics"
        >
          Info
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
        >
          Menu
        </button>
        {rightSlot}
      </div>
    </header>
  );
}
