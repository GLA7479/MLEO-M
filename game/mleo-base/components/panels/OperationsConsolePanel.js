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
  const overclockStatusLabel = maintenance?.overclockStatusLabel || null;
  const refillStatusLabel = maintenance?.refillStatusLabel || null;
  const maintainStatusLabel = maintenance?.maintainStatusLabel || null;
  const overclockStatusTone = overclockStatusLabel === "Cooldown" ? "text-amber-200/75" : "text-white/55";
  const refillStatusTone = refillStatusLabel === "Insufficient resources" ? "text-rose-200/70" : "text-white/55";
  const maintainStatusTone =
    maintainStatusLabel === "Insufficient resources" ? "text-rose-200/70" : "text-white/55";

  return (
    <div className={`grid gap-2.5 md:grid-cols-2 ${tone.opsGrid || ""}`}>
      {/* Field + vault utilities first (active loop) */}
      {showExpeditions ? (
        <div
          data-base-target="expedition"
          className={`relative flex h-full flex-col gap-2.5 rounded-2xl border border-cyan-500/28 bg-cyan-500/[0.11] p-3 shadow-[0_0_22px_rgba(34,211,238,0.07)] sm:p-3.5 ${
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
              className="flex h-7 w-7 items-center justify-center rounded-full border border-cyan-400/40 bg-cyan-500/15 text-[13px] font-black text-cyan-100 outline-none transition hover:bg-cyan-500/25 hover:text-white focus-visible:ring-2 focus-visible:ring-cyan-400/45 active:scale-95 motion-reduce:active:scale-100"
              aria-label="Open expedition info"
              title="Info about expedition"
            >
              i
            </button>
          </div>

          <div className="flex min-h-0 flex-col pr-8">
            <div className="text-sm font-semibold text-cyan-200">Expedition</div>
            <p className="mt-0.5 text-[13px] leading-snug text-white/68">Field team gathers resources.</p>
            <OpsHintSurface wrapClass={hintWrap}>{expedition.expeditionHint}</OpsHintSurface>

            <div className="mt-2 flex min-w-0 flex-wrap gap-1.5">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-0.5 text-[10px] font-bold text-cyan-200">
                COST: 36 ENERGY
              </span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-0.5 text-[10px] font-bold text-amber-200">
                COST: 4 DATA
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-2.5 py-0.5 text-[10px] font-bold text-white/75">
                CD: 120s
              </span>
            </div>
          </div>

          <button
            data-base-target="expedition-action"
            onClick={expedition.onLaunch}
            disabled={!expedition.canExpeditionNow}
            className={`mt-auto flex min-h-11 w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-extrabold outline-none transition active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-cyan-300/55 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:active:scale-100 ${
              expedition.canExpeditionNow
                ? "bg-cyan-600 text-slate-950 shadow-[0_0_18px_rgba(34,211,238,0.22)] hover:bg-cyan-500"
                : "bg-white/10 text-white/45"
            } ${expedition.buttonHighlighted ? highlightRingClass : ""}`}
          >
            {expedition.canExpeditionNow ? "Start Expedition" : expedition.buttonText}
          </button>
        </div>
      ) : null}

      <div
        data-base-target="maintenance"
        className={`flex flex-col rounded-2xl border border-amber-500/22 bg-amber-500/[0.09] p-3 sm:p-3.5 ${
          maintenance.highlightClass || ""
        } ${maintenance.highlighted ? highlightRingClass : ""}`}
      >
        {/* Band 1 — title, purpose, info (no inner shell) */}
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-amber-200">Shared Vault Utilities</div>
            <p className="mt-0.5 text-[11px] leading-snug text-white/52">
              Overclock, refill, stability — shared MLEO.
            </p>
          </div>
          <div className="flex shrink-0 gap-1 pt-0.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                maintenance.onOpenRefillInfo?.();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/5 text-[11px] font-bold text-cyan-200/85 outline-none transition hover:border-cyan-400/35 hover:bg-cyan-500/15 hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/35 active:scale-95 motion-reduce:active:scale-100"
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
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/12 bg-white/5 text-[13px] font-bold text-cyan-200/85 outline-none transition hover:border-cyan-400/35 hover:bg-cyan-500/15 hover:text-cyan-100 focus-visible:ring-2 focus-visible:ring-cyan-400/35 active:scale-95 motion-reduce:active:scale-100"
              aria-label="Open maintenance info"
              title="Info about maintenance"
            >
              i
            </button>
          </div>
        </div>

        {/* Band 2 — costs + presets: side-by-side on sm+, stacked on narrow; light labels only */}
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 sm:items-start sm:gap-x-4">
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Costs</div>
            <div className="mt-0.5 flex flex-wrap gap-1">
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/55 sm:text-[10px]">
                OVERCLOCK: 900 + 12 DATA
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/55 sm:text-[10px]">
                REFILL: 180 + 5 DATA
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] font-semibold text-white/55 sm:text-[10px]">
                MAINTAIN: STABILITY
              </span>
            </div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-white/35">Preset</div>
            <div className="mt-0.5 grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={maintenance.onSafeMode}
                aria-pressed={maintenance.powerPresetActive === "safe"}
                title={
                  maintenance.powerPresetActive === "safe"
                    ? "Safe 50% is ON (all runtime buildings match this preset)"
                    : "Safe 50% is OFF — click to apply"
                }
                className={`relative z-10 flex min-h-11 w-full cursor-pointer touch-manipulation select-none items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-bold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500/10 active:scale-[0.98] sm:text-[11px] ${
                  maintenance.powerPresetActive === "safe"
                    ? "border-2 border-cyan-200/80 bg-gradient-to-b from-cyan-500/35 to-cyan-800/25 text-white shadow-[0_0_12px_rgba(34,211,238,0.3)] ring-1 ring-cyan-400/35"
                    : "border border-white/15 bg-slate-950/80 text-cyan-100/75 hover:border-cyan-400/35 hover:bg-slate-900/80 hover:text-cyan-50"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    maintenance.powerPresetActive === "safe"
                      ? "bg-cyan-300 shadow-[0_0_6px_#67e8f9]"
                      : "bg-cyan-950 ring-1 ring-cyan-800/50"
                  }`}
                  aria-hidden
                />
                <span className="truncate">{maintenance.safeModeButtonText || "Safe 50%"}</span>
                <span
                  className={`shrink-0 text-[8px] font-black uppercase tracking-wider sm:text-[9px] ${
                    maintenance.powerPresetActive === "safe" ? "text-cyan-100" : "text-cyan-400/45"
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
                className={`relative z-10 flex min-h-11 w-full cursor-pointer touch-manipulation select-none items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[10px] font-bold outline-none transition-all duration-200 focus-visible:ring-2 focus-visible:ring-white/35 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500/10 active:scale-[0.98] sm:text-[11px] ${
                  maintenance.powerPresetActive === "normal"
                    ? "border-2 border-white/70 bg-gradient-to-b from-white/20 to-white/[0.06] text-white shadow-[0_0_10px_rgba(255,255,255,0.12)] ring-1 ring-white/28"
                    : "border border-white/15 bg-slate-950/80 text-white/75 hover:border-white/30 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    maintenance.powerPresetActive === "normal"
                      ? "bg-white shadow-[0_0_6px_rgba(255,255,255,0.85)]"
                      : "bg-white/12 ring-1 ring-white/20"
                  }`}
                  aria-hidden
                />
                <span className="truncate">{maintenance.normalModeButtonText || "Normal 100%"}</span>
                <span
                  className={`shrink-0 text-[8px] font-black uppercase tracking-wider sm:text-[9px] ${
                    maintenance.powerPresetActive === "normal" ? "text-white" : "text-white/45"
                  }`}
                >
                  {maintenance.powerPresetActive === "normal" ? "ON" : "OFF"}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Band 3 — context then actions (single tight block) */}
        <div className="mt-2 space-y-0.5">
          {maintenance.powerPresetActive === "mixed" ? (
            <p className="text-[10px] leading-snug text-amber-200/65">Custom mix — align with Safe 50% or Normal 100%</p>
          ) : maintenance.powerPresetActive === "none" ? (
            <p className="text-[10px] leading-snug text-white/42">Presets need runtime production buildings.</p>
          ) : null}
          <p className="text-[11px] text-white/48">Stability: {maintenance.stabilityText}%</p>
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

        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <button
            type="button"
            data-base-target="overclock"
            onClick={maintenance.onOverclock}
            aria-disabled={maintenance.overclockVisualDisabled ? "true" : undefined}
            data-disabled={maintenance.overclockVisualDisabled ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl bg-amber-600 px-1.5 py-2 text-center text-[11px] font-bold leading-tight text-white outline-none transition focus-visible:ring-2 focus-visible:ring-amber-200/50 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500/15 active:scale-[0.99] motion-reduce:active:scale-100 sm:px-2 sm:text-sm ${
              maintenance.highlightOverclock
                ? "ring-2 ring-cyan-300/90 ring-offset-2 ring-offset-amber-500/10"
                : ""
            } ${
              maintenance.overclockVisualDisabled
                ? "opacity-65 saturate-[0.85] hover:bg-amber-600 cursor-default"
                : "hover:bg-amber-500"
            }`}
          >
            <span className="min-w-0 truncate">{maintenance.overclockButtonText}</span>
          </button>
          <button
            type="button"
            onClick={maintenance.onRefill}
            aria-disabled={maintenance.refillVisualDisabled ? "true" : undefined}
            data-disabled={maintenance.refillVisualDisabled ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl bg-white/10 px-1.5 py-2 text-center text-[11px] font-bold leading-tight text-white outline-none transition focus-visible:ring-2 focus-visible:ring-white/25 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500/15 active:scale-[0.99] motion-reduce:active:scale-100 sm:px-2 sm:text-sm ${
              maintenance.refillVisualDisabled
                ? "opacity-65 saturate-[0.85] hover:bg-white/10 cursor-default"
                : "hover:bg-white/20"
            }`}
          >
            <span className="min-w-0 truncate">{maintenance.refillButtonText}</span>
          </button>
          <button
            type="button"
            onClick={maintenance.onMaintain}
            aria-disabled={maintenance.maintainVisualDisabled ? "true" : undefined}
            data-disabled={maintenance.maintainVisualDisabled ? "true" : undefined}
            className={`flex min-h-11 items-center justify-center rounded-xl px-1.5 py-2 text-center text-[11px] font-bold leading-tight text-white outline-none transition focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-amber-500/15 active:scale-[0.99] motion-reduce:active:scale-100 sm:px-2 sm:text-sm ${
              maintenance.systemState === "critical"
                ? "bg-rose-600 hover:bg-rose-500 focus-visible:ring-rose-300/55"
                : maintenance.systemState === "warning"
                ? "bg-amber-600 hover:bg-amber-500 focus-visible:ring-amber-200/50"
                : "bg-white/10 hover:bg-white/20 focus-visible:ring-white/30"
            } ${
              maintenance.maintainVisualDisabled
                ? "opacity-65 saturate-[0.85] hover:bg-inherit cursor-default"
                : ""
            }`}
          >
            <span className="min-w-0 truncate">Maintain</span>
          </button>
        </div>
        <div className="mt-1.5 grid min-h-[16px] grid-cols-3 gap-1.5 text-center text-[10px] leading-snug">
          <div className={overclockStatusTone}>{overclockStatusLabel || ""}</div>
          <div className={refillStatusTone}>{refillStatusLabel || ""}</div>
          <div className={maintainStatusTone}>{maintainStatusLabel || ""}</div>
        </div>
      </div>

      {/* Vault transfer + long-term upgrade — calmer shells */}
      <div
        data-base-target="shipping"
        className={`relative flex h-full flex-col gap-2 rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.03] p-3 sm:p-3.5 ${
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
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[13px] font-semibold text-emerald-200/70 outline-none transition hover:border-emerald-400/25 hover:bg-emerald-500/10 hover:text-emerald-100 focus-visible:ring-2 focus-visible:ring-emerald-400/30 active:scale-95 motion-reduce:active:scale-100"
            aria-label="Open shipping info"
            title="Info about shipping"
          >
            i
          </button>
        </div>

        <div className="flex min-h-0 flex-col pr-8">
          <div className="text-sm font-medium text-emerald-200/72">Ship to Shared Vault</div>
          <p className="mt-0.5 text-[12px] leading-snug text-white/52">
            Banked MLEO → shared vault. Daily cap is on production, not this transfer.
          </p>
          <OpsHintSurface wrapClass={hintWrap}>{shipping.freightHint}</OpsHintSurface>
        </div>

        <button
          onClick={shipping.onShip}
          disabled={!shipping.canShipNow}
          className={`mt-auto flex min-h-11 w-full items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-bold outline-none transition active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-emerald-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:active:scale-100 ${
            shipping.canShipNow
              ? "bg-emerald-600 text-white shadow-[0_0_14px_rgba(16,185,129,0.15)] hover:bg-emerald-500"
              : "bg-white/10 text-white/45"
          }`}
          title={`Ship ${shipping.bankedMleoText} MLEO`}
        >
          <span className="min-w-0 truncate">Ship {shipping.bankedMleoText} MLEO</span>
        </button>
      </div>

      <div
        data-base-target="blueprint"
        className={`relative rounded-2xl border border-fuchsia-500/10 bg-fuchsia-500/[0.03] p-3 sm:p-3.5 ${
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
            className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[13px] font-semibold text-fuchsia-200/70 outline-none transition hover:border-fuchsia-400/25 hover:bg-fuchsia-500/10 hover:text-fuchsia-100 focus-visible:ring-2 focus-visible:ring-fuchsia-400/35 active:scale-95 motion-reduce:active:scale-100"
            aria-label="Open blueprint info"
            title="Info about blueprint"
          >
            i
          </button>
        </div>

        <div className="flex min-h-0 flex-col pr-8">
          <div className="text-sm font-medium text-fuchsia-200/72">Blueprint Cache</div>
          <p className="mt-0.5 text-[12px] leading-snug text-white/52">
            {blueprint.costText} shared MLEO + {blueprint.dataCostText} DATA — permanent refinery efficiency.
          </p>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-1.5">
          <button
            onClick={blueprint.onBuy}
            disabled={!blueprint.canBuy}
            className={`flex min-h-11 w-full items-center justify-center rounded-xl px-3 py-2 text-sm font-bold outline-none transition active:scale-[0.99] motion-reduce:active:scale-100 focus-visible:ring-2 focus-visible:ring-fuchsia-300/45 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:active:scale-100 ${
              blueprint.canBuy
                ? "bg-fuchsia-600 text-white shadow-[0_0_12px_rgba(192,38,211,0.14)] hover:bg-fuchsia-500"
                : "bg-white/10 text-white/45"
            }`}
          >
            {blueprint.buttonText}
          </button>
        </div>
      </div>
    </div>
  );
}
