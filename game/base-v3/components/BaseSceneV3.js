import { BUILDINGS } from "../../base-v2/data/buildings";
import { SCENE_BUILDING_KEYS, SCENE_POSITIONS } from "../data/scenePositions";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

function BuildingNode({ def, level, locked, active, selected, onSelect, style, powerCellBlink }) {
  const name = def.key === "hq" ? "HQ" : def.name.replace(/\s+(Yard|Hub|Bay|Lab|Cell).*$/, "").trim() || def.key;
  const short = name.length > 8 ? name.slice(0, 6) + "…" : name;

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className={`
        absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 px-3 py-2 text-xs font-medium
        transition-all duration-200 shadow-lg
        min-w-[3rem] min-h-[2.5rem] flex items-center justify-center gap-1.5
        ${active ? "border-emerald-400/60 bg-slate-800/90 text-slate-100" : "border-slate-600/70 bg-slate-900/70 text-slate-400"}
        ${locked ? "opacity-50" : ""}
        ${selected ? "ring-2 ring-emerald-300 ring-offset-2 ring-offset-slate-950 scale-105 z-10" : ""}
        active:scale-95
      `}
    >
      <span
        className={`h-4 w-4 rounded-full shrink-0 ${active ? "bg-emerald-400/80" : "bg-slate-600/80"} ${active ? "animate-base-v3-pulse-slow" : ""} ${powerCellBlink ? "animate-base-v3-power-blink" : ""}`}
      />
      <span className="uppercase tracking-wide hidden sm:inline">{short}</span>
      {level > 0 && (
        <span className="text-[10px] text-emerald-300 shrink-0">Lv.{level}</span>
      )}
    </button>
  );
}

export function BaseSceneV3({ base, selected, onSelect }) {
  return (
    <div className="relative w-full max-w-md aspect-[3/4] mx-auto rounded-3xl overflow-hidden shadow-xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
      {/* Ambient glow behind HQ */}
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 50%, rgba(16, 185, 129, 0.15), transparent 70%)",
        }}
      />

      {SCENE_BUILDING_KEYS.map((key) => {
        const pos = SCENE_POSITIONS[key];
        if (!pos) return null;
        const def = BUILDINGS.find((b) => b.key === key);
        if (!def) return null;
        const level = getBuildingLevel(base, key);
        const hasReqs = !def.requires?.length || (def.requires ?? []).every(
          (r) => getBuildingLevel(base, r.key) >= (r.lvl ?? 1)
        );
        const locked = level <= 0 && !hasReqs;
        const active = level > 0;
        const powerCellBlink = key === "powerCell" && active;

        return (
          <BuildingNode
            key={key}
            def={def}
            level={level}
            locked={locked}
            active={active}
            selected={selected === key}
            onSelect={() => onSelect?.(key)}
            powerCellBlink={powerCellBlink}
            style={{
              left: `${pos.x}%`,
              top: `${pos.y}%`,
            }}
          />
        );
      })}

      {/* Small moving drone / particle */}
      <div
        className="pointer-events-none absolute left-1/3 top-1/4 h-2 w-2 rounded-full bg-cyan-300/80 shadow-[0_0_12px_rgba(34,211,238,0.6)] animate-base-v3-drone"
        aria-hidden
      />

      {/* Energy link lines from HQ to nearby (decorative) */}
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full opacity-20"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="v3-link" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgb(16, 185, 129)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(16, 185, 129)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {["quarry", "tradeHub", "powerCell"].map((key) => {
          const p = SCENE_POSITIONS[key];
          if (!p) return null;
          return (
            <line
              key={key}
              x1={50}
              y1={50}
              x2={p.x}
              y2={p.y}
              stroke="rgba(16, 185, 129, 0.35)"
              strokeWidth="0.5"
            />
          );
        })}
      </svg>
    </div>
  );
}
