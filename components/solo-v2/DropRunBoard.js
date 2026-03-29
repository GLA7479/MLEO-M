import { DROP_RUN_DRIFT_ROWS, DROP_RUN_GATES } from "../../lib/solo-v2/dropRunConfig";
import DropRunFieldCanvas from "./DropRunFieldCanvas";

/**
 * Inner playfield only — peg field + drop canvas. Ladder shell (notice, status, strip, payout) lives on the page.
 */
export default function DropRunBoard({ dropPlayback = null, onDropAnimationComplete }) {
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

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col">
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:min-h-[min(52vh,28rem)]">
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
