function SectionAvailabilityBadge({ count }) {
  if (!count) return null;
  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

function toneClass(tone) {
  if (tone === "critical") return "border-red-300/45 bg-red-500/12";
  if (tone === "warning") return "border-amber-300/45 bg-amber-500/12";
  if (tone === "success") return "border-emerald-300/45 bg-emerald-500/12";
  return "border-cyan-300/35 bg-cyan-500/10";
}

function formatRate(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  if (num >= 1000) return num.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (num >= 100) return num.toFixed(1);
  if (num >= 10) return num.toFixed(2);
  return num.toFixed(3);
}

function ProgressBar({ current, max }) {
  const safeMax = Math.max(0, Number(max || 0));
  const safeCurrent = Math.max(0, Number(current || 0));
  const ratio = safeMax > 0 ? Math.min(100, (safeCurrent / safeMax) * 100) : 0;
  return (
    <div className="mt-2">
      <div className="flex items-center justify-between text-[11px] text-white/65">
        <span>{safeCurrent.toLocaleString()}</span>
        <span>{safeMax.toLocaleString()}</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${ratio}%` }} />
      </div>
    </div>
  );
}

export function OverviewPanelCards({
  buildSectionCardClass,
  openInnerPanel,
  toggleInnerPanel,
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  onOpenBuildPanel,
  showCrew,
  overviewIdentityCount,
  crewRoleInfo,
  roleBonusText,
  commanderPathInfo,
  commanderPathText,
  liveContractsAvailableCount,
  liveContracts,
  highlightTarget,
  isHighlightedTarget,
  highlightCard,
  onClaimContract,
  overview,
  onNavigate,
}) {
  const baseStatus = overview?.baseStatus || {
    label: "Stable",
    tone: "success",
    text: "Core systems are healthy and the base is ready for efficient growth.",
  };
  const bottleneck = overview?.bottleneck || {
    label: "No critical issue",
    tone: "success",
    text: "No major bottleneck detected right now.",
    target: { tab: "overview", target: "recommendation" },
  };
  const nextAction = overview?.nextAction || {
    title: "Scale efficiently",
    text: "No urgent issue detected. Push your strongest economy upgrade.",
    cta: "Open Build",
    target: { tab: "build", target: "refinery" },
  };
  const rates = overview?.rates || {};
  const progress = overview?.dailyProgress || {};

  return (
    <div className="grid gap-4">
      <div className={`rounded-3xl border p-4 ${toneClass(baseStatus.tone)}`}>
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">Base Status</div>
        <div className="mt-1 text-xl font-black text-white">{baseStatus.label}</div>
        <div className="mt-1 text-sm text-white/75">{baseStatus.text}</div>
      </div>

      <div
        data-base-target={bottleneck?.target?.target || "recommendation"}
        className={`rounded-3xl border p-4 ${toneClass(bottleneck.tone)}`}
      >
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">
          Main Bottleneck
        </div>
        <div className="mt-1 text-lg font-bold text-white">{bottleneck.label}</div>
        <div className="mt-1 text-sm text-white/75">{bottleneck.text}</div>
        {bottleneck?.target ? (
          <button
            onClick={() => onNavigate?.(bottleneck.target)}
            className="mt-3 rounded-xl border border-white/20 bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
          >
            Focus this issue
          </button>
        ) : null}
      </div>

      <div
        data-base-target={nextAction?.target?.target || "recommendation"}
        className="rounded-3xl border border-cyan-300/35 bg-cyan-500/10 p-4"
      >
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">
          Best Next Action
        </div>
        <div className="mt-1 text-lg font-bold text-white">{nextAction.title}</div>
        <div className="mt-1 text-sm text-white/75">{nextAction.text}</div>
        {nextAction?.target ? (
          <button
            onClick={() => onNavigate?.(nextAction.target)}
            className="mt-3 rounded-xl border border-cyan-300/40 bg-cyan-400/20 px-3 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-400/30"
          >
            {nextAction.cta || "Open"}
          </button>
        ) : null}
      </div>

      <div className="rounded-3xl border border-white/12 bg-white/5 p-4">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">Live Rates</div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] text-white/55">Banked / hr</div>
            <div className="text-sm font-bold text-white">{formatRate(rates.bankedPerHour || 0)} MLEO</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] text-white/55">Projected / day</div>
            <div className="text-sm font-bold text-white">{formatRate(rates.projectedPerDay || 0)} MLEO</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] text-white/55">ORE / hr</div>
            <div className="text-sm font-bold text-white">{formatRate(rates.orePerHour || 0)}</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-[11px] text-white/55">DATA / hr</div>
            <div className="text-sm font-bold text-white">{formatRate(rates.dataPerHour || 0)}</div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-white/12 bg-white/5 p-4">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-white/55">
          Daily Progress
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-white">Ship Progress</div>
            <ProgressBar
              current={progress?.shipProgress?.current || 0}
              max={progress?.shipProgress?.max || 0}
            />
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-white">Missions</div>
            <div className="mt-2 text-sm text-white/75">
              Ready: <span className="font-bold text-white">{progress?.missionsReady || 0}</span>
            </div>
            <div className="text-sm text-white/75">
              Completed:{" "}
              <span className="font-bold text-white">{progress?.missionsCompleted || 0}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-white">Expeditions Done</div>
            <div className="mt-2 text-lg font-black text-white">
              {(progress?.expeditionsDone || 0).toLocaleString()}
            </div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <div className="text-xs font-semibold text-white">Maintenance Done</div>
            <div className="mt-2 text-lg font-black text-white">
              {(progress?.maintenanceDone || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {buildOpportunitiesCount > 0 ? (
          <button
            onClick={onOpenBuildPanel}
            className="w-full rounded-3xl border border-cyan-400/20 bg-cyan-500/6 p-4 text-left shadow-[0_0_18px_rgba(34,211,238,0.06)]"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-extrabold text-white">Build opportunities</div>
                <div className="mt-1 text-sm text-cyan-100/75">
                  {availableStructuresCount > 0 ? `${availableStructuresCount} structures` : null}
                  {availableStructuresCount > 0 && availableModulesCount > 0 ? " · " : null}
                  {availableModulesCount > 0 ? `${availableModulesCount} modules` : null}
                  {(availableStructuresCount > 0 || availableModulesCount > 0) &&
                  availableResearchCount > 0
                    ? " · "
                    : null}
                  {availableResearchCount > 0 ? `${availableResearchCount} research` : null}
                </div>
              </div>
              <span className="inline-flex min-w-7 h-7 items-center justify-center rounded-full bg-cyan-400 px-2 text-xs font-black text-slate-950">
                {buildOpportunitiesCount}
              </span>
            </div>
          </button>
        ) : (
          <div className="rounded-3xl border border-white/12 bg-white/5 p-4">
            <div className="text-lg font-extrabold text-white">Build opportunities</div>
            <div className="mt-1 text-sm text-white/60">No affordable upgrades right now.</div>
          </div>
        )}

        {showCrew ? (
          <div className={`rounded-3xl border p-3.5 transition ${buildSectionCardClass(overviewIdentityCount > 0)}`}>
            <div className="text-lg font-bold text-white">Command Identity</div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-semibold text-white">{crewRoleInfo.name}</div>
                <div className="mt-1 text-xs text-white/60">{roleBonusText}</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                <div className="text-sm font-semibold text-white">{commanderPathInfo.name}</div>
                <div className="mt-1 text-xs text-white/60">{commanderPathText}</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-white/12 bg-white/5 p-4">
            <div className="text-lg font-bold text-white">Command Identity</div>
            <div className="mt-1 text-sm text-white/60">Unlock HQ level 3 to access crew identity.</div>
          </div>
        )}

        <div
          data-base-target="contracts"
          className={`${buildSectionCardClass(liveContractsAvailableCount > 0)} ${
            isHighlightedTarget("contracts", highlightTarget)
              ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
              : ""
          } rounded-3xl border p-3.5 transition`}
        >
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Live Contracts</div>
            <SectionAvailabilityBadge count={liveContractsAvailableCount} />
          </div>
          <div className="mt-2 text-sm text-white/60">
            {liveContractsAvailableCount > 0
              ? `${liveContractsAvailableCount} contract reward${liveContractsAvailableCount > 1 ? "s" : ""} ready`
              : "No contract rewards ready right now"}
          </div>
          <button
            onClick={() => toggleInnerPanel("overview-contracts")}
            className="mt-3 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
          >
            {openInnerPanel === "overview-contracts" ? "CLOSE" : "OPEN"}
          </button>
          {openInnerPanel === "overview-contracts" ? (
            <div className="mt-3 grid gap-2">
              {[...liveContracts]
                .sort((a, b) => {
                  const aReady = a.done && !a.claimed ? 1 : 0;
                  const bReady = b.done && !b.claimed ? 1 : 0;
                  return bReady - aReady;
                })
                .map((contract) => (
                  <div
                    key={contract.key}
                    className={`rounded-2xl border border-white/10 bg-black/20 p-3 ${
                      contract.done && !contract.claimed ? highlightCard(true, "success") : ""
                    }`}
                  >
                    <div className="text-sm font-semibold text-white">{contract.title}</div>
                    <div className="mt-1 text-xs text-white/60">{contract.rewardText}</div>
                    <button
                      onClick={() => onClaimContract(contract.key)}
                      disabled={!contract.done || contract.claimed}
                      className="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40"
                    >
                      {contract.claimed ? "Claimed" : contract.done ? "Claim" : "In Progress"}
                    </button>
                  </div>
                ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
