import {
  TRIPLE_DICE_MAX_TOTAL,
  TRIPLE_DICE_MIN_TOTAL,
} from "../../lib/solo-v2/tripleDiceConfig";

const TARGETS = Array.from(
  { length: TRIPLE_DICE_MAX_TOTAL - TRIPLE_DICE_MIN_TOTAL + 1 },
  (_, i) => i + TRIPLE_DICE_MIN_TOTAL,
);

/** 3×3 pip layout for values 1–6 */
function PipDie({ value, rolling, muted }) {
  const v = Math.min(6, Math.max(1, Math.floor(Number(value)) || 1));
  const on = pos => {
    const p = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    }[v];
    return p.includes(pos);
  };
  return (
    <div
      className={`grid w-[4.25rem] shrink-0 grid-cols-3 gap-px rounded-xl border-2 p-1.5 sm:w-[4.75rem] sm:p-2 ${
        muted
          ? "border-zinc-700 bg-zinc-950"
          : rolling
            ? "border-violet-500/80 bg-zinc-900"
            : "border-violet-600/70 bg-zinc-900"
      } ${rolling ? "motion-safe:animate-pulse" : ""}`}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(pos => (
        <div key={pos} className="flex aspect-square items-center justify-center">
          <span
            className={`h-1.5 w-1.5 rounded-full sm:h-2 sm:w-2 ${
              on(pos)
                ? muted
                  ? "bg-zinc-500"
                  : "bg-violet-200 shadow-[0_0_6px_rgba(196,181,253,0.45)]"
                : "bg-transparent"
            } ${rolling ? "opacity-80" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Triple Dice — board only: status → target/result → three dice → total → target grid + Roll.
 * Fixed vertical bands; overflow-hidden; no inner scroll.
 */
export default function TripleDiceBoard({
  sessionNotice = "",
  statusTop = "\u00a0",
  statusSub = "\u00a0",
  diceValues = [1, 1, 1],
  diceMuted = false,
  totalDisplay = "—",
  targetTotal = 10,
  onTargetChange,
  rolling = false,
  onRoll,
  rollDisabled = false,
  targetPickerDisabled = false,
}) {
  const showSession = Boolean(sessionNotice);
  const d0 = diceValues[0] ?? 1;
  const d1 = diceValues[1] ?? 1;
  const d2 = diceValues[2] ?? 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      <div className="flex h-6 shrink-0 items-center justify-center px-2 sm:h-7">
        <p
          className={`truncate text-center text-[10px] text-emerald-200/75 sm:text-[11px] ${
            showSession ? "opacity-100" : "opacity-0"
          }`}
        >
          {showSession ? sessionNotice : "\u00a0"}
        </p>
      </div>

      <div className="shrink-0 px-3 pb-1 pt-0.5 text-center sm:px-4 sm:pb-1.5">
        <p className="min-h-[1.25rem] text-[13px] font-bold leading-tight text-white sm:text-sm">{statusTop}</p>
        <p className="mt-0.5 min-h-[1.1rem] text-[11px] leading-snug text-zinc-400 sm:text-xs">{statusSub}</p>
      </div>

      <div className="flex min-h-[5.75rem] shrink-0 items-center justify-center gap-2.5 px-2 py-1 sm:min-h-[6.75rem] sm:gap-4 sm:px-3 sm:py-1.5">
        <PipDie value={d0} rolling={rolling} muted={diceMuted} />
        <PipDie value={d1} rolling={rolling} muted={diceMuted} />
        <PipDie value={d2} rolling={rolling} muted={diceMuted} />
      </div>

      <div className="flex h-9 shrink-0 items-center justify-center sm:h-10">
        <p className="text-lg font-black tabular-nums text-violet-100 sm:text-xl" aria-live="polite">
          Total{" "}
          <span className="text-amber-100/95">{totalDisplay}</span>
        </p>
      </div>

      <div className="mt-auto flex min-h-0 shrink-0 flex-col gap-2.5 border-t border-violet-600/30 bg-zinc-950 px-2 py-2.5 sm:gap-2 sm:px-3 sm:py-2.5">
        <div className="mx-auto grid w-full max-w-[18.5rem] grid-cols-4 gap-1.5 sm:max-w-[20rem] sm:gap-2">
          {TARGETS.map(n => {
            const active = n === targetTotal;
            return (
              <button
                key={n}
                type="button"
                disabled={targetPickerDisabled}
                onClick={() => onTargetChange?.(n)}
                className={`flex h-9 items-center justify-center rounded-lg border-2 text-center text-xs font-black tabular-nums transition sm:h-9 sm:text-sm ${
                  active
                    ? "border-violet-400 bg-violet-950/60 text-violet-50"
                    : "border-violet-800/60 bg-zinc-800 text-violet-100 hover:border-violet-600"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                {n}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={rollDisabled || rolling}
          onClick={() => onRoll?.()}
          className={`mx-auto flex min-h-[48px] w-full max-w-[18.5rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition-colors sm:max-w-[20rem] sm:min-h-[48px] sm:px-1 sm:py-1.5 ${
            rollDisabled || rolling
              ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
              : "border-violet-400 bg-violet-950/50 text-violet-50 ring-2 ring-violet-500/25 hover:bg-violet-900/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase leading-tight text-white sm:text-xs">
            {rolling ? "Rolling…" : "Roll"}
          </span>
        </button>
      </div>
    </div>
  );
}
