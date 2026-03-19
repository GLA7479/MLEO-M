import Link from "next/link";

function fmt(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

export function ProgressSummaryPanel({
  totalBanked,
  totalSharedSpent,
  totalExpeditions,
  totalMissionsDone,
  crewCount,
  crewRoleName,
  commanderPathName,
  systemStateLabel,
}) {
  const baseProfile =
    Number(crewCount || 0) >= 5
      ? "Developed Command"
      : Number(crewCount || 0) >= 2
      ? "Growing Outpost"
      : "Early Outpost";

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="font-semibold text-white">Totals</div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white/70">
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Shipped</div>
            <div className="mt-1 font-semibold text-white">{fmt(totalBanked)} MLEO</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Vault Spent</div>
            <div className="mt-1 font-semibold text-white">{fmt(totalSharedSpent)} MLEO</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Expeditions</div>
            <div className="mt-1 font-semibold text-white">{fmt(totalExpeditions)}</div>
          </div>
          <div>
            <div className="text-white/45 text-xs uppercase tracking-[0.16em]">Missions</div>
            <div className="mt-1 font-semibold text-white">{fmt(totalMissionsDone)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-black/20 p-3">
        <div className="font-semibold text-white">Identity Snapshot</div>
        <div className="mt-3 space-y-2 text-sm text-white/70">
          <div>
            <span className="text-white/45">Crew role:</span> {crewRoleName}
          </div>
          <div>
            <span className="text-white/45">Commander path:</span> {commanderPathName}
          </div>
          <div>
            <span className="text-white/45">System state:</span> {systemStateLabel}
          </div>
          <div>
            <span className="text-white/45">Base profile:</span> {baseProfile}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivityLogPanel({ logEntries, onResetGame }) {
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href="/mleo-miners"
          className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20"
        >
          Open Miners
        </Link>
        <Link
          href="/arcade"
          className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 hover:bg-sky-500/20"
        >
          Open Arcade
        </Link>
        <button
          onClick={onResetGame}
          className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
        >
          Reset Game
        </button>
      </div>

      <div className="space-y-2">
        {(Array.isArray(logEntries) ? logEntries : []).slice(0, 4).map((entry) => (
          <div
            key={entry?.id}
            className="rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/75"
          >
            <div>{entry?.text}</div>
            <div className="mt-1 text-xs text-white/40">
              {entry?.ts ? new Date(entry.ts).toLocaleTimeString() : ""}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function IntelPanelCards({
  progressCardClass,
  logCardClass,
  openInnerPanel,
  toggleInnerPanel,
  progressSummaryContent,
  activityLogContent,
}) {
  return (
    <>
      <div className={`rounded-3xl border p-3.5 transition ${progressCardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-white">Progress Summary</div>
            {openInnerPanel !== "intel-summary" ? (
              <div className="mt-1 text-sm text-white/60">Key progress and identity data</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("intel-summary")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "intel-summary" ? "CLOSE" : "OPEN"}
          </button>
        </div>

        {openInnerPanel === "intel-summary" ? (
          <div className="mt-3">{progressSummaryContent}</div>
        ) : null}
      </div>

      <div className={`rounded-3xl border p-3.5 transition ${logCardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-lg font-bold text-white">Activity Log</div>
            {openInnerPanel !== "intel-log" ? (
              <div className="mt-1 text-sm text-white/60">Recent events and milestones</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("intel-log")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "intel-log" ? "CLOSE" : "OPEN"}
          </button>
        </div>

        {openInnerPanel === "intel-log" ? (
          <div className="mt-3">{activityLogContent}</div>
        ) : null}
      </div>
    </>
  );
}
