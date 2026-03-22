import Link from "next/link";

import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function fmt(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

export function ProgressSummaryPanel({
  panelTone,
  totalBanked,
  totalSharedSpent,
  totalExpeditions,
  totalMissionsDone,
  crewCount,
  crewRoleName,
  commanderPathName,
  systemStateLabel,
}) {
  const tile = panelTone?.compactUtilityTile ? ` ${panelTone.compactUtilityTile}` : "";
  const baseProfile =
    Number(crewCount || 0) >= 5
      ? "Developed Command"
      : Number(crewCount || 0) >= 2
      ? "Growing Outpost"
      : "Early Outpost";

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className={`rounded-xl border border-white/10 bg-black/20 p-3${tile}`}>
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

      <div className={`rounded-xl border border-white/10 bg-black/20 p-3${tile}`}>
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

export function ActivityLogPanel({ panelTone, logEntries, onResetGame }) {
  const tile = panelTone?.compactUtilityTile ? ` ${panelTone.compactUtilityTile}` : "";
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
            className={`rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/75${tile}`}
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

function SectionAvailabilityBadge({ count, panelTone }) {
  const extra = panelTone?.sectionCountBadge ? ` ${panelTone.sectionCountBadge}` : "";
  if (!count) return null;

  return (
    <span
      className={`inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950${extra}`}
    >
      {count}
    </span>
  );
}

export function IntelPanelCards({
  panelTone,
  progressCardClass,
  logCardClass,
  openInnerPanel,
  toggleInnerPanel,
  progressSummaryContent,
  activityLogContent,
  progressAvailableCount = 0,
  logAvailableCount = 0,
}) {
  const shell = panelTone?.panelSectionShell ? ` ${panelTone.panelSectionShell}` : "";
  const hintRow = panelTone?.helperRow ? ` ${panelTone.helperRow}` : "";

  return (
    <>
      <div className={`rounded-3xl border p-3.5 transition${shell} ${progressCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="intel-summary"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold text-white">Progress Summary</div>
            <SectionAvailabilityBadge count={progressAvailableCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "intel-summary" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>Key progress and identity data</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "intel-summary" ? (
          <div className="mt-3">{progressSummaryContent}</div>
        ) : null}
      </div>

      <div className={`rounded-3xl border p-3.5 transition${shell} ${logCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="intel-log"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-lg font-bold text-white">Activity Log</div>
            <SectionAvailabilityBadge count={logAvailableCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "intel-log" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>Recent events and milestones</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "intel-log" ? (
          <div className="mt-3">{activityLogContent}</div>
        ) : null}
      </div>
    </>
  );
}
