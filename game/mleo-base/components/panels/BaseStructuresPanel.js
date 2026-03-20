function AvailabilityBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-slate-950">
      AVAILABLE
    </span>
  );
}

function availabilityCardClass(isAvailable) {
  return isAvailable ? "border-cyan-400/30 bg-cyan-500/5" : "border-white/10 bg-black/20";
}

export function BaseStructuresPanel({
  structuresTab,
  onSetStructuresTab,
  cards,
  highlightTarget,
  powerSteps,
  onOpenBuildingInfo,
  onChangePowerMode,
  onBuyBuilding,
}) {
  return (
    <div>
      <div className="mb-3 flex gap-2">
        <button
          onClick={() => onSetStructuresTab("core")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
            structuresTab === "core"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          Core
        </button>
        <button
          onClick={() => onSetStructuresTab("expansion")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold transition ${
            structuresTab === "expansion"
              ? "bg-cyan-400 text-slate-950"
              : "border border-white/10 bg-white/5 text-white/75"
          }`}
        >
          Expansion
        </button>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {(cards || []).map((card) => {
          const highlighted = highlightTarget === card.key;
          return (
            <div
              key={card.key}
              data-base-target={card.key}
              className={`flex min-h-[328px] flex-col rounded-xl border p-3 ${availabilityCardClass(
                card.ready
              )} ${
                highlighted
                  ? "border-cyan-300/70 ring-2 ring-cyan-300/35 shadow-[0_0_0_1px_rgba(103,232,249,0.25)]"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1 pr-2">
                  <div className="line-clamp-1 h-[20px] text-[15px] font-semibold leading-5 text-white">
                    {card.name}
                  </div>
                </div>

                <div className="shrink-0 flex flex-col items-end gap-1">
                  <div className="h-[28px] flex items-center justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBuildingInfo?.(card.key);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
                      aria-label={`Open info for ${card.name}`}
                      title={`Info about ${card.name}`}
                    >
                      i
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-1 flex items-center justify-between">
                <div className="rounded-full bg-white/10 px-2 py-1 text-[11px] font-semibold text-white/65">
                  Lv {card.level}
                </div>

                <div className="h-[24px] flex items-center">
                  {card.ready ? <AvailabilityBadge /> : null}
                </div>
              </div>

              <div className="mt-1 h-[38px] overflow-hidden text-[11px] leading-[1.2rem] text-white/60 line-clamp-2">
                {card.desc}
              </div>

              <div className="mt-1.5 min-h-[24px] max-h-[24px] overflow-hidden">
                <div className="flex flex-wrap gap-1.5">
                  <div className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                    {card.roleTagText}
                  </div>
                  <div className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-[11px] font-semibold text-cyan-200">
                    {card.synergyTagText}
                  </div>
                </div>
              </div>

              <div className="mt-2 h-[22px]">
                <div className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[10px] text-white/65">
                  {card.sectorStatusText}
                </div>
              </div>

              <div className="mt-1.5 h-[18px] text-[11px] font-medium text-cyan-200/85">
                Next Lv {card.nextLevel}
              </div>

              <div className="mt-1 h-[34px]">
                {card.upgradeImpactPreview ? (
                  <div className="rounded-lg border border-cyan-400/20 bg-cyan-500/8 px-2.5 py-1">
                    <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200/70">
                      {card.upgradeImpactPreview.label}
                    </div>
                    <div className="text-[11px] font-semibold text-cyan-100">
                      {card.upgradeImpactPreview.value}
                    </div>
                  </div>
                ) : (
                  <div className="h-[34px]" />
                )}
              </div>

              <div className="mt-1 h-[14px] text-[10px] font-black uppercase tracking-[0.18em] text-white/40">
                Cost
              </div>

              {card.costRow}

              <div className="mt-auto flex flex-col justify-end pt-0 pb-3">
                <div className="text-[10px] font-semibold text-white/50">
                  {card.energyLineText}
                </div>
                <div className="mt-1 text-[10px] font-semibold text-cyan-200/70">
                  {card.powerLineText}
                </div>

                <div className="mt-2 flex w-full flex-col gap-2">
                  {card.canThrottle && card.level > 0 ? (
                    <div className="mt-3 grid grid-cols-5 gap-1.5">
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
                    <div className="grid grid-cols-5 gap-1.5 opacity-0 pointer-events-none">
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

                  <button
                    onClick={() => onBuyBuilding?.(card.key)}
                    disabled={!card.ready || card.buildBusy}
                    className={`w-full rounded-xl px-3 py-2 text-xs font-semibold leading-none transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40 ${
                      card.canAffordCost
                        ? "bg-white/10"
                        : "bg-white/10 opacity-70"
                    }`}
                  >
                    {card.buildBusy ? "Building..." : card.buttonText}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

