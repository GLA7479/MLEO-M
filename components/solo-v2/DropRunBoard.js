import { DROP_RUN_DRIFT_ROWS, DROP_RUN_GATES } from "../../lib/solo-v2/dropRunConfig";
import DropRunFieldCanvas from "./DropRunFieldCanvas";

/**
 * Drop Run — Quick Flip mirror shell + peg field canvas. Mobile stack; `lg+` widens insets (separate desktop target).
 */
export default function DropRunBoard({
  sessionNotice = "",
  pickingUi = false,
  resolvingUi = false,
  statusTop = "—",
  statusSub = "",
  hintLine = "\u00a0",
  stepTotal = 2,
  currentStepIndex = 0,
  stepsComplete = 0,
  stepLabels = ["Session", "Drop"],
  payoutBandLabel = "Max win",
  payoutBandValue = "—",
  payoutCaption = "",
  dropPlayback = null,
  onDropAnimationComplete,
}) {
  const pathPositions = Array.isArray(dropPlayback?.pathPositions) ? dropPlayback.pathPositions : [];
  const runKey =
    dropPlayback?.sessionId != null && dropPlayback?.animEpoch != null
      ? `${dropPlayback.sessionId}:${dropPlayback.animEpoch}`
      : "";

  const finalBayRaw = dropPlayback?.finalBay != null ? Math.floor(Number(dropPlayback.finalBay)) : NaN;
  const finalBayOk =
    Number.isFinite(finalBayRaw) && finalBayRaw >= 1 && finalBayRaw <= DROP_RUN_GATES;
  const finalBay = finalBayOk ? finalBayRaw : null;
  const pathOk = pathPositions.length === DROP_RUN_DRIFT_ROWS + 1;
  const boardActive = Boolean(dropPlayback && pathOk && finalBayOk);

  const showSession = Boolean(sessionNotice);
  const total = Math.max(1, Math.floor(Number(stepTotal) || 2));
  const cleared = Math.max(0, Math.min(total, Math.floor(Number(stepsComplete) || 0)));
  const cur = Math.max(0, Math.min(total - 1, Math.floor(Number(currentStepIndex) || 0)));
  const hintVisible = String(hintLine || "").trim().length > 0 && hintLine !== "\u00a0";

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden rounded-2xl border-2 border-violet-700/45 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
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
                key={`dr-step-${i}`}
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

      <div className="flex min-h-0 flex-1 flex-col px-2 pb-2 pt-1 sm:px-3 lg:flex-row lg:gap-5 lg:px-8 lg:pb-3 lg:pt-2">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-[min(52vh,28rem)]">
          <div className="flex shrink-0 justify-center px-0 pb-1 pt-0 lg:justify-start lg:pb-2">
            <div
              className="inline-flex h-[1.125rem] min-w-[3.25rem] items-center justify-center rounded border border-zinc-700/35 bg-zinc-950/60 px-1.5 sm:h-5 sm:min-w-[3.5rem]"
              aria-hidden
            >
              <span className="text-[6px] font-medium uppercase tracking-[0.1em] text-zinc-500 sm:text-[7px]">
                Release
              </span>
            </div>
          </div>
          <DropRunFieldCanvas
            pathPositions={pathPositions}
            finalBay={finalBay}
            boardActive={boardActive}
            runKey={runKey}
            onAnimationComplete={onDropAnimationComplete}
          />
        </div>

        <div className="mt-2 flex min-h-[2.25rem] shrink-0 items-start justify-center px-0.5 text-center text-[9px] font-medium leading-snug text-zinc-500 sm:min-h-[2.5rem] sm:text-[10px] lg:mt-0 lg:w-[min(100%,14rem)] lg:items-start lg:justify-start lg:self-stretch lg:border-l lg:border-zinc-700/40 lg:pl-4 lg:pt-1 lg:text-left">
          <p className="line-clamp-4 w-full lg:line-clamp-none">
            {hintVisible ? hintLine : pickingUi || resolvingUi ? "\u00a0" : "Outer boxes ×0 — center pays best."}
          </p>
        </div>
      </div>
    </div>
  );
}
