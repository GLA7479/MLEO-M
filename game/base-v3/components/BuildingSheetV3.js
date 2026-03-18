import { BUILDINGS } from "../../base-v2/data/buildings";
import { buildingCost, canAfford } from "../../base-v2/utils/buildings";
import { getBuildingIdentity } from "../data/buildingIdentity";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

function getRoleLine(key, def) {
  const roles = {
    hq: "Command center. Unlocks systems.",
    quarry: "Produces Ore from energy.",
    tradeHub: "Steady Gold income.",
    salvage: "Recovers Scrap.",
    refinery: "Converts Ore + Scrap → bankable MLEO.",
    powerCell: "Energy cap & regen.",
    minerControl: "Synergy with Miners. Ore quality.",
    arcadeHub: "Activity → progression. Mission rewards.",
    expeditionBay: "Stronger expeditions. Better loot.",
    logisticsCenter: "Ship quality. Export efficiency.",
    researchLab: "DATA & research paths.",
    repairBay: "Stability. Less maintenance pressure.",
  };
  return roles[key] || def?.desc?.slice(0, 50) || "Base building.";
}

// Current effect summary by type: outputs, convert, power, or support
function getEffectSummary(def, level) {
  if (!def) return "—";
  const lvl = Math.max(1, level || 0);
  if (def.outputs && Object.keys(def.outputs).length > 0) {
    const parts = Object.entries(def.outputs).map(([k, v]) => `${k} +${Number(v) * lvl}`);
    return parts.join(", ");
  }
  if (def.convert) {
    const c = def.convert;
    return `ORE+SCRAP→MLEO (${c.ORE ?? 0}/${c.SCRAP ?? 0}→${c.MLEO ?? 0})`;
  }
  if (def.power) {
    return `+${(def.power.cap ?? 0) * lvl} cap, +${(def.power.regen ?? 0) * lvl} regen`;
  }
  return "Support";
}

// Next level effect (simplified: same formula at level+1)
function getNextEffectSummary(def, level) {
  if (!def) return "—";
  return getEffectSummary(def, level + 1);
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
  const currentEffect = getEffectSummary(def, level);
  const nextEffect = level > 0 ? getNextEffectSummary(def, level) : currentEffect;

  const primaryAction = (() => {
    if (buildingKey === "expeditionBay") return { label: "Launch expedition", onClick: onExpedition };
    if (buildingKey === "repairBay") return { label: "Maintenance", onClick: onMaintenance };
    return { label: level === 0 ? "Construct" : "Upgrade", onClick: () => onBuild(buildingKey) };
  })();

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center pointer-events-none">
      <div
        className="absolute inset-0 bg-black/55 pointer-events-auto animate-base-v3-sheet-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative pointer-events-auto w-full max-h-[75vh] overflow-y-auto rounded-t-3xl border-t border-slate-700 bg-slate-950/98 shadow-2xl animate-base-v3-sheet-enter"
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} details`}
      >
        <div className="sticky top-0 z-10 flex justify-center pt-2.5 pb-1 bg-slate-950/98">
          <div className="h-1 w-12 rounded-full bg-slate-600" aria-hidden />
        </div>

        <div className="px-4 pb-6 pt-1 space-y-3">
          {/* Header: icon + name + level + tag + close */}
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-slate-600 bg-slate-800/80 text-xl">
              {identity?.icon ?? "◆"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-base font-semibold text-slate-100">{def.name}</div>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                <span className="text-xs text-slate-500">Lv.{level} · {locked ? "Locked" : "Online"}</span>
                {identity?.tag && (
                  <span className="rounded bg-slate-700/80 px-1.5 py-0.5 text-[10px] text-slate-300 uppercase tracking-wide">
                    {identity.tag}
                  </span>
                )}
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

          <p className="text-xs text-slate-400 leading-snug">{getRoleLine(buildingKey, def)}</p>

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

          {/* Next cost */}
          <div className="rounded-xl bg-slate-900/80 px-3 py-2 text-xs">
            <div className="font-medium text-slate-400 mb-1">Next level cost</div>
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

          {/* Current effect + Next effect */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl bg-slate-900/80 px-3 py-2">
              <div className="font-medium text-slate-400 mb-1">Current</div>
              <div className="text-slate-300 text-[11px]">{currentEffect}</div>
            </div>
            <div className="rounded-xl bg-slate-900/80 px-3 py-2">
              <div className="font-medium text-slate-400 mb-1">Next level</div>
              <div className="text-slate-300 text-[11px]">{nextEffect}</div>
            </div>
          </div>

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
