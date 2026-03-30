import SoloV2ProgressStrip from "./SoloV2ProgressStrip";

/**
 * Quick Flip board shell — structural mirror of MysteryChamberBoard (card, notice row, status,
 * step strip, payout band, centered playfield, bottom anchor band). Game-specific coin
 * and choice UI are passed as slots.
 *
 * Layout rule: base + `sm:` preserve phone / small-tablet stack; `lg:` is the desktop composition
 * (horizontal playfield, wider insets). Do not fold desktop into `sm:` — treat lg+ as its own target.
 */
export default function QuickFlipBoard({
  sessionNotice,
  statusTop,
  statusSub,
  stepTotal = 2,
  currentStepIndex = 0,
  stepsComplete = 0,
  payoutBandLabel = "Payout if win",
  payoutBandValue = "—",
  payoutCaption = "",
  coinSlot,
  choiceSlot,
  /**
   * Omits the mobile-only (`lg:hidden`) in-board payout band; shell header already shows Play / Max win.
   * The `flex-1` playfield below grows into the freed space. Unchanged at `lg+` (band was already hidden).
   */
  hideMobilePayoutBand = false,
  /** Omits the two-line status stack above the round strip; `flex-1` playfield grows. Quick Flip proof route. */
  hideBoardStatusStack = false,
  stepLabels = ["Side", "Flip"],
}) {
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const showSession = Boolean(sessionNotice);

  return (
    <div className="solo-v2-board-frame flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-5">
        <p
          className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-amber-200/85 sm:text-[10px] ${
            showSession ? "opacity-100" : "opacity-0"
          }`}
        >
          {showSession ? sessionNotice : "\u00a0"}
        </p>
      </div>

      {!hideBoardStatusStack ? (
        <div className="solo-v2-board-status-stack shrink-0 space-y-0 px-2.5 py-0 text-center sm:px-3 lg:px-5">
          <div className="flex min-h-[1.6875rem] items-start justify-center sm:min-h-[2.0625rem]">
            <p className="line-clamp-2 w-full text-center text-[11px] font-bold leading-tight text-white sm:text-[13px]">
              {statusTop}
            </p>
          </div>
          <div className="flex min-h-[1.375rem] items-start justify-center sm:min-h-[1.5625rem]">
            <p className="line-clamp-2 w-full text-center text-[9px] leading-tight text-zinc-400 sm:text-[10px]">
              {statusSub}
            </p>
          </div>
        </div>
      ) : null}

      <SoloV2ProgressStrip
        keyPrefix="qf"
        rowLabel="Round"
        ariaLabel="Round progress"
        stepTotal={total}
        stepsComplete={cleared}
        currentStepIndex={cur}
        stepLabels={stepLabels}
      />

      {!hideMobilePayoutBand ? (
        <div className="solo-v2-board-mobile-payout-band shrink-0 px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1 lg:px-5 lg:hidden">
          <div className="rounded-lg border border-amber-900/50 bg-zinc-800/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl">
            <div className="flex min-h-[2.125rem] items-center justify-between gap-2 px-2.5 py-0.5 sm:min-h-[2.25rem] sm:px-3 sm:py-1">
              <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200/45 sm:text-[9px]">
                {payoutBandLabel}
              </span>
              <span className="truncate text-right text-sm font-black tabular-nums text-amber-100 sm:text-base">
                {payoutBandValue}
              </span>
            </div>
            <p className="min-h-[1.05rem] border-t border-white/5 px-2.5 pb-0.5 pt-0.5 text-right text-[8px] font-medium leading-tight text-zinc-500 sm:min-h-[1.1rem] sm:px-3 sm:pb-1 sm:pt-0.5 sm:text-[9px]">
              <span className={`line-clamp-1 ${payoutCaption ? "" : "opacity-0"}`}>
                {payoutCaption || "\u00a0"}
              </span>
            </p>
          </div>
        </div>
      ) : null}

      {/* Mobile: vertical stack (base). Desktop (lg+): intentional wide composition — coin + choices in a row. */}
      <div className="solo-v2-board-playfield flex min-h-0 flex-1 flex-col justify-center gap-3 px-2 pb-0.5 pt-0 lg:flex-row lg:items-center lg:justify-center lg:gap-8 lg:px-4 lg:py-3 lg:pb-3">
        <div className="flex shrink-0 items-center justify-center">{coinSlot}</div>
        <div className="mx-auto w-full max-w-[17.75rem] shrink-0 lg:mx-0 lg:max-w-none lg:w-[min(30rem,44%)] lg:min-w-[18rem]">
          {choiceSlot}
        </div>
      </div>

      <div className="solo-v2-board-anchor flex shrink-0 justify-center px-2 py-1.5 sm:px-4 sm:pb-1.5 sm:pt-1 lg:px-5">
        <div className="h-10 w-full max-w-sm sm:mx-auto sm:h-[2.4rem] lg:h-8 lg:max-w-2xl" aria-hidden />
      </div>
    </div>
  );
}
