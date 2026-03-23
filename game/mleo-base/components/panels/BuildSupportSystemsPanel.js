function AvailabilityBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-1.5 py-0.5 text-[9px] font-black tracking-[0.12em] text-slate-950">
      AVAILABLE
    </span>
  );
}

function availabilityCardClass(isAvailable) {
  return isAvailable
    ? "border-cyan-400/22 bg-cyan-500/[0.04]"
    : "border-white/[0.08] bg-white/[0.025]";
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
  overclockVisualDisabled = false,
  refillVisualDisabled = false,
  maintainVisualDisabled = false,
  overclockStatusLabel = "",
  refillStatusLabel = "",
  maintainStatusLabel = "",
}) {
  return (
    <div className="space-y-2">
      <div className={`relative rounded-xl border p-2.5 sm:p-3 ${availabilityCardClass(canBuyBlueprintNow)}`}>
        <div className="absolute right-2 top-2 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenBlueprintInfo?.();
            }}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-white/12 bg-white/5 text-[10px] font-semibold text-fuchsia-200/75 outline-none transition hover:border-fuchsia-400/25 hover:bg-fuchsia-500/10 hover:text-fuchsia-100 focus-visible:ring-2 focus-visible:ring-fuchsia-400/30"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>

        <div className="flex flex-col pr-7">
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm font-medium text-white/88">Blueprint Cache</div>
            {canBuyBlueprintNow ? <AvailabilityBadge /> : null}
          </div>

          <p className="mt-0.5 text-[11px] leading-snug text-white/50">
            Shipment cap & bank efficiency upgrade.
          </p>

          <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/32">Cost</div>
          <div className="mt-0.5 text-[11px] font-medium text-white/72">
            {blueprintCostText} shared MLEO · DATA {blueprintDataCostText}
          </div>
        </div>

        <button
          type="button"
          onClick={onBuyBlueprint}
          className="mt-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.07] px-3 py-2 text-sm font-bold text-white outline-none transition hover:bg-white/12 focus-visible:ring-2 focus-visible:ring-white/25 active:scale-[0.99] motion-reduce:active:scale-100"
        >
          {blueprintButtonText}
        </button>

        <div className="mt-1 min-h-[16px] text-center text-[10px] leading-tight text-white/40">{blueprintStatusText}</div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onOverclock}
          aria-disabled={overclockVisualDisabled ? "true" : undefined}
          data-disabled={overclockVisualDisabled ? "true" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] px-2 py-2 text-xs font-bold text-white/85 outline-none transition focus-visible:ring-2 focus-visible:ring-white/20 sm:text-sm ${
            overclockVisualDisabled
              ? "opacity-65 saturate-[0.85] hover:bg-white/[0.06] cursor-default"
              : "hover:bg-white/10"
          }`}
        >
          Overclock
        </button>

        <button
          type="button"
          onClick={onRefill}
          aria-disabled={refillVisualDisabled ? "true" : undefined}
          data-disabled={refillVisualDisabled ? "true" : undefined}
          className={`flex min-h-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] px-2 py-2 text-xs font-bold text-white/85 outline-none transition focus-visible:ring-2 focus-visible:ring-white/20 sm:text-sm ${
            refillVisualDisabled
              ? "opacity-65 saturate-[0.85] hover:bg-white/[0.06] cursor-default"
              : "hover:bg-white/10"
          }`}
        >
          Refill
        </button>
      </div>
      <div className="mt-1 grid min-h-[16px] grid-cols-2 gap-2 text-center text-[10px] leading-snug">
        <div className={overclockStatusLabel === "Cooldown" ? "text-amber-200/75" : "text-white/50"}>
          {overclockStatusLabel}
        </div>
        <div className={refillStatusLabel === "Insufficient resources" ? "text-rose-200/70" : "text-white/50"}>
          {refillStatusLabel}
        </div>
      </div>

      <button
        type="button"
        onClick={onMaintain}
        aria-disabled={maintainVisualDisabled ? "true" : undefined}
        data-disabled={maintainVisualDisabled ? "true" : undefined}
        className={`flex min-h-11 w-full items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.06] px-3 py-2 text-xs font-bold text-white/85 outline-none transition focus-visible:ring-2 focus-visible:ring-white/20 sm:text-sm ${
          maintainVisualDisabled
            ? "opacity-65 saturate-[0.85] hover:bg-white/[0.06] cursor-default"
            : "hover:bg-white/10"
        }`}
      >
        Maintain
      </button>
      <div className="mt-1 min-h-[16px] text-center text-[10px] leading-snug text-white/50">
        {maintainStatusLabel}
      </div>
    </div>
  );
}
