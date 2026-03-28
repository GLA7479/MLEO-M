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
 * Limit Run — Limbo board only: fixed header (session + helper/result), flex hero, bottom controls.
 * overflow-hidden; no inner scroll. No stage strips or non-limbo chrome.
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
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      <style>{`
        .lr-hero-num { font-size: clamp(1.9rem, 8.5vw, 2.7rem); line-height: 1.02; }
        @media (min-width: 640px) {
          .lr-hero-num { font-size: clamp(2.25rem, 8vmin, 4.5rem); }
        }
        .lr-custom-target-input::selection {
          background-color: rgba(167, 139, 250, 0.38);
        }
      `}</style>
      {/* Fixed header: session line + helper/result (opacity only, fixed height) — tighter on mobile */}
      <div className="relative shrink-0 px-2 pb-0.5 pt-1 sm:px-3 sm:pb-1 sm:pt-2">
        <div className="relative mx-auto h-7 max-w-[min(100%,360px)] sm:h-8">
          <p
            className={`absolute inset-0 flex items-center justify-center text-center text-[10px] leading-snug text-emerald-200/75 transition-opacity duration-200 sm:text-[11px] ${
              showSession ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
          >
            {showSession ? sessionNotice : "\u00a0"}
          </p>
        </div>
        <div className="relative mx-auto mt-0.5 h-9 max-w-[min(100%,360px)] sm:h-12">
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

      {/* Mobile: compact hero (no flex-1); desktop: flex-1 center band unchanged */}
      <div className="flex min-h-0 min-w-0 flex-none items-center justify-center px-1 py-0.5 max-h-[min(21vh,9rem)] sm:flex-1 sm:max-h-none sm:px-2 sm:py-0">
        <div
          className={`lr-hero-num max-w-full truncate font-black tabular-nums tracking-tight transition-colors duration-200 ${heroClass}`}
          aria-live="polite"
        >
          ×{displayMultiplierText}
        </div>
      </div>

      <div className="mt-auto shrink-0 border-t border-violet-600/30 bg-zinc-950 px-1.5 py-2.5 sm:mt-0 sm:px-2 sm:py-2">
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
  );
}
