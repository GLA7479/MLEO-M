/**
 * Mystery Box board — same shell rhythm as QuickFlipBoard (Quick Flip mirror source).
 * `accentSlot` + `boxesSlot`: mobile stack, lg+ side-by-side composition.
 */
export default function MysteryBoxBoard({
  sessionNotice,
  statusTop,
  statusSub,
  stepTotal = 2,
  currentStepIndex = 0,
  stepsComplete = 0,
  stepLabels = ["Choose", "Open"],
  payoutBandLabel = "Payout if win",
  payoutBandValue = "—",
  payoutCaption = "",
  accentSlot,
  boxesSlot,
}) {
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const showSession = Boolean(sessionNotice);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-8">
        <p
          className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-amber-200/85 sm:text-[10px] ${
            showSession ? "opacity-100" : "opacity-0"
          }`}
        >
          {showSession ? sessionNotice : "\u00a0"}
        </p>
      </div>

      <div className="shrink-0 px-2.5 pb-0 pt-0.5 text-center sm:px-3 sm:pb-0.5 sm:pt-0.5 lg:px-8">
        <div className="flex min-h-[1.875rem] items-start justify-center sm:min-h-[2rem]">
          <p className="line-clamp-2 w-full text-center text-[11px] font-bold leading-snug text-white sm:text-[13px] sm:leading-snug">
            {statusTop}
          </p>
        </div>
        <div className="flex min-h-[1.625rem] items-start justify-center sm:min-h-[1.75rem]">
          <p className="line-clamp-2 w-full text-center text-[9px] leading-snug text-zinc-400 sm:text-[10px]">
            {statusSub}
          </p>
        </div>
      </div>

      <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-8">
        <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-amber-200/40 sm:text-[9px]">
            Round
          </span>
          <span className="text-[8px] font-semibold tabular-nums text-zinc-500 sm:text-[9px]">
            {Math.min(cleared + 1, total)} / {total}
          </span>
        </div>
        <div
          className="flex items-stretch justify-center gap-px rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-px shadow-inner sm:gap-0.5 sm:rounded-xl sm:p-0.5"
          aria-label="Round progress"
        >
          {Array.from({ length: total }, (_, i) => {
            const done = i < cleared;
            const active = i === cur && !done;
            const label = stepLabels[i] ?? String(i + 1);
            return (
              <div
                key={`mb-step-${i}`}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[5px] py-1 sm:rounded-md sm:py-1.5 ${
                  done
                    ? "bg-emerald-600/35 text-emerald-100"
                    : active
                      ? "bg-amber-500/25 text-amber-100 ring-1 ring-inset ring-amber-400/35"
                      : "bg-zinc-900/90 text-zinc-500"
                }`}
              >
                <span className="px-0.5 text-center text-[9px] font-extrabold uppercase tracking-wide sm:text-[10px]">
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1 lg:px-8 lg:hidden">
        <div className="rounded-lg border border-amber-900/50 bg-zinc-800/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5">
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

      {/* Playfield column widths match QuickFlipBoard exactly (coin + choice lane). */}
      <div className="flex min-h-0 flex-1 flex-col justify-center gap-3 px-2 pb-0.5 pt-0 lg:flex-row lg:items-center lg:justify-center lg:gap-14 lg:px-10 lg:py-7 lg:pb-6">
        <div className="flex shrink-0 items-center justify-center">{accentSlot}</div>
        <div className="mx-auto w-full max-w-[17.75rem] shrink-0 lg:mx-0 lg:max-w-none lg:w-[min(30rem,44%)] lg:min-w-[18rem]">
          {boxesSlot}
        </div>
      </div>

      <div className="flex shrink-0 justify-center px-2 py-1.5 sm:px-4 sm:pb-1.5 sm:pt-1 lg:px-8">
        <div className="h-10 w-full max-w-sm sm:mx-auto sm:h-[2.4rem] lg:max-w-2xl" aria-hidden />
      </div>
    </div>
  );
}
