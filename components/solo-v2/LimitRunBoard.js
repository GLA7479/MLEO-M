import { useEffect, useState } from "react";
import {
  LIMIT_RUN_LIMBO_MAX_TARGET,
  LIMIT_RUN_LIMBO_MIN_TARGET,
  LIMIT_RUN_TARGET_PRESETS,
  normalizeLimitRunTargetMultiplier,
} from "../../lib/solo-v2/limitRunConfig";

/** Allow typing; max one dot, up to 2 fractional digits (keeps trailing "."). */
function sanitizeTargetDraftString(raw) {
  let out = "";
  let dotSeen = false;
  let fracLen = 0;
  for (const ch of String(raw)) {
    if (ch >= "0" && ch <= "9") {
      if (dotSeen) {
        if (fracLen < 2) {
          out += ch;
          fracLen += 1;
        }
      } else {
        out += ch;
      }
    } else if (ch === "." && !dotSeen) {
      out += ".";
      dotSeen = true;
    }
  }
  return out;
}

function formatTargetInputFromNumber(n) {
  const v = normalizeLimitRunTargetMultiplier(n);
  if (v == null) return String(LIMIT_RUN_LIMBO_MIN_TARGET);
  return parseFloat(v.toFixed(2)).toString();
}

function commitTargetDraftToNumber(draft) {
  const t = String(draft).trim();
  if (t === "" || t === ".") {
    return normalizeLimitRunTargetMultiplier(LIMIT_RUN_LIMBO_MIN_TARGET) ?? LIMIT_RUN_LIMBO_MIN_TARGET;
  }
  const n = parseFloat(t);
  if (!Number.isFinite(n)) {
    return normalizeLimitRunTargetMultiplier(LIMIT_RUN_LIMBO_MIN_TARGET) ?? LIMIT_RUN_LIMBO_MIN_TARGET;
  }
  return normalizeLimitRunTargetMultiplier(n) ?? LIMIT_RUN_LIMBO_MIN_TARGET;
}

/**
 * Limit Run — Quick Flip mirror shell (notice, status, round strip, payout band, hint) + limbo identity
 * (hero readout, slider, roll). Mobile stack; `lg+` splits hero | controls — separate desktop target.
 */
