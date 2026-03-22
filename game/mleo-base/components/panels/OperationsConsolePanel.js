function OpsHintSurface({ wrapClass, children }) {
  if (!children) return null;
  if (!wrapClass) return children;
  return <div className={wrapClass}>{children}</div>;
}

export function OperationsConsolePanel({
  panelTone,
  showExpeditions,
  highlightRingClass,
  shipping,
  expedition,
  blueprint,
  maintenance,
}) {
  const tone = panelTone || {};
  const hintWrap = tone.opsHintWrap || "";

  return (
    <div className={`grid gap-3 md:grid-cols-2 ${tone.opsGrid || ""}`}>
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
            Sends all current banked MLEO to the shared vault. MLEO production inside BASE uses a daily cap
            + softcut; shipping itself is not daily-limited.
          </p>
          <OpsHintSurface wrapClass={hintWrap}>{shipping.freightHint}</OpsHintSurface>
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
            <div className="text-sm font-semibold text-cyan-200">Expedition</div>
            <p className="mt-1 text-sm text-white/70">
              Send your field team to gather resources.
            </p>
            <OpsHintSurface wrapClass={hintWrap}>{expedition.expeditionHint}</OpsHintSurface>

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
            data-base-target="expedition-action"
            onClick={expedition.onLaunch}
            disabled={!expedition.canExpeditionNow}
            className={`mt-auto w-full rounded-2xl px-4 py-3.5 text-sm font-extrabold transition ${
              expedition.canExpeditionNow
                ? "bg-cyan-600 text-slate-950 hover:bg-cyan-500"
                : "bg-white/10 text-white/45"
            } ${expedition.buttonHighlighted ? highlightRingClass : ""}`}
          >
            {expedition.canExpeditionNow ? "Start Expedition" : expedition.buttonText}
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

        <div className="flex min-h-[160px] flex-col pr-8">
          <div className="text-sm font-semibold text-fuchsia-200">Blueprint Cache</div>
          <p className="mt-1 text-sm text-white/70">
            Costs {blueprint.costText} shared MLEO + {blueprint.dataCostText} DATA. Raises banking
            efficiency permanently (stronger refinery bank bonus scaling).
          </p>
        </div>

        <div className="mt-auto grid grid-cols-1 gap-2 pt-1">
          <button
            onClick={blueprint.onBuy}
            disabled={!blueprint.canBuy}
            className={`w-full rounded-xl px-3 py-3 text-sm font-bold transition ${
              blueprint.canBuy ? "bg-fuchsia-600 text-white hover:bg-fuchsia-500" : "bg-white/10 text-white/45"
            }`}
          >
            {blueprint.buttonText}
          </button>
        </div>
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
            <button
              type="button"
              onClick={maintenance.onSafeMode}
              aria-pressed={maintenance.powerPresetActive === "safe"}
              title={
                maintenance.powerPresetActive === "safe"
                  ? "Safe 50% is ON (all runtime buildings match this preset)"
                  : "Safe 50% is OFF — click to apply"
              }
              className={`relative z-10 inline-flex cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 active:scale-[0.98] ${
                maintenance.powerPresetActive === "safe"
                  ? "border-2 border-cyan-200/90 bg-gradient-to-b from-cyan-500/40 to-cyan-700/30 text-white shadow-[0_0_20px_rgba(34,211,238,0.55)] ring-1 ring-cyan-300/50"
                  : "border border-cyan-400/35 bg-slate-950/90 text-cyan-100/85 shadow-sm hover:border-cyan-300/50 hover:bg-cyan-950/70 hover:text-cyan-50"
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  maintenance.powerPresetActive === "safe"
                    ? "bg-cyan-300 shadow-[0_0_10px_#67e8f9]"
                    : "bg-cyan-950 ring-1 ring-cyan-700/60"
                }`}
                aria-hidden
              />
              {maintenance.safeModeButtonText || "Safe 50%"}
              <span
                className={`text-[9px] font-black uppercase tracking-wider ${
                  maintenance.powerPresetActive === "safe" ? "text-cyan-50" : "text-cyan-300/50"
                }`}
              >
                {maintenance.powerPresetActive === "safe" ? "ON" : "OFF"}
              </span>
            </button>
            <button
              type="button"
              onClick={maintenance.onNormalMode}
              aria-pressed={maintenance.powerPresetActive === "normal"}
              title={
                maintenance.powerPresetActive === "normal"
                  ? "Normal 100% is ON (all runtime buildings at 100%)"
                  : "Normal 100% is OFF — click to apply"
              }
              className={`relative z-10 inline-flex cursor-pointer touch-manipulation select-none items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-bold transition-all duration-200 active:scale-[0.98] ${
                maintenance.powerPresetActive === "normal"
                  ? "border-2 border-white/80 bg-gradient-to-b from-white/25 to-white/10 text-white shadow-[0_0_18px_rgba(255,255,255,0.22)] ring-1 ring-white/40"
                  : "border border-white/20 bg-slate-950/90 text-white/80 shadow-sm hover:border-white/40 hover:bg-white/10 hover:text-white"
              }`}
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  maintenance.powerPresetActive === "normal"
                    ? "bg-white shadow-[0_0_10px_rgba(255,255,255,0.9)]"
                    : "bg-white/15 ring-1 ring-white/25"
                }`}
                aria-hidden
              />
              {maintenance.normalModeButtonText || "Normal 100%"}
              <span
                className={`text-[9px] font-black uppercase tracking-wider ${
                  maintenance.powerPresetActive === "normal" ? "text-white" : "text-white/50"
                }`}
              >
                {maintenance.powerPresetActive === "normal" ? "ON" : "OFF"}
              </span>
            </button>
          </div>

          {maintenance.powerPresetActive === "mixed" ? (
            <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200/85">
              Custom power mix — tap Safe 50% or Normal 100% to align all buildings
            </p>
          ) : maintenance.powerPresetActive === "none" ? (
            <p className="mt-1.5 text-[10px] text-white/45">
              Presets apply when you have runtime production buildings.
            </p>
          ) : null}

          <p className="mt-2 text-xs text-white/55">
            Stability: {maintenance.stabilityText}%
          </p>
          {hintWrap && (maintenance.overclockHint || maintenance.maintenanceHint) ? (
            <div className={hintWrap}>
              {maintenance.overclockHint}
              {maintenance.maintenanceHint}
            </div>
          ) : (
            <>
              {maintenance.overclockHint}
              {maintenance.maintenanceHint}
            </>
          )}
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <button
            type="button"
            data-base-target="overclock"
            onClick={maintenance.onOverclock}
            className={`rounded-xl bg-amber-600 px-3 py-3 text-sm font-bold text-white hover:bg-amber-500 ${
              maintenance.highlightOverclock
                ? "ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-amber-500/10"
                : ""
            }`}
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

