/**
 * Shared Solo V2 gift control — fixed footprint so badge count changes do not shift layout.
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
    <div className="relative h-9 w-9 shrink-0 sm:h-10 sm:w-10">
      <button
        type="button"
        disabled={disabled}
        title={title}
        aria-label={giftTitle}
        onClick={() => {
          if (!disabled && typeof onGiftClick === "function") onGiftClick();
        }}
        className={`flex h-full w-full items-center justify-center rounded-lg border border-amber-400/35 bg-amber-500/20 text-lg leading-none text-amber-100 shadow-sm shadow-black/20 transition hover:bg-amber-500/30 ${
          disabled ? "cursor-not-allowed opacity-50" : ""
        }`}
      >
        <span className="select-none" aria-hidden>
          🎁
        </span>
      </button>
      <span
        className="pointer-events-none absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full border border-amber-200/40 bg-zinc-900 px-0.5 text-[10px] font-extrabold tabular-nums leading-none text-amber-100 sm:h-5 sm:min-w-[20px] sm:text-[11px]"
        aria-hidden
      >
        {giftLoading ? "…" : `${safeCount}`}
      </span>
      <span className="sr-only">
        {giftLoading ? "Gift loading" : `${safeCount} of ${safeMax} gifts`}
      </span>
    </div>
  );
}
