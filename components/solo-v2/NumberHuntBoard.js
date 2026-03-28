import {
  NUMBER_HUNT_MAX_GUESSES,
  NUMBER_HUNT_MAX_NUM,
  NUMBER_HUNT_MIN_NUM,
} from "../../lib/solo-v2/numberHuntConfig";

const NUMBERS = Array.from({ length: NUMBER_HUNT_MAX_NUM - NUMBER_HUNT_MIN_NUM + 1 }, (_, i) => i + NUMBER_HUNT_MIN_NUM);

/**
 * Number Hunt — flat board only: clue → 3 slots → range → 4×5 grid.
 * No inner cards, overlays, or stacked translucent panels. Popup handles round outcome.
 */
export default function NumberHuntBoard({
  playing = null,
  pickingUi = false,
  showHeroHint = false,
  sessionNotice = "",
  onPickNumber,
  pickDisabled = false,
  revealTarget = null,
  revealWin = false,
}) {
  const history = Array.isArray(playing?.guessHistory) ? playing.guessHistory : [];
  const low = Number.isFinite(Number(playing?.lowBound)) ? Number(playing.lowBound) : NUMBER_HUNT_MIN_NUM;
  const high = Number.isFinite(Number(playing?.highBound)) ? Number(playing.highBound) : NUMBER_HUNT_MAX_NUM;
  const guessed = new Set(history.map(h => Math.floor(Number(h?.guess))).filter(Number.isFinite));
  const lastClue = history.length > 0 ? String(history[history.length - 1]?.clue || "").trim() : "";
  const showReveal = revealTarget != null && Number.isFinite(revealTarget);
  const inFirstPick = showHeroHint && !pickingUi && !showReveal;

  let line1 = "\u00a0";
  let line2 = "\u00a0";
  if (pickingUi) {
    line1 = "Checking…";
    line2 = "\u00a0";
  } else if (showReveal) {
    line1 = "\u00a0";
    line2 = "\u00a0";
  } else if (inFirstPick) {
    line1 = "Pick your first guess";
    line2 = "Hidden number is 1–20 · You have 3 tries";
  } else if (lastClue) {
    line1 = lastClue;
    line2 = "\u00a0";
  } else if (history.length === 0) {
    line1 = "Pick your first guess";
    line2 = "Hidden number is 1–20 · You have 3 tries";
  } else {
    line1 = "Pick a number";
    line2 = "\u00a0";
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      {/* Session notice — single line, fixed band */}
      <div className="flex h-6 shrink-0 items-center justify-center px-2 sm:h-7">
        <p className="truncate text-center text-[10px] text-emerald-200/75 sm:text-[11px]">
          {sessionNotice || "\u00a0"}
        </p>
      </div>

      {/* Instruction / clue — two reserved lines, no layers */}
      <div className="shrink-0 px-3 pb-2 pt-0.5 text-center sm:px-4 sm:pb-2.5">
        <p className="min-h-[1.25rem] text-[13px] font-bold leading-tight text-white sm:text-sm">{line1}</p>
        <p className="mt-0.5 min-h-[1.1rem] text-[11px] leading-snug text-zinc-400 sm:text-xs">{line2}</p>
      </div>

      {/* Guess slots — one row, flat */}
      <div className="flex shrink-0 justify-center gap-2 px-3 sm:gap-3 sm:px-4">
        {Array.from({ length: NUMBER_HUNT_MAX_GUESSES }, (_, i) => {
          const filled = i < history.length;
          const g = filled ? history[i]?.guess : null;
          return (
            <div key={i} className="flex w-[4.25rem] flex-col items-center gap-0.5 sm:w-[4.75rem]">
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

      {/* Range — one row */}
      <div className="mt-3 shrink-0 px-3 sm:mt-3.5 sm:px-4">
        <div className="flex items-center justify-center gap-2 text-sm sm:text-base">
          <span className="font-semibold uppercase tracking-wide text-zinc-500">Range</span>
          <span className="font-black tabular-nums text-violet-200">
            {low}–{high}
          </span>
        </div>
      </div>

      {/* Grid — primary content */}
      <div className="mt-2 flex min-h-0 flex-1 flex-col px-3 pb-3 pt-1 sm:mt-3 sm:px-4 sm:pb-3 sm:pt-1">
        <div
          className={`grid min-h-0 w-full max-w-[20rem] flex-1 grid-cols-4 gap-1.5 self-center sm:max-w-[22rem] sm:gap-2 [grid-template-rows:repeat(5,minmax(0,1fr))] ${pickingUi ? "pointer-events-none opacity-50" : ""}`}
        >
          {NUMBERS.map(n => {
            const usedWrong = guessed.has(n);
            const isTargetReveal = showReveal && n === revealTarget;
            const inRange = n >= low && n <= high;
            const canTap = !pickDisabled && !usedWrong && !isTargetReveal && inRange && !pickingUi && !showReveal;

            let tileClass =
              "flex h-full min-h-[2.5rem] w-full items-center justify-center rounded-lg border-2 text-[15px] font-black tabular-nums sm:min-h-0 sm:text-[17px] ";

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
  );
}
