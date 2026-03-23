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
    <div className="grid gap-1.5 md:grid-cols-2">
      <div className={`rounded-lg border border-white/[0.09] bg-black/18 p-2 sm:p-2.5${tile}`}>
        <div className="text-[13px] font-medium text-white/92">Totals</div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[13px] text-white/68 sm:text-sm sm:text-white/72">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/38">Shipped</div>
            <div className="mt-px font-semibold text-white">{fmt(totalBanked)} MLEO</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/38">Vault Spent</div>
            <div className="mt-px font-semibold text-white">{fmt(totalSharedSpent)} MLEO</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/38">Expeditions</div>
            <div className="mt-px font-semibold text-white">{fmt(totalExpeditions)}</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/38">Missions</div>
            <div className="mt-px font-semibold text-white">{fmt(totalMissionsDone)}</div>
          </div>
        </div>
      </div>

      <div className={`rounded-lg border border-white/[0.09] bg-black/18 p-2 sm:p-2.5${tile}`}>
        <div className="text-[13px] font-medium text-white/92">Identity</div>
        <div className="mt-1.5 space-y-1 text-[12px] leading-snug text-white/62 sm:text-[13px] sm:text-white/65">
          <div className="break-words">
            <span className="text-white/40">Role:</span> {crewRoleName}
          </div>
          <div className="break-words">
            <span className="text-white/40">Path:</span> {commanderPathName}
          </div>
          <div className="break-words">
            <span className="text-white/40">State:</span> {systemStateLabel}
          </div>
          <div className="break-words">
            <span className="text-white/40">Profile:</span> {baseProfile}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ActivityLogPanel({ panelTone, logEntries, onResetGame }) {
  const tile = panelTone?.compactUtilityTile ? ` ${panelTone.compactUtilityTile}` : "";
  const visibleEntries = (Array.isArray(logEntries) ? logEntries : []).slice(0, 4);
  return (
    <>
      <div className="mb-1.5 flex flex-wrap gap-1">
        <Link
          href="/mleo-miners"
          aria-label="Open MLEO Miners"
          title="Open MLEO Miners"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-emerald-500/15 bg-emerald-500/[0.05] px-2.5 py-1 text-[11px] font-medium text-emerald-200/75 outline-none hover:bg-emerald-500/12 focus-visible:ring-2 focus-visible:ring-emerald-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
        >
          Miners
        </Link>
        <Link
          href="/arcade"
          aria-label="Open Arcade"
          title="Open Arcade"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-sky-500/15 bg-sky-500/[0.05] px-2.5 py-1 text-[11px] font-medium text-sky-200/75 outline-none hover:bg-sky-500/12 focus-visible:ring-2 focus-visible:ring-sky-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
        >
          Arcade
        </Link>
        <button
          type="button"
          onClick={onResetGame}
          aria-label="Reset local game progress"
          className="inline-flex min-h-[44px] items-center justify-center rounded-md border border-rose-500/15 bg-rose-500/[0.05] px-2.5 py-1 text-[11px] font-medium text-rose-200/75 outline-none hover:bg-rose-500/12 focus-visible:ring-2 focus-visible:ring-rose-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-xs"
        >
          Reset
        </button>
      </div>

      <div className="space-y-1">
        {visibleEntries.length === 0 ? (
          <div
            className={`rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-2 text-center text-[10px] leading-snug text-white/40 sm:text-[11px]${tile}`}
          >
            No history yet. Actions will appear here.
          </div>
        ) : null}
        {visibleEntries.map((entry) => (
          <div
            key={entry?.id}
            className={`rounded-md border border-white/[0.06] bg-black/20 px-2 py-1.5 text-[11px] leading-snug text-white/58 sm:text-[11px] sm:text-white/60${tile}`}
          >
            <div className="break-words">{entry?.text}</div>
            <div className="mt-px text-[9px] text-white/32">
              {entry?.ts ? new Date(entry.ts).toLocaleTimeString() : ""}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function IntelPanelCards({
  panelTone,
  progressCardClass,
  logCardClass,
  progressHint,
  logHint,
  openInnerPanel,
  toggleInnerPanel,
  progressSummaryContent,
  activityLogContent,
  progressAvailableCount = 0,
  logAvailableCount = 0,
}) {
  const shell = panelTone?.panelSectionShell ? ` ${panelTone.panelSectionShell}` : "";
  const hintRow = panelTone?.helperRow ? ` ${panelTone.helperRow}` : "";

  const progressHintText =
    progressHint != null && progressHint !== "" ? progressHint : "Totals & identity · open";
  const logHintText = logHint != null && logHint !== "" ? logHint : "History & links · open";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Primary — current intel snapshot */}
      <div
        data-base-inner-panel="intel-summary"
        className={
          progressCardClass
            ? `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${progressCardClass}`
            : `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="intel-summary"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          overviewTapRow
          subtlePill={progressAvailableCount === 0}
        >
          <div className="text-[15px] font-extrabold tracking-tight text-white sm:text-lg">Progress Summary</div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "intel-summary" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug sm:text-xs${hintRow} ${
                progressAvailableCount > 0 ? "text-cyan-100/70" : "text-white/48 sm:text-white/52"
              }`}
            >
              {progressHintText}
            </div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "intel-summary" ? (
          <div className="mt-2">{progressSummaryContent}</div>
        ) : null}
      </div>

      {/* Reference — log & tools */}
      <div
        data-base-inner-panel="intel-log"
        className={
          logCardClass
            ? `rounded-2xl border border-white/[0.09] p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${logCardClass}`
            : `rounded-2xl border border-white/[0.09] p-2 transition sm:rounded-3xl sm:p-2.5${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="intel-log"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          overviewTapRow
          subtlePill
        >
          <div className="text-[15px] font-semibold tracking-tight text-white/82 sm:text-base">Activity Log</div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "intel-log" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/42 sm:text-xs sm:text-white/46${hintRow}`}
            >
              {logHintText}
            </div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "intel-log" ? (
          <div className="mt-2">{activityLogContent}</div>
        ) : null}
      </div>
    </div>
  );
}
