import { BUILDINGS } from "../../base-v2/data/buildings";
import { SCENE_BUILDING_KEYS, SCENE_POSITIONS } from "../data/scenePositions";
import { getBuildingIdentity } from "../data/buildingIdentity";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

const GLOW_CLASSES = {
  emerald: "border-emerald-400/70 bg-emerald-950/40 shadow-[0_0_16px_rgba(16,185,129,0.35)]",
  amber: "border-amber-400/50 bg-amber-950/30 shadow-[0_0_10px_rgba(245,158,11,0.25)]",
  yellow: "border-yellow-400/50 bg-yellow-950/30 shadow-[0_0_10px_rgba(250,204,21,0.25)]",
  lime: "border-lime-400/50 bg-lime-950/30 shadow-[0_0_10px_rgba(132,204,22,0.25)]",
  cyan: "border-cyan-400/60 bg-cyan-950/30 shadow-[0_0_12px_rgba(34,211,238,0.4)]",
  violet: "border-violet-400/50 bg-violet-950/30 shadow-[0_0_10px_rgba(167,139,250,0.3)]",
  indigo: "border-indigo-400/50 bg-indigo-950/30 shadow-[0_0_10px_rgba(99,102,241,0.3)]",
  teal: "border-teal-400/50 bg-teal-950/30 shadow-[0_0_10px_rgba(45,212,191,0.3)]",
  slate: "border-slate-500/50 bg-slate-900/60",
};

const GLOW_ACTIVE = {
  emerald: "border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.5)]",
  amber: "border-amber-400/70 shadow-[0_0_14px_rgba(245,158,11,0.4)]",
  yellow: "border-yellow-400/70 shadow-[0_0_14px_rgba(250,204,21,0.4)]",
  lime: "border-lime-400/70 shadow-[0_0_14px_rgba(132,204,22,0.4)]",
  cyan: "border-cyan-400/80 shadow-[0_0_16px_rgba(34,211,238,0.5)]",
  violet: "border-violet-400/70 shadow-[0_0_14px_rgba(167,139,250,0.4)]",
  indigo: "border-indigo-400/70 shadow-[0_0_14px_rgba(99,102,241,0.4)]",
  teal: "border-teal-400/70 shadow-[0_0_14px_rgba(45,212,191,0.4)]",
  slate: "border-slate-500/60",
};

function BuildingNode({ buildingKey, def, level, locked, active, selected, onSelect, style, identity }) {
  const id = identity || getBuildingIdentity(buildingKey);
  const glow = id.glow || "slate";
  const isHq = buildingKey === "hq";
  const sizeClasses = isHq
    ? "min-w-[4rem] min-h-[4rem] text-base px-4 py-3 rounded-2xl"
    : "min-w-[2.75rem] min-h-[2.5rem] text-[11px] px-2.5 py-2 rounded-xl";
  const baseGlow = active ? GLOW_ACTIVE[glow] : GLOW_CLASSES[glow];
  const lockedClass = locked ? "opacity-55" : "";
  const pulseClass =
    active && id.pulse === "flicker"
      ? "animate-base-v3-power-blink"
      : active && !isHq
      ? "animate-base-v3-pulse-slow"
      : "";
  const hqBreathe = isHq && active ? "animate-base-v3-hq-breathe" : "";
  const selectedRing = selected ? "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-105 z-10 animate-base-v3-selected" : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className={`
        absolute -translate-x-1/2 -translate-y-1/2 border-2 flex items-center justify-center gap-1
        transition-all duration-200 font-semibold
        ${sizeClasses}
        ${active ? `text-slate-100 ${baseGlow}` : "border-slate-600/60 bg-slate-900/70 text-slate-500"}
        ${lockedClass}
        ${selectedRing}
        ${hqBreathe}
        active:scale-95
      `}
    >
      <span className={`shrink-0 ${pulseClass}`}>
        {isHq ? (
          <span className="text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]">{id.icon}</span>
        ) : (
          <span className={active ? "text-slate-200" : "text-slate-500"}>{id.icon}</span>
        )}
      </span>
      <span className="uppercase tracking-wide">{id.label}</span>
      {level > 0 && <span className="text-[10px] opacity-90 text-slate-300">Lv.{level}</span>}
    </button>
  );
}

export function BaseSceneV3({ base, selected, onSelect }) {
  return (
    <div className="relative w-full max-w-md aspect-[3/4] mx-auto rounded-3xl overflow-hidden shadow-xl border border-slate-700/80 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950">
      {/* World layer: terrain / base feel */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse 85% 75% at 50% 55%, rgba(15, 23, 42, 0.4) 0%, transparent 55%),
            radial-gradient(ellipse 50% 45% at 50% 50%, rgba(30, 41, 59, 0.35) 0%, transparent 60%),
            linear-gradient(180deg, rgba(2, 6, 23, 0.9) 0%, rgba(15, 23, 42, 0.6) 45%, rgba(15, 23, 42, 0.7) 100%)
          `,
        }}
      />
      {/* Central platform / ring under HQ */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[42%] h-[32%] rounded-full border-2 border-emerald-500/25 bg-emerald-950/20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[38%] h-[28%] rounded-full bg-emerald-900/15"
        aria-hidden
      />
      {/* Ambient glow behind HQ */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: "radial-gradient(ellipse 55% 45% at 50% 50%, rgba(16, 185, 129, 0.2), transparent 65%)",
        }}
      />

      {/* Energy link lines – subtle glow */}
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full animate-base-v3-link-glow"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {["quarry", "tradeHub", "powerCell", "salvage"].map((key) => {
          const p = SCENE_POSITIONS[key];
          if (!p) return null;
          return (
            <line
              key={key}
              x1={50}
              y1={50}
              x2={p.x}
              y2={p.y}
              stroke="rgba(16, 185, 129, 0.4)"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {SCENE_BUILDING_KEYS.map((key) => {
        const pos = SCENE_POSITIONS[key];
        if (!pos) return null;
        const def = BUILDINGS.find((b) => b.key === key);
        if (!def) return null;
        const level = getBuildingLevel(base, key);
        const hasReqs = !def.requires?.length || (def.requires ?? []).every((r) => getBuildingLevel(base, r.key) >= (r.lvl ?? 1));
        const locked = level <= 0 && !hasReqs;
        const active = level > 0;
        const identity = getBuildingIdentity(key);

        return (
          <BuildingNode
            key={key}
            buildingKey={key}
            def={def}
            level={level}
            locked={locked}
            active={active}
            selected={selected === key}
            onSelect={() => onSelect?.(key)}
            identity={identity}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        );
      })}

      {/* Drone / particle between HQ and one building */}
      <div
        className="pointer-events-none absolute left-[38%] top-[42%] h-1.5 w-1.5 rounded-full bg-cyan-300/90 shadow-[0_0_10px_rgba(34,211,238,0.8)] animate-base-v3-drone"
        aria-hidden
      />
    </div>
  );
}
