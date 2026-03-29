import {
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MAX_NUM,
  NUMBER_HUNT_MIN_NUM,
} from "../../lib/solo-v2/numberHuntConfig";

const NUMBERS = Array.from({ length: NUMBER_HUNT_MAX_NUM - NUMBER_HUNT_MIN_NUM + 1 }, (_, i) => i + NUMBER_HUNT_MIN_NUM);

/**
 * Number Hunt — Quick Flip mirror shell (notice, status, guess strip, payout) + grid identity.
 * Mobile: vertical stack. `lg+`: sidebar (slots, range) | grid — separate desktop target.
 */
export default function NumberHuntBoard({
  playing = null,
  pickingUi = false,
  sessionNotice = "",
  statusTop = "—",
  statusSub = "",
  stepTotal = NUMBER_HUNT_MAX_GUESSES,
  currentStepIndex = 0,
  stepsComplete = 0,
  stepLabels = ["1st", "2nd", "3rd"],
  payoutBandLabel = "Max win",
  payoutBandValue = "—",
  payoutCaption = "",
  onPickNumber,
  pickDisabled = false,
  revealTarget = null,
  revealWin = false,
}) {
  const history = Array.isArray(playing?.guessHistory) ? playing.guessHistory : [];
  const low = Number.isFinite(Number(playing?.lowBound)) ? Number(playing.lowBound) : NUMBER_HUNT_MIN_NUM;
  const high = Number.isFinite(Number(playing?.highBound)) ? Number(playing.highBound) : NUMBER_HUNT_MAX_NUM;
  const guessed = new Set(history.map(h => Math.floor(Number(h?.guess))).filter(Number.isFinite));
  const showReveal = revealTarget != null && Number.isFinite(revealTarget);
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || NUMBER_HUNT_MAX_GUESSES));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-2 border-violet-700/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-4 shrink-0 items-center justify-center px-2 sm:h-[1.125rem] lg:px-8">
        <p
          className={`line-clamp-1 w-full text-center text-[9px] font-semibold leading-tight text-violet-200/85 sm:text-[10px] ${
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
          <p className="line-clamp-2 w-full text-center text-[9px] leading-snug text-zinc-400 sm:text-[10px]">{statusSub}</p>
        </div>
      </div>

      <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-8">
        <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-200/40 sm:text-[9px]">Guesses</span>
          <span className="text-[8px] font-semibold tabular-nums text-zinc-500 sm:text-[9px]">
            {Math.min(cleared + 1, total)} / {total}
          </span>
        </div>
        <div
          className="flex items-stretch justify-center gap-px rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-px shadow-inner sm:gap-0.5 sm:rounded-xl sm:p-0.5"
          aria-label="Guess progress"
        >
          {Array.from({ length: total }, (_, i) => {
            const done = i < cleared;
            const active = i === cur && !done;
            const label = stepLabels[i] ?? String(i + 1);
            return (
              <div
                key={`nh-step-${i}`}
                className={`flex min-w-0 flex-1 flex-col items-center justify-center rounded-[5px] py-1 sm:rounded-md sm:py-1.5 ${
                  done
                    ? "bg-emerald-600/35 text-emerald-100"
                    : active
                      ? "bg-violet-500/25 text-violet-100 ring-1 ring-inset ring-violet-400/35"
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

      <div className="shrink-0 px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1 lg:px-8">
        <div className="rounded-lg border border-violet-800/50 bg-zinc-800/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl">
          <div className="flex items-center justify-between gap-2 px-2.5 py-1 sm:px-3 sm:py-1.5">
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.14em] text-violet-200/45 sm:text-[9px]">
              {payoutBandLabel}
            </span>
            <span className="truncate text-right text-sm font-black tabular-nums text-violet-100 sm:text-base">
              {payoutBandValue}
            </span>
          </div>
          <p className="min-h-[1.05rem] border-t border-white/5 px-2.5 pb-0.5 pt-0.5 text-right text-[8px] font-medium leading-tight text-zinc-500 sm:min-h-[1.1rem] sm:px-3 sm:pb-1 sm:pt-0.5 sm:text-[9px]">
            {payoutCaption || "\u00a0"}
          </p>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1 sm:px-3 sm:pb-3 lg:flex-row lg:gap-6 lg:px-8 lg:pb-3 lg:pt-2">
        <div className="flex shrink-0 flex-col gap-2 lg:w-[min(100%,13.5rem)] lg:shrink-0 lg:gap-3 lg:pt-1">
          <div className="flex justify-center gap-2 sm:gap-3 lg:flex-col lg:items-stretch lg:gap-2">
            {Array.from({ length: NUMBER_HUNT_MAX_GUESSES }, (_, i) => {
              const filled = i < history.length;
              const g = filled ? history[i]?.guess : null;
              return (
                <div key={i} className="flex w-[4.25rem] flex-col items-center gap-0.5 sm:w-[4.75rem] lg:w-full">
                  <div
                    className={`flex h-10 w-full items-center justify-center rounded-lg border-2 text-base font-black tabular-nums sm:h-11 sm:text-lg ${
                      filled
                        ? "border-violet-500 bg-zinc-800 text-violet-100"
                        : "border-zinc-700 bg-zinc-950 text-zinc-600"
                    }`}
                  >
                    {filled ? g : ""}
                  </div>
                  <span className="text-[8px] font-semibold uppercase tracking-wide text-zinc-500">{i + 1}</span>
                </div>
              );
            })}
          </div>

          <div className="shrink-0 px-0 sm:px-0">
            <div className="flex items-center justify-center gap-2 text-sm sm:text-base lg:justify-start">
              <span className="font-semibold uppercase tracking-wide text-zinc-500">Range</span>
              <span className="font-black tabular-nums text-violet-200">
                {low}–{high}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-2 flex min-h-0 flex-1 flex-col sm:mt-3 lg:mt-0 lg:min-w-0 lg:justify-center">
          <div
            className={`grid min-h-0 w-full max-w-[20rem] flex-1 grid-cols-4 gap-1.5 self-center sm:max-w-[22rem] sm:gap-2 lg:max-h-[min(52vh,28rem)] lg:max-w-[24rem] lg:gap-2.5 [grid-template-rows:repeat(5,minmax(0,1fr))] ${
              pickingUi ? "pointer-events-none opacity-50" : ""
            }`}
          >
              {NUMBERS.map(n => {
                const usedWrong = guessed.has(n);
                const isTargetReveal = showReveal && n === revealTarget;
                const inRange = n >= low && n <= high;
                const canTap = !pickDisabled && !usedWrong && !isTargetReveal && inRange && !pickingUi && !showReveal;

                let tileClass =
                  "flex h-full min-h-[2.5rem] w-full items-center justify-center rounded-lg border-2 text-[15px] font-black tabular-nums sm:min-h-0 sm:text-[17px] lg:text-[18px] ";

                if (isTargetReveal && revealWin) {
                  tileClass +=
                    "border-emerald-500 bg-emerald-950/50 text-emerald-100 sm:border-emerald-400 sm:bg-emerald-950/40";
                } else if (isTargetReveal && !revealWin) {
                  tileClass += "border-amber-500 bg-amber-950/40 text-amber-100";
                } else if (usedWrong) {
                  tileClass += "border-zinc-600 bg-zinc-900 text-zinc-500 line-through decoration-zinc-500";
                } else if (!inRange && !showReveal) {
                  tileClass += "cursor-not-allowed border-zinc-800/80 bg-zinc-950 text-zinc-700 opacity-35";
                } else if (canTap) {
                  tileClass +=
                    "border-violet-600/70 bg-zinc-800 text-violet-50 hover:border-violet-400 hover:bg-zinc-700 active:scale-[0.98]";
                } else {
                  tileClass += "cursor-not-allowed border-zinc-800 bg-zinc-900/80 text-zinc-600 opacity-50";
                }

                return (
                  <button
                    key={n}
                    type="button"
                    disabled={!canTap}
                    onClick={() => onPickNumber?.(n)}
                    className={tileClass}
                  >
                    {n}
                  </button>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
}
