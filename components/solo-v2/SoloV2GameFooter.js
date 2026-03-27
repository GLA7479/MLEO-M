/**
 * Shared Solo V2 bottom shell: wager controls + primary CTA + inline error.
 * Game supplies presets/steps and handlers; layout stays fixed for all games.
 */
export default function SoloV2GameFooter({
  betPresets = [],
  wagerInput = "",
  wagerNumeric = 0,
  canEditPlay = true,
  onPresetAmount,
  onDecreaseAmount,
  onIncreaseAmount,
  onAmountInput,
  onResetAmount,
  decreaseStep = 1,
  increaseStep = 1000,
  formatPresetLabel,
  primaryActionLabel = "Play",
  primaryActionDisabled = false,
  primaryActionLoading = false,
  primaryLoadingLabel = "…",
  onPrimaryAction,
  errorMessage = "",
}) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-2.5 pb-1 sm:gap-3 sm:pb-2">
      <div className="flex h-9 w-full min-w-0 flex-nowrap items-stretch gap-1 sm:h-10 sm:gap-1.5">
        {betPresets.map(value => (
          <button
            key={value}
            type="button"
            disabled={!canEditPlay}
            onClick={() => onPresetAmount?.(value)}
            className={`min-h-0 min-w-0 flex-1 basis-0 rounded-md border px-1 py-1.5 text-[10px] font-bold leading-none sm:px-2 sm:text-xs ${
              wagerNumeric === value
                ? "border-amber-400/55 bg-amber-500/30 text-amber-50"
                : "border-white/20 bg-white/[0.07] text-zinc-100"
            } ${!canEditPlay ? "cursor-not-allowed opacity-60" : ""}`}
          >
            {formatPresetLabel ? formatPresetLabel(value) : value >= 1000 ? `${value / 1000}K` : String(value)}
          </button>
        ))}
        <button
          type="button"
          onClick={onDecreaseAmount}
          disabled={!canEditPlay}
          className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={wagerInput}
          onChange={e => onAmountInput?.(e.target.value)}
          disabled={!canEditPlay}
          className="h-full min-w-0 flex-[1.15] rounded-md border border-white/20 bg-black/40 px-1.5 text-center text-[11px] font-bold text-white disabled:opacity-50 sm:min-w-[4.5rem] sm:text-sm"
        />
        <button
          type="button"
          onClick={onResetAmount}
          disabled={!canEditPlay}
          className="h-full w-9 shrink-0 rounded-md border border-red-400/35 bg-red-500/15 text-[11px] font-bold text-red-100 disabled:opacity-50 sm:w-10"
          title="Reset"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={onIncreaseAmount}
          disabled={!canEditPlay}
          className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10"
        >
          +
        </button>
      </div>

      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={primaryActionDisabled || primaryActionLoading}
        className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-base font-extrabold tracking-wide ${
          primaryActionDisabled || primaryActionLoading
            ? "cursor-not-allowed border-white/20 bg-white/10 text-zinc-400 opacity-70"
            : "border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-green-600 text-white"
        }`}
      >
        {primaryActionLoading ? primaryLoadingLabel : primaryActionLabel}
      </button>

      {errorMessage ? (
        <p className="text-center text-[11px] leading-snug text-red-300/95">{errorMessage}</p>
      ) : null}
    </div>
  );
}
