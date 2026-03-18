function format(value) {
  if (value == null) return "0";
  const n = Number(value) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function Chip({ label, value, tone = "slate" }) {
  const toneClass =
    tone === "emerald"
      ? "border-emerald-500/30 bg-emerald-950/25 text-emerald-100"
      : tone === "amber"
      ? "border-amber-500/30 bg-amber-950/25 text-amber-100"
      : tone === "cyan"
      ? "border-cyan-500/30 bg-cyan-950/25 text-cyan-100"
      : "border-slate-700/70 bg-slate-800/70 text-slate-100";

  return (
    <div className={`rounded-xl border px-2 py-1 ${toneClass}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-70">{label}</div>
      <div className="mt-0.5 text-xs font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function BaseHudV3({ base }) {
  const res = base?.resources ?? {};
  const commander = base?.commander ?? {};
  const commanderLevel = Number(commander?.level ?? base?.commanderLevel ?? 1);
  const stability = clamp(Number(base?.stability ?? 100), 0, 100);
  const banked = Number(base?.bankedMleo ?? 0);
  const sentToday = Number(base?.sentToday ?? 0);
  const crew = Number(base?.crew ?? 0);
  const maintenanceDue = Number(base?.maintenanceDue ?? 0);

  const topResources = [
    { key: "ORE", value: res.ORE },
    { key: "GOLD", value: res.GOLD },
    { key: "SCRAP", value: res.SCRAP },
    { key: "ENG", value: res.ENERGY },
    { key: "DATA", value: res.DATA },
  ];

  return (
    <>
      {/* Mobile */}
      <div className="md:hidden w-full px-0 pt-0">
        <div className="rounded-[24px] border border-slate-800 bg-slate-900/70 px-3 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-slate-500">Base V3</div>
              <div className="mt-1 text-sm font-semibold text-slate-100">Command View</div>
            </div>
            <div className="rounded-full border border-slate-700 bg-slate-800/80 px-2.5 py-1 text-[11px] text-slate-200">
              Lv.{commanderLevel}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-5 gap-1.5">
            {topResources.map((c) => (
              <div
                key={c.key}
                className="rounded-xl border border-slate-800 bg-slate-950/70 px-1.5 py-1.5 text-center"
              >
                <div className="text-[9px] uppercase tracking-wide text-slate-500">{c.key}</div>
                <div className="mt-0.5 text-[11px] font-semibold text-slate-100 tabular-nums">
                  {format(c.value)}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-2 grid grid-cols-4 gap-1.5">
            <Chip label="Banked" value={format(banked)} tone="emerald" />
            <Chip label="Stability" value={`${Math.round(stability)}%`} tone={stability < 75 ? "amber" : "cyan"} />
            <Chip label="Crew" value={format(crew)} />
            <Chip label="Sent" value={format(sentToday)} />
          </div>
        </div>
      </div>

      {/* Desktop */}
      <div className="hidden md:block">
        <div className="rounded-[28px] border border-slate-800 bg-slate-900/70 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Base V3</div>
              <div className="mt-1 text-lg font-semibold text-slate-100">Command Center</div>
            </div>
            <div className="rounded-2xl border border-slate-700 bg-slate-800/80 px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wide text-slate-500">Commander</div>
              <div className="text-sm font-semibold text-slate-100">Lv.{commanderLevel}</div>
            </div>
          </div>

          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
              <span>Stability</span>
              <span>{Math.round(stability)}%</span>
            </div>
            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${stability < 70 ? "bg-amber-400" : "bg-emerald-400"}`}
                style={{ width: `${Math.max(4, Math.min(100, stability))}%` }}
              />
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Chip label="Banked MLEO" value={format(banked)} tone="emerald" />
            <Chip label="Sent Today" value={format(sentToday)} />
            <Chip label="Crew" value={format(crew)} />
            <Chip
              label="Maintenance"
              value={format(maintenanceDue)}
              tone={maintenanceDue >= 1 ? "amber" : "slate"}
            />
          </div>

          <div className="mt-4 grid grid-cols-5 gap-2">
            {topResources.map((c) => (
              <div
                key={c.key}
                className="rounded-2xl border border-slate-800 bg-slate-950/70 px-2 py-2 text-center"
              >
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{c.key}</div>
                <div className="mt-1 text-sm font-semibold text-slate-100 tabular-nums">{format(c.value)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
