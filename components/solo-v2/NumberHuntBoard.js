import {
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MAX_NUM,
  NUMBER_HUNT_MIN_NUM,
} from "../../lib/solo-v2/numberHuntConfig";

const NUMBERS = Array.from({ length: NUMBER_HUNT_MAX_NUM - NUMBER_HUNT_MIN_NUM + 1 }, (_, i) => i + NUMBER_HUNT_MIN_NUM);

/**
 * Guess history + live range — fills DicePickBoard `diceSlot` (coin-family sidebar target).
 */
export function NumberHuntGuessSlots({ playing = null }) {
  const history = Array.isArray(playing?.guessHistory) ? playing.guessHistory : [];
  const low = Number.isFinite(Number(playing?.lowBound)) ? Number(playing.lowBound) : NUMBER_HUNT_MIN_NUM;
  const high = Number.isFinite(Number(playing?.highBound)) ? Number(playing.highBound) : NUMBER_HUNT_MAX_NUM;

  return (
    <div className="flex w-full max-w-[17.75rem] flex-col gap-2 lg:w-[min(100%,13.5rem)] lg:max-w-[13.5rem] lg:gap-3 lg:pt-1">
      <div className="flex justify-center gap-2 sm:gap-3 lg:flex-col lg:items-stretch lg:gap-2">
        {Array.from({ length: NUMBER_HUNT_MAX_GUESSES }, (_, i) => {
          const filled = i < history.length;
          const g = filled ? history[i]?.guess : null;
          return (
            <div key={i} className="flex w-[4.25rem] flex-col items-center gap-0.5 sm:w-[4.75rem] lg:w-full">
              <div
                className={`flex h-10 w-full items-center justify-center rounded-lg border-2 text-base font-black tabular-nums sm:h-11 sm:text-lg ${
                  filled ? "border-amber-600/80 bg-zinc-800 text-amber-100" : "border-zinc-700 bg-zinc-950 text-zinc-600"
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
          <span className="font-black tabular-nums text-amber-100">
            {low}–{high}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * 1–20 pick grid + resolve styling — fills DicePickBoard `choiceSlot`.
 */
export function NumberHuntPickGrid({
  playing = null,
  pickingUi = false,
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

  return (
    <div className="mt-2 flex min-h-0 w-full flex-col sm:mt-3 lg:mt-0 lg:min-w-0 lg:justify-center">
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
              "border-amber-700/60 bg-zinc-800 text-amber-50 hover:border-amber-500 hover:bg-zinc-700 active:scale-[0.98]";
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
  );
}
