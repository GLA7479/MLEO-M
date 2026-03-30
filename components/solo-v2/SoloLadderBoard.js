/**
 * Step ladder — passed / current / future rungs; climb CTA lives inside this playfield root.
 */
export default function SoloLadderBoard({
  stepTotal = 6,
  successCount = 0,
  terminal = false,
  terminalKind = null,
  failedAtStep = null,
  showClimb = false,
  climbDisabled = false,
  climbLoading = false,
  onClimb,
}) {
  const total = Math.max(1, Math.floor(Number(stepTotal) || 6));
  const done = Math.max(0, Math.min(total, Math.floor(Number(successCount) || 0)));
  const bust = terminal && terminalKind === "bust";
  const full = terminal && terminalKind === "full_clear";
  const bustRowIndex =
    bust && failedAtStep != null && Number.isFinite(Number(failedAtStep))
      ? Math.max(0, Math.floor(Number(failedAtStep)) - 1)
      : bust
        ? done
        : -1;

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-1.5 px-1 sm:gap-2 sm:px-2"
      aria-label="Ladder steps"
    >
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const passed = i < done;
        const current = !terminal && i === done;
        const base =
          "flex min-h-[2.25rem] items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold sm:min-h-[2.5rem] sm:px-3 sm:text-xs";

        let cls = `${base} border-white/10 bg-zinc-900/40 text-zinc-500`;
        if (passed) {
          cls = `${base} border-emerald-500/35 bg-emerald-950/30 text-emerald-100`;
        } else if (current) {
          cls = `${base} border-amber-400/45 bg-amber-950/35 text-amber-100 ring-1 ring-amber-400/25`;
        }
        if (bust && i === bustRowIndex) {
          cls = `${base} border-red-500/45 bg-red-950/35 text-red-100`;
        }
        if (full && passed) {
          cls = `${base} border-amber-400/40 bg-amber-950/25 text-amber-50`;
        }

        return (
          <div key={i} className={cls}>
            <span className="tabular-nums">Step {stepNum}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-[11px]">
              {passed ? "Cleared" : current ? "Next" : "—"}
            </span>
          </div>
        );
      })}
      {showClimb ? (
        <button
          type="button"
          onClick={() => !climbDisabled && !climbLoading && onClimb?.()}
          disabled={climbDisabled || climbLoading}
          className={`mt-1 min-h-[48px] w-full shrink-0 rounded-lg border px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide sm:mt-1.5 sm:text-sm ${
            climbDisabled || climbLoading
              ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
              : "border-amber-400/45 bg-amber-950/40 text-amber-100 active:bg-amber-900/45"
          }`}
        >
          {climbLoading ? "CLIMBING…" : "CLIMB STEP"}
        </button>
      ) : null}
    </div>
  );
}
