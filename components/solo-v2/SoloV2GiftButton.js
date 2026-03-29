/**
 * Shared Solo V2 gift control — matches shell button scale (Back / Info / Menu); badge floats, no layout shift.
 * Gameplay / payout wiring is supplied via props (see useSoloV2GiftShellState for local preview).
 */
export default function SoloV2GiftButton({
  giftCount = 0,
  giftMax = 5,
  giftEnabled = true,
  giftLoading = false,
  onGiftClick,
  giftTitle = "Gifts",
  giftNextGiftAt = null,
  giftRegenMs = null,
}) {
  const disabled = !giftEnabled || giftLoading;
  const safeCount = Math.max(0, Math.min(Number(giftMax) || 5, Math.floor(Number(giftCount) || 0)));
  const safeMax = Math.max(1, Math.floor(Number(giftMax) || 5));

  const extraHint = [];
  if (giftNextGiftAt != null && Number.isFinite(Number(giftNextGiftAt))) {
    extraHint.push(`Next gift at: ${new Date(Number(giftNextGiftAt)).toLocaleString()}`);
  }
  if (giftRegenMs != null && Number.isFinite(Number(giftRegenMs))) {
    extraHint.push(`Regen: ${Math.round(Number(giftRegenMs) / 60000)} min`);
  }
  const title =
    extraHint.length > 0 ? `${giftTitle} (${extraHint.join(" · ")})` : giftTitle;

  return (
    <span className="relative inline-flex shrink-0">
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={giftTitle}
        onClick={() => {
          if (!disabled && typeof onGiftClick === "function") onGiftClick();
        }}
        className={`inline-flex size-8 touch-manipulation select-none items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] text-sm leading-none text-white/90 shadow-sm shadow-black/15 transition-colors hover:border-white/18 hover:bg-white/[0.1] active:bg-white/[0.14] lg:size-7 lg:text-xs ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        <span className="select-none text-[13px] leading-none lg:text-xs" aria-hidden>
          🎁
        </span>
      </button>
      <span
        className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-white/25 bg-zinc-900 px-0.5 text-[9px] font-extrabold tabular-nums leading-none text-amber-100 sm:h-[17px] sm:min-w-[17px] sm:text-[10px] lg:h-3.5 lg:min-w-[14px] lg:text-[8px]"
        aria-hidden
      >
        {giftLoading ? "…" : `${safeCount}`}
      </span>
      <span className="sr-only">
        {giftLoading ? "Gift loading" : `${safeCount} of ${safeMax} gifts`}
      </span>
    </span>
  );
}
