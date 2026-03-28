import {
  MYSTERY_CHAMBER_CHAMBER_COUNT,
  MYSTERY_CHAMBER_SIGIL_GLYPHS,
} from "../../lib/solo-v2/mysteryChamberConfig";

/**
 * @typedef {"idle" | "pending" | "safe" | "fail" | "muted"} SigilVisual
 */

function SigilTile({ index, visual, disabled, onPick, revealPulse }) {
  const glyph = MYSTERY_CHAMBER_SIGIL_GLYPHS[index] || "?";

  const shell =
    "group relative flex h-full min-h-[5.65rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.75rem] sm:rounded-[1.05rem] lg:min-h-[7rem]";

  let face =
    "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";

  if (visual === "safe") {
    face =
      "border-emerald-400/65 bg-gradient-to-b from-emerald-900/55 to-emerald-950/90 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(16,185,129,0.12)] ";
  } else if (visual === "fail") {
    face =
      "border-rose-500/70 bg-gradient-to-b from-rose-900/50 to-rose-950/90 text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";
  } else if (visual === "muted") {
    face =
      "border-zinc-700/70 bg-zinc-950/90 text-zinc-600 shadow-none saturate-50 ";
  } else if (visual === "pending") {
    face =
      "border-amber-300/55 bg-gradient-to-b from-amber-900/35 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_2px_rgba(251,191,36,0.22)] ring-2 ring-amber-400/30 " +
      (revealPulse ? "motion-safe:animate-pulse " : "");
  } else {
    face +=
      "enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] enabled:active:border-amber-400/50 ";
  }

  const isLocked = visual === "safe" || visual === "fail" || visual === "muted";
  const dimmed = disabled && !isLocked;

  return (
    <button
      type="button"
      className={`${shell} ${face}${
        dimmed ? "cursor-not-allowed opacity-[0.42] " : ""
      }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35 disabled:cursor-not-allowed`}
      disabled={disabled}
      onClick={() => onPick?.(index)}
    >
      <span className="absolute left-2 top-2 text-[8px] font-bold uppercase tracking-[0.18em] text-white/30 sm:left-2.5 sm:top-2.5 sm:text-[9px]">
        {index + 1}
      </span>
      <span
        className={`mt-1 select-none font-serif text-[2.15rem] font-black leading-none tabular-nums tracking-tight sm:text-[2.55rem] lg:text-[2.7rem] ${
          visual === "idle" ? "text-amber-100/95" : ""
        }`}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px]">
        {visual === "safe" ? "Safe" : visual === "fail" ? "Wrong" : visual === "muted" ? "—" : "Choose"}
      </span>
    </button>
  );
}

