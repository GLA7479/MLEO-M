import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";
import SoloV2GiftButton from "./SoloV2GiftButton";

/**
 * Shared Solo V2 top shell — layout is fixed; title/subtitle/stats/gift data come from props.
 * Left: Back + Gift · Center: title, subtitle, compact stats · Right: Info, Menu (+ optional slot).
 */
export default function SoloV2TopHud({
  title,
  subtitle = "",
  onBack,
  onOpenInfo,
  onOpenMenu,
  rightSlot = null,
  /** Shared vault display (formatted inside shell). Omit to hide vault segment. */
  headerVaultBalance = null,
  /** Game-specific stats fragments (e.g. Play / Win), rendered after vault with separators. */
  topGameStatsSlot = null,
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

  return (
    <header className="grid w-full shrink-0 grid-cols-[auto_1fr_auto] items-start gap-x-2 gap-y-0.5 py-1.5 sm:gap-x-3 sm:py-2">
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

      <div className="min-w-0 justify-self-center px-1 text-center">
        <h1 className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-zinc-400 sm:text-sm">{subtitle}</p> : null}
        {showVault || topGameStatsSlot ? (
          <div className="mt-0.5 flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 sm:text-[13px]">
            {showVault ? (
              <span>
                Vault{" "}
                <span className="font-semibold text-emerald-300/95">
                  {formatCompactNumber(headerVaultBalance)}
                </span>
              </span>
            ) : null}
            {showVault && topGameStatsSlot ? (
              <span className="text-zinc-600" aria-hidden>
                ·
              </span>
            ) : null}
            {topGameStatsSlot}
          </div>
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