export default function LimitRunBoard({
  targetMultiplier = LIMIT_RUN_LIMBO_MIN_TARGET,
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
  statusTop = "—",
  statusSub = "",
  hintLine = "\u00a0",
  stepTotal = 2,
  currentStepIndex = 0,
  stepsComplete = 0,
  stepLabels = ["Target", "Roll"],
  payoutBandLabel = "Payout if win",
  payoutBandValue = "—",
  payoutCaption = "",
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
  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const hintVisible = String(hintLine || "").trim().length > 0 && hintLine !== "\u00a0";

  const [customDraft, setCustomDraft] = useState(() => formatTargetInputFromNumber(targetMultiplier));

  useEffect(() => {
    setCustomDraft(formatTargetInputFromNumber(targetMultiplier));
  }, [targetMultiplier]);

  const disabledControls = rolling || rollDisabled;

  const commitCustomTarget = () => {
    const next = commitTargetDraftToNumber(customDraft);
    const formatted = formatTargetInputFromNumber(next);
    setCustomDraft(formatted);
    if (Math.abs(Number(next) - Number(targetMultiplier)) > 0.0001) {
      onTargetChange?.(next);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-2 border-violet-700/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <style>{`
        .lr-hero-num { font-size: clamp(1.9rem, 8.5vw, 2.7rem); line-height: 1.02; }
        @media (min-width: 640px) {
          .lr-hero-num { font-size: clamp(2.25rem, 8vmin, 4.5rem); }
        }
        @media (min-width: 1024px) {
          .lr-hero-num { font-size: clamp(2.5rem, 5.5vmin, 4.75rem); }
        }
        .lr-custom-target-input::selection {
          background-color: rgba(167, 139, 250, 0.38);
        }
      `}</style>

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

      <div className="relative mx-auto h-9 w-full max-w-[min(100%,420px)] shrink-0 px-2 sm:h-10 lg:max-w-none">
        <p
          className={`absolute inset-0 flex items-center justify-center px-1 text-center text-[10px] font-semibold leading-snug sm:text-[11px] ${resultToneClass} transition-opacity duration-200 ${
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
      </div>

      <div className="shrink-0 px-2.5 pb-0.5 pt-0 sm:px-3 sm:pb-1 lg:px-8">
        <div className="mb-0 flex items-center justify-between px-0.5 sm:mb-0.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.16em] text-violet-200/40 sm:text-[9px]">Round</span>
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
                key={`lr-step-${i}`}
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

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-6 lg:px-8 lg:pb-2">
        <div className="flex min-h-0 min-w-0 flex-none items-center justify-center px-1 py-0.5 max-h-[min(21vh,9rem)] sm:max-h-none sm:flex-1 sm:px-2 sm:py-2 lg:max-h-none lg:flex-1 lg:py-4">
          <div
            className={`lr-hero-num max-w-full truncate font-black tabular-nums tracking-tight transition-colors duration-200 ${heroClass}`}
            aria-live="polite"
          >
            ×{displayMultiplierText}
          </div>
        </div>

        <div className="mt-auto flex min-h-0 w-full shrink-0 flex-col border-t border-violet-600/30 bg-zinc-950 px-1.5 py-2.5 sm:mt-0 sm:border-t-0 sm:bg-transparent sm:px-2 sm:py-2 lg:mt-0 lg:w-[min(100%,22rem)] lg:border-l lg:border-t-0 lg:border-violet-600/25 lg:px-0 lg:pl-5 lg:pt-1">
        <div className="mx-auto flex w-full flex-col gap-2.5 sm:gap-2">
          <div className="w-full">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[10px] font-semibold text-zinc-400 sm:mb-0.5 sm:text-[11px]">
              <span id="lr-board-target-heading">Target</span>
              <span className="tabular-nums text-violet-200">×{Number(targetMultiplier).toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={LIMIT_RUN_LIMBO_MIN_TARGET}
              max={LIMIT_RUN_LIMBO_MAX_TARGET}
              step={0.01}
              value={targetMultiplier}
              onChange={e => onTargetChange?.(Number(e.target.value))}
              disabled={disabledControls}
              className="h-2.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 disabled:opacity-50 sm:h-2 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 sm:[&::-webkit-slider-thumb]:h-3.5 sm:[&::-webkit-slider-thumb]:w-3.5"
            />
            <div className="mt-1 flex justify-between text-[9px] text-zinc-600 sm:mt-0.5 sm:text-[10px]">
              <span>×{LIMIT_RUN_LIMBO_MIN_TARGET}</span>
              <span>×{LIMIT_RUN_LIMBO_MAX_TARGET}</span>
            </div>
          </div>

          <div className="flex min-h-12 w-full flex-nowrap items-center justify-center gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] sm:min-h-11 sm:gap-2 [&::-webkit-scrollbar]:hidden">
            {LIMIT_RUN_TARGET_PRESETS.map(m => {
              const active = Math.abs(Number(targetMultiplier) - m) < 0.02;
              return (
                <button
                  key={m}
                  type="button"
                  disabled={disabledControls}
                  onClick={() => onTargetChange?.(m)}
                  className={`flex h-9 shrink-0 items-center justify-center rounded-lg border-2 px-2 py-1 text-center text-[10px] font-black tabular-nums transition sm:h-9 sm:px-2.5 sm:text-xs ${
                    active
                      ? "border-violet-400 bg-violet-950/60 text-violet-50"
                      : "border-violet-800/60 bg-zinc-800 text-violet-100 hover:border-violet-600"
                  } disabled:cursor-not-allowed disabled:opacity-45`}
                >
                  ×{m}
                </button>
              );
            })}
            <div
              className={`flex h-9 w-[4.05rem] shrink-0 items-center gap-px rounded-md border border-violet-950/80 bg-black/60 px-1 shadow-[inset_0_2px_4px_rgba(0,0,0,0.7)] ring-1 ring-inset ring-black/60 transition-[border-color,box-shadow] focus-within:border-violet-400/90 focus-within:shadow-[inset_0_2px_4px_rgba(0,0,0,0.55),0_0_0_1px_rgba(167,139,250,0.4)] focus-within:ring-violet-400/30 sm:w-[4.2rem] sm:px-1.5 ${
                disabledControls
                  ? "pointer-events-none cursor-not-allowed opacity-45"
                  : "cursor-text"
              }`}
              onMouseDown={e => {
                if (disabledControls) return;
                const el = e.currentTarget.querySelector("input.lr-custom-target-input");
                if (el && e.target !== el) {
                  e.preventDefault();
                  el.focus();
                }
              }}
            >
              <span
                className="pointer-events-none shrink-0 select-none text-[10px] font-black tabular-nums leading-none text-violet-200 sm:text-xs"
                aria-hidden
              >
                ×
              </span>
              <input
                type="text"
                inputMode="decimal"
                enterKeyHint="done"
                autoComplete="off"
                spellCheck={false}
                aria-labelledby="lr-board-target-heading"
                disabled={disabledControls}
                value={customDraft}
                onChange={e => setCustomDraft(sanitizeTargetDraftString(e.target.value))}
                onBlur={commitCustomTarget}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="lr-custom-target-input min-w-0 w-0 flex-1 cursor-text border-0 bg-transparent py-0 pl-px pr-0 text-left text-[10px] font-black tabular-nums leading-none text-violet-50 caret-violet-400 outline-none ring-0 focus:outline-none focus:ring-0 disabled:cursor-not-allowed sm:text-xs"
              />
              <div
                className="pointer-events-none flex shrink-0 flex-col items-center justify-center gap-px py-0.5 pr-px text-zinc-500"
                aria-hidden
              >
                <svg className="h-1 w-2" viewBox="0 0 10 5" aria-hidden>
                  <path fill="currentColor" d="M5 0l5 5H0z" />
                </svg>
                <svg className="h-1 w-2" viewBox="0 0 10 5" aria-hidden>
                  <path fill="currentColor" d="M5 5L0 0h10z" />
                </svg>
              </div>
            </div>
          </div>

          <div className="flex min-h-[2.25rem] items-start justify-center px-0.5 text-center text-[9px] font-medium leading-snug text-zinc-500 sm:min-h-[2.5rem] sm:text-[10px] lg:px-0">
            <p className="line-clamp-2 w-full">{hintVisible ? hintLine : showHeroHint ? "Set target, then roll. Win if result ≥ target." : "\u00a0"}</p>
          </div>

          <div className="grid min-h-[3.35rem] grid-cols-2 gap-2 rounded-lg border border-violet-900/40 bg-zinc-900/80 px-2.5 py-2 text-center sm:min-h-[3.25rem] sm:gap-1.5 sm:px-2 sm:py-2">
            <div className="flex flex-col items-center justify-center gap-0.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">
                Win chance
              </div>
              <div className="text-xs font-bold tabular-nums text-amber-200/95 sm:text-sm">
                {winChancePercent.toFixed(2)}%
              </div>
            </div>
            <div className="flex flex-col items-center justify-center gap-0.5">
              <div className="text-[9px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[10px]">
                If you win
              </div>
              <div className="text-xs font-bold tabular-nums text-lime-200/95 sm:text-sm">+{projectedPayoutLabel}</div>
            </div>
          </div>

          <button
            type="button"
            disabled={disabledControls}
            onClick={() => onRoll?.()}
            className={`flex min-h-[48px] w-full flex-col items-center justify-center rounded-xl border-2 px-2 py-2 text-center transition-colors sm:min-h-[48px] sm:px-1 sm:py-1.5 ${
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
    </div>
  );
}
