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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-white">Development</div>
              <SectionAvailabilityBadge count={developmentCount} />
            </div>
            {openInnerPanel !== "build-development" ? (
              <div className="mt-1 text-sm text-white/60">{developmentHint}</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("build-development")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "build-development" ? "CLOSE" : "OPEN"}
          </button>
        </div>

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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-white">Base Structures</div>
              <SectionAvailabilityBadge count={structuresCount} />
            </div>

            {openInnerPanel !== "build-structures" ? (
              <div className="mt-1 text-sm text-white/60">
                {structuresHint}
              </div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("build-structures")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "build-structures" ? "CLOSE" : "OPEN"}
          </button>
        </div>

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
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-lg font-bold text-white">Support Systems</div>
              <SectionAvailabilityBadge count={supportCount} />
            </div>

            {openInnerPanel !== "build-support" ? (
              <div className="mt-1 text-sm text-white/60">{supportHint}</div>
            ) : null}
          </div>

          <button
            onClick={() => toggleInnerPanel("build-support")}
            className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "build-support" ? "CLOSE" : "OPEN"}
          </button>
        </div>

        {openInnerPanel === "build-support" ? (
          <div className="mt-3">{buildSupportSystemsContent}</div>
        ) : null}
      </div>
    </>
  );
}

