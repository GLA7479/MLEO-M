import { useState } from "react";
import { formatCompactNumber } from "../../lib/solo-v2/formatCompactNumber";

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
  /** Optional second full-width row (e.g. pit stop / cash out) below the primary CTA. Omit when label is null/empty. */
  secondaryActionLabel = null,
  secondaryActionDisabled = true,
  secondaryActionLoading = false,
  secondaryLoadingLabel = "…",
  onSecondaryAction,
  /** When true, secondary row is hidden from `lg` up (desktop uses an in-board control instead). */
  secondaryActionLgHidden = false,
  /** When true, omit the primary CTA row (e.g. in-play action lives in the gameplay panel). */
  hidePrimaryAction = false,
  /** When true with hidePrimaryAction, keeps the same vertical band as the primary button (no layout jump). */
  reservePrimarySlotWhenHidden = false,
  /** When true, always reserve error row height (opacity/transparent text when empty). */
  reserveErrorRow = false,
  errorMessage = "",
  /**
   * When true: amount field shows compact K/M/B while blurred; raw digits while focused.
   * Underlying `wagerNumeric` / `onAmountInput` stay unchanged (display-only toggle).
   */
  compactAmountDisplayWhenBlurred = false,
  formatAmountCompact = formatCompactNumber,
  /**
   * Desktop (lg+) only: one-line payout chip to the right of the wager row (`h-9`/`sm:h-10`, same as controls).
   * `caption` is ignored here (mobile board band still uses it below lg).
   */
  desktopPayout = null,
}) {
  const [amountFieldFocused, setAmountFieldFocused] = useState(false);
  const showCompactAmount = compactAmountDisplayWhenBlurred && !amountFieldFocused;

  const amountInputValue = showCompactAmount ? formatAmountCompact(wagerNumeric) : wagerInput;

  const payout = desktopPayout && typeof desktopPayout === "object" ? desktopPayout : null;
  const showDesktopPayout = Boolean(payout && (payout.label != null || payout.value != null));

  return (
    <div className="flex w-full shrink-0 flex-col gap-2.5 pb-1 sm:gap-3 sm:pb-2 lg:gap-2 lg:pb-1">
      <div
        className={`flex min-w-0 flex-col gap-2 lg:gap-1.5 ${showDesktopPayout ? "lg:flex-row lg:items-center lg:gap-2.5" : ""}`}
      >
        <div
          className={`flex h-9 w-full min-w-0 flex-nowrap items-stretch gap-1 sm:h-10 sm:gap-1.5 lg:h-9 lg:gap-1 ${
            showDesktopPayout ? "lg:min-w-0 lg:flex-1" : ""
          }`}
        >
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
          className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10 lg:w-9"
        >
          −
        </button>
        <input
          type="text"
          inputMode="numeric"
          value={amountInputValue}
          onChange={e => onAmountInput?.(e.target.value)}
          onFocus={() => setAmountFieldFocused(true)}
          onBlur={() => setAmountFieldFocused(false)}
          disabled={!canEditPlay}
          className="h-full min-w-0 flex-[1.15] rounded-md border border-white/20 bg-black/40 px-1.5 text-center text-[11px] font-bold text-white disabled:opacity-50 sm:min-w-[4.5rem] sm:text-sm"
        />
        <button
          type="button"
          onClick={onResetAmount}
          disabled={!canEditPlay}
          className="h-full w-9 shrink-0 rounded-md border border-red-400/35 bg-red-500/15 text-[11px] font-bold text-red-100 disabled:opacity-50 sm:w-10 lg:w-9"
          title="Reset"
        >
          ↺
        </button>
        <button
          type="button"
          onClick={onIncreaseAmount}
          disabled={!canEditPlay}
          className="h-full w-9 shrink-0 rounded-md border border-white/20 bg-white/10 text-sm font-bold leading-none text-white disabled:opacity-50 sm:w-10 lg:w-9"
        >
          +
        </button>
        </div>

        {showDesktopPayout ? (
          <aside
            className="hidden h-9 w-[10.25rem] max-w-[40vw] shrink-0 flex-row items-center justify-between gap-1.5 rounded-md border border-amber-900/50 bg-zinc-800/55 px-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:h-10 lg:flex lg:h-9"
            aria-label="Payout summary"
          >
            <span className="min-w-0 max-w-[46%] truncate text-left text-[7px] font-bold uppercase leading-none tracking-[0.12em] text-amber-200/45 sm:text-[8px]">
              {payout.label}
            </span>
            <span className="min-w-0 flex-1 truncate text-right text-sm font-black tabular-nums leading-none text-amber-100 sm:text-base">
              {payout.value}
            </span>
          </aside>
        ) : null}
      </div>

      {hidePrimaryAction ? (
        reservePrimarySlotWhenHidden ? (
          <div className="min-h-[48px] w-full shrink-0 lg:min-h-[44px]" aria-hidden />
        ) : null
      ) : (
        <button
          type="button"
          onClick={onPrimaryAction}
          disabled={primaryActionDisabled || primaryActionLoading}
          className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-base font-extrabold tracking-wide lg:min-h-[44px] lg:py-2 lg:text-sm ${
            primaryActionDisabled || primaryActionLoading
              ? "cursor-not-allowed border-white/20 bg-white/10 text-zinc-400 opacity-70"
              : "border-emerald-400/40 bg-gradient-to-r from-emerald-600 to-green-600 text-white"
          }`}
        >
          {primaryActionLoading ? primaryLoadingLabel : primaryActionLabel}
        </button>
      )}

      {secondaryActionLabel ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          disabled={secondaryActionDisabled || secondaryActionLoading}
          className={`min-h-[44px] w-full rounded-lg border px-4 py-2 text-xs font-extrabold uppercase tracking-wide sm:text-sm lg:min-h-[42px] lg:py-1.5 lg:text-xs ${
            secondaryActionLgHidden ? "lg:hidden" : ""
          } ${
            secondaryActionDisabled || secondaryActionLoading
              ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
              : "border-amber-400/45 bg-amber-950/40 text-amber-100 hover:bg-amber-900/45"
          }`}
        >
          {secondaryActionLoading ? secondaryLoadingLabel : secondaryActionLabel}
        </button>
      ) : null}

      {reserveErrorRow ? (
        <div className="flex min-h-[2.75rem] shrink-0 items-start justify-center px-0.5 sm:min-h-[3rem] lg:min-h-[2.5rem]">
          <p
            className={`line-clamp-2 text-center text-[11px] leading-snug transition-opacity duration-150 ${
              errorMessage ? "text-red-300/95 opacity-100" : "text-transparent opacity-0"
            }`}
          >
            {errorMessage || "\u00a0"}
          </p>
        </div>
      ) : errorMessage ? (
        <p className="text-center text-[11px] leading-snug text-red-300/95">{errorMessage}</p>
      ) : null}
    </div>
  );
}