export default function MysteryChamberBoard({
  sessionNotice,
  statusTop,
  statusSub,
  chamberTotal = MYSTERY_CHAMBER_CHAMBER_COUNT,
  currentChamberIndex = 0,
  chambersCleared = 0,
  securedReturnLabel,
  securedCaption = "",
  sigilVisuals = ["idle", "idle", "idle", "idle"],
  sigilPickDisabled = false,
  onSigilPick,
  hintLine = "\u00a0",
  exitVisible = false,
  exitDisabled = false,
  onExitNow,
  revealPulse = false,
}) {
  const total = Math.max(1, Math.floor(Number(chamberTotal) || MYSTERY_CHAMBER_CHAMBER_COUNT));
  const showSession = Boolean(sessionNotice);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-2 border-amber-900/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex h-[1.125rem] shrink-0 items-center justify-center px-2 sm:h-5">
        <p
          className={`truncate text-center text-[9px] font-semibold text-amber-200/85 sm:text-[10px] ${
            showSession ? "opacity-100" : "opacity-0"
          }`}
        >
          {showSession ? sessionNotice : "\u00a0"}
        </p>
      </div>

      <div className="shrink-0 px-2.5 pb-0.5 pt-0.5 text-center sm:px-3 sm:pb-1 sm:pt-1">
        <p className="min-h-[1.1rem] text-[11px] font-bold leading-tight text-white sm:min-h-[1.2rem] sm:text-[13px]">
          {statusTop}
        </p>
        <p className="mt-0 min-h-[0.85rem] text-[9px] leading-snug text-zinc-400 sm:mt-0.5 sm:min-h-[1rem] sm:text-[10px]">
          {statusSub}
        </p>
      </div>

      <div className="shrink-0 px-2.5 pb-1 pt-0 sm:px-3 sm:pb-1.5">
        <div className="mb-1 flex items-center justify-between gap-2 px-0.5">
          <span className="text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200/40 sm:text-[9px]">
            Run progress
          </span>
          <span className="text-[10px] font-bold tabular-nums text-white/85 sm:text-[11px]">
            Step {Math.min(currentChamberIndex + 1, total)} of {total}
          </span>
        </div>
        <div
          className="relative h-2 w-full overflow-hidden rounded-full bg-zinc-800/90 shadow-inner sm:h-2.5"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={chambersCleared}
          aria-label={`${chambersCleared} of ${total} steps cleared`}
        >
          <div className="pointer-events-none absolute inset-0 z-0 flex">
            {Array.from({ length: total }, (_, i) => (
              <div key={`tick-${i}`} className="flex-1 border-r border-zinc-600/25 last:border-r-0" />
            ))}
          </div>
          <div
            className="relative z-[1] h-full rounded-full bg-gradient-to-r from-emerald-600/85 to-emerald-500/75 transition-[width] duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, (chambersCleared / total) * 100))}%` }}
          />
          {chambersCleared < total ? (
            <div
              className="pointer-events-none absolute top-1/2 z-[2] h-2.5 w-0.5 -translate-y-1/2 rounded-full bg-amber-400/90 shadow-[0_0_6px_rgba(251,191,36,0.35)] sm:h-3"
              style={{
                left: `calc(${((chambersCleared + 0.5) / total) * 100}% - 1px)`,
              }}
              aria-hidden
            />
          ) : null}
        </div>
        <p className="mt-1 text-center text-[8px] font-medium leading-tight text-zinc-500 sm:text-[9px]">
          {chambersCleared} of {total} steps cleared · 4 sigils below are for this step only
        </p>
      </div>

      <div className="shrink-0 px-2.5 pb-1.5 pt-0 sm:px-3 sm:pb-2">
        <div className="rounded-lg border border-amber-900/50 bg-zinc-800/55 px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:rounded-xl sm:px-3 sm:py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-[0.14em] text-amber-200/45 sm:text-[9px]">
              Secured return
            </span>
            <span className="truncate text-right text-sm font-black tabular-nums text-amber-100 sm:text-base">
              {securedReturnLabel}
            </span>
          </div>
          {securedCaption ? (
            <p className="mt-0.5 border-t border-white/5 pt-0.5 text-right text-[8px] font-medium leading-snug text-zinc-500 sm:text-[9px]">
              {securedCaption}
            </p>
          ) : null}
        </div>
      </div>

      {/* Mobile: 2×2 centered in flex-1. Desktop (sm+): single horizontal row, full width — uses canvas width, not a shrunk mobile block. */}
      <div className="flex min-h-0 flex-1 flex-col justify-center px-2 pb-1 pt-0 sm:flex-none sm:justify-start sm:px-4 sm:pb-2 sm:pt-1">
        <div
          className="mx-auto grid w-full max-w-[17.75rem] grid-cols-2 grid-rows-2 gap-2.5 sm:mx-0 sm:max-w-none sm:grid-cols-4 sm:grid-rows-1 sm:gap-3 lg:gap-3.5"
          role="group"
          aria-label="Sigils"
        >
          {[0, 1, 2, 3].map(i => (
            <SigilTile
              key={i}
              index={i}
              visual={sigilVisuals[i] || "idle"}
              disabled={sigilPickDisabled || ["safe", "fail", "muted"].includes(sigilVisuals[i])}
              onPick={onSigilPick}
              revealPulse={revealPulse && sigilVisuals[i] === "pending"}
            />
          ))}
        </div>
      </div>

      <div className="flex min-h-[2rem] shrink-0 items-center justify-center px-2 text-center sm:min-h-[2.125rem] sm:px-4">
        <p className="text-[9px] font-medium leading-snug text-zinc-400 sm:text-[10px]">{hintLine}</p>
      </div>

      {/* Absorb extra desktop height below the hint so the exit band stays bottom-anchored without a void under the sigil row. */}
      <div className="hidden min-h-0 shrink-0 sm:block sm:flex-1" aria-hidden />

      <div className="shrink-0 border-t border-amber-900/35 bg-zinc-950/80 px-2 py-1.5 sm:px-4 sm:py-2">
        {exitVisible ? (
          <button
            type="button"
            disabled={exitDisabled}
            onClick={() => onExitNow?.()}
            className="w-full rounded-xl border-2 border-white/12 bg-white/[0.08] py-2.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white transition enabled:hover:border-white/18 enabled:hover:bg-white/[0.11] enabled:active:scale-[0.99] enabled:active:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-35 sm:py-2.5 sm:text-[11px]"
          >
            Exit now
          </button>
        ) : (
          <div className="h-10 w-full sm:h-[2.65rem]" aria-hidden />
        )}
      </div>
    </div>
  );
}
