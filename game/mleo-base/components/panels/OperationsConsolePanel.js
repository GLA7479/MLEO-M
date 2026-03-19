export function OperationsConsolePanel({
  showExpeditions,
  highlightRingClass,
  shipping,
  expedition,
  blueprint,
  maintenance,
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div
        data-base-target="shipping"
        className={`relative flex h-full flex-col gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4 ${
          shipping.highlightClass || ""
        } ${shipping.highlighted ? highlightRingClass : ""}`}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              shipping.onOpenInfo?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open shipping info"
            title="Info about shipping"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-emerald-200">Ship to Shared Vault</div>
          <p className="mt-1 text-sm text-white/70">
            Move refined MLEO into the main vault with a daily softcut, so BASE supports Miners instead
            of replacing it.
          </p>
        </div>

        <button
          onClick={shipping.onShip}
          disabled={!shipping.canShipNow}
          className={`mt-auto w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
            shipping.canShipNow
              ? "bg-emerald-600 text-white hover:bg-emerald-500"
              : "bg-white/10 text-white/45"
          }`}
        >
          Ship {shipping.bankedMleoText} MLEO
        </button>
      </div>

      {showExpeditions ? (
        <div
          data-base-target="expedition"
          className={`relative flex h-full flex-col gap-3 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 ${
            expedition.highlightClass || ""
          } ${expedition.highlighted ? highlightRingClass : ""}`}
        >
          <div className="absolute right-3 top-3 z-10">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                expedition.onOpenInfo?.();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
              aria-label="Open expedition info"
              title="Info about expedition"
            >
              i
            </button>
          </div>

          <div className="flex min-h-[88px] flex-col pr-8">
            <div className="text-sm font-semibold text-cyan-200">Field Expedition</div>
            <p className="mt-1 text-sm text-white/70">
              Potential rewards: Ore, Gold, Scrap, DATA, and sometimes banked MLEO. Typical outcome varies.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
                COST: 36 ENERGY
              </span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
                COST: 4 DATA
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
                CD: 120s
              </span>
            </div>
          </div>

          <button
            onClick={expedition.onLaunch}
            disabled={!expedition.canExpeditionNow}
            className={`mt-auto w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
              expedition.canExpeditionNow
                ? "bg-cyan-600 text-slate-950 hover:bg-cyan-500"
                : "bg-white/10 text-white/45"
            }`}
          >
            {expedition.buttonText}
          </button>
        </div>
      ) : null}

      <div
        data-base-target="blueprint"
        className={`relative rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4 ${
          blueprint.highlightClass || ""
        } ${blueprint.highlighted ? highlightRingClass : ""}`}
      >
        <div className="absolute right-3 top-3 z-10">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              blueprint.onOpenInfo?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
          <p className="mt-1 text-sm text-white/70">
            Costs {blueprint.costText} shared MLEO + {blueprint.dataCostText} DATA. Raises banking efficiency
            and daily ship cap permanently.
          </p>
        </div>

        <button
          onClick={blueprint.onBuy}
          disabled={!blueprint.canBuy}
          className={`mt-4 w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
            blueprint.canBuy ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500" : "bg-white/10 text-white/45"
          }`}
        >
          {blueprint.buttonText}
        </button>
      </div>

      <div
        data-base-target="maintenance"
        className={`relative rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 ${
          maintenance.highlightClass || ""
        } ${maintenance.highlighted ? highlightRingClass : ""}`}
      >
        <div className="absolute right-3 top-3 z-10 flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              maintenance.onOpenRefillInfo?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[11px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open refill info"
            title="Info about refill"
          >
            i
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              maintenance.onOpenMaintenanceInfo?.();
            }}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-500/10 text-[13px] font-black text-cyan-200 transition hover:bg-cyan-500/20 hover:text-white"
            aria-label="Open maintenance info"
            title="Info about maintenance"
          >
            i
          </button>
        </div>

        <div className="flex min-h-[88px] flex-col pr-8">
          <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
          <p className="mt-1 text-sm text-white/70">Spend shared MLEO on productivity instead of pure emissions.</p>

          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-3 py-1 text-[11px] font-bold text-cyan-200">
              OVERCLOCK: 900 + 12 DATA
            </span>
            <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-3 py-1 text-[11px] font-bold text-amber-200">
              REFILL: 180 + 5 DATA
            </span>
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold text-white/75">
              MAINTAIN: STABILITY
            </span>
          </div>

          <p className="mt-2 text-xs text-white/55">
            Stability: {maintenance.stabilityText}%
          </p>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            onClick={maintenance.onOverclock}
            className="rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold text-white hover:bg-amber-500"
          >
            {maintenance.overclockButtonText}
          </button>
          <button
            onClick={maintenance.onRefill}
            className="rounded-xl bg-white/10 px-3 py-3 text-sm font-bold text-white hover:bg-white/20"
          >
            {maintenance.refillButtonText}
          </button>
          <button
            onClick={maintenance.onMaintain}
            className={`rounded-xl px-3 py-3 text-sm font-bold text-white ${
              maintenance.systemState === "critical"
                ? "bg-rose-600 hover:bg-rose-500"
                : maintenance.systemState === "warning"
                ? "bg-amber-600 hover:bg-amber-500"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            Maintain
          </button>
        </div>
      </div>
    </div>
  );
}

