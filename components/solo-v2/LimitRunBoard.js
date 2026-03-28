import {
  LIMIT_RUN_LIMBO_MAX_TARGET,
  LIMIT_RUN_LIMBO_MIN_TARGET,
  LIMIT_RUN_TARGET_PRESETS,
} from "../../lib/solo-v2/limitRunConfig";

/**
 * Limit Run — Limbo board only: fixed header (session + helper/result), flex hero, bottom controls.
 * overflow-hidden; no inner scroll. No stage strips or non-limbo chrome.
 */
export default function LimitRunBoard({
  targetMultiplier = 2,
  onTargetChange,
  displayMultiplierText = "—",
  rolling = false,
  resultLine = "",
  resultTone = "neutral",
  winChancePercent = 0,
  projectedPayoutLabel = "0",
  onRoll,
  rollDisabled = false,
  showHeroHint = false,
  sessionNotice = "",
}) {
  const heroClass = rolling
    ? "animate-pulse text-violet-300"
    : resultTone === "win"
      ? "text-emerald-400"
      : resultTone === "lose"
        ? "text-red-400"
        : "text-zinc-500";

  const resultToneClass =
    resultTone === "win" ? "text-emerald-300" : resultTone === "lose" ? "text-red-300" : "text-zinc-400";

  const showResult = Boolean(resultLine);
  const showRollingLine = rolling && !showResult;
  const showHint = showHeroHint && !showResult && !showRollingLine;
  const showSession = Boolean(sessionNotice);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      {/* Fixed header: session line + helper/result (opacity only, fixed height) */}
      <div className="relative shrink-0 px-2 pb-1 pt-2 sm:px-3">
        <div className="relative mx-auto h-8 max-w-[min(100%,360px)]">
          <p
            className={`absolute inset-0 flex items-center justify-center text-center text-[10px] leading-snug text-emerald-200/75 transition-opacity duration-200 sm:text-[11px] ${
              showSession ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {showSession ? sessionNotice : "\u00a0"}
          </p>
        </div>
        <div className="relative mx-auto mt-0.5 h-11 max-w-[min(100%,360px)] sm:h-12">
          <p
            className={`absolute inset-0 flex items-center justify-center text-center text-[10px] font-semibold leading-snug sm:text-[11px] ${resultToneClass} transition-opacity duration-200 ${
              showResult ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {showResult ? resultLine : "\u00a0"}
          </p>
          <p
            className={`absolute inset-0 flex items-center justify-center text-center text-[10px] font-semibold text-violet-200/90 transition-opacity duration-200 sm:text-[11px] ${
              showRollingLine ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            Rolling…
          </p>
          <p
            className={`absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] font-medium leading-snug text-zinc-500 transition-opacity duration-200 sm:text-[11px] ${
              showHint ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            Set target, then roll. Win if result ≥ target.
          </p>
        </div>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center px-1 sm:px-2">
        <div
          className={`max-w-full truncate font-black tabular-nums tracking-tight transition-colors duration-200 ${heroClass}`}
          style={{
            fontSize: "clamp(2.25rem, 8vmin, 4.5rem)",
            lineHeight: 1.02,
          }}
          aria-live="polite"
        >
          ×{displayMultiplierText}
        </div>
      </div>

      <div className="shrink-0 border-t border-violet-600/30 bg-zinc-950 px-1.5 py-1.5 sm:px-2 sm:py-2">
        <div className="mx-auto flex w-full flex-col gap-1.5 sm:gap-2">
          <div className="w-full">
            <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[10px] font-semibold text-zinc-400 sm:text-[11px]">
              <span>Target</span>
              <span className="tabular-nums text-violet-200">×{Number(targetMultiplier).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={LIMIT_RUN_LIMBO_MIN_TARGET}
              max={LIMIT_RUN_LIMBO_MAX_TARGET}
              step={0.01}
              value={targetMultiplier}
              onChange={e => onTargetChange?.(Number(e.target.value))}
              disabled={rolling || rollDisabled}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 disabled:opacity-50 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400"
            />
            <div className="mt-0.5 flex justify-between text-[9px] text-zinc-600 sm:text-[10px]">
              <span>×{LIMIT_RUN_LIMBO_MIN_TARGET}</span>
              <span>×{LIMIT_RUN_LIMBO_MAX_TARGET}</span>
            </div>
          </div>

          <div className="flex min-h-10 w-full flex-nowrap items-center justify-center gap-1.5 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:min-h-11 sm:gap-2 [&::-webkit-scrollbar]:hidden">
            {LIMIT_RUN_TARGET_PRESETS.map(m => {
              const active = Math.abs(Number(targetMultiplier) - m) < 0.02;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={rolling || rollDisabled}
                  onClick={() => onTargetChange?.(m)}
                  className={`flex h-8 shrink-0 items-center justify-center rounded-lg border-2 px-2 py-1 text-center text-[10px] font-black tabular-nums transition sm:h-9 sm:px-2.5 sm:text-xs ${
                    active
                      ? "border-violet-400 bg-violet-950/60 text-violet-50"
                      : "border-violet-800/60 bg-zinc-800 text-violet-100 hover:border-violet-600"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  ×{m}
                </button>
              );
            })}
          </div>

          <div className="grid min-h-[3rem] grid-cols-2 gap-1.5 rounded-lg border border-violet-900/40 bg-zinc-900/80 px-2 py-1.5 text-center sm:min-h-[3.25rem] sm:py-2">
            <div className="flex flex-col items-center justify-center">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">
                Win chance
              </div>
              <div className="text-xs font-bold tabular-nums text-amber-200/95 sm:text-sm">
                {winChancePercent.toFixed(2)}%
              </div>
            </div>
            <div className="flex flex-col items-center justify-center">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">
                If you win
              </div>
              <div className="text-xs font-bold tabular-nums text-lime-200/95 sm:text-sm">+{projectedPayoutLabel}</div>
            </div>
          </div>

          <button
            type="button"
            disabled={rollDisabled || rolling}
            onClick={() => onRoll?.()}
            className={`flex min-h-[44px] w-full flex-col items-center justify-center rounded-xl border-2 px-1 py-1 text-center transition-colors sm:min-h-[48px] sm:py-1.5 ${
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
    </div>
  );
}
