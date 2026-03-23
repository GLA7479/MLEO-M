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
      <div className={`rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3${tile}`}>
        <div className="text-sm font-semibold text-white">Totals</div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-white/70 sm:gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Shipped</div>
            <div className="mt-0.5 font-semibold text-white">{fmt(totalBanked)} MLEO</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Vault Spent</div>
            <div className="mt-0.5 font-semibold text-white">{fmt(totalSharedSpent)} MLEO</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Expeditions</div>
            <div className="mt-0.5 font-semibold text-white">{fmt(totalExpeditions)}</div>
          </div>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Missions</div>
            <div className="mt-0.5 font-semibold text-white">{fmt(totalMissionsDone)}</div>
          </div>
        </div>
      </div>

      <div className={`rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3${tile}`}>
        <div className="text-sm font-semibold text-white">Identity Snapshot</div>
        <div className="mt-2 space-y-1.5 text-[13px] text-white/68 sm:text-sm sm:text-white/70">
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
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Link
          href="/mleo-miners"
          className="rounded-lg border border-emerald-500/20 bg-emerald-500/[0.07] px-3 py-1.5 text-xs font-semibold text-emerald-200/90 hover:bg-emerald-500/15 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm"
        >
          Open Miners
        </Link>
        <Link
          href="/arcade"
          className="rounded-lg border border-sky-500/20 bg-sky-500/[0.07] px-3 py-1.5 text-xs font-semibold text-sky-200/90 hover:bg-sky-500/15 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm"
        >
          Open Arcade
        </Link>
        <button
          type="button"
          onClick={onResetGame}
          className="rounded-lg border border-rose-500/20 bg-rose-500/[0.07] px-3 py-1.5 text-xs font-semibold text-rose-200/90 hover:bg-rose-500/15 sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm"
        >
          Reset Game
        </button>
      </div>

      <div className="space-y-1.5">
        {(Array.isArray(logEntries) ? logEntries : []).slice(0, 4).map((entry) => (
          <div
            key={entry?.id}
            className={`rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[11px] text-white/68 sm:px-3 sm:py-2 sm:text-xs${tile}`}
          >
            <div>{entry?.text}</div>
            <div className="mt-0.5 text-[10px] text-white/38">
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
    progressHint != null && progressHint !== ""
      ? progressHint
      : "Key progress and identity — open to view";
  const logHintText =
    logHint != null && logHint !== "" ? logHint : "Recent events and external links — open to view";

  return (
    <div className="flex flex-col gap-2.5">
      {/* Primary — current intel snapshot */}
      <div
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
                progressAvailableCount > 0 ? "text-cyan-100/68" : "text-white/48 sm:text-white/52"
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

      {/* Tertiary — log, links, reference */}
      <div
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
          <div className="text-[15px] font-semibold tracking-tight text-white/88 sm:text-base">Activity Log</div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "intel-log" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/44 sm:text-[11px] sm:text-white/48${hintRow}`}
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
