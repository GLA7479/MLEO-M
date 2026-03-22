import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count, panelTone }) {
  const extra = panelTone?.sectionCountBadge ? ` ${panelTone.sectionCountBadge}` : "";
  if (!count) return null;

  return (
    <span
      className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-cyan-400 px-1.5 text-[10px] font-black text-slate-950${extra}`}
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
    <div className="flex flex-col gap-3">
      {/* A) Action now — daily missions */}
      <section aria-label="Daily missions">
        <div className={`rounded-2xl border p-2.5 transition sm:rounded-3xl sm:p-3${shell} ${missionsCardClass}`}>
          <ExpandablePanelSectionHeader
            panelKey="ops-missions"
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
            overviewTapRow
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-[15px] font-extrabold tracking-tight text-white sm:text-lg">
                Daily Missions
              </div>
              <SectionAvailabilityBadge count={missionsAvailableCount} panelTone={panelTone} />
            </div>
            {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
            {openInnerPanel !== "ops-missions" ? (
              <div
                className={`mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/55 sm:text-xs sm:text-white/60${hintRow}`}
              >
                {missionsHintText}
              </div>
            ) : null}
          </ExpandablePanelSectionHeader>

          {openInnerPanel === "ops-missions" ? (
            <div className="mt-2.5">{dailyMissionsContent}</div>
          ) : null}
        </div>
      </section>

      {/* B) Operating console — ship, expedition, blueprint, utilities */}
      <section aria-label="Operations console">
        <div className={`rounded-2xl border p-2.5 transition sm:rounded-3xl sm:p-3${shell} ${opsCardClass}`}>
          <ExpandablePanelSectionHeader
            panelKey="ops-console"
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
            overviewTapRow
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-[15px] font-bold text-white/90 sm:text-lg">Operations Console</div>
              <SectionAvailabilityBadge count={opsAvailableCount} panelTone={panelTone} />
            </div>
            {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
            {openInnerPanel !== "ops-console" ? (
              <div
                className={`mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/48 sm:text-xs sm:text-white/52${hintRow}`}
              >
                {opsHintText}
              </div>
            ) : null}
          </ExpandablePanelSectionHeader>

          {openInnerPanel === "ops-console" ? (
            <div className="mt-2.5">{operationsConsoleContent}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
