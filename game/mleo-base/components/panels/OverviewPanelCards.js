import { createContext, useContext } from "react";
import { ExpandablePanelSectionHeader } from "./ExpandablePanelSectionHeader";
import { WorldSectorPanel } from "./WorldSectorPanel";
const BaseOverviewPanelToneContext = createContext(null);

function toneClasses(tone = "info") {
  if (tone === "critical") {
    return "border-rose-400/30 bg-rose-500/10 text-rose-100";
  }
  if (tone === "warning") {
    return "border-amber-300/30 bg-amber-400/10 text-amber-100";
  }
  if (tone === "success") {
    return "border-emerald-400/30 bg-emerald-500/10 text-emerald-100";
  }
  return "border-cyan-400/30 bg-cyan-500/10 text-cyan-100";
}

function CardShell({ className = "", children, ...rest }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const shell = pt?.cardShell ? ` ${pt.cardShell}` : "";
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-white/10 bg-white/[0.05] p-4${shell} ${className}`}
    >
      {children}
    </div>
  );
}

function MiniStat({ label, value, note }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const ms = pt?.miniStat ? ` ${pt.miniStat}` : "";
  return (
    <div className={`rounded-xl border border-white/10 bg-black/20 px-3 py-2.5${ms}`}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-0.5 text-base font-black text-white">{value}</div>
      {note ? <div className="mt-0.5 text-xs text-white/55">{note}</div> : null}
    </div>
  );
}

function SectionHeader({ title, hint, right }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const bar = pt?.sectionBar;
  return (
    <div className="mb-2.5 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">
          {title}
        </div>
        {bar ? <div className={bar} aria-hidden /> : null}
        {hint ? <div className="mt-1 text-xs text-white/55">{hint}</div> : null}
      </div>
      {right}
    </div>
  );
}

function AvailabilityBadge({ count }) {
  const pt = useContext(BaseOverviewPanelToneContext);
  const badge = pt?.availabilityBadge ? ` ${pt.availabilityBadge}` : "";
  if (!count) return null;
  return (
    <span
      className={`ml-2 inline-flex min-w-[24px] items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-black text-cyan-200${badge}`}
    >
      {count}
    </span>
  );
}

function formatValue(value, digits = 2) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1000) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(n);
  }
  return n.toFixed(digits).replace(/\.?0+$/, "").replace(/\.$/, "");
}

function ActionButton({ action, onNavigate }) {
  if (!action?.target || typeof onNavigate !== "function") return null;

  return (
    <button
      onClick={() => onNavigate(action.target)}
      className="mt-4 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
    >
      {action.cta || "Open"}
    </button>
  );
}

function BaseStatusBlock({ status }) {
  if (!status) return null;
  const chips = Array.isArray(status?.chips) ? status.chips.slice(0, 2) : [];
  const chipClass = (tone) =>
    tone === "critical"
      ? "border-rose-300/35 bg-rose-500/12 text-rose-100"
      : tone === "warning"
      ? "border-amber-300/35 bg-amber-400/12 text-amber-100"
      : "border-cyan-300/30 bg-cyan-500/10 text-cyan-100";

  return (
    <CardShell className={toneClasses(status.tone)}>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
        Base Status
      </div>
      {chips.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((chip) => (
            <span
              key={chip.key}
              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${chipClass(
                chip.tone
              )}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-2 text-2xl font-black">{status.label}</div>
      <div className="mt-2 text-sm leading-6 text-white/85">{status.text}</div>
    </CardShell>
  );
}

function BottleneckBlock({ bottleneck, onNavigate }) {
  if (!bottleneck) return null;
  return (
    <CardShell>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Main Bottleneck
          </div>
          <div className="mt-2 text-lg font-black text-white">{bottleneck.label}</div>
          <div className="mt-2 text-sm leading-6 text-white/70">{bottleneck.text}</div>
        </div>
        <div
          className={`rounded-xl border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.14em] ${toneClasses(
            bottleneck.tone
          )}`}
        >
          {bottleneck.tone || "info"}
        </div>
      </div>

      {bottleneck.target ? (
        <button
          onClick={() => onNavigate?.(bottleneck.target)}
          className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-white hover:bg-white/10"
        >
          Inspect
        </button>
      ) : null}
    </CardShell>
  );
}

function NextActionBlock({ action, onNavigate }) {
  if (!action) return null;
  return (
    <CardShell className="border-cyan-400/25 bg-cyan-500/[0.08]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
        Best Next Action
      </div>
      <div className="mt-2 text-lg font-black text-white">{action.title}</div>
      <div className="mt-2 text-sm leading-6 text-white/80">{action.text}</div>
      <ActionButton action={action} onNavigate={onNavigate} />
    </CardShell>
  );
}

function RatesBlock({ rates, openInnerPanel, toggleInnerPanel }) {
  if (!rates) return null;
  const openKey = "overview-rates";
  const isOpen = openInnerPanel === openKey;
  const ratesHint = !isOpen
    ? `Refinery ${rates.refineryState || "—"} · Banked/hr ${formatValue(rates.bankedPerHour)} · Proj/day ${formatValue(
        rates.projectedPerDay
      )}`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Live Rates</div>
        {ratesHint ? <div className="mt-1 text-xs text-white/55">{ratesHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Banked / hr" value={`${formatValue(rates.bankedPerHour)}`} />
            <MiniStat label="Projected / day" value={`${formatValue(rates.projectedPerDay)}`} />
            <MiniStat label="ORE / hr" value={`${formatValue(rates.orePerHour)}`} />
            <MiniStat label="DATA / hr" value={`${formatValue(rates.dataPerHour)}`} />
          </div>

          <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/55">
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
              Refinery: {rates.refineryState || "Unknown"}
            </span>
            {(() => {
              const eta =
                rates.etaToMleoCapHours != null ? rates.etaToMleoCapHours : rates.etaToShipCapHours;
              return eta != null ? (
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1.5">
                  MLEO cap ETA: {formatValue(eta, 1)}h
                </span>
              ) : null;
            })()}
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

function StabilityBlock({ stability, openInnerPanel, toggleInnerPanel }) {
  if (!stability) return null;

  const openKey = "overview-stability";
  const isOpen = openInnerPanel === openKey;
  const stabilityHint = !isOpen
    ? `${formatValue(stability.value)}% stability · ${stability.impactLabel || "Impact"} · ${
        stability.pressureLabel || "Pressure"
      }`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Stability Insight</div>
        {stabilityHint ? <div className="mt-1 text-xs text-white/55">{stabilityHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat label="Stability" value={`${formatValue(stability.value)}%`} />
          <MiniStat label="Impact" value={stability.impactLabel} note={stability.impactText} />
          <MiniStat label="Pressure" value={stability.pressureLabel} note={stability.pressureText} />
          <MiniStat label="Repair Support" value={stability.repairSupportLabel} note={stability.repairSupportText} />
        </div>
      ) : null}
    </CardShell>
  );
}

function DailyProgressBlock({ progress, openInnerPanel, toggleInnerPanel }) {
  if (!progress) return null;

  const openKey = "overview-daily-progress";
  const isOpen = openInnerPanel === openKey;
  const mleoCur =
    (progress.mleoDailyProgress?.current ?? progress.shipProgress?.current) || 0;
  const mleoMax = (progress.mleoDailyProgress?.max ?? progress.shipProgress?.max) || 0;
  const dailyHint = !isOpen
    ? `MLEO ${formatValue(mleoCur)}/${formatValue(mleoMax)} · Expeditions ${formatValue(
        progress.expeditionsDone || 0,
        0
      )} · Missions ${formatValue(progress.missionsReady || 0, 0)} ready`
    : null;

  return (
    <CardShell>
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Daily Progress</div>
        {dailyHint ? <div className="mt-1 text-xs text-white/55">{dailyHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MiniStat
            label="Daily MLEO (BASE)"
            value={`${formatValue(mleoCur)}/${formatValue(mleoMax)}`}
          />
          <MiniStat label="Expeditions" value={formatValue(progress.expeditionsDone || 0, 0)} />
          <MiniStat label="Maintenance" value={formatValue(progress.maintenanceDone || 0, 0)} />
          <MiniStat
            label="Missions"
            value={`${formatValue(progress.missionsReady || 0, 0)} ready`}
            note={`${formatValue(progress.missionsCompleted || 0, 0)} completed`}
          />
        </div>
      ) : null}
    </CardShell>
  );
}

function MissionFocusBlock({ missionGuidance, onNavigate }) {
  if (!missionGuidance?.title) return null;
  return (
    <CardShell className="border-cyan-400/20 bg-cyan-500/[0.06]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100/70">
        Mission Focus
      </div>
      <div className="mt-2 text-sm font-bold text-white">{missionGuidance.title}</div>
      <div className="mt-1 text-sm text-white/75">{missionGuidance.hint}</div>
      {missionGuidance.target ? (
        <button
          onClick={() => onNavigate?.(missionGuidance.target)}
          className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          {missionGuidance.cta || "Open missions"}
        </button>
      ) : null}
    </CardShell>
  );
}

function RecoveryHintBlock({ hint, onNavigate }) {
  if (!hint?.text) return null;
  return (
    <CardShell className="border-amber-300/25 bg-amber-500/[0.07]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-100/80">
        {hint.title || "Recovery hint"}
      </div>
      <div className="mt-1 text-sm text-white/80">{hint.text}</div>
      {hint?.target ? (
        <button
          onClick={() => onNavigate?.(hint.target)}
          className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Open recovery actions
        </button>
      ) : null}
    </CardShell>
  );
}

function TodaysLoopBlock({ steps, onNavigate }) {
  const list = Array.isArray(steps) ? steps.slice(0, 4) : [];
  if (!list.length) return null;

  const statusClass = (status) =>
    status === "Ready"
      ? "text-cyan-200"
      : status === "Done"
      ? "text-emerald-200/90"
      : "text-white/55";

  const firstActionable = list.find((s) => s?.target);

  return (
    <CardShell className="border-white/12 bg-white/[0.04]">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        Today&apos;s Loop
      </div>
      <div className="mt-2 space-y-1.5">
        {list.map((step, idx) => (
          <div key={`${step.title}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
            <div className="min-w-0 text-white/82">
              <span className="mr-2 text-white/45">{idx + 1}.</span>
              <span>{step.title}</span>
            </div>
            <span className={`shrink-0 text-[11px] font-semibold ${statusClass(step.status)}`}>
              {step.status || "Soon"}
            </span>
          </div>
        ))}
      </div>
      {firstActionable ? (
        <button
          onClick={() => onNavigate?.(firstActionable.target)}
          className="mt-3 rounded-xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Focus first step
        </button>
      ) : null}
    </CardShell>
  );
}

