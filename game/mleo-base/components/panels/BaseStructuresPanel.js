import { useLayoutEffect, useRef, useState } from "react";

import { PanelAvailabilityBadge, PanelTabCountBadge } from "./BasePanelBadges";
import {
  findVerticalScrollContainer,
  scheduleScrollPanelHeaderIntoView,
} from "../../utils/scrollPanelSectionTopIntoView";

function availabilityCardClass(isAvailable) {
  return isAvailable ? "border-cyan-400/30 bg-cyan-500/5" : "border-white/10 bg-black/20";
}

export function BaseStructuresPanel({
  structuresTab,
  onSetStructuresTab,
  coreMissionReadyCount = 0,
  coreAvailableBuildingsCount = 0,
  expansionMissionReadyCount = 0,
  expansionAvailableBuildingsCount = 0,
  cards,
  highlightTarget,
  powerSteps,
  onOpenBuildingInfo,
  onChangePowerMode,
  onBuyBuilding,
  onAdvanceTier,
  activeTierKey,
  onUnlockSupportProgram,
  onSetSupportProgram,
  onClaimSpecializationMilestone,
}) {
  const structureCards = cards || [];
  /** Per building card: at most one of "programs" | "milestones" open; missing key = all closed. */
  const [openSpecSubsectionByCard, setOpenSpecSubsectionByCard] = useState({});

  const getOpenSpecSubsection = (cardKey) => openSpecSubsectionByCard[cardKey] ?? null;
  const isSectionOpen = (cardKey, section) => getOpenSpecSubsection(cardKey) === section;
  const toggleSpecSubsection = (cardKey, section) => {
    setOpenSpecSubsectionByCard((prev) => {
      const cur = prev[cardKey] ?? null;
      const next = cur === section ? null : section;
      if (next == null) {
        if (!(cardKey in prev)) return prev;
        const { [cardKey]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [cardKey]: next };
    });
  };

  const prevOpenSpecRef = useRef({});

  useLayoutEffect(() => {
    const prev = prevOpenSpecRef.current;
    const next = openSpecSubsectionByCard;
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);

    for (const cardKey of keys) {
      const before = prev[cardKey] ?? null;
      const after = next[cardKey] ?? null;
      if (after && after !== before) {
        const attr = `${cardKey}:${after}`;
        const headerEl = document.querySelector(
          `[data-base-structure-accordion-header="${CSS.escape(attr)}"]`
        );
        const scrollParent = headerEl ? findVerticalScrollContainer(headerEl) : null;
        if (scrollParent && headerEl) {
          scheduleScrollPanelHeaderIntoView(scrollParent, headerEl, { padding: 8 });
        }
      }
    }

    prevOpenSpecRef.current = { ...next };
  }, [openSpecSubsectionByCard]);

  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onSetStructuresTab("core")}
          className={`flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
            structuresTab === "core"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          <span>Core</span>
          <PanelTabCountBadge
            brightTabStyle="structures"
            count={coreMissionReadyCount}
            title="Daily missions ready to claim"
            onBrightTab={structuresTab === "core"}
          />
          <PanelTabCountBadge
            brightTabStyle="structures"
            count={coreAvailableBuildingsCount}
            title="Affordable structure upgrades in Core"
            onBrightTab={structuresTab === "core"}
          />
        </button>
        <button
          type="button"
          onClick={() => onSetStructuresTab("expansion")}
          className={`flex flex-wrap items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition sm:text-sm ${
            structuresTab === "expansion"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          <span>Expansion</span>
          <PanelTabCountBadge
            brightTabStyle="structures"
            count={expansionMissionReadyCount}
            title="Daily missions ready to claim"
            onBrightTab={structuresTab === "expansion"}
          />
          <PanelTabCountBadge
            brightTabStyle="structures"
            count={expansionAvailableBuildingsCount}
            title="Affordable structure upgrades in Expansion"
            onBrightTab={structuresTab === "expansion"}
          />
        </button>
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {structureCards.length === 0 ? (
          <div className="rounded-lg border border-dashed border-white/[0.08] bg-black/[0.08] px-2.5 py-2 text-center text-[10px] leading-snug text-white/40 sm:text-[11px] md:col-span-2 xl:col-span-3">
            No structures available yet.
          </div>
        ) : null}
        {structureCards.map((card) => {
          const highlighted = highlightTarget === card.key;
          const specSectionsLocked = !!card.supportProgramsSectionsLocked;
          const supportProgramsOpen = isSectionOpen(card.key, "programs");
          const milestonesOpen = isSectionOpen(card.key, "milestones");
          return (
            <div
              key={card.key}
              data-base-target={card.key}
              className={`flex min-h-0 flex-col rounded-xl border p-2 ${availabilityCardClass(
                card.ready
              )} ${
                highlighted
                  ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : ""
              }`}
            >
              {/* Top row: title (left), AVAILABLE (right), info button (far right) */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2">
                  {/* Stable title band on mobile (2-line clamp) so the metrics column lines up across cards */}
                  <div className="line-clamp-1 min-h-[1.25rem] text-[15px] font-semibold leading-5 text-white sm:line-clamp-1 max-sm:line-clamp-2 max-sm:min-h-[2.5rem]">
                    {card.name}
                  </div>
                </div>

                <div className="shrink-0 flex items-center gap-2">
                  {card.ready ? <PanelAvailabilityBadge /> : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBuildingInfo?.(card.key);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 outline-none transition hover:bg-cyan-500/20 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                    aria-label={`Open info for ${card.name}`}
                    title={`Info about ${card.name}`}
                  >
                    i
                  </button>
                </div>
              </div>

              {/* Stable height: two lines of description so the metrics slot does not drift between cards */}
              <div className="mt-1 min-h-[2.75rem] overflow-hidden text-[11px] leading-snug text-white/58 line-clamp-2">
                {card.desc}
              </div>

              {/* Anchored slot: left stack (tags / level / cost) + fixed-width metrics column, top-aligned */}
              <div className="mt-1 grid grid-cols-[1fr_auto] items-start gap-x-3 gap-y-2">
                {/* LEFT column */}
                <div className="min-w-0 flex flex-col gap-1">
                  {/* Meta badges row: Production/Utility/Core + Synergy — stable band for wrap */}
                  <div className="min-h-[40px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                        {card.roleTagText}
                      </div>
                      <div className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                        {card.synergyTagText}
                      </div>
                    </div>
                  </div>

                  {/* Compact status row: Lv badge + tier (support buildings) + ACTIVE/WARNING */}
                  <div className="flex min-h-[22px] flex-wrap items-center gap-2">
                    <div className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-white/65">
                      Lv {card.level}
                    </div>
                    {card.tierText ? (
                      <span
                        className="inline-flex w-fit rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-200"
                        title="Building tier"
                      >
                        {card.tierText}
                      </span>
                    ) : null}
                    <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] text-white/65">
                      {card.sectorStatusText}
                    </div>
                  </div>

                  <div className="mt-0.5">
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Cost</div>
                    {card.costRow}
                  </div>
                </div>

                {/* RIGHT column — fixed slot: same width + min-height whether Now-only, Next+Δ, or legacy impact */}
                <div className="flex w-[144px] shrink-0 flex-col justify-self-end self-start">
                  <div className="flex min-h-[3.5rem] w-full flex-col justify-center">
                    {card.liveNowNext?.nowLine ? (
                      <div className="w-full rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1">
                        <div className="line-clamp-2 text-[10px] font-semibold leading-snug text-white/90">
                          {card.liveNowNext.nowLine}
                        </div>
                        {card.liveNowNext.nextLine ? (
                          <div className="line-clamp-2 text-[10px] font-bold leading-snug text-emerald-100">
                            {card.liveNowNext.nextLine}
                          </div>
                        ) : null}
                      </div>
                    ) : card.upgradeImpactPreview ? (
                      <div className="w-full rounded-lg border border-cyan-400/20 bg-cyan-500/8 px-2 py-1">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
                          {card.upgradeImpactPreview.label}
                        </div>
                        <div className="text-[11px] font-semibold text-cyan-100 max-sm:text-[10px] max-sm:font-bold">
                          {card.upgradeImpactPreview.value}
                        </div>
                        {card.upgradeImpactPreview.note ? (
                          <div className="line-clamp-1 text-[10px] text-cyan-100/70">
                            {card.upgradeImpactPreview.note}
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div className="h-full min-h-[3.5rem] w-full rounded-lg border border-white/[0.06] bg-black/10" aria-hidden />
                    )}
                  </div>
                  <div className="mt-1 min-h-[1.75rem]">
                    {!card.ready && card.requirementsText ? (
                      <div className="w-full rounded-md border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] leading-snug text-amber-100/90">
                        <span className="font-semibold">Missing:</span>{" "}
                        <span className="line-clamp-2">{card.requirementsText}</span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>

              {card.tierAdvanceBlock}

              {card.supportsPrograms && card.programCards?.length ? (
                <div
                  className={`mt-2 rounded-2xl border border-violet-400/20 bg-violet-500/8 px-2.5 py-2 ${
                    specSectionsLocked ? "opacity-75" : ""
                  }`}
                >
                  <button
                    type="button"
                    data-base-structure-accordion-header={`${card.key}:programs`}
                    onClick={() => toggleSpecSubsection(card.key, "programs")}
                    aria-expanded={supportProgramsOpen && !specSectionsLocked}
                    disabled={specSectionsLocked}
                    title={specSectionsLocked ? "Build this structure first" : undefined}
                    className={`group relative z-[1] flex min-h-[44px] w-full touch-manipulation select-none items-stretch justify-between gap-2 rounded-lg px-0.5 py-1 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-violet-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:py-0 ${
                      specSectionsLocked
                        ? "cursor-not-allowed opacity-90"
                        : "cursor-pointer hover:bg-violet-500/[0.06] active:bg-violet-500/[0.09]"
                    }`}
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/80">
                      Support Programs
                    </div>
                    <span
                      className={`pointer-events-none shrink-0 self-center rounded-lg border border-violet-400/35 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition ${
                        specSectionsLocked
                          ? "border-violet-400/15 bg-violet-500/5 text-violet-100/35"
                          : "bg-violet-500/15 text-violet-100 group-hover:bg-violet-500/25"
                      }`}
                    >
                      {supportProgramsOpen && !specSectionsLocked ? "CLOSE" : "OPEN"}
                    </span>
                  </button>
                  {specSectionsLocked ? (
                    <div className="mt-1 text-[10px] leading-snug text-white/40">
                      Build this structure to unlock programs and milestones.
                    </div>
                  ) : null}
                  {supportProgramsOpen && !specSectionsLocked ? (
                    <>
                      <div className="mt-1 text-[11px] font-semibold text-white/80">
                        {card.activeProgramLabel ? (
                          <span>
                            Active:{" "}
                            <span className="text-violet-100">{card.activeProgramLabel}</span>
                          </span>
                        ) : (
                          <span className="text-white/55">No active program</span>
                        )}
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5">
                        {card.programCards.map((program) => (
                          <div
                            key={program.key}
                            className="rounded-xl border border-white/10 bg-black/25 px-2 py-1.5"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-1">
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-bold text-white/90">{program.label}</div>
                                <div className="text-[10px] text-white/50">Requires T{program.minTier}</div>
                                <div className="text-[10px] text-violet-200/75">{program.effects}</div>
                              </div>
                              <div className="shrink-0 flex flex-col items-end gap-1">
                                {!program.unlocked && !program.tierReady ? (
                                  <span className="inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-amber-100">
                                    Needs T{program.minTier}
                                  </span>
                                ) : null}
                                {program.active ? (
                                  <span className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-cyan-100">
                                    Active
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            {!program.unlocked && program.tierReady ? (
                              <div className="mt-1 border-t border-white/5 pt-1">
                                {program.costRow}
                                <button
                                  type="button"
                                  onClick={() => onUnlockSupportProgram?.(card.key, program.key)}
                                  disabled={program.unlockDisabled || program.unlockBusy}
                                  className="mt-1 w-full rounded-lg border border-violet-400/30 bg-violet-500/15 px-2 py-1 text-[10px] font-bold text-violet-100 transition hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  {program.unlockBusy ? "Unlocking..." : "Unlock"}
                                </button>
                              </div>
                            ) : null}
                            {program.unlocked && !program.active ? (
                              <button
                                type="button"
                                onClick={() => onSetSupportProgram?.(card.key, program.key)}
                                disabled={program.setDisabled || program.setBusy}
                                className="mt-1.5 w-full rounded-lg border border-cyan-400/25 bg-cyan-500/10 px-2 py-1 text-[10px] font-bold text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {program.setBusy ? "Activating..." : "Activate"}
                              </button>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              {card.supportsPrograms && card.milestoneCards?.length ? (
                <div
                  className={`mt-2 rounded-2xl bg-gradient-to-br from-amber-500/10 via-emerald-500/6 to-transparent px-2.5 py-2 ring-0 outline-none ${
                    specSectionsLocked ? "opacity-75" : ""
                  }`}
                >
                  <button
                    type="button"
                    data-base-structure-accordion-header={`${card.key}:milestones`}
                    onClick={() => toggleSpecSubsection(card.key, "milestones")}
                    aria-expanded={milestonesOpen && !specSectionsLocked}
                    disabled={specSectionsLocked}
                    title={specSectionsLocked ? "Build this structure first" : undefined}
                    className={`group relative z-[1] flex min-h-[44px] w-full touch-manipulation select-none items-stretch justify-between gap-2 rounded-lg px-0.5 py-1 text-left outline-none ring-0 transition focus-visible:ring-2 focus-visible:ring-amber-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 sm:min-h-0 sm:py-0 ${
                      specSectionsLocked
                        ? "cursor-not-allowed opacity-90"
                        : "cursor-pointer hover:bg-amber-500/[0.07] active:bg-amber-500/[0.1]"
                    }`}
                  >
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-center">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-[10px] font-black uppercase tracking-[0.16em] text-amber-200/85">
                          Specialization milestones
                        </div>
                        <span className="inline-flex rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
                          Milestone
                        </span>
                      </div>
                    </div>
                    <span
                      className={`pointer-events-none shrink-0 self-center rounded-lg border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] transition ${
                        specSectionsLocked
                          ? "border-amber-400/15 bg-amber-500/5 text-amber-50/35"
                          : "border-amber-400/35 bg-amber-500/15 text-amber-50 group-hover:bg-amber-500/25"
                      }`}
                    >
                      {milestonesOpen && !specSectionsLocked ? "CLOSE" : "OPEN"}
                    </span>
                  </button>
                  {milestonesOpen && !specSectionsLocked ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      {card.milestoneCards.map((m) => (
                        <div
                          key={m.key}
                          className="rounded-xl border border-emerald-400/15 bg-black/20 px-2 py-1.5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-1">
                            <div className="min-w-0 flex-1">
                              <div className="text-[11px] font-bold text-white/90">{m.label}</div>
                              <div className="text-[10px] text-white/50">
                                Requires T{m.minTier} · Program:{" "}
                                <span className="text-emerald-200/80">{m.reqProgLabel}</span>
                              </div>
                              <div className="mt-0.5 text-[10px] text-amber-100/70">{m.conditionShort}</div>
                              <div className="mt-0.5 text-[10px] text-white/45">Reward: {m.rewardPreview}</div>
                            </div>
                            <div className="shrink-0 flex flex-col items-end gap-1">
                              {!m.eligible ? (
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/50">
                                  Locked
                                </span>
                              ) : m.claimed ? (
                                <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">
                                  Claimed
                                </span>
                              ) : m.canClaim ? (
                                <span className="inline-flex rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-amber-100">
                                  Claim ready
                                </span>
                              ) : (
                                <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white/55">
                                  In progress
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="mt-1 text-[10px] text-white/40">{m.progressText}</div>
                          {m.canClaim ? (
                            <button
                              type="button"
                              onClick={() => onClaimSpecializationMilestone?.(card.key, m.key)}
                              disabled={m.claimBusy}
                              className="mt-1.5 w-full rounded-lg border border-amber-400/35 bg-amber-500/15 px-2 py-1 text-[10px] font-bold text-amber-50 transition hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {m.claimBusy ? "Claiming..." : "Claim milestone"}
                            </button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-auto flex flex-col justify-end pt-0 pb-2">
                {/* Fixed-height bottom info block (stabilizes Upgrade button Y across cards) */}
                <div className="flex flex-col">
                  <div className="min-h-[14px] text-[10px] font-semibold leading-snug text-white/50">
                    {card.energyLineText}
                  </div>
                  <div className="min-h-[14px] text-[10px] font-semibold leading-snug text-cyan-200/70">
                    {card.powerLineText}
                  </div>
                </div>

                <div className="mt-1 flex w-full flex-col gap-1.5">
                  {card.canThrottle && card.level > 0 ? (
                    <div className="mt-1.5 grid grid-cols-5 gap-1">
                      {(powerSteps || []).map((mode) => {
                        const active = card.powerMode === mode;
                        return (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => onChangePowerMode?.(card.key, mode)}
                            className={`rounded-lg border px-1.5 py-1.5 text-[10px] font-bold transition ${
                              active
                                ? "border-cyan-300/50 bg-cyan-500/15 text-cyan-200"
                                : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                            }`}
                          >
                            {mode}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    // Keep exact visual spacing for buildings without power % controls.
                    <div className="mt-1.5 grid grid-cols-5 gap-1 opacity-0 pointer-events-none">
                      {(powerSteps || []).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          disabled
                          className="rounded-lg border border-white/10 bg-white/5 px-1.5 py-1.5 text-[10px] font-bold text-white/70"
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  )}

                  {card.tierAdvanceAvailable ? (
                    <button
                      type="button"
                      onClick={() => onAdvanceTier?.(card.key)}
                      disabled={
                        activeTierKey === card.key ||
                        !card.canAffordTierCost ||
                        !card.tierCost
                      }
                      className={`flex min-h-11 w-full items-center justify-center rounded-xl border px-3 py-2 text-xs font-semibold leading-none transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                        card.canAffordTierCost && card.tierCost
                          ? "border-cyan-400/25 bg-cyan-500/15 text-cyan-100"
                          : "border-transparent bg-white/10 opacity-70"
                      }`}
                    >
                      {activeTierKey === card.key
                        ? "Advancing..."
                        : !card.tierCost
                        ? "Tier unavailable"
                        : `Advance to T${card.nextTier}`}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onBuyBuilding?.(card.key)}
                      disabled={!card.ready || card.buildBusy}
                      className={`flex min-h-11 w-full items-center justify-center rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold leading-none transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                        card.canAffordCost ? "" : "opacity-70"
                      }`}
                    >
                      {card.buildBusy ? "Building..." : card.buttonText}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

