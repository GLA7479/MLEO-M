import { BUILDINGS } from "../data/buildings";
import { WORLD_BUILDING_POSITIONS } from "../data/worldMap";
import { buildingCost, canAfford } from "../utils/buildings";

function getBuildingLevel(state, key) {
  return Number(state?.buildings?.[key] || 0);
}

function getVisualState(def, state) {
  const level = getBuildingLevel(state, def.key);
  const resources = state?.resources || {};

  const locked = level <= 0 && !!def.requires?.length;
  const active = level > 0;

  const energy = Number(resources.ENERGY || 0);
  const usesEnergy = Number(def.energyUse || 0) > 0;
  const lowEnergy = usesEnergy && energy < 12;

  const nextCost = buildingCost(def, level);
  const upgradeAvailable =
    active && !locked && canAfford(resources, nextCost);

  return { locked, active, lowEnergy, upgradeAvailable };
}

export function BaseMap({ state, onSelectBuilding }) {
  return (
    <div className="relative h-[260px] w-full overflow-hidden rounded-md border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 sm:h-[320px] md:h-[360px]">
      {/* Background grid / terrain hint */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.18]">
        <div className="h-full w-full bg-[radial-gradient(circle_at_top,_rgba(148,163,184,0.35),transparent_60%),repeating-linear-gradient(90deg,rgba(30,64,175,0.2)_0,rgba(30,64,175,0.2)_1px,transparent_1px,transparent_16px),repeating-linear-gradient(0deg,rgba(30,64,175,0.16)_0,rgba(30,64,175,0.16)_1px,transparent_1px,transparent_16px)]" />
      </div>

      {BUILDINGS.map((def) => {
        const pos = WORLD_BUILDING_POSITIONS[def.key];
        if (!pos) return null;
        const level = getBuildingLevel(state, def.key);
        const visual = getVisualState(def, state);
        const isLocked = visual.locked;

        // Simple ambient glow near some active structures
        const showDrone =
          visual.active &&
          ["quarry", "salvage", "refinery", "expeditionBay"].includes(def.key);

        return (
          <button
            key={def.key}
            type="button"
            onClick={() => onSelectBuilding?.(def.key)}
            className={`
              group absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center
              ${isLocked ? "opacity-50" : "opacity-100"}
            `}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            }}
          >
            <div
              className={`
                relative flex h-10 w-16 items-center justify-center rounded-md border
                bg-slate-900/80 text-[10px] font-medium
                shadow-[0_0_0_1px_rgba(15,23,42,0.9),0_18px_40px_rgba(15,23,42,0.9)]
                ${isLocked ? "border-slate-800 text-slate-600" : "border-indigo-500/60 text-slate-100"}
                group-active:scale-95 group-hover:border-emerald-400/80 group-hover:text-emerald-50 group-hover:shadow-[0_0_0_1px_rgba(16,185,129,0.8),0_18px_40px_rgba(16,185,129,0.45)]
                transition-all duration-150
                sm:h-11 sm:w-20 sm:text-[11px]
              `}
            >
              <span className="truncate px-1 sm:hidden">
                {def.name.length > 6 ? def.name.slice(0, 5) + "…" : def.name}
              </span>
              <span className="hidden truncate px-1 sm:inline">
                {def.name}
              </span>
              {visual.upgradeAvailable && (
                <span className="absolute -bottom-2 left-1 rounded-full bg-emerald-500/90 px-1.5 py-0.5 text-[9px] font-semibold text-slate-950 shadow-sm">
                  UPGRADE
                </span>
              )}
              <span
                className={`
                  absolute -top-2 right-1 rounded-full border px-1 text-[10px]
                  ${level > 0 ? "border-emerald-400/70 bg-emerald-500/20 text-emerald-200" : "border-slate-700 bg-slate-900/80 text-slate-400"}
                `}
              >
                Lv {Math.max(level, 0)}
              </span>
            </div>
            <span className="mt-0.5 hidden max-w-[92px] truncate text-[10px] text-slate-500 group-hover:text-slate-300 sm:block">
              {def.desc}
            </span>
            {showDrone && (
              <span
                className="pointer-events-none mt-1 h-1 w-10 animate-pulse rounded-full bg-cyan-400/40 blur-[2px]"
              />
            )}
          </button>
        );
      })}

      {/* Center hint text when base is very empty */}
      {!state?.buildings?.hq && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-slate-600">
          Construct your first buildings to bring the base online.
        </div>
      )}
    </div>
  );
}

