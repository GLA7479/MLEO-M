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

export function BuildSupportSystemsPanel({
  canBuyBlueprintNow,
  blueprintCostText,
  blueprintDataCostText,
  blueprintButtonText,
  blueprintStatusText,
  onOpenBlueprintInfo,
  onBuyBlueprint,
  onOverclock,
  onRefill,
  onMaintain,
}) {
  return (
    <div className="space-y-3">
      <div
        className={`relative rounded-2xl border p-3.5 ${availabilityCardClass(canBuyBlueprintNow)}`}
      >
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBlueprintInfo?.();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[20px] flex-col pr-8">
          <div className="flex items-start justify-between gap-2">
            <div className="text-base font-bold text-white">Blueprint Cache</div>
            {canBuyBlueprintNow ? <AvailabilityBadge /> : null}
          </div>

          <div className="mt-1 text-sm text-white/65">
            Upgrade your shipment capacity and long-term bank efficiency.
          </div>

          <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-white/40">
            Cost
          </div>

          <div className="mt-1 text-xs font-semibold text-white/80">
            {blueprintCostText} shared MLEO · DATA {blueprintDataCostText}
          </div>
        </div>

        <button
          onClick={onBuyBlueprint}
          className="mt-3 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          {blueprintButtonText}
        </button>

        <div className="mt-1 min-h-[20px] text-center text-[10px] leading-4 text-white/45">
          {blueprintStatusText}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={onOverclock}
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          Overclock
        </button>

        <button
          onClick={onRefill}
          className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
        >
          Refill
        </button>
      </div>

      <button
        onClick={onMaintain}
        className="w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3.5 text-sm font-extrabold text-white hover:bg-white/15"
      >
        Maintain
      </button>
    </div>
  );
}

