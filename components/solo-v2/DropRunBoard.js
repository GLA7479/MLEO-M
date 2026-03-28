import { DROP_RUN_DRIFT_ROWS } from "../../lib/solo-v2/dropRunConfig";
import DropRunFieldCanvas from "./DropRunFieldCanvas";

/**
 * Solo V2 Drop Run — compact header + minimal release; peg field + payout live in canvas (dominant height).
 */
export default function DropRunBoard({
  sessionNotice = "",
  readState = "",
  pickingUi = false,
  resolvingUi = false,
  dropPlayback = null,
  onDropAnimationComplete,
}) {
  const pathPositions = Array.isArray(dropPlayback?.pathPositions) ? dropPlayback.pathPositions : [];
  const runKey =
    dropPlayback?.sessionId != null && dropPlayback?.animEpoch != null
      ? `${dropPlayback.sessionId}:${dropPlayback.animEpoch}`
      : "";

  let headline = "Drop · Bottom box sets payout";
  if (pickingUi) headline = "Locking drop…";
  else if (resolvingUi) headline = "Drawing path…";
  else if (dropPlayback) headline = "Dropping…";
  else if (readState === "gate_submitted") headline = "Starting drop…";

  const finalBay = dropPlayback?.finalBay != null ? Math.floor(Number(dropPlayback.finalBay)) : null;
  const pathOk = pathPositions.length === DROP_RUN_DRIFT_ROWS + 1;
  const boardActive = Boolean(dropPlayback && pathOk);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      <div className="flex h-5 shrink-0 items-center justify-center px-2 sm:h-5">
        <p className="truncate text-center text-[9px] text-emerald-200/70 sm:text-[10px]">
          {sessionNotice || "\u00a0"}
        </p>
      </div>

      <div className="shrink-0 px-2 pb-0.5 pt-0 text-center sm:px-3">
        <p className="text-[10px] font-semibold leading-tight text-zinc-100 sm:text-[11px]">{headline}</p>
      </div>

      <div className="flex shrink-0 justify-center px-2 pb-0.5 pt-0">
        <div
          className="inline-flex h-[1.125rem] min-w-[3.25rem] items-center justify-center rounded border border-zinc-700/35 bg-zinc-950/60 px-1.5 sm:h-5 sm:min-w-[3.5rem]"
          aria-hidden
        >
          <span className="text-[6px] font-medium uppercase tracking-[0.1em] text-zinc-500 sm:text-[7px]">
            Release
          </span>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col px-1.5 pb-1.5 pt-0 sm:px-2 sm:pb-2">
        <DropRunFieldCanvas
          pathPositions={pathPositions}
          finalBay={finalBay}
          boardActive={boardActive}
          runKey={runKey}
          onAnimationComplete={onDropAnimationComplete}
        />
      </div>
    </div>
  );
}
