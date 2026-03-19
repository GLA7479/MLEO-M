function SectionHeader({ title, hint, openInnerPanel, openKey }) {
  return (
    <>
      <div className="text-lg font-bold text-white">{title}</div>
      {openInnerPanel !== openKey ? hint : null}
    </>
  );
}

function SectionAvailabilityBadge({ count }) {
  if (!count) return null;

  return (
    <span className="inline-flex min-w-6 h-6 items-center justify-center rounded-full bg-cyan-400 px-2 text-[11px] font-black text-slate-950">
      {count}
    </span>
  );
}

function OverviewRecommendationCard({
  cardClass,
  openInnerPanel,
  toggleInnerPanel,
  openKey = "overview-recommendation",
  hint,
  inner,
}) {
  return (
    <div className={`rounded-3xl border p-3.5 transition ${cardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <SectionHeader
            title="Next Recommended Step"
            hint={hint}
            openInnerPanel={openInnerPanel}
            openKey={openKey}
          />
        </div>

        <button
          onClick={() => toggleInnerPanel(openKey)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          {openInnerPanel === openKey ? "CLOSE" : "OPEN"}
        </button>
      </div>

      {openInnerPanel === openKey ? inner : null}
    </div>
  );
}

function OverviewIdentityCard({
  showCrew,
  cardClass,
  openInnerPanel,
  toggleInnerPanel,
  openKey = "overview-identity",
  hint,
  inner,
}) {
  if (!showCrew) return null;

  return (
    <div className={`rounded-3xl border p-3.5 transition ${cardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-lg font-bold text-white">Command Identity</div>
          {openInnerPanel !== openKey ? hint : null}
        </div>

        <button
          onClick={() => toggleInnerPanel(openKey)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          {openInnerPanel === openKey ? "CLOSE" : "OPEN"}
        </button>
      </div>

      {openInnerPanel === openKey ? inner : null}
    </div>
  );
}

function OverviewContractsCard({
  cardClass,
  availableCount,
  openInnerPanel,
  toggleInnerPanel,
  openKey = "overview-contracts",
  hint,
  inner,
}) {
  return (
    <div data-base-target="contracts" className={`rounded-3xl border p-3.5 transition ${cardClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="text-lg font-bold text-white">Live Contracts</div>
            <SectionAvailabilityBadge count={availableCount} />
          </div>
          {openInnerPanel !== openKey ? hint : null}
        </div>

        <button
          onClick={() => toggleInnerPanel(openKey)}
          className="shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
        >
          {openInnerPanel === openKey ? "CLOSE" : "OPEN"}
        </button>
      </div>

      {openInnerPanel === openKey ? inner : null}
    </div>
  );
}

export function OverviewPanelCards({
  buildSectionCardClass,
  openInnerPanel,
  toggleInnerPanel,
  overviewRecommendationCount,
  nextStep,
  buildOpportunitiesCount,
  availableStructuresCount,
  availableModulesCount,
  availableResearchCount,
  availableBlueprintCount,
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
}) {
  return (
    <>
      <OverviewRecommendationCard
        cardClass={buildSectionCardClass(overviewRecommendationCount > 0)}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        hint={<div className="mt-1 text-sm text-white/60">Suggested next action for your base</div>}
        inner={
          <div className="mt-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
            <div className="text-base font-bold text-white">{nextStep.title}</div>
            <div className="mt-1 text-sm text-white/70">{nextStep.text}</div>
          </div>
        }
      />

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
                {(availableStructuresCount > 0 ||
                  availableModulesCount > 0 ||
                  availableResearchCount > 0) &&
                availableBlueprintCount > 0
                  ? " · "
                  : null}
                {availableBlueprintCount > 0 ? "blueprint ready" : null}
              </div>
            </div>
            <span className="inline-flex min-w-7 h-7 items-center justify-center rounded-full bg-cyan-400 px-2 text-xs font-black text-slate-950">
              {buildOpportunitiesCount}
            </span>
          </div>
        </button>
      ) : null}

      {showCrew ? (
        <OverviewIdentityCard
          showCrew={showCrew}
          cardClass={buildSectionCardClass(overviewIdentityCount > 0)}
          openInnerPanel={openInnerPanel}
          toggleInnerPanel={toggleInnerPanel}
          hint={<div className="mt-1 text-sm text-white/60">Current crew role and commander path</div>}
          inner={
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
          }
        />
      ) : null}

      <OverviewContractsCard
        cardClass={`${buildSectionCardClass(liveContractsAvailableCount > 0)} ${
          isHighlightedTarget("contracts", highlightTarget)
            ? "ring-2 ring-cyan-300/90 border-cyan-300 bg-cyan-400/10 shadow-[0_0_0_1px_rgba(103,232,249,0.45),0_0_28px_rgba(34,211,238,0.18)]"
            : ""
        }`}
        availableCount={liveContractsAvailableCount}
        openInnerPanel={openInnerPanel}
        toggleInnerPanel={toggleInnerPanel}
        hint={
          <div className="mt-1 text-sm text-white/60">
            {liveContractsAvailableCount > 0
              ? `${liveContractsAvailableCount} contract reward${
                  liveContractsAvailableCount > 1 ? "s" : ""
                } ready`
              : "No contract rewards ready right now"}
          </div>
        }
        inner={
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
        }
      />
    </>
  );
}
