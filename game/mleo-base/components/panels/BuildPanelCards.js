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
    <>
      <div
        className={
          developmentCardClass
            ? `rounded-3xl border p-3.5 transition${shell} ${developmentCardClass}`
            : `rounded-3xl border p-3.5 transition${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-development"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Development</div>
            <SectionAvailabilityBadge count={developmentCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-development" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>{developmentHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-development" ? (
          <div className="mt-3">{crewModulesResearchContent}</div>
        ) : null}
      </div>

      <div
        className={
          structuresCardClass
            ? `rounded-3xl border p-3.5 transition${shell} ${structuresCardClass}`
            : `rounded-3xl border p-3.5 transition${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-structures"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Base Structures</div>
            <SectionAvailabilityBadge count={structuresCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-structures" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>{structuresHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-structures" ? (
          <div className="mt-3">{baseStructuresContent}</div>
        ) : null}
      </div>

      <div
        className={
          supportCardClass
            ? `rounded-3xl border p-3.5 transition${shell} ${supportCardClass}`
            : `rounded-3xl border p-3.5 transition${shell}`
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-support"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Support Systems</div>
            <SectionAvailabilityBadge count={supportCount} panelTone={panelTone} />
          </div>
          {panelTone?.sectionBar ? <div className={panelTone.sectionBar} aria-hidden /> : null}
          {openInnerPanel !== "build-support" ? (
            <div className={`mt-1 text-sm text-white/60${hintRow}`}>{supportHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-support" ? (
          <div className="mt-3">{buildSupportSystemsContent}</div>
        ) : null}
      </div>
    </>
  );
}
