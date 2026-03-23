import { useLayoutEffect, useRef, useState } from "react";

import {
  findVerticalScrollContainer,
  scrollPanelSectionTopIntoView,
} from "../../utils/scrollPanelSectionTopIntoView";
import {
  COMMAND_PROTOCOL_FAMILY_LABEL,
  COMMAND_PROTOCOL_STORED_INACTIVE_OVERVIEW,
} from "../../commandProtocols";

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
    <div className="mt-1 min-h-[28px] max-h-[28px] overflow-hidden">
      {entries.length ? (
        <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-semibold leading-tight sm:text-[11px]">
          {entries.slice(0, 3).map(([key, value]) => (
            <span key={key} className={costTone(resources?.[key], value)}>
              {key} {formatResourceValue(value)}
            </span>
          ))}
        </div>
      ) : (
        <div className="h-[28px]" />
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

function QuickTags({ tags, className = "" }) {
  if (!Array.isArray(tags) || tags.length === 0) return null;

  return (
    <div className={`mt-2 flex flex-wrap gap-1.5${className ? ` ${className}` : ""}`}>
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

/** Internal Development accordion — ids must be unique within CrewModulesResearchPanel. */
const DEV_SUB_CREW_SPEC = "dev-crew-spec";
const DEV_SUB_COMMANDER_PATH = "dev-commander-path";
const DEV_SUB_COMMAND_PROTOCOL = "dev-command-protocol";

/** Lighter than top-level Build rows; same OPEN / CLOSE language as ExpandablePanelSectionHeader. */
function DevCollapsibleSection({
  sectionId,
  openSection,
  onAccordionSelect,
  title,
  collapsedHint,
  openSubtitle,
  children,
}) {
  const open = openSection === sectionId;

  return (
    <div
      className="border-t border-white/10 pt-2 first:border-t-0 first:pt-0"
      data-base-dev-accordion={sectionId}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={() => onAccordionSelect(sectionId)}
        className="group flex min-h-[44px] w-full cursor-pointer touch-manipulation select-none items-stretch justify-between gap-2 rounded-xl px-0.5 py-1 text-left outline-none transition hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:py-1.5"
      >
        <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center pr-1">
          <div className="text-sm font-semibold text-white">{title}</div>
          {open ? (
            openSubtitle ? (
              <div className="mt-0.5 text-[10px] leading-snug text-white/42 sm:text-[11px]">{openSubtitle}</div>
            ) : null
          ) : (
            <div className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-white/48 sm:text-[11px]">{collapsedHint}</div>
          )}
        </div>
        <span className="pointer-events-none shrink-0 self-center rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-white transition group-hover:border-white/15 group-hover:bg-white/10">
          {open ? "CLOSE" : "OPEN"}
        </span>
      </button>
      {open ? <div className="mt-2">{children}</div> : null}
    </div>
  );
}

export function CrewModulesResearchPanel({
  telemetryHint = null,
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
  commandProtocolRows = null,
  commandProtocolEffectiveId = "none",
  commandProtocolStoredId = "none",
  commandProtocolCommanderLevel = 1,
  commandProtocolCanSwapToday = true,
  onSetCommandProtocol = null,
}) {
  const crewHireAvailableCount = crewTab?.hireDisabled ? 0 : 1;

  /** Accordion: at most one Development subsection open; null = all closed. */
  const [openDevSubsection, setOpenDevSubsection] = useState(null);
  const prevDevSubForScrollRef = useRef(null);

  const selectDevSubsection = (sectionId) => {
    setOpenDevSubsection((prev) => (prev === sectionId ? null : sectionId));
  };

  useLayoutEffect(() => {
    const prev = prevDevSubForScrollRef.current;
    prevDevSubForScrollRef.current = openDevSubsection;

    if (openDevSubsection == null || openDevSubsection === prev) return;

    const run = () => {
      const el = document.querySelector(
        `[data-base-dev-accordion="${CSS.escape(String(openDevSubsection))}"]`
      );
      const scrollParent = el ? findVerticalScrollContainer(el) : null;
      if (scrollParent && el) {
        scrollPanelSectionTopIntoView(scrollParent, el, { offset: 8 });
      }
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
  }, [openDevSubsection]);

  const activeRoleName = crewTab?.roles?.find((r) => r.active)?.name || "None";
  const activePathName = crewTab?.paths?.find((p) => p.active)?.name || "None";
  const effectiveProtocolName =
    commandProtocolRows?.find((r) => r.id === commandProtocolEffectiveId)?.name || "Standard Posture";
  const protocolQueued =
    commandProtocolStoredId !== commandProtocolEffectiveId && commandProtocolStoredId !== "none";

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
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
              type="button"
              onClick={() => onSetDevTab(tab.key)}
              className={`flex shrink-0 flex-wrap items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition sm:rounded-xl sm:px-3.5 sm:py-2 sm:text-sm ${
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
          <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold">Crew</div>
                  <div className="text-[11px] text-white/58 sm:text-xs">
                    {crewTab.workerCount} workers · +{crewTab.globalBonusText}% output
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onHire}
                  className={`shrink-0 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/20 sm:text-sm ${
                    crewTab.hireDisabled ? "opacity-70" : ""
                  }`}
                  disabled={crewTab.hireDisabled}
                >
                  Hire
                </button>
              </div>

              <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wider text-white/35">Next cost</div>
              <ResourceCostRow cost={crewTab.workerNextCost} resources={resources} />

              <DevCollapsibleSection
                sectionId={DEV_SUB_CREW_SPEC}
                openSection={openDevSubsection}
                onAccordionSelect={selectDevSubsection}
                title="Crew specialization"
                collapsedHint={`Active: ${activeRoleName} · open to pick role & bonuses`}
                openSubtitle="Saved on this device."
              >
                <div className="grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                  {crewTab.roles.map((role) => {
                    const active = !!role.active;

                    return (
                      <button
                        key={role.key}
                        type="button"
                        onClick={() => onSelectCrewRole(role.key)}
                        className={`relative rounded-lg border px-2.5 py-2 text-left transition sm:rounded-xl sm:px-3 sm:py-2.5 ${
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
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 outline-none transition hover:bg-cyan-500/20 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
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
              </DevCollapsibleSection>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3">
            <DevCollapsibleSection
              sectionId={DEV_SUB_COMMANDER_PATH}
              openSection={openDevSubsection}
              onAccordionSelect={selectDevSubsection}
              title="Commander Path"
              collapsedHint={`Active: ${activePathName} · open to change command identity`}
              openSubtitle="Specialization only — not core economy. Saved on device."
            >
              <div className="grid gap-1.5 lg:grid-cols-2">
                {crewTab.paths.map((path) => {
                  const active = !!path.active;

                  return (
                    <button
                      key={path.key}
                      type="button"
                      onClick={() => onSelectCommanderPath(path.key)}
                      className={`relative rounded-lg border px-2.5 py-2 text-left transition sm:rounded-xl sm:px-3 sm:py-2.5 ${
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
                          className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[12px] font-black text-cyan-200 outline-none transition hover:bg-cyan-500/20 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
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
            </DevCollapsibleSection>
          </div>

          {commandProtocolRows && onSetCommandProtocol ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-2.5 sm:p-3" data-base-target="command-protocol">
              <DevCollapsibleSection
                sectionId={DEV_SUB_COMMAND_PROTOCOL}
                openSection={openDevSubsection}
                onAccordionSelect={selectDevSubsection}
                title="Command Protocol"
                collapsedHint={`Live: ${effectiveProtocolName} · ${
                  commandProtocolCanSwapToday ? "Swap ok today" : "Swap locked (UTC)"
                }${protocolQueued ? " · queued change" : ""}`}
                openSubtitle="One live protocol · Cmdr level gates choices · 1 swap/day (UTC)."
              >
                <div
                  className={`rounded-lg px-2.5 py-1.5 ${
                    commandProtocolEffectiveId === "none"
                      ? "border border-white/10 bg-white/[0.03]"
                      : "border border-cyan-400/25 bg-cyan-500/[0.09]"
                  }`}
                >
                  <div className="text-xs text-white/55">
                    <span
                      className={`font-semibold ${
                        commandProtocolEffectiveId === "none" ? "text-white/65" : "text-cyan-100/85"
                      }`}
                    >
                      Effective:
                    </span>{" "}
                    <span
                      className={`font-semibold ${
                        commandProtocolEffectiveId === "none" ? "text-white/75" : "text-cyan-100"
                      }`}
                    >
                      {commandProtocolRows.find((r) => r.id === commandProtocolEffectiveId)?.name || "Standard Posture"}
                    </span>
                    {commandProtocolEffectiveId === "none" ? null : (
                      <span className="text-white/45"> · Cmdr Lv {commandProtocolCommanderLevel}</span>
                    )}
                  </div>
                </div>
                {commandProtocolStoredId !== commandProtocolEffectiveId && commandProtocolStoredId !== "none" ? (
                  <div className="mt-1.5 rounded-md border border-amber-400/10 bg-amber-400/[0.04] px-2 py-1 text-[11px] font-normal leading-snug text-amber-100/65">
                    {COMMAND_PROTOCOL_STORED_INACTIVE_OVERVIEW}
                  </div>
                ) : null}
                {!commandProtocolCanSwapToday ? (
                  <div className="mt-2 text-[11px] font-normal text-amber-100/60">Next swap: tomorrow (UTC).</div>
                ) : null}
                <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
                  {commandProtocolRows.map((row) => {
                  const isSel = !!row.selected;
                  const isEffectiveLive =
                    row.id === commandProtocolEffectiveId && commandProtocolEffectiveId !== "none";
                  const disableSelect =
                    row.locked ||
                    (!commandProtocolCanSwapToday && !isSel);
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => onSetCommandProtocol(row.id)}
                      disabled={disableSelect}
                      className={`rounded-xl border px-3 py-2.5 text-left transition ${
                        isEffectiveLive
                          ? "border-cyan-400/50 bg-cyan-500/[0.11] ring-1 ring-cyan-400/18"
                          : isSel
                          ? "border-white/12 border-l-[3px] border-l-cyan-400/35 bg-white/[0.04] hover:bg-white/[0.07]"
                          : "border-white/10 bg-white/5 hover:bg-white/10"
                      } ${disableSelect && !isSel ? "cursor-not-allowed opacity-50" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 text-sm font-semibold text-white">{row.name}</div>
                        {isSel ? (
                          <span
                            className={`shrink-0 rounded-full border px-2 py-0.5 text-[8px] uppercase tracking-[0.1em] ${
                              isEffectiveLive
                                ? "border-cyan-400/25 bg-cyan-500/10 font-semibold text-cyan-200/55"
                                : "border-white/14 bg-white/[0.05] font-semibold text-cyan-200/70"
                            }`}
                          >
                            Stored
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 text-[11px] leading-snug text-white/55">{row.shortDesc}</div>
                      {row.locked ? (
                        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-200/90">
                          Requires Cmdr Lv {row.minCommanderLevel}
                        </div>
                      ) : null}
                      {row.family && COMMAND_PROTOCOL_FAMILY_LABEL[row.family] ? (
                        <span className="mt-1 inline-flex max-w-full rounded border border-white/[0.07] bg-transparent px-1 py-px text-[9px] font-medium uppercase tracking-wide text-white/38">
                          {COMMAND_PROTOCOL_FAMILY_LABEL[row.family]}
                        </span>
                      ) : null}
                      {row.bestWhen ? (
                        <div className="mt-1.5 border-l border-white/15 pl-2 text-[10px] leading-relaxed text-white/38">
                          {row.bestWhen}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
                </div>
              </DevCollapsibleSection>
            </div>
          ) : null}
        </>
      ) : null}

      {devTab === "modules" ? (
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start lg:gap-x-3 lg:gap-y-2">
          {modules.map((module) => {
            return (
              <div
                key={module.key}
                data-base-target={module.key}
                className={`relative flex flex-col gap-1 rounded-xl border p-2.5 sm:rounded-2xl sm:p-3 sm:gap-1.5 lg:gap-1 lg:p-2.5 ${availabilityCardClass(
                  module.available
                )} ${
                  highlightTarget === module.key
                    ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                    : ""
                }`}
              >
                <div className="absolute right-2 top-2 z-10 sm:right-2.5 sm:top-2.5 lg:right-1.5 lg:top-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenModuleInfo(module.key);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 outline-none transition hover:bg-cyan-500/20 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 lg:h-6 lg:w-6 lg:text-xs"
                    aria-label={`Open info for ${module.name}`}
                    title={`Info about ${module.name}`}
                  >
                    i
                  </button>
                </div>

                <div className="flex flex-col gap-1 pr-8 lg:gap-0.5 lg:pr-7">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold leading-tight lg:text-[13px]">{module.name}</div>
                    {module.available ? <AvailabilityBadge /> : null}
                  </div>
                  <div className="line-clamp-2 text-xs leading-snug text-white/58 lg:mt-0">{module.desc}</div>
                  <QuickTags tags={module.quickTags} className="lg:mt-1 lg:gap-1" />
                  {module.helpText ? (
                    <div className="line-clamp-2 text-[11px] leading-snug text-white/42 lg:mt-0.5">
                      {module.helpText}
                    </div>
                  ) : null}
                </div>

                <div className="mt-2 shrink-0 border-t border-white/10 pt-1.5 lg:mt-1.5 lg:pt-1.5">
                  <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35 lg:text-[8px]">
                    Cost
                  </div>
                  <ResourceCostRow cost={module.cost} resources={resources} />
                  <button
                    type="button"
                    onClick={() => onBuyModule(module.key)}
                    disabled={module.owned}
                    className={`mt-1.5 flex min-h-11 w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 lg:mt-1.5 lg:min-h-10 lg:py-1.5 lg:text-[13px] ${
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
        <div data-base-target="research" className="grid grid-cols-1 gap-2 lg:grid-cols-2 lg:items-start lg:gap-x-3 lg:gap-y-2">
          {telemetryHint ? (
            <div className="col-span-full text-[11px] text-white/65 lg:col-span-2">{telemetryHint}</div>
          ) : null}
          {research.map((item) => {
            return (
              <div
                key={item.key}
                data-base-target={item.key}
                className={`relative flex flex-col gap-1.5 rounded-xl border p-2.5 sm:rounded-2xl sm:p-3 lg:gap-1 lg:p-2.5 ${availabilityCardClass(item.available)} ${
                  highlightTarget === item.key
                    ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                    : ""
                }`}
              >
                <div className="absolute right-2 top-2 z-10 sm:right-2.5 sm:top-2.5 lg:right-1.5 lg:top-1.5">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenResearchInfo(item.key);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 outline-none transition hover:bg-cyan-500/20 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 lg:h-6 lg:w-6 lg:text-xs"
                    aria-label={`Open info for ${item.name}`}
                    title={`Info about ${item.name}`}
                  >
                    i
                  </button>
                </div>

                <div className="flex flex-col gap-1 pr-8 lg:pr-7 lg:gap-0.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold leading-tight lg:text-[13px]">{item.name}</div>
                    {item.available ? <AvailabilityBadge /> : null}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-xs leading-snug text-white/58">{item.desc}</div>
                  <QuickTags tags={item.quickTags} className="lg:mt-1 lg:gap-1" />
                  {item.helpText ? (
                    <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/42 lg:mt-0.5">
                      {item.helpText}
                    </div>
                  ) : null}
                </div>

                {/* One footer: mobile stacked; sm/md side-by-side cost + action; lg stacked full-width for 2-col grid */}
                <div className="mt-2 flex flex-col gap-1.5 border-t border-white/10 pt-1.5 sm:mt-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3 lg:mt-1.5 lg:flex-col lg:items-stretch lg:gap-1 lg:pt-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35 lg:text-[8px]">
                      Cost
                    </div>
                    <ResourceCostRow cost={item.cost} resources={resources} />
                  </div>
                  <button
                    type="button"
                    onClick={() => onBuyResearch(item.key)}
                    disabled={item.done || item.locked}
                    className={`flex min-h-11 w-full shrink-0 items-center justify-center rounded-xl px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto sm:min-w-[7.25rem] lg:mt-0 lg:min-h-10 lg:w-full lg:py-1.5 lg:text-[13px] ${
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

