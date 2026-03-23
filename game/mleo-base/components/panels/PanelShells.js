import { BasePanelOverlayCloseHeaderRow } from "./BasePanelOverlayCloseHeaderRow";

/** Resource rail + tab body stack (desktop and mobile use the same layout). */
function BasePanelScrollSection({ resourceBar, children }) {
  return (
    <div className="space-y-3">
      {resourceBar}
      {children}
    </div>
  );
}

export const DesktopPanelSection = BasePanelScrollSection;
export const MobilePanelSection = BasePanelScrollSection;

export function MobilePanelOverlayShell({ title, bankedBadge, onClose, scrollRef, children }) {
  return (
    <div className="fixed inset-0 z-[115] bg-black/55 backdrop-blur-sm sm:hidden">
      <div className="absolute inset-x-0 bottom-0 top-[84px] rounded-t-[28px] border border-white/10 bg-[#0b1526] shadow-2xl">
        <BasePanelOverlayCloseHeaderRow
          variant="mobile"
          onClose={onClose}
          aria-label={title ? `Close ${title} panel` : "Close panel"}
          bankedBadge={bankedBadge}
        >
          <div className="text-lg font-bold text-white">{title}</div>
        </BasePanelOverlayCloseHeaderRow>

        <div ref={scrollRef} className="h-[calc(100%-73px)] overflow-y-auto px-4 py-4 pb-28">
          {children}
        </div>
      </div>
    </div>
  );
}

export function ReadyNowSummaryBlock({
  panelTone,
  readyCounts,
  showExpeditions,
  onOpenMissions,
  onOpenContracts,
  onOpenOpsConsole,
}) {
  if (!readyCounts?.total) return null;

  const shell = panelTone?.readyNowShell ? ` ${panelTone.readyNowShell}` : "";
  const readyNowRowButtonClass =
    "w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left outline-none hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0b1526]";

  return (
    <div className={`mb-4 rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-3${shell}`}>
      <div className="mb-2 text-sm font-semibold text-cyan-200">Ready now</div>
      <div className="space-y-2">
        {readyCounts.missions > 0 ? (
          <button
            type="button"
            onClick={onOpenMissions}
            className={readyNowRowButtonClass}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">
                  {readyCounts.missions} Mission reward{readyCounts.missions > 1 ? "s" : ""} ready
                </div>
                <div className="mt-1 text-xs text-white/60">Open Daily Missions to claim it.</div>
              </div>
              <span className="text-cyan-300 text-lg font-bold">›</span>
            </div>
          </button>
        ) : null}

        {readyCounts.contracts > 0 ? (
          <button
            type="button"
            onClick={onOpenContracts}
            className={readyNowRowButtonClass}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">
                  {readyCounts.contracts} Contract{readyCounts.contracts > 1 ? "s" : ""} ready
                </div>
                <div className="mt-1 text-xs text-white/60">Open Live Contracts to claim.</div>
              </div>
              <span className="text-cyan-300 text-lg font-bold">›</span>
            </div>
          </button>
        ) : null}

        {showExpeditions && readyCounts.expedition > 0 ? (
          <button
            type="button"
            onClick={onOpenOpsConsole}
            className={readyNowRowButtonClass}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-white">Start expedition</div>
                <div className="mt-1 text-xs text-white/60">
                  You can launch an expedition now from Operations Console.
                </div>
              </div>
              <span className="text-cyan-300 text-lg font-bold">›</span>
            </div>
          </button>
        ) : null}
      </div>
    </div>
  );
}
