/**
 * Coin-family Core Breaker — uses DicePickBoard `diceSlot` + `choiceSlot` (same lg row as dice-pick / triple-dice).
 * Outcomes are unknown until the server resolves — copy hints roles only, never layout.
 */

const CRACK_ANGLES_DEG = [-48, 22, 96, -15, 61];

function outcomeFlashLabel(outcome) {
  if (outcome === "unstable") return "Unstable — run over";
  if (outcome === "gem") return "Gem strike — payout boosted";
  if (outcome === "safe") return "Safe strike";
  return "";
}

function useCoreBreakerDerived(playing) {
  const maxSteps = Math.max(1, Math.floor(Number(playing?.maxSteps) || 5));
  const hist = Array.isArray(playing?.strikeHistory) ? playing.strikeHistory : [];
  const landed = hist.length;
  const multBps = Math.max(10000, Math.floor(Number(playing?.multBps) || 10000));
  const multLabel = (multBps / 10000).toFixed(2);
  const gems = Math.max(0, Math.floor(Number(playing?.gemsCollected) || 0));
  return { maxSteps, landed, multLabel, gems };
}

/** Left column: coin-family rhythm, slightly under DicePickDisplay footprint for board comfort. */
export function CoreBreakerDiceSlot({ playing }) {
  const { maxSteps, landed, multLabel, gems } = useCoreBreakerDerived(playing);

  return (
    <div
      className="flex flex-col items-center justify-center lg:mt-10"
      aria-label="Core target"
    >
      <div
        className={[
          "relative mt-2 flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-amber-900/55 bg-zinc-950 lg:mt-0",
          "shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_8px_24px_rgba(0,0,0,0.55)]",
          "h-[6.625rem] w-[6.625rem] sm:h-[8.25rem] sm:w-[8.25rem] sm:rounded-[1.05rem] lg:h-[9.75rem] lg:w-[9.75rem] lg:rounded-2xl",
        ].join(" ")}
      >
        <div
          className="pointer-events-none absolute inset-[8%] rounded-xl border border-zinc-700/40 bg-gradient-to-b from-zinc-800/90 to-zinc-950"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-[14%] rounded-lg border border-cyan-950/30 bg-cyan-950/10"
          style={{ opacity: 0.15 + Math.min(1, landed / maxSteps) * 0.25 }}
          aria-hidden
        />

        {CRACK_ANGLES_DEG.map((deg, i) => {
          const open = i < landed;
          if (!open && landed === 0) return null;
          return (
            <div
              key={`crack-${deg}`}
              className="pointer-events-none absolute left-1/2 top-1/2 h-[2px] origin-left rounded-full sm:h-0.5"
              style={{
                width: open ? "42%" : "36%",
                opacity: open ? 0.55 + i * 0.06 : 0.09,
                background: open
                  ? "linear-gradient(90deg, transparent 0%, rgba(244,244,245,0.5) 45%, rgba(161,161,170,0.35) 100%)"
                  : "linear-gradient(90deg, transparent, rgba(113,113,122,0.12))",
                transform: `translate(-50%, -50%) rotate(${deg}deg)`,
              }}
              aria-hidden
            />
          );
        })}

        <span
          className="relative z-[1] select-none text-[1.9rem] leading-none text-zinc-200 sm:text-[2.25rem] lg:text-[2.6rem]"
          style={{ textShadow: "0 1px 0 rgba(0,0,0,0.5)" }}
          aria-hidden
        >
          ◆
        </span>
        <span className="relative z-[1] mt-1 text-[8px] font-bold uppercase tracking-[0.16em] text-zinc-400 sm:text-[9px] lg:text-[10px]">
          Sealed core
        </span>
        <span className="relative z-[1] mt-1 text-[8px] font-medium tabular-nums text-zinc-500 sm:text-[9px] lg:text-[10px]">
          ×{multLabel} · {gems} gem{gems === 1 ? "" : "s"}
        </span>
      </div>

      <div
        className="mt-2 flex w-[6.625rem] justify-between px-1 sm:mt-2.5 sm:w-[8.25rem] lg:mt-3 lg:w-[9.75rem]"
        aria-hidden
      >
        {[0, 1, 2].map(i => (
          <div
            key={`tie-${i}`}
            className="h-3 w-px shrink-0 bg-gradient-to-b from-zinc-600/40 to-transparent sm:h-3.5"
          />
        ))}
      </div>
    </div>
  );
}

const STRIKE_SHELL =
  "group relative flex h-full w-full min-h-[5.25rem] flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.1rem] sm:rounded-[1.05rem] lg:min-h-[7.35rem] lg:rounded-[1.12rem]";

const STRIKE_FACE_BASE =
  "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] ";

/** Right column: copy + strike grid — same max width behavior as dice-pick choiceSlot (board-owned). */
export function CoreBreakerChoiceSlot({ pickDisabled, strikingUi, lastFlash, onStrike }) {
  const labels = ["Left", "Center", "Right"];
  const flashText = lastFlash ? outcomeFlashLabel(lastFlash.outcome) : "";

  return (
    <div className="grid w-full grid-cols-1 gap-2.5 sm:gap-3 lg:gap-4">
      <p className="text-center text-[10px] font-semibold leading-snug text-zinc-300 sm:text-[11px] sm:leading-relaxed lg:text-left lg:text-[12px] lg:leading-normal">
        Break the core in 5 safe strikes. Gems boost payout. Unstable ends the run.
      </p>

      <p className="text-center text-[9px] font-medium uppercase tracking-wide text-zinc-500 sm:text-[10px] lg:text-left">
        Three lanes · one unstable · one gem · one safe — each swing
      </p>

      <div className="grid w-full grid-cols-3 gap-2 sm:gap-3 lg:gap-6" role="group" aria-label="Strike lanes">
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
              key={`strike-${col}`}
              type="button"
              disabled={pickDisabled}
              onClick={() => onStrike(col)}
              className={`${STRIKE_SHELL} ${STRIKE_FACE_BASE}${ring} ${
                pickDisabled ? "cursor-not-allowed opacity-[0.42] " : ""
              }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35`}
            >
              <span
                className="mt-0.5 select-none text-[1.65rem] font-black leading-none tabular-nums text-amber-100/95 sm:text-[2rem] lg:text-[2.35rem]"
                aria-hidden
              >
                ⚒
              </span>
              <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px] lg:text-[11px]">
                {labels[col]}
              </span>
              <span className="mt-0.5 text-[8px] font-semibold text-zinc-500 sm:text-[9px]">Strike</span>
            </button>
          );
        })}
      </div>

      {flashText ? (
        <p
          className={`min-h-[1.25rem] text-center text-[10px] font-bold leading-tight sm:text-[11px] lg:text-left ${
            lastFlash?.outcome === "unstable"
              ? "text-red-300/95"
              : lastFlash?.outcome === "gem"
                ? "text-cyan-300/95"
                : "text-amber-200/95"
          }`}
          role="status"
          aria-live="polite"
        >
          {flashText}
        </p>
      ) : strikingUi ? (
        <p className="min-h-[1.25rem] text-center text-[10px] font-medium text-zinc-400 sm:text-[11px] lg:text-left">
          Resolving…
        </p>
      ) : null}
    </div>
  );
}
