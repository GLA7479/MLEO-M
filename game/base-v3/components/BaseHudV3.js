function format(value) {
  if (value == null) return "0";
  const n = Number(value) || 0;
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.floor(n).toLocaleString();
}

export function BaseHudV3({ base }) {
  const res = base?.resources ?? {};
  const stability = Number(base?.stability ?? 0);
  const commander = base?.commander ?? {};
  const commanderLevel = Number(commander?.level ?? base?.commanderLevel ?? 1);
  const commanderXp = Number(commander?.xp ?? base?.commanderXp ?? 0);
  const commanderNext = Number(commander?.nextLevelXp ?? base?.commanderNextLevelXp ?? 1);
  const xpRatio = commanderNext > 0 ? Math.min(1, Math.max(0, commanderXp / commanderNext)) : 0;

  const chips = [
    { key: "ORE", value: res.ORE },
    { key: "GOLD", value: res.GOLD },
    { key: "SCRAP", value: res.SCRAP },
    { key: "ENERGY", value: res.ENERGY },
    { key: "DATA", value: res.DATA },
  ];

  return (
    <div className="w-full px-3 pt-3">
      <div className="flex flex-wrap gap-1.5 items-center justify-between rounded-2xl border border-slate-800/80 bg-slate-950/90 px-2.5 py-1.5">
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <div
              key={c.key}
              className="flex items-center gap-1 rounded-full bg-slate-900/90 px-2 py-0.5 text-[11px]"
            >
              <span className="text-slate-400">{c.key}</span>
              <span className="font-semibold text-slate-100">{format(c.value)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-slate-400">
          <span title="Stability">STB {Math.round((stability ?? 0) * 100) / 100}</span>
          <span title="Commander level">CMD Lv.{commanderLevel}</span>
          <div className="h-1.5 w-12 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-500/80"
              style={{ width: `${Math.max(0, Math.min(1, stability)) * 100}%` }}
            />
          </div>
          <div className="h-1.5 w-12 rounded-full bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-indigo-500/80"
              style={{ width: `${xpRatio * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
