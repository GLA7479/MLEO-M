// Portrait mobile only – compact game HUD. Not an admin panel.

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

  const chips = [
    { key: "ORE", value: res.ORE },
    { key: "GOLD", value: res.GOLD },
    { key: "SCRAP", value: res.SCRAP },
    { key: "ENG", value: res.ENERGY },
    { key: "DATA", value: res.DATA },
  ];

  return (
    <div className="w-full px-2 pt-2">
      <div className="flex flex-wrap gap-1 items-center justify-between rounded-xl bg-slate-900/60 border border-slate-700/60 px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {chips.map((c) => (
            <div
              key={c.key}
              className="flex items-center gap-0.5 rounded-md bg-slate-800/70 px-1.5 py-0.5 text-[10px]"
            >
              <span className="text-slate-500">{c.key}</span>
              <span className="font-semibold text-slate-200 tabular-nums">{format(c.value)}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-slate-500">
          <span>STB {Math.round((stability ?? 0) * 100) / 100}</span>
          <span>Lv.{commanderLevel}</span>
        </div>
      </div>
    </div>
  );
}
