/**
 * Shared Solo V2 progress / step strip — one visual system for the six finished arcade games.
 * Typography and spacing match the Gold Rush Digger reference (`text-[8px] sm:text-[9px]` in cells).
 */
export default function SoloV2ProgressStrip({
  rowLabel,
  ariaLabel = "Progress",
  stepTotal = 1,
  stepsComplete = 0,
  currentStepIndex = 0,
  /** `stepLabels[i]` per step, or shorter array falls back to `R${i+1}` / numeric */
  stepLabels = null,
  /** Prefix for React keys when multiple strips mount */
  keyPrefix = "sv2",
}) {
  const total = Math.max(1, Math.floor(Number(stepTotal) || 1));
  const stripCleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const labels = Array.isArray(stepLabels) ? stepLabels : null;

  return (
    <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-5">
      <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
        <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-amber-200/40 sm:text-[9px]">
          {rowLabel}
        </span>
        <span className="text-[8px] font-semibold tabular-nums text-zinc-500 sm:text-[9px]">
          {Math.min(stripCleared + 1, total)} / {total}
        </span>
      </div>
      <div
        className="flex items-stretch justify-center gap-px rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-px shadow-inner sm:gap-0.5 sm:rounded-xl sm:p-0.5"
        aria-label={ariaLabel}
      >
        {Array.from({ length: total }, (_, i) => {
          const done = i < stripCleared;
          const active = i === cur && !done;
          const label =
            labels && labels[i] != null && String(labels[i]).length > 0
              ? String(labels[i])
              : `R${i + 1}`;
          return (
            <div
              key={`${keyPrefix}-step-${i}`}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[5px] py-1 sm:rounded-md sm:py-1.5 ${
                done
                  ? "bg-emerald-600/35 text-emerald-100"
                  : active
                    ? "bg-amber-500/25 text-amber-100 ring-1 ring-inset ring-amber-400/35"
                    : "bg-zinc-900/90 text-zinc-500"
              }`}
            >
              <span className="px-0.5 text-center text-[8px] font-extrabold uppercase tracking-wide sm:text-[9px]">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
