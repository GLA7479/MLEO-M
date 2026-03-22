import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

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

export function OpsPanelCards({
  panelTone,
  opsCardClass,
  missionsCardClass,
  opsAvailableCount,
  missionsAvailableCount,
  opsHintText,
  missionsHintText,
  openInnerPanel,
  toggleInnerPanel,
  operationsConsoleContent,
  dailyMissionsContent,
}) {
  const shell = panelTone?.panelSectionShell ? ` ${panelTone.panelSectionShell}` : "";
  const hintRow = panelTone?.helperRow ? ` ${panelTone.helperRow}` : "";

  return (
    <>
      <div className={`rounded-3xl border p-3.5 transition${shell} ${opsCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="ops-console"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Operations Console</div>
            <SectionAvailabilityBadge count={opsAvailableCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "ops-console" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>{opsHintText}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "ops-console" ? (
          <div className="mt-3">{operationsConsoleContent}</div>
        ) : null}
      </div>

      <div className={`rounded-3xl border p-3.5 transition${shell} ${missionsCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="ops-missions"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Daily Missions</div>
            <SectionAvailabilityBadge count={missionsAvailableCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "ops-missions" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>{missionsHintText}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "ops-missions" ? (
          <div className="mt-3">{dailyMissionsContent}</div>
        ) : null}
      </div>
    </>
  );
}
