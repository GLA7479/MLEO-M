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
  return (
    <div
      {...rest}
      className={`rounded-2xl border border-white/10 bg-white/[0.05] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

function MiniStat({ label, value, note }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        {label}
      </div>
      <div className="mt-0.5 text-base font-black text-white">{value}</div>
      {note ? <div className="mt-0.5 text-xs text-white/55">{note}</div> : null}
    </div>
  );
}

function SectionButton({ isOpen, onClick }) {
  return (
    <button
      onClick={onClick}
      className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
    >
      {isOpen ? "Close" : "Open"}
    </button>
  );
}

function SectionHeader({ title, hint, right }) {
  return (
    <div className="mb-2.5 flex items-start justify-between gap-3">
      <div>
        <div className="text-sm font-black uppercase tracking-[0.16em] text-white">
          {title}
        </div>
        {hint ? <div className="mt-1 text-xs text-white/55">{hint}</div> : null}
      </div>
      {right}
    </div>
  );
}

function AvailabilityBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-2 inline-flex min-w-[24px] items-center justify-center rounded-full border border-cyan-300/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-black text-cyan-200">
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

function RatesBlock({ rates }) {
  if (!rates) return null;
  return (
    <CardShell>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        Live Rates
      </div>
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
    </CardShell>
  );
}

function StabilityBlock({ stability }) {
  if (!stability) return null;

  return (
    <CardShell>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        Stability Insight
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Stability" value={`${formatValue(stability.value)}%`} />
        <MiniStat label="Impact" value={stability.impactLabel} note={stability.impactText} />
        <MiniStat label="Pressure" value={stability.pressureLabel} note={stability.pressureText} />
        <MiniStat label="Repair Support" value={stability.repairSupportLabel} note={stability.repairSupportText} />
      </div>
    </CardShell>
  );
}

function DailyProgressBlock({ progress }) {
  if (!progress) return null;
  return (
    <CardShell>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
        Daily Progress
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat
          label="Daily MLEO (BASE)"
          value={`${formatValue(
            (progress.mleoDailyProgress?.current ?? progress.shipProgress?.current) || 0
          )}/${formatValue(
            (progress.mleoDailyProgress?.max ?? progress.shipProgress?.max) || 0
          )}`}
        />
        <MiniStat label="Expeditions" value={formatValue(progress.expeditionsDone || 0, 0)} />
        <MiniStat label="Maintenance" value={formatValue(progress.maintenanceDone || 0, 0)} />
        <MiniStat
          label="Missions"
          value={`${formatValue(progress.missionsReady || 0, 0)} ready`}
          note={`${formatValue(progress.missionsCompleted || 0, 0)} completed`}
        />
      </div>
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
      <SectionHeader
        title="Command Identity"
        hint={!isOpen ? "Current crew role and commander path" : null}
        right={<SectionButton isOpen={isOpen} onClick={() => toggleInnerPanel(openKey)} />}
      />
      {isOpen ? (
        <div className="space-y-3 text-sm">
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

function ContractsCard({
  liveContractsAvailableCount,
  liveContracts,
  openInnerPanel,
  toggleInnerPanel,
  onClaimContract,
}) {
  const openKey = "overview-contracts";
  const isOpen = openInnerPanel === openKey;

  return (
    <CardShell data-base-target="contracts" className="h-full">
      <SectionHeader
        title="Live Contracts"
        hint={
          !isOpen
            ? liveContractsAvailableCount > 0
              ? `${liveContractsAvailableCount} contract reward${
                  liveContractsAvailableCount > 1 ? "s" : ""
                } ready`
              : "No contract rewards ready right now"
            : null
        }
        right={
          <div className="flex items-center gap-2">
            <AvailabilityBadge count={liveContractsAvailableCount} />
            <SectionButton isOpen={isOpen} onClick={() => toggleInnerPanel(openKey)} />
          </div>
        }
      />

      {isOpen ? (
        <div className="space-y-3">
          {[...(liveContracts || [])]
            .sort((a, b) => {
              const aReady = a.done && !a.claimed ? 1 : 0;
              const bReady = b.done && !b.claimed ? 1 : 0;
              return bReady - aReady;
            })
            .map((contract) => (
              <div key={contract.key} className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="font-bold text-white">{contract.title}</div>
                {contract.contractClass === "advanced" ? (
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

  return (
    <div className="space-y-4">
      <BaseStatusBlock
        status={{
          ...(safeOverview.baseStatus || {}),
          chips: safeOverview.bottleneckChips || [],
        }}
      />
      <BottleneckBlock bottleneck={safeOverview.bottleneck} onNavigate={onNavigate} />
      <NextActionBlock action={safeOverview.nextAction || actionFallback} onNavigate={onNavigate} />
      <RecoveryHintBlock hint={safeOverview.recoveryHint} onNavigate={onNavigate} />
      <MissionFocusBlock missionGuidance={missionGuidance} onNavigate={onNavigate} />
      <TodaysLoopBlock steps={safeOverview.todaysLoop} onNavigate={onNavigate} />
      <RatesBlock rates={safeOverview.rates} />
      <StabilityBlock stability={safeOverview.stability} />
      <DailyProgressBlock progress={safeOverview.dailyProgress} />

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
  );
}
