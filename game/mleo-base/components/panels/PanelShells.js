export function DesktopPanelSection({ resourceBar, children }) {
  return (
    <div className="space-y-3">
      {resourceBar}
      {children}
    </div>
  );
}

export function MobilePanelSection({ resourceBar, children }) {
  return (
    <div className="space-y-3">
      {resourceBar}
      {children}
    </div>
  );
}

export function MobilePanelOverlayShell({ title, bankedBadge, onClose, scrollRef, children }) {
  return (
    <div className="fixed inset-0 z-[115] bg-black/55 backdrop-blur-sm sm:hidden">
      <div className="absolute inset-x-0 bottom-0 top-[84px] rounded-t-[28px] border border-white/10 bg-[#0b1526] shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-white">{title}</div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {bankedBadge}
            <button
              onClick={onClose}
              className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-sm font-bold text-white/90 hover:bg-white/10"
            >
              Close
            </button>
          </div>
        </div>

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

  return (
    <div className={`mb-4 rounded-2xl border border-cyan-400/40 bg-cyan-400/10 p-3${shell}`}>
      <div className="mb-2 text-sm font-semibold text-cyan-200">Ready now</div>
      <div className="space-y-2">
        {readyCounts.missions > 0 ? (
          <button
            onClick={onOpenMissions}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
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
            onClick={onOpenContracts}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
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
            onClick={onOpenOpsConsole}
            className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left hover:bg-white/10"
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
