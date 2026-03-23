import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count, panelTone }) {
  const extra = panelTone?.sectionCountBadge ? ` ${panelTone.sectionCountBadge}` : "";
  const n = Number(count || 0);
  if (!n) return null;
  const label = n > 99 ? "99+" : String(n);

  return (
    <span
      title={n > 99 ? `${n} available` : undefined}
      className={`inline-flex min-h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-cyan-400 px-1.5 text-[10px] font-black tabular-nums text-slate-950${extra}`}
    >
      {label}
    </span>
  );
}

export function BuildPanelCards({
  panelTone,
  developmentCardClass,
  structuresCardClass,
  supportCardClass,
  developmentCount,
  structuresCount,
  supportCount,
  developmentHint,
  structuresHint,
  supportHint,
  openInnerPanel,
  toggleInnerPanel,
  crewModulesResearchContent,
  baseStructuresContent,
  buildSupportSystemsContent,
}) {
  const shell = panelTone?.panelSectionShell ? ` ${panelTone.panelSectionShell}` : "";
  const hintRow = panelTone?.helperRow ? ` ${panelTone.helperRow}` : "";

  return (
    <div className="flex flex-col gap-2.5">
      {/* 1) Primary build loop — base structures first */}
      <div
        data-base-inner-panel="build-structures"
        className={
          structuresCardClass
            ? `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${structuresCardClass}`
            : `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-structures"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          overviewTapRow
          subtlePill={structuresCount === 0}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="min-w-0 text-[15px] font-extrabold tracking-tight text-white sm:text-lg">Base Structures</div>
            <SectionAvailabilityBadge count={structuresCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-structures" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug sm:text-xs${hintRow} ${
                structuresCount > 0 ? "text-cyan-100/70" : "text-white/48 sm:text-white/52"
              }`}
            >
              {structuresHint}
            </div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-structures" ? (
          <div className="mt-2">{baseStructuresContent}</div>
        ) : null}
      </div>

      {/* 2) Strategic upgrades — crew modules & research */}
      <div
        data-base-inner-panel="build-development"
        className={
          developmentCardClass
            ? `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${developmentCardClass}`
            : `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-development"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          overviewTapRow
          subtlePill={developmentCount === 0}
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="min-w-0 text-[15px] font-bold tracking-tight text-white/95 sm:text-lg">Development</div>
            <SectionAvailabilityBadge count={developmentCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-development" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug sm:text-xs${hintRow} ${
                developmentCount > 0 ? "text-cyan-100/65" : "text-white/48 sm:text-white/52"
              }`}
            >
              {developmentHint}
            </div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-development" ? (
          <div className="mt-2">{crewModulesResearchContent}</div>
        ) : null}
      </div>

      {/* 3) Supporting planning / tools — quieter */}
      <div
        data-base-inner-panel="build-support"
        className={
          supportCardClass
            ? `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell} ${supportCardClass}`
            : `rounded-2xl border p-2 transition sm:rounded-3xl sm:p-2.5${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-support"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          overviewTapRow
          subtlePill
        >
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <div className="min-w-0 text-[15px] font-semibold tracking-tight text-white/82 sm:text-base">Support Systems</div>
            <SectionAvailabilityBadge count={supportCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-support" ? (
            <div
              className={`mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/42 sm:text-xs sm:text-white/46${hintRow}`}
            >
              {supportHint}
            </div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-support" ? (
          <div className="mt-2">{buildSupportSystemsContent}</div>
        ) : null}
      </div>
    </div>
  );
}
