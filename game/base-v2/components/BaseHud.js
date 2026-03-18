function format(value) {
  if (value == null) return "0";
  const n = Number(value) || 0;
  if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
  if (n >= 1000) return (n / 1000).toFixed(1) + "K";
  return n.toFixed(0);
}

export function BaseHud({ state }) {
  const r = state?.resources || {};
  const stability = Number(state?.stability || 0);
  const commanderLevel = Number(state?.commanderLevel || 1);
  const commanderXp = Number(state?.commanderXp || 0);
  const commanderNext = Number(state?.commanderNextLevelXp || 1);

  const xpRatio =
    commanderNext > 0 ? Math.min(1, Math.max(0, commanderXp / commanderNext)) : 0;

  return (
    <div className="flex flex-col gap-2 text-xs sm:gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
        <HudPill label="ORE" value={format(r.ORE)} tone="slate" />
        <HudPill label="GOLD" value={format(r.GOLD)} tone="amber" />
        <HudPill label="SCRAP" value={format(r.SCRAP)} tone="lime" />
        <HudPill label="ENERGY" value={format(r.ENERGY)} tone="cyan" />
        <HudPill label="DATA" value={format(r.DATA)} tone="violet" />
      </div>

      <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4 lg:justify-end">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">Stability</span>
          <div className="h-2 w-32 max-w-full rounded-full bg-slate-900">
            <div
              className="h-full rounded-full bg-emerald-500"
              style={{ width: `${Math.max(0, Math.min(1, stability)) * 100}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-400">
            Cmdr L{commanderLevel}
          </span>
          <div className="h-2 w-32 max-w-full rounded-full bg-slate-900">
            <div
              className="h-full rounded-full bg-indigo-500"
              style={{ width: `${xpRatio * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function HudPill({ label, value, tone }) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
      : tone === "lime"
      ? "border-lime-500/50 bg-lime-500/10 text-lime-200"
      : tone === "cyan"
      ? "border-cyan-500/50 bg-cyan-500/10 text-cyan-200"
      : tone === "violet"
      ? "border-violet-500/50 bg-violet-500/10 text-violet-200"
      : "border-slate-500/50 bg-slate-500/10 text-slate-200";

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${toneClasses}`}
    >
      <span className="text-[10px] font-semibold tracking-wide">{label}</span>
      <span className="text-[11px]">{value}</span>
    </div>
  );
}

