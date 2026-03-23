import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count, panelTone, variant = "default" }) {
  const extra = panelTone?.sectionCountBadge ? ` ${panelTone.sectionCountBadge}` : "";
  if (!count) return null;

  const tone =
    variant === "claim"
      ? "bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
      : "bg-cyan-400 text-slate-950";

  return (
    <span className={`inline-flex min-h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${tone}${extra}`}>
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
    <div className="flex flex-col gap-2.5">
      {/* A) Action now — daily missions */}
      <section aria-label="Daily missions">
        <div
          className={`rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${missionsCardClass} ${
            missionsAvailableCount > 0 ? "shadow-[0_0_20px_rgba(251,191,36,0.06)]" : ""
          }`}
        >
          <ExpandablePanelSectionHeader
            panelKey="ops-missions"
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
            overviewTapRow
            subtlePill={missionsAvailableCount === 0}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-[15px] font-extrabold tracking-tight text-white sm:text-lg">
                Daily Missions
              </div>
              <SectionAvailabilityBadge
                count={missionsAvailableCount}
                panelTone={panelTone}
                variant={missionsAvailableCount > 0 ? "claim" : "default"}
              />
            </div>
            {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
            {openInnerPanel !== "ops-missions" ? (
              <div
                className={`mt-0.5 line-clamp-2 text-[10px] leading-snug sm:text-xs${hintRow} ${
                  missionsAvailableCount > 0 ? "text-amber-100/78" : "text-white/48 sm:text-white/52"
                }`}
              >
                {missionsHintText}
              </div>
            ) : null}
          </ExpandablePanelSectionHeader>

          {openInnerPanel === "ops-missions" ? (
            <div className="mt-2">{dailyMissionsContent}</div>
          ) : null}
        </div>
      </section>

      {/* B) Operating console — ship, expedition, blueprint, utilities */}
      <section aria-label="Operations console">
        <div className={`rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${opsCardClass}`}>
          <ExpandablePanelSectionHeader
            panelKey="ops-console"
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
            overviewTapRow
            subtlePill={opsAvailableCount === 0}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="text-[15px] font-bold text-white/95 sm:text-lg">Operations Console</div>
              <SectionAvailabilityBadge count={opsAvailableCount} panelTone={panelTone} />
            </div>
            {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
            {openInnerPanel !== "ops-console" ? (
              <div
                className={`mt-0.5 line-clamp-2 text-[10px] leading-snug sm:text-xs${hintRow} ${
                  opsAvailableCount > 0 ? "text-cyan-100/70" : "text-white/48 sm:text-white/52"
                }`}
              >
                {opsHintText}
              </div>
            ) : null}
          </ExpandablePanelSectionHeader>

          {openInnerPanel === "ops-console" ? (
            <div className="mt-2">{operationsConsoleContent}</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
