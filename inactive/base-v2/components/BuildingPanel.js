import { BUILDINGS } from "../data/buildings";
import { buildingCost, canAfford } from "../utils/buildings";

export function BuildingPanel({ state, selectedKey, onBuild }) {
  if (!selectedKey) {
    return (
      <div className="rounded-md border border-dashed border-slate-700 bg-slate-950/60 p-2 text-[11px] text-slate-400">
        Tap a building on the map to see its details and upgrade options.
      </div>
    );
  }

  const def = BUILDINGS.find((item) => item.key === selectedKey);
  if (!def) {
    return (
      <div className="text-xs text-slate-400">
        Unknown building: <span className="font-mono">{selectedKey}</span>
      </div>
    );
  }

  const level = Number(state?.buildings?.[def.key] || 0);
  const nextCost = buildingCost(def, level);
  const affordable = canAfford(state?.resources, nextCost);

  return (
    <div className="space-y-3 text-xs">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-sm font-semibold text-slate-100">
            {def.name}
          </div>
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            {def.key}
          </div>
        </div>
        <div className="shrink-0">
          <span className="inline-flex items-center rounded-full border border-emerald-400/60 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200">
            Lv {Math.max(level, 0)}
          </span>
        </div>
      </div>

      {/* Description */}
      <p className="text-[11px] text-slate-300">{def.desc}</p>

      {/* Requirements */}
      {def.requires?.length ? (
        <div className="rounded-md bg-slate-950/60 p-2">
          <div className="mb-1 text-[11px] font-semibold text-slate-200">
            Requirements
          </div>
          <ul className="space-y-0.5 text-[11px] text-slate-400">
            {def.requires.map((req) => {
              const current = Number(state?.buildings?.[req.key] || 0);
              const ok = current >= (req.lvl || 1);
              return (
                <li key={req.key} className={ok ? "text-emerald-300" : ""}>
                  <span className="font-mono">{req.key}</span> Lv {req.lvl}{" "}
                  <span className="opacity-70">
                    ({ok ? "ready" : `current ${current}`})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {/* Cost */}
      <div className="space-y-1 rounded-md bg-slate-950/60 p-2">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold text-slate-200">
            Next level cost
          </div>
          <div
            className={`text-[10px] ${
              affordable ? "text-emerald-300" : "text-slate-500"
            }`}
          >
            {affordable ? "You can afford this" : "Not enough resources"}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          {Object.entries(nextCost).map(([k, v]) => (
            <span
              key={k}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${
                Number(state?.resources?.[k] || 0) >= Number(v || 0)
                  ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-200"
                  : "border-slate-700 bg-slate-900 text-slate-300"
              }`}
            >
              <span className="text-[10px] font-semibold">{k}</span>
              <span>{Math.round(Number(v || 0))}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Action */}
      <button
        type="button"
        disabled={!affordable}
        onClick={() => onBuild?.(def.key)}
        className="w-full rounded-md bg-emerald-600/90 px-2 py-2 text-[11px] font-medium hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700"
      >
        {level > 0 ? "Upgrade building" : "Construct building"}
      </button>
    </div>
  );
}

