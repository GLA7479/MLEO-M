/**
 * Step ladder — full-width playfield stack (spacing matches `GoldRushDiggerBoard` rows).
 * When `reserveClimbSlot` is true (active non-terminal run), the climb band keeps fixed height so show/hide does not jump layout.
 */
export default function SoloLadderBoard({
  stepTotal = 6,
  successCount = 0,
  terminal = false,
  terminalKind = null,
  failedAtStep = null,
  reserveClimbSlot = false,
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

  const stepBase =
    "flex w-full min-h-[2.25rem] items-center justify-between rounded-lg border px-2.5 py-1.5 text-left text-[11px] font-bold sm:min-h-[2.5rem] sm:px-3 sm:text-xs lg:min-h-[2.75rem] lg:px-4 lg:text-sm";

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-1.5 sm:gap-2 lg:gap-1"
      aria-label="Ladder steps"
    >
      {Array.from({ length: total }, (_, i) => {
        const stepNum = i + 1;
        const passed = i < done;
        const current = !terminal && i === done;
        let cls = `${stepBase} border-white/10 bg-zinc-900/40 text-zinc-500`;
        if (passed) {
          cls = `${stepBase} border-emerald-500/35 bg-emerald-950/30 text-emerald-100`;
        } else if (current) {
          cls = `${stepBase} border-amber-400/45 bg-amber-950/35 text-amber-100 ring-1 ring-amber-400/25`;
        }
        if (bust && i === bustRowIndex) {
          cls = `${stepBase} border-red-500/45 bg-red-950/35 text-red-100`;
        }
        if (full && passed) {
          cls = `${stepBase} border-amber-400/40 bg-amber-950/25 text-amber-50`;
        }

        return (
          <div key={i} className={cls}>
            <span className="tabular-nums">Step {stepNum}</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80 sm:text-[11px] lg:text-xs">
              {passed ? "Cleared" : current ? "Next" : "—"}
            </span>
          </div>
        );
      })}

      {reserveClimbSlot ? (
        <div className="min-h-[48px] w-full shrink-0 sm:min-h-[48px]">
          {showClimb ? (
            <button
              type="button"
              onClick={() => !climbDisabled && !climbLoading && onClimb?.()}
              disabled={climbDisabled || climbLoading}
              className={`min-h-[48px] w-full rounded-lg border px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide sm:text-sm ${
                climbDisabled || climbLoading
                  ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
                  : "border-amber-400/45 bg-amber-950/40 text-amber-100 active:bg-amber-900/45"
              }`}
            >
              {climbLoading ? "CLIMBING…" : "CLIMB STEP"}
            </button>
          ) : (
            <div className="pointer-events-none min-h-[48px] w-full" aria-hidden />
          )}
        </div>
      ) : null}
    </div>
  );
}