function BuildOpportunitiesCard({
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  availableBlueprintCount,
  onOpenBuildPanel,
}) {
  return (
    <CardShell className="h-full">
      <SectionHeader
        title="Build Opportunities"
        hint={[
          availableStructuresCount > 0 ? `${availableStructuresCount} structures` : null,
          availableModulesCount > 0 ? `${availableModulesCount} modules` : null,
          availableResearchCount > 0 ? `${availableResearchCount} research` : null,
          availableBlueprintCount > 0 ? "blueprint ready" : null,
        ]
          .filter(Boolean)
          .join(" · ") || "No build opportunities right now"}
        right={<AvailabilityBadge count={buildOpportunitiesCount > 0 ? buildOpportunitiesCount : 0} />}
      />
      {buildOpportunitiesCount > 0 ? (
        <button
          onClick={onOpenBuildPanel}
          className="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20"
        >
          Open Build
        </button>
      ) : (
        <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-white/60">
          Keep gathering resources to unlock upgrades.
        </div>
      )}
    </CardShell>
  );
}

function IdentityCard({
  showCrew,
  crewRoleInfo,
  roleBonusText,
  commanderPathInfo,
  commanderPathText,
  openInnerPanel,
  toggleInnerPanel,
}) {
  if (!showCrew) return null;
  const openKey = "overview-identity";
  const isOpen = openInnerPanel === openKey;

  return (
    <CardShell className="h-full">
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Command Identity</div>
        {!isOpen ? (
          <div className="mt-1 text-xs text-white/55">Current crew role and commander path</div>
        ) : null}
      </ExpandablePanelSectionHeader>
      {isOpen ? (
        <div className="mt-3 space-y-3 text-sm">
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Crew Role</div>
            <div className="mt-1 font-bold text-white">{crewRoleInfo?.name}</div>
            <div className="mt-1 text-white/70">{roleBonusText}</div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs uppercase tracking-[0.16em] text-white/45">Commander Path</div>
            <div className="mt-1 font-bold text-white">{commanderPathInfo?.name}</div>
            <div className="mt-1 text-white/70">{commanderPathText}</div>
          </div>
        </div>
      ) : null}
    </CardShell>
  );
}

