import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";

function SectionAvailabilityBadge({ count }) {
  if (!count) return null;

  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

export function BuildPanelCards({
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
  return (
    <>
      <div
        className={
          developmentCardClass
            ? `rounded-3xl border p-3.5 transition ${developmentCardClass}`
            : "rounded-3xl border p-3.5 transition"
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-development"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Development</div>
            <SectionAvailabilityBadge count={developmentCount} />
          </div>
          {openInnerPanel !== "build-development" ? (
            <div className="mt-1 text-sm text-white/60">{developmentHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-development" ? (
          <div className="mt-3">{crewModulesResearchContent}</div>
        ) : null}
      </div>

      <div
        className={
          structuresCardClass
            ? `rounded-3xl border p-3.5 transition ${structuresCardClass}`
            : "rounded-3xl border p-3.5 transition"
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-structures"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Base Structures</div>
            <SectionAvailabilityBadge count={structuresCount} />
          </div>

          {openInnerPanel !== "build-structures" ? (
            <div className="mt-1 text-sm text-white/60">{structuresHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-structures" ? (
          <div className="mt-3">{baseStructuresContent}</div>
        ) : null}
      </div>

      <div
        className={
          supportCardClass
            ? `rounded-3xl border p-3.5 transition ${supportCardClass}`
            : "rounded-3xl border p-3.5 transition"
        }
      >
        <ExpandablePanelSectionHeader
          panelKey="build-support"
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Support Systems</div>
            <SectionAvailabilityBadge count={supportCount} />
          </div>

          {openInnerPanel !== "build-support" ? (
            <div className="mt-1 text-sm text-white/60">{supportHint}</div>
          ) : null}
        </ExpandablePanelSectionHeader>

        {openInnerPanel === "build-support" ? (
          <div className="mt-3">{buildSupportSystemsContent}</div>
        ) : null}
      </div>
    </>
  );
}
