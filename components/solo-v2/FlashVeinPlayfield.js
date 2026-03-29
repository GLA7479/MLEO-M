/**
 * Flash Vein — coin-family DicePickBoard `diceSlot` + `choiceSlot`.
 * Reveal lives in a fixed-size grid; lane picks mirror dice-pick / core-breaker strike layout.
 */

function roleShortLabel(role) {
  if (role === "unstable") return "Unstable";
  if (role === "gem") return "Gem";
  if (role === "safe") return "Safe";
  return "";
}

function roleToneClass(role) {
  if (role === "unstable") return "text-red-300/95";
  if (role === "gem") return "text-cyan-300/95";
  if (role === "safe") return "text-amber-200/95";
  return "text-zinc-500";
}

/**
 * @param {{ lanes: string[] | null; revealPhase: "idle" | "showing" | "masked" }} props
 */
export function FlashVeinDiceSlot({ lanes, revealPhase }) {
  const safeLanes = Array.isArray(lanes) && lanes.length === 3 ? lanes : null;
  const showFaces = revealPhase === "showing" && safeLanes;

  return (
    <div
      className="flex flex-col items-center justify-center lg:mt-8"
      aria-label="Flash vein board"
    >
      <div
        className={[
          "relative mt-2 flex w-full max-w-[19rem] flex-col justify-center overflow-hidden rounded-2xl border border-amber-900/55 bg-zinc-950 sm:mt-0 sm:max-w-[22rem] lg:max-w-[26rem]",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.55)]",
          "h-[6.625rem] sm:h-[8.25rem] sm:rounded-[1.05rem] lg:h-[9.75rem] lg:rounded-2xl",
        ].join(" ")}
      >
        <div
          className="pointer-events-none absolute inset-[5%] rounded-xl border border-zinc-700/40 bg-gradient-to-b from-zinc-800/90 to-zinc-950"
          aria-hidden
        />
        <div className="relative z-[1] grid h-full w-full grid-cols-3 gap-0 px-1 py-2 sm:px-1.5 sm:py-2.5">
          {[0, 1, 2].map(i => {
            const role = safeLanes ? String(safeLanes[i] || "") : "";
            const label = showFaces ? roleShortLabel(role) : "";
            const muted = revealPhase === "masked" || revealPhase === "idle";
            return (
              <div
                key={`fv-cell-${i}`}
                className="flex min-h-0 flex-col items-center justify-center border-r border-white/[0.06] px-0.5 last:border-r-0"
              >
                <span
                  className={[
                    "select-none text-center text-[0.65rem] font-black uppercase leading-tight tracking-wide sm:text-[0.72rem] lg:text-[0.8rem]",
                    showFaces ? roleToneClass(role) : "text-zinc-600",
                    muted && !showFaces ? "opacity-95" : "",
                  ].join(" ")}
                  style={{
                    opacity: showFaces ? 1 : revealPhase === "masked" ? 0.55 : 0.35,
                    transition: "opacity 160ms ease-out",
                  }}
                >
                  {showFaces ? label : "?"}
                </span>
                <span className="mt-1 text-[7px] font-bold uppercase tracking-[0.14em] text-zinc-600 sm:text-[8px]">
                  {i === 0 ? "Left" : i === 1 ? "Ctr" : "Right"}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div
        className="mt-2 flex w-full max-w-[19rem] justify-center sm:max-w-[22rem] lg:max-w-[26rem]"
        aria-hidden
      >
        <span className="text-[8px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[9px]">
          Flash zone
        </span>
      </div>
    </div>
  );
}

const LANE_SHELL =
  "group relative flex h-full w-full min-h-[5.25rem] flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]";

const LANE_FACE_BASE =
  "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] ";

function outcomeFlashLabel(outcome) {
  if (outcome === "unstable") return "Unstable — vein lost";
  if (outcome === "gem") return "Gem lane — multiplier up";
  if (outcome === "safe") return "Safe lane — carry on";
  return "";
}

export function FlashVeinChoiceSlot({ pickDisabled, pickingUi, lastFlash, onPickLane }) {
  const labels = ["Left", "Center", "Right"];
  const flashText = lastFlash ? outcomeFlashLabel(lastFlash.outcome) : "";

  return (
    <div className="grid w-full grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4">
      <p className="text-center text-[10px] font-semibold leading-snug text-zinc-300 sm:text-[11px] sm:leading-relaxed lg:text-left lg:text-[12px] lg:leading-normal">
        Memorize the flash. Pick the safe lane. Gem boosts payout. Unstable ends the run.
      </p>

      <div
        className="grid w-full grid-cols-3 gap-2 sm:gap-3 lg:gap-6"
        role="group"
        aria-label="Vein lanes"
        aria-busy={Boolean(pickingUi)}
      >
        {[0, 1, 2].map(col => {
          const fl = lastFlash?.column === col ? lastFlash.outcome : null;
          const ring =
            fl === "unstable"
              ? "ring-2 ring-red-600/75 ring-offset-2 ring-offset-zinc-950"
              : fl === "gem"
                ? "ring-2 ring-cyan-500/60 ring-offset-2 ring-offset-zinc-950"
                : fl === "safe"
                  ? "ring-2 ring-amber-500/55 ring-offset-2 ring-offset-zinc-950"
                  : "";
          return (
            <button
              key={`fv-lane-${col}`}
              type="button"
              disabled={pickDisabled}
              onClick={() => onPickLane(col)}
              className={`${LANE_SHELL} ${LANE_FACE_BASE}${ring} ${
                pickDisabled ? "cursor-not-allowed opacity-[0.42] " : ""
              }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35`}
            >
              <span
                className="mt-0.5 select-none text-[1.65rem] font-black leading-none tabular-nums text-amber-100/95 sm:text-[2rem] lg:text-[2.35rem]"
                aria-hidden
              >
                ⛏
              </span>
              <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">
                {labels[col]}
              </span>
              <span className="mt-0.5 text-[8px] font-semibold text-zinc-500 sm:text-[9px]">Strike</span>
            </button>
          );
        })}
      </div>

      <div className="flex min-h-[2.625rem] items-start sm:min-h-[2.75rem]">
        <p
          className={`line-clamp-2 w-full text-center text-[10px] leading-tight sm:text-[11px] lg:text-left ${
            flashText
              ? `font-bold ${
                  lastFlash?.outcome === "unstable"
                    ? "text-red-300/95"
                    : lastFlash?.outcome === "gem"
                      ? "text-cyan-300/95"
                      : "text-amber-200/95"
                }`
              : "select-none font-bold text-transparent"
          }`}
          role="status"
          aria-live="polite"
        >
          {flashText || "\u00a0"}
        </p>
      </div>
    </div>
  );
}
