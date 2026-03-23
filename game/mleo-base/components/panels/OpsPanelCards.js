import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count, panelTone, variant = "default" }) {
  const extra = panelTone?.sectionCountBadge ? ` ${panelTone.sectionCountBadge}` : "";
  const n = Number(count || 0);
  if (!n) return null;
  const label = n > 99 ? "99+" : String(n);

  const tone =
    variant === "claim"
      ? "bg-amber-400 text-slate-950 shadow-[0_0_10px_rgba(251,191,36,0.25)]"
      : "bg-cyan-400 text-slate-950";

  return (
    <span
      title={n > 99 ? `${n} available` : undefined}
      className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-black tabular-nums ${tone}${extra}`}
    >
      {label}
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
  missionsPanelEmpty = false,
  opsConsoleEmpty = false,
}) {
  const shell = panelTone?.panelSectionShell ? ` ${panelTone.panelSectionShell}` : "";
  const hintRow = panelTone?.helperRow ? ` ${panelTone.helperRow}` : "";

  return (
    <div className="flex flex-col gap-2.5">
      {/* A) Action now — daily missions */}
      <section aria-label="Daily missions">
        <div
          data-base-inner-panel="ops-missions"
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
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div className="min-w-0 text-[15px] font-extrabold tracking-tight text-white sm:text-lg">
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
            <div className="mt-2">
              {dailyMissionsContent}
              {missionsPanelEmpty ? (
                <div className="mt-2 rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-2 text-center text-[10px] leading-snug text-white/40 sm:text-[11px]">
                  No mission entries are available in this view yet.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {/* B) Operating console — ship, expedition, blueprint, utilities */}
      <section aria-label="Operations console">
        <div
          data-base-inner-panel="ops-console"
          className={`rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${opsCardClass}`}
        >
          <ExpandablePanelSectionHeader
            panelKey="ops-console"
            openInnerPanel={openInnerPanel}
            toggleInnerPanel={toggleInnerPanel}
            overviewTapRow
            subtlePill={opsAvailableCount === 0}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              <div className="min-w-0 text-[15px] font-bold text-white/95 sm:text-lg">Operations Console</div>
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
            <div className="mt-2">
              {operationsConsoleContent}
              {opsConsoleEmpty ? (
                <div className="mt-2 rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-2 text-center text-[10px] leading-snug text-white/40 sm:text-[11px]">
                  No operations are ready in this view right now.
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
