import { BUILDINGS } from "../../base-v2/data/buildings";
import { buildingCost, canAfford } from "../../base-v2/utils/buildings";
import { getBuildingIdentity } from "../data/buildingIdentity";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

// One short role line per building (game-like, not admin)
function getRoleLine(key, def) {
  if (key === "hq") return "Command center. Unlocks systems.";
  if (key === "quarry") return "Produces Ore from energy.";
  if (key === "tradeHub") return "Steady Gold income.";
  if (key === "salvage") return "Recovers Scrap.";
  if (key === "powerCell") return "Energy cap & regen.";
  if (key === "expeditionBay") return "Launch expeditions.";
  if (key === "researchLab") return "DATA & research.";
  if (key === "repairBay") return "Stability & maintenance.";
  return def?.desc?.slice(0, 50) || "Base building.";
}

export function BuildingSheetV3({
  base,
  buildingKey,
  busy,
  onClose,
  onBuild,
  onExpedition,
  onMaintenance,
}) {
  if (!buildingKey) return null;

  const def = BUILDINGS.find((b) => b.key === buildingKey);
  if (!def) return null;

  const level = getBuildingLevel(base, buildingKey);
  const resources = base?.resources ?? {};
  const nextCost = buildingCost(def, level);
  const affordable = canAfford(resources, nextCost);
  const locked = level <= 0 && (def.requires?.length ?? 0) > 0;
  const identity = getBuildingIdentity(buildingKey);

  const primaryAction = (() => {
    if (buildingKey === "expeditionBay") return { label: "Launch expedition", onClick: onExpedition };
    if (buildingKey === "repairBay") return { label: "Maintenance", onClick: onMaintenance };
    return { label: level === 0 ? "Construct" : "Upgrade", onClick: () => onBuild(buildingKey) };
  })();

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
      {/* Backdrop – tap to close */}
      <div
        className="absolute inset-0 bg-black/55 pointer-events-auto animate-base-v3-sheet-backdrop"
        onClick={onClose}
        aria-hidden
      />
      {/* Bottom sheet – portrait mobile first, thumb-friendly */}
      <div
        className="relative pointer-events-auto w-full max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-950/98 shadow-2xl animate-base-v3-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} details`}
      >
        {/* Drag handle */}
        <div className="sticky top-0 z-10 flex justify-center pt-2.5 pb-1 bg-slate-950/98">
          <div className="h-1 w-12 rounded-full bg-slate-600" aria-hidden />
        </div>

        <div className="px-4 pb-6 pt-1 space-y-4">
          {/* Header: icon + name + level + close */}
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/80 text-xl">
              {identity?.icon ?? "◆"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-slate-100">{def.name}</div>
              <div className="text-xs text-slate-500 mt-0.5">
                Lv.{level} · {locked ? "Locked" : "Online"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-full p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 active:bg-slate-700 transition touch-manipulation"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          {/* One short role line */}
          <p className="text-xs text-slate-400 leading-snug">{getRoleLine(buildingKey, def)}</p>

          {/* Requirements if locked */}
          {locked && (def.requires?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-amber-950/40 border border-amber-500/40 px-3 py-2 text-xs text-amber-200/90 space-y-1">
              <div className="font-medium">Requirements</div>
              <ul className="space-y-0.5">
                {def.requires.map((r) => {
                  const cur = getBuildingLevel(base, r.key);
                  const ok = cur >= (r.lvl ?? 1);
                  return (
                    <li key={r.key} className={ok ? "text-emerald-300" : ""}>
                      {r.key} Lv.{r.lvl} {ok ? "✓" : `(${cur})`}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Next cost + effect in one row */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-900/80 px-3 py-2">
              <div className="font-medium text-slate-400 mb-1">Next cost</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(nextCost).length === 0 ? (
                  <span className="text-slate-500">—</span>
                ) : (
                  Object.entries(nextCost).map(([k, v]) => (
                    <span key={k} className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">
                      {k} {Math.round(Number(v))}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl bg-slate-900/80 px-3 py-2">
              <div className="font-medium text-slate-400 mb-1">Effect</div>
              <div className="text-slate-300 text-[11px]">
                {def.outputs && Object.keys(def.outputs).length > 0
                  ? Object.entries(def.outputs).map(([k, v]) => `${k}+${v}`).join(" ")
                  : def.power
                  ? `+${def.power.cap ?? 0} cap`
                  : "—"}
              </div>
            </div>
          </div>

          {/* Main action – large thumb target */}
          <button
            type="button"
            onClick={primaryAction.onClick}
            disabled={
              busy ||
              (primaryAction.label === "Construct" && (locked || !affordable)) ||
              (primaryAction.label === "Upgrade" && !affordable)
            }
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-sm font-semibold py-3.5 text-slate-950 transition touch-manipulation"
          >
            {busy ? "…" : primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
