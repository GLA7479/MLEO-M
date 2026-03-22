import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count }) {
  if (!count) return null;

  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

export function OpsPanelCards({
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
  return (
    <>
      <div className={`rounded-3xl border p-3.5 transition ${opsCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="ops-console"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Operations Console</div>
            <SectionAvailabilityBadge count={opsAvailableCount} />
          </div>
          {openInnerPanel !== "ops-console" ? (
            <div className="mt-1 text-sm text-white/60">{opsHintText}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "ops-console" ? (
          <div className="mt-3">{operationsConsoleContent}</div>
        ) : null}
      </div>

      <div className={`rounded-3xl border p-3.5 transition ${missionsCardClass}`}>
        <ExpandablePanelSectionHeader
          panelKey="ops-missions"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Daily Missions</div>
            <SectionAvailabilityBadge count={missionsAvailableCount} />
          </div>

          {openInnerPanel !== "ops-missions" ? (
            <div className="mt-1 text-sm text-white/60">{missionsHintText}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "ops-missions" ? (
          <div className="mt-3">{dailyMissionsContent}</div>
        ) : null}
      </div>
    </>
  );
}
