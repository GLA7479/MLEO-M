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
        className={`inline-flex items-center justify-center rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold leading-none text-white transition hover:bg-white/[0.14] ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        <span className="select-none text-[13px] leading-none" aria-hidden>
          🎁
        </span>
      </button>
      <span
        className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full border border-white/25 bg-zinc-900 px-0.5 text-[9px] font-extrabold tabular-nums leading-none text-amber-100 sm:h-[17px] sm:min-w-[17px] sm:text-[10px]"
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
