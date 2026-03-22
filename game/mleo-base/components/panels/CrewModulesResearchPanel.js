function fmt(value) {
  const n = Number(value || 0);
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

function formatResourceValue(value) {
  const n = Number(value || 0);
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return `${Math.floor(n)}`;
}

function costTone(current, needed) {
  return Number(current || 0) >= Number(needed || 0) ? "text-emerald-300" : "text-rose-300";
}

function ResourceCostRow({ cost, resources }) {
  const entries = Object.entries(cost || {}).filter(([, value]) => Number(value || 0) > 0);

  return (
    <div className="mt-1.5 min-h-[34px] max-h-[34px] overflow-hidden">
      {entries.length ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-semibold leading-4">
          {entries.slice(0, 3).map(([key, value]) => (
            <span key={key} className={costTone(resources?.[key], value)}>
              {key} {formatResourceValue(value)}
            </span>
          ))}
        </div>
      ) : (
        <div className="h-[34px]" />
      )}
    </div>
  );
}

function AvailabilityBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-slate-950">
      AVAILABLE
    </span>
  );
}

/** Same cyan count style as BuildPanelCards `SectionAvailabilityBadge` */
function TabCountBadge({ count, title, onBrightTab = false }) {
  const n = Number(count || 0);
  if (!n) return null;

  return (
    <span
      title={title || ""}
      className={`inline-flex min-w-6 h-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-black ${
        onBrightTab
          ? "bg-slate-950 text-cyan-300 ring-1 ring-white/15"
          : "bg-cyan-400 text-slate-950"
      }`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}

function availabilityCardClass(isAvailable) {
  return isAvailable ? "border-cyan-400/30 bg-cyan-500/5" : "border-white/10 bg-black/20";
}

function quickTagToneClass(tone = "neutral") {
  switch (tone) {
    case "good":
      return "bg-emerald-500/10 text-emerald-200 border border-emerald-400/20";
    case "warn":
      return "bg-amber-500/10 text-amber-200 border border-amber-400/20";
    case "risk":
      return "bg-rose-500/10 text-rose-200 border border-rose-400/20";
    case "info":
      return "bg-cyan-500/10 text-cyan-200 border border-cyan-400/20";
    default:
      return "bg-white/10 text-white/75 border border-white/10";
  }
}

function QuickTags({ tags }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {tags.map((tag) => (
        <span
          key={`${tag?.label}-${tag?.tone || "neutral"}`}
          className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] ${quickTagToneClass(
            tag?.tone
          )}`}
        >
          {tag?.label}
        </span>
      ))}
    </div>
  );
}

export function CrewModulesResearchPanel({
  devTab,
  onSetDevTab,
  modulesMissionReadyCount = 0,
  researchMissionReadyCount = 0,
  modulesAvailableCount = 0,
  researchAvailableCount = 0,
  resources,
  highlightTarget,
  crewTab,
  modules,
  research,
  onHire,
  onSelectCrewRole,
  onOpenCrewRoleInfo,
  onSelectCommanderPath,
  onOpenCommanderPathInfo,
  onBuyModule,
  onOpenModuleInfo,
  onBuyResearch,
  onOpenResearchInfo,
}) {
  const crewHireAvailableCount = crewTab?.hireDisabled ? 0 : 1;

  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {[
          {
            key: "crew",
            label: "Crew",
            missionReady: 0,
            opportunityCount: crewHireAvailableCount,
            opportunityTitle: "Ready to hire a worker",
          },
          {
            key: "modules",
            label: "Modules",
            missionReady: modulesMissionReadyCount,
            opportunityCount: modulesAvailableCount,
            opportunityTitle: "Modules you can purchase now",
          },
          {
            key: "research",
            label: "Research",
            missionReady: researchMissionReadyCount,
            opportunityCount: researchAvailableCount,
            opportunityTitle: "Research you can unlock now",
          },
        ].map((tab) => {
          const active = devTab === tab.key;

          return (
            <button
              key={tab.key}
              onClick={() => onSetDevTab(tab.key)}
              className={`flex shrink-0 flex-wrap items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active ? "bg-cyan-500 text-white" : "border border-white/10 bg-white/5 text-white/70"
              }`}
            >
              <span>{tab.label}</span>
              <TabCountBadge
                count={tab.missionReady}
                title="Daily missions ready to claim"
                onBrightTab={active}
              />
              <TabCountBadge
                count={tab.opportunityCount}
                title={tab.opportunityTitle}
                onBrightTab={active}
              />
            </button>
          );
        })}
      </div>

      {devTab === "crew" ? (
        <>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold">Crew</div>
                  <div className="text-xs text-white/60">
                    {crewTab.workerCount} workers · global output bonus {crewTab.globalBonusText}%
                  </div>
                </div>
                <button
                  onClick={onHire}
                  className={`rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 ${
                    crewTab.hireDisabled ? "opacity-70" : ""
                  }`}
                  disabled={crewTab.hireDisabled}
                >
                  Hire
                </button>
              </div>

              <div className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
                Next Cost
              </div>
              <ResourceCostRow cost={crewTab.workerNextCost} resources={resources} />

              <div>
                <div className="mb-2 text-xs uppercase tracking-[0.18em] text-white/45">Crew Specialization</div>
                <div className="mb-3 text-[11px] text-white/35">
                  Profile preference: saved locally on this device for now.
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {crewTab.roles.map((role) => {
                    const active = !!role.active;

                    return (
                      <button
                        key={role.key}
                        onClick={() => onSelectCrewRole(role.key)}
                        className={`relative rounded-xl border px-3 py-2.5 text-left transition ${
                          active ? "border-cyan-400/60 bg-cyan-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                        }`}
                      >
                        <div className="absolute right-2 top-2 z-10">
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenCrewRoleInfo(role.key);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenCrewRoleInfo(role.key);
                              }
                            }}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                            aria-label={`Open info for ${role.name}`}
                            title={`Info about ${role.name}`}
                          >
                            i
                          </span>
                        </div>

                        <div className="pr-8">
                          <div className="text-sm font-semibold text-white">{role.name}</div>
                          <div className="mt-1 text-xs text-white/60">{role.desc}</div>
                          <QuickTags tags={role.quickTags} />
                          <div className="mt-2 text-[11px] font-semibold text-cyan-200/85">{role.statLine}</div>
                          <div className="mt-1 text-[11px] text-white/45">{role.hint}</div>

                          {active ? (
                            <div className="mt-2">
                              <AvailabilityBadge />
                            </div>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-sm font-semibold text-white">Commander Path</div>
            <div className="mt-1 text-xs text-white/60">
              Choose a command identity for your base. This changes specialization, not the core economy.
            </div>
            <div className="mt-2 text-[11px] text-white/35">
              Profile preference: saved locally on this device for now.
            </div>

            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {crewTab.paths.map((path) => {
                const active = !!path.active;

                return (
                  <button
                    key={path.key}
                    onClick={() => onSelectCommanderPath(path.key)}
                    className={`relative rounded-xl border px-3 py-2.5 text-left transition ${
                      active ? "border-cyan-400/60 bg-cyan-500/15" : "border-white/10 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <div className="absolute right-2 top-2 z-10">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenCommanderPathInfo(path.key);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpenCommanderPathInfo(path.key);
                          }
                        }}
                        className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                        aria-label={`Open info for ${path.name}`}
                        title={`Info about ${path.name}`}
                      >
                        i
                      </span>
                    </div>

                    <div className="pr-8">
                      <div className="text-sm font-semibold text-white">{path.name}</div>
                      <div className="mt-1 text-xs text-white/60">{path.desc}</div>
                      <QuickTags tags={path.quickTags} />
                      <div className="mt-2 text-[11px] font-semibold text-cyan-200/85">{path.statLine}</div>
                      <div className="mt-1 text-[11px] text-white/45">{path.hint}</div>

                      {active ? (
                        <div className="mt-2">
                          <AvailabilityBadge />
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      {devTab === "modules" ? (
        <div className="grid gap-2.5 xl:grid-cols-2">
          {modules.map((module) => {
            return (
              <div
                key={module.key}
                data-base-target={module.key}
                className={`relative flex h-full flex-col gap-2 rounded-2xl border p-3.5 ${availabilityCardClass(
                  module.available
                )} ${
                  highlightTarget === module.key
                    ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                    : ""
                }`}
              >
                <div className="absolute right-2.5 top-2.5 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenModuleInfo(module.key);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                    aria-label={`Open info for ${module.name}`}
                    title={`Info about ${module.name}`}
                  >
                    i
                  </button>
                </div>

                <div className="flex min-h-0 flex-1 flex-col pr-8">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{module.name}</div>
                    {module.available ? <AvailabilityBadge /> : null}
                  </div>
                  <div className="mt-1 text-xs text-white/60">{module.desc}</div>
                  <QuickTags tags={module.quickTags} />
                  <div className="mt-2 text-[11px] text-white/45">{module.helpText}</div>
                </div>

                <div className="mt-auto shrink-0 border-t border-white/10 pt-3">
                  <div className="text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Cost</div>
                  <ResourceCostRow cost={module.cost} resources={resources} />
                  <button
                    onClick={() => onBuyModule(module.key)}
                    disabled={module.owned}
                    className={`mt-3 w-full rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                      module.owned
                        ? "bg-white/10"
                        : module.canAfford
                        ? "bg-white/10"
                        : "bg-white/10 opacity-70"
                    }`}
                  >
                    {module.owned ? "Installed" : "Install"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {devTab === "research" ? (
        <div className="grid gap-2.5">
          {research.map((item) => {
            return (
              <div
                key={item.key}
                data-base-target={item.key}
                className={`relative rounded-2xl border p-3.5 ${availabilityCardClass(item.available)} ${
                  highlightTarget === item.key
                    ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                    : ""
                }`}
              >
                <div className="absolute right-2.5 top-2.5 z-10">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenResearchInfo(item.key);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                    aria-label={`Open info for ${item.name}`}
                    title={`Info about ${item.name}`}
                  >
                    i
                  </button>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="pr-8">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{item.name}</div>
                      {item.available ? <AvailabilityBadge /> : null}
                    </div>
                    <div className="mt-1 text-xs text-white/60">{item.desc}</div>
                    <QuickTags tags={item.quickTags} />
                    <div className="mt-2 text-[11px] text-white/45">{item.helpText}</div>

                    <div className="mt-2 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">Cost</div>
                    <ResourceCostRow cost={item.cost} resources={resources} />
                  </div>

                  <button
                    onClick={() => onBuyResearch(item.key)}
                    disabled={item.done || item.locked}
                    className={`shrink-0 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                      item.done || item.locked
                        ? "bg-white/10"
                        : item.canAfford
                        ? "bg-white/10"
                        : "bg-white/10 opacity-70"
                    }`}
                  >
                    {item.done ? "Done" : item.locked ? "Locked" : "Research"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