function SpecializationSummaryCard({ summary, onNavigate, openInnerPanel, toggleInnerPanel }) {
  if (!summary?.buildings?.length) return null;
  const t = summary.totals || {};
  const rec = summary.topRecommendation || {};

  const openKey = "overview-specialization";
  const isOpen = openInnerPanel === openKey;
  const specHint = !isOpen
    ? `Late-game · Tiers ${t.supportBuildingsTier2Plus ?? 0}/3 · Programs ${t.totalUnlockedPrograms ?? 0} unlocked · ${
        t.totalClaimableMilestones ?? 0
      } milestone${(t.totalClaimableMilestones ?? 0) === 1 ? "" : "s"} ready`
    : null;

  const statMini = (label, value, accentClass = "text-white") => (
    <div className="rounded-xl border border-white/10 bg-black/25 px-2 py-2 sm:px-3 sm:py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45 sm:text-[10px] sm:tracking-[0.18em]">
        {label}
      </div>
      <div className={`mt-0.5 text-xs font-black leading-tight sm:text-sm ${accentClass}`}>{value}</div>
    </div>
  );

  return (
    <CardShell className="border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.06] via-violet-500/[0.04] to-amber-500/[0.04]">
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Specialization</div>
        {specHint ? <div className="mt-1 text-xs text-white/55">{specHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {statMini(
              "Tiers",
              `${t.supportBuildingsTier2Plus ?? 0}/3`,
              "text-cyan-200"
            )}
            {statMini(
              "Programs",
              `${t.totalUnlockedPrograms ?? 0} unlocked · ${t.totalActivePrograms ?? 0} active`,
              "text-violet-200"
            )}
            {statMini(
              "Milestones",
              `${t.totalClaimedMilestones ?? 0}/${t.totalMilestoneSlots || 6} · ${
                t.totalClaimableMilestones ?? 0
              } ready`,
              "text-amber-100"
            )}
            {statMini(
              "Adv. contracts",
              `${t.totalVisibleAdvancedContracts ?? 0} shown · ${t.totalReadyAdvancedContracts ?? 0} ready`,
              "text-cyan-100"
            )}
          </div>

          {rec.text ? (
            <button
              type="button"
              onClick={() => rec.navigateTarget && onNavigate?.(rec.navigateTarget)}
              disabled={!rec.navigateTarget}
              className={`mt-3 w-full rounded-xl border px-3 py-2.5 text-left text-sm font-semibold leading-snug transition ${
                rec.navigateTarget
                  ? "border-cyan-400/30 bg-cyan-500/10 text-cyan-50 hover:bg-cyan-500/18"
                  : "cursor-default border-white/10 bg-white/5 text-white/70"
              }`}
            >
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200/75">
                Next focus
              </span>
              <div className="mt-1 text-white">{rec.text}</div>
              {rec.navigateTarget ? (
                <div className="mt-1 text-[11px] text-cyan-200/80">Tap to open in Structures</div>
              ) : null}
            </button>
          ) : null}

          <div className="mt-3 space-y-2">
            {summary.buildings.map((row) => (
              <button
                key={row.buildingKey}
                type="button"
                onClick={() => onNavigate?.({ tab: "build", target: row.buildingKey })}
                className="w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-left transition hover:border-cyan-400/25 hover:bg-black/30"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 text-[13px] font-bold text-white">{row.buildingName}</div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                    <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-cyan-100">
                      T{row.tier}
                    </span>
                    {row.activeProgramKey ? (
                      <span className="inline-flex max-w-[120px] truncate rounded-full border border-violet-400/30 bg-violet-500/12 px-2 py-0.5 text-[9px] font-bold text-violet-100">
                        Active
                      </span>
                    ) : null}
                    {row.claimableMilestones > 0 ? (
                      <span className="inline-flex rounded-full border border-amber-400/35 bg-amber-500/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-amber-100">
                        Milestone
                      </span>
                    ) : null}
                    {row.advancedContractsReady > 0 ? (
                      <span className="inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/12 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.1em] text-emerald-100">
                        Contract
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="mt-1 text-[11px] text-white/60">
                  {row.activeProgramLabel || "No active program"}
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-white/45">
                  <span>
                    Milestones: {row.claimedMilestones}/{row.totalMilestones || 0}
                  </span>
                  <span>Ready items: {row.readyItemsCount}</span>
                  <span className="text-white/35">
                    Next: {row.nextMilestoneLabel}
                  </span>
                </div>
                {row.nextActionText ? (
                  <div className="mt-0.5 text-[10px] text-amber-100/55">{row.nextActionText}</div>
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </CardShell>
  );
}

function ContractsCard({
  liveContractsAvailableCount,
  liveContracts,
  openInnerPanel,
  toggleInnerPanel,
  onClaimContract,
}) {
  const openKey = "overview-contracts";
  const isOpen = openInnerPanel === openKey;

  const contractsHint = !isOpen
    ? liveContractsAvailableCount > 0
      ? `${liveContractsAvailableCount} contract reward${
          liveContractsAvailableCount > 1 ? "s" : ""
        } ready`
      : "No contract rewards ready right now"
    : null;

  return (
    <CardShell data-base-target="contracts" className="h-full">
      <ExpandablePanelSectionHeader
        panelKey={openKey}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-sm font-black uppercase tracking-[0.16em] text-white">Live Contracts</div>
          <AvailabilityBadge count={liveContractsAvailableCount} />
        </div>
        {contractsHint ? <div className="mt-1 text-xs text-white/55">{contractsHint}</div> : null}
      </ExpandablePanelSectionHeader>

      {isOpen ? (
        <div className="mt-3 space-y-3">
          {[...(liveContracts || [])]
            .sort((a, b) => {
              const aReady = a.done && !a.claimed ? 1 : 0;
              const bReady = b.done && !b.claimed ? 1 : 0;
              return bReady - aReady;
            })
            .map((contract) => (
              <div key={contract.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="font-bold text-white">{contract.title}</div>
                {contract.contractClass === "elite" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-amber-100">
                      Elite
                    </span>
                    <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-bold text-white/55">
                      Rotates daily
                    </span>
                    {contract.eliteTierPill ? (
                      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-bold text-cyan-100">
                        {contract.eliteTierPill}
                      </span>
                    ) : null}
                    {contract.eliteProgramPill ? (
                      <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                        {contract.eliteProgramPill}
                      </span>
                    ) : null}
                  </div>
                ) : contract.contractClass === "advanced" ? (
                  <div className="mt-1 flex flex-wrap gap-1">
                    <span className="inline-flex rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.08em] text-violet-100">
                      Advanced
                    </span>
                    {contract.advancedTierPill ? (
                      <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-1.5 py-0.5 text-[8px] font-bold text-cyan-100">
                        {contract.advancedTierPill}
                      </span>
                    ) : null}
                    {contract.advancedProgramPill ? (
                      <span className="inline-flex max-w-full rounded-full border border-white/10 bg-white/5 px-1.5 py-0.5 text-[8px] font-semibold text-white/65">
                        {contract.advancedProgramPill}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {contract.contractClass === "elite" && contract.desc ? (
                  <div className="mt-1 text-[11px] leading-snug text-white/50">{contract.desc}</div>
                ) : null}
                <div className="mt-1 text-sm text-white/65">{contract.rewardText}</div>
                <button
                  onClick={() => onClaimContract(contract.key)}
                  disabled={!contract.done || contract.claimed}
                  className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40"
                >
                  {contract.claimed ? "Claimed" : contract.done ? "Claim" : "In Progress"}
                </button>
              </div>
            ))}
        </div>
      ) : null}
    </CardShell>
  );
}

export function OverviewPanelCards({
  panelTone,
  overview,
  missionGuidance,
  nextStep,
  onNavigate,
  openInnerPanel,
  toggleInnerPanel,
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  availableBlueprintCount,
  onOpenBuildPanel,
  showCrew,
  crewRoleInfo,
  roleBonusText,
  commanderPathInfo,
  commanderPathText,
  liveContractsAvailableCount,
  liveContracts,
  onClaimContract,
  specializationSummary,
  sectorWorldSnapshot,
  onDeployNextSector,
  sectorDeployBusy,
  systemsHint,
  doctrineContextHint = null,
}) {
  const actionFallback =
    nextStep && (nextStep?.title || nextStep?.text)
      ? {
          title: nextStep?.title || "Best Next Action",
          text: nextStep?.text || "",
          cta: "Open",
        }
      : null;

  const safeOverview = overview || {};

  const flavor = sectorWorldSnapshot?.panelFlavor;
  const worldOverviewHint = flavor?.overviewHint;
  const overviewStripTitle = flavor?.overviewStripTitle;
  const overviewStripShellClassName =
    flavor?.overviewStripShellClassName ||
    "rounded-xl border border-amber-400/25 bg-amber-500/[0.07] px-3 py-2 text-[11px] leading-snug text-amber-50/90";
  const overviewStripTitleClassName =
    flavor?.overviewStripTitleClassName ||
    "font-black uppercase tracking-[0.14em] text-amber-200/85";

  const stackTone = panelTone?.overviewStack ? ` ${panelTone.overviewStack}` : "";
  const systemsTone = panelTone?.systemsHint ? ` ${panelTone.systemsHint}` : "";

  const showDoctrineStrip = Boolean(
    doctrineContextHint && !worldOverviewHint && !systemsHint
  );
  const hasTopContextRail = Boolean(worldOverviewHint || systemsHint || showDoctrineStrip);

  return (
    <BaseOverviewPanelToneContext.Provider value={panelTone || null}>
      <div className={`space-y-4${stackTone}`}>
      <div>
        {hasTopContextRail ? (
          <div className="space-y-2">
            {worldOverviewHint ? (
              <div className={overviewStripShellClassName}>
                {overviewStripTitle ? (
                  <span className={overviewStripTitleClassName}>
                    {overviewStripTitle}
                    {" · "}
                  </span>
                ) : null}
                {worldOverviewHint}
              </div>
            ) : null}
            {systemsHint ? (
              <div
                className={`rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-[11px] text-white/65${systemsTone}`}
              >
                {systemsHint}
              </div>
            ) : null}
            {showDoctrineStrip ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.035] px-3 py-2 text-[11px] font-normal leading-snug text-white/52">
                {doctrineContextHint}
              </div>
            ) : null}
          </div>
        ) : null}
        <div
          data-base-target="systems"
          className={hasTopContextRail ? "mt-3 border-t border-white/[0.06] pt-3" : undefined}
        >
          <BaseStatusBlock
            status={{
              ...(safeOverview.baseStatus || {}),
              chips: safeOverview.bottleneckChips || [],
            }}
          />
        </div>
      </div>
      <BottleneckBlock bottleneck={safeOverview.bottleneck} onNavigate={onNavigate} />
      <NextActionBlock action={safeOverview.nextAction || actionFallback} onNavigate={onNavigate} />
      <RecoveryHintBlock hint={safeOverview.recoveryHint} onNavigate={onNavigate} />
      <MissionFocusBlock missionGuidance={missionGuidance} onNavigate={onNavigate} />
      <TodaysLoopBlock steps={safeOverview.todaysLoop} onNavigate={onNavigate} />
      <RatesBlock
        rates={safeOverview.rates}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      />
      <StabilityBlock
        stability={safeOverview.stability}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      />
      <DailyProgressBlock
        progress={safeOverview.dailyProgress}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      />

      <SpecializationSummaryCard
        summary={specializationSummary}
        onNavigate={onNavigate}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      />

      <WorldSectorPanel
        snapshot={sectorWorldSnapshot}
        onDeploy={onDeployNextSector}
        deployBusy={!!sectorDeployBusy}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <BuildOpportunitiesCard
          buildOpportunitiesCount={buildOpportunitiesCount}
          availableStructuresCount={availableStructuresCount}
          availableModulesCount={availableModulesCount}
          availableResearchCount={availableResearchCount}
          availableBlueprintCount={availableBlueprintCount}
          onOpenBuildPanel={onOpenBuildPanel}
        />

        <IdentityCard
          showCrew={showCrew}
          crewRoleInfo={crewRoleInfo}
          roleBonusText={roleBonusText}
          commanderPathInfo={commanderPathInfo}
          commanderPathText={commanderPathText}
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
        />

        <ContractsCard
          liveContractsAvailableCount={liveContractsAvailableCount}
          liveContracts={liveContracts}
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          onClaimContract={onClaimContract}
        />
      </div>
    </div>
    </BaseOverviewPanelToneContext.Provider>
  );
}
