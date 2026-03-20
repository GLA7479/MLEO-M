import { useEffect, useMemo, useRef, useState } from "react";
import { BUILDINGS } from "../../../base-v2/data/buildings";
import { buildingCost, canAfford } from "../../../base-v2/utils/buildings";
import { SCENE_BUILDING_KEYS, SCENE_POSITIONS, SCENE_LINK_KEYS } from "../data/scenePositions";
import { getBuildingIdentity } from "../data/buildingIdentity";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function distance(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function computeLayout({ width, height, basePositions }) {
  const keys = Object.keys(basePositions);
  const hq = basePositions.hq || { x: 50, y: 50 };

  // Approx radii in px that match the current tap targets.
  const HQ_RADIUS = 44;
  const NODE_RADIUS = 30;
  const HQ_PROTECTED = 92; // protected bubble around HQ (px)
  const MIN_MARGIN = 18; // keep nodes inside scene bounds (px)

  // Initialize in px
  const nodes = keys.map((key) => {
    const p = basePositions[key];
    return {
      key,
      x: (p.x / 100) * width,
      y: (p.y / 100) * height,
      r: key === "hq" ? HQ_RADIUS : NODE_RADIUS,
      locked: false,
    };
  });

  const hqNode = nodes.find((n) => n.key === "hq") || {
    key: "hq",
    x: (hq.x / 100) * width,
    y: (hq.y / 100) * height,
    r: HQ_RADIUS,
  };

  // Simple relaxation solver to avoid overlaps + keep HQ zone clear.
  const iters = 42;
  for (let iter = 0; iter < iters; iter++) {
    // Pairwise repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (a.key === "hq" && b.key === "hq") continue;

        const minDist = a.r + b.r + 10;
        const d = distance(a.x, a.y, b.x, b.y) || 0.0001;
        if (d < minDist) {
          const push = (minDist - d) * 0.5;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          // Keep HQ more stable; push the other node a bit more.
          const aWeight = a.key === "hq" ? 0.15 : 0.5;
          const bWeight = b.key === "hq" ? 0.15 : 0.5;
          a.x -= ux * push * aWeight;
          a.y -= uy * push * aWeight;
          b.x += ux * push * bWeight;
          b.y += uy * push * bWeight;
        }
      }
    }

    // HQ protected zone (bigger than HQ itself)
    for (const n of nodes) {
      if (n.key === "hq") continue;
      const d = distance(n.x, n.y, hqNode.x, hqNode.y) || 0.0001;
      const min = HQ_PROTECTED + n.r;
      if (d < min) {
        const push = (min - d) * 0.9;
        const ux = (n.x - hqNode.x) / d;
        const uy = (n.y - hqNode.y) / d;
        n.x += ux * push;
        n.y += uy * push;
      }
    }

    // Clamp to bounds
    for (const n of nodes) {
      n.x = clamp(n.x, MIN_MARGIN + n.r, width - MIN_MARGIN - n.r);
      n.y = clamp(n.y, MIN_MARGIN + n.r, height - MIN_MARGIN - n.r);
    }
  }

  // Convert back to %
  const out = {};
  for (const n of nodes) {
    out[n.key] = { x: (n.x / width) * 100, y: (n.y / height) * 100 };
  }
  return out;
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
  orange: "border-orange-400/50 bg-orange-950/30 shadow-[0_0_10px_rgba(251,146,60,0.3)]",
  sky: "border-sky-400/50 bg-sky-950/30 shadow-[0_0_10px_rgba(56,189,248,0.3)]",
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
  orange: "border-orange-400/70 shadow-[0_0_14px_rgba(251,146,60,0.4)]",
  sky: "border-sky-400/70 shadow-[0_0_14px_rgba(56,189,248,0.4)]",
};

const STATUS_BADGE_CLASSES = {
  emerald: "border-emerald-500/40 bg-emerald-950/80 text-emerald-100",
  amber: "border-amber-500/40 bg-amber-950/80 text-amber-100",
  cyan: "border-cyan-500/40 bg-cyan-950/80 text-cyan-100",
  slate: "border-slate-700/80 bg-slate-950/85 text-slate-300",
};

function getNodeStatus({ base, buildingKey, level, locked, canUpgrade }) {
  const res = base?.resources ?? {};
  const energy = Number(res.ENERGY ?? 0);
  const data = Number(res.DATA ?? 0);
  const stability = Number(base?.stability ?? 100);
  const banked = Number(base?.bankedMleo ?? 0);

  if (buildingKey === "expeditionBay" && level > 0 && energy >= 36 && data >= 4) {
    return { label: "READY", tone: "emerald" };
  }

  if (locked) {
    return { label: "LOCK", tone: "slate" };
  }

  if (level === 0 && canUpgrade) {
    return { label: "NEW", tone: "cyan" };
  }

  if (level > 0 && canUpgrade) {
    return { label: "UP", tone: "emerald" };
  }

  if (buildingKey === "powerCell" && energy < 12) {
    return { label: "LOW", tone: "amber" };
  }

  if (buildingKey === "repairBay" && stability < 75) {
    return { label: "FIX", tone: "amber" };
  }

  if (buildingKey === "refinery" && banked >= 120) {
    return { label: "SHIP", tone: "emerald" };
  }

  return null;
}

function BuildingNode({
  buildingKey,
  level,
  locked,
  active,
  selected,
  onSelect,
  style,
  identity,
  status,
}) {
  const id = identity || getBuildingIdentity(buildingKey);
  const glow = id.glow || "slate";
  const isHq = buildingKey === "hq";

  const sizeClasses = isHq
    ? "min-w-[4.1rem] min-h-[4.1rem] px-4 py-3 text-base rounded-2xl md:min-w-[5rem] md:min-h-[5rem] md:text-lg"
    : "min-w-[3rem] min-h-[2.7rem] px-2.5 py-2 text-[11px] rounded-xl md:min-w-[3.7rem] md:min-h-[3.1rem] md:px-3 md:py-2.5 md:text-[12px]";

  const baseGlow = active ? GLOW_ACTIVE[glow] : GLOW_CLASSES[glow];
  const lockedClass = locked ? "opacity-55" : "";
  const pulseClass =
    active && id.pulse === "flicker"
      ? "animate-base-v3-power-blink"
      : active && !isHq
      ? "animate-base-v3-pulse-slow"
      : "";
  const hqBreathe = isHq && active ? "animate-base-v3-hq-breathe" : "";
  const selectedRing = selected
    ? "ring-2 ring-white/80 ring-offset-2 ring-offset-slate-950 scale-[1.03] z-10 animate-base-v3-selected"
    : "";

  return (
    <button
      type="button"
      onClick={onSelect}
      style={style}
      className={`
        absolute -translate-x-1/2 -translate-y-1/2 border-2 flex items-center justify-center gap-1
        transition-all duration-200 font-semibold
        ${sizeClasses}
        ${active ? `text-slate-100 ${baseGlow}` : "border-slate-600/60 bg-slate-900/75 text-slate-500"}
        ${lockedClass}
        ${selectedRing}
        ${hqBreathe}
        active:scale-95
      `}
    >
      {status && (
        <span
          className={`absolute -right-1.5 -top-1.5 rounded-full border px-1.5 py-0.5 text-[8px] font-bold tracking-wide ${
            STATUS_BADGE_CLASSES[status.tone] || STATUS_BADGE_CLASSES.slate
          }`}
        >
          {status.label}
        </span>
      )}

      <span className={`shrink-0 ${pulseClass}`}>
        {isHq ? (
          <span className="text-emerald-300 drop-shadow-[0_0_6px_rgba(16,185,129,0.6)]">{id.icon}</span>
        ) : (
          <span className={active ? "text-slate-200" : "text-slate-500"}>{id.icon}</span>
        )}
      </span>

      <span className="uppercase tracking-wide">{id.label}</span>

      {level > 0 && (
        <span className="hidden md:inline text-[10px] opacity-90 text-slate-300">
          Lv.{level}
        </span>
      )}
    </button>
  );
}

export function BaseSceneV3({ base, selected, onSelect }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function update() {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width || 0, height: rect.height || 0 });
    }

    update();
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    let raf = 0;
    function loop() {
      setTick((t) => (t + 1) % 1_000_000);
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const layout = useMemo(() => {
    if (!size.width || !size.height) return SCENE_POSITIONS;
    return computeLayout({ width: size.width, height: size.height, basePositions: SCENE_POSITIONS });
  }, [size.width, size.height]);

  const hqPos = layout.hq || SCENE_POSITIONS.hq || { x: 50, y: 50 };

  const routeKeys = useMemo(() => {
    const primary = ["powerCell", "researchLab", "logisticsCenter", "refinery", "tradeHub"];
    const extra = ["salvage", "expeditionBay", "repairBay", "minerControl", "arcadeHub", "quarry"];
    const keys = [...primary, ...extra].filter((k) => layout[k]);
    if (selected && selected !== "hq" && layout[selected]) keys.unshift(selected, selected);
    return keys;
  }, [layout, selected]);

  const drones = useMemo(() => {
    if (!size.width || !size.height || routeKeys.length === 0) return [];
    const now = tick / 60; // time-ish
    const count = 5;
    const items = [];
    for (let i = 0; i < count; i++) {
      const idx = (i + Math.floor(now * (0.55 + i * 0.08))) % routeKeys.length;
      const k = routeKeys[idx];
      const target = layout[k];
      if (!target) continue;

      const speed = 0.085 + i * 0.02 + (selected ? 0.02 : 0);
      const t = (now * speed + i * 0.23) % 1;
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      items.push({
        id: `d${i}`,
        x: lerp(hqPos.x, target.x, eased),
        y: lerp(hqPos.y, target.y, eased),
        hot: selected === k,
      });
    }
    return items;
  }, [hqPos.x, hqPos.y, layout, routeKeys, selected, size.width, size.height, tick]);

  const packets = useMemo(() => {
    if (!size.width || !size.height) return [];
    const now = tick / 60;
    const keys = (SCENE_LINK_KEYS || []).filter((k) => layout[k]);
    const items = [];
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const target = layout[k];
      if (!target) continue;
      for (let j = 0; j < 2; j++) {
        const speed = 0.12 + i * 0.01;
        const t = (now * speed + j * 0.47 + i * 0.13) % 1;
        items.push({
          id: `p-${k}-${j}`,
          x: lerp(hqPos.x, target.x, t),
          y: lerp(hqPos.y, target.y, t),
          hot: selected === k,
        });
      }
    }
    return items;
  }, [hqPos.x, hqPos.y, layout, selected, size.width, size.height, tick]);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto h-full w-full max-w-md overflow-hidden rounded-3xl border border-slate-700/80 bg-gradient-to-b from-slate-950 via-slate-900/95 to-slate-950 shadow-xl aspect-[3/4] md:max-w-none md:aspect-auto"
    >
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

      {/* Closed system overlay: faint grid + dome */}
      <div
        className="pointer-events-none absolute inset-0 opacity-25"
        style={{
          background: `
            radial-gradient(ellipse 75% 70% at 50% 58%, rgba(16,185,129,0.10) 0%, rgba(2,6,23,0) 55%),
            radial-gradient(ellipse 110% 95% at 50% 50%, rgba(15,23,42,0) 45%, rgba(0,0,0,0.6) 100%),
            repeating-linear-gradient(90deg, rgba(148,163,184,0.06) 0, rgba(148,163,184,0.06) 1px, transparent 1px, transparent 10px),
            repeating-linear-gradient(0deg, rgba(148,163,184,0.05) 0, rgba(148,163,184,0.05) 1px, transparent 1px, transparent 12px)
          `,
        }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 animate-base-v3-scanline opacity-25"
        style={{
          background: "linear-gradient(180deg, transparent 0%, rgba(56,189,248,0.10) 45%, rgba(56,189,248,0.04) 60%, transparent 100%)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-2 rounded-[1.6rem] border border-slate-600/25" aria-hidden />

      {/* Central platform / ring under HQ */}
      <div
        className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[44%] h-[34%] rounded-full border-2 bg-emerald-950/20 ${
          selected ? "border-emerald-400/35" : "border-emerald-500/25"
        }`}
        style={{ left: `${hqPos.x}%`, top: `${hqPos.y}%` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[40%] h-[30%] rounded-full bg-emerald-900/15"
        style={{ left: `${hqPos.x}%`, top: `${hqPos.y}%` }}
        aria-hidden
      />
      {/* Core routing rings (rotate) */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[32%] h-[24%] rounded-full border border-emerald-400/20 animate-base-v3-core-rotate"
        style={{ left: `${hqPos.x}%`, top: `${hqPos.y}%` }}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-[28%] h-[21%] rounded-full border border-cyan-400/15 animate-base-v3-core-rotate-slow"
        style={{ left: `${hqPos.x}%`, top: `${hqPos.y}%` }}
        aria-hidden
      />
      {/* Ambient glow behind HQ */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(ellipse 55% 45% at ${hqPos.x}% ${hqPos.y}%, rgba(16, 185, 129, 0.2), transparent 65%)`,
        }}
      />

      {/* Energy link lines – subtle glow */}
      <svg
        className="pointer-events-none absolute inset-0 w-full h-full animate-base-v3-link-glow"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        {(SCENE_LINK_KEYS || ["quarry", "tradeHub", "powerCell", "salvage"]).map((key) => {
          const p = layout[key];
          if (!p) return null;
          return (
            <line
              key={key}
              x1={hqPos.x}
              y1={hqPos.y}
              x2={p.x}
              y2={p.y}
              stroke="rgba(16, 185, 129, 0.12)"
              strokeWidth="0.8"
              strokeLinecap="round"
            />
          );
        })}

        {selected && selected !== "hq" && layout[selected] && (
          <line
            key={`sel-${selected}`}
            x1={hqPos.x}
            y1={hqPos.y}
            x2={layout[selected].x}
            y2={layout[selected].y}
            stroke="rgba(16, 185, 129, 0.72)"
            strokeWidth="1.35"
            strokeLinecap="round"
          />
        )}
      </svg>

      {/* Data packets (DB routing) */}
      {packets.map((p) => (
        <div
          key={p.id}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full animate-base-v3-packet ${
            p.hot ? "bg-emerald-300/95" : "bg-cyan-300/80"
          }`}
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.hot ? "6px" : "4px",
            height: p.hot ? "6px" : "4px",
            boxShadow: p.hot ? "0 0 12px rgba(16,185,129,0.55)" : "0 0 10px rgba(34,211,238,0.35)",
          }}
          aria-hidden
        />
      ))}

      {/* Spider-miner drones (service routes) */}
      {drones.map((d) => (
        <div
          key={d.id}
          className={`pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded-full ${
            d.hot ? "bg-emerald-200" : "bg-slate-200/85"
          }`}
          style={{
            left: `${d.x}%`,
            top: `${d.y}%`,
            width: d.hot ? "7px" : "6px",
            height: d.hot ? "7px" : "6px",
            boxShadow: d.hot
              ? "0 0 14px rgba(16,185,129,0.55), 0 0 0 6px rgba(16,185,129,0.06)"
              : "0 0 10px rgba(148,163,184,0.35), 0 0 0 5px rgba(148,163,184,0.05)",
          }}
          aria-hidden
        />
      ))}

      {SCENE_BUILDING_KEYS.map((key) => {
        const pos = layout[key];
        if (!pos) return null;

        const def = BUILDINGS.find((b) => b.key === key);
        if (!def) return null;

        const level = getBuildingLevel(base, key);
        const hasReqs =
          !def.requires?.length ||
          (def.requires ?? []).every((r) => getBuildingLevel(base, r.key) >= (r.lvl ?? 1));

        const locked = level <= 0 && !hasReqs;
        const active = level > 0;
        const identity = getBuildingIdentity(key);
        const nextCost = buildingCost(def, level);
        const canUpgradeNow = hasReqs && canAfford(base?.resources ?? {}, nextCost);
        const status = getNodeStatus({
          base,
          buildingKey: key,
          level,
          locked,
          canUpgrade: canUpgradeNow,
        });

        return (
          <BuildingNode
            key={key}
            buildingKey={key}
            level={level}
            locked={locked}
            active={active}
            selected={selected === key}
            onSelect={() => onSelect?.(key)}
            identity={identity}
            status={status}
            style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
          />
        );
      })}
      {/* “Sealed system” corner glyphs */}
      <div className="pointer-events-none absolute left-3 top-3 text-[9px] text-slate-500/80 uppercase tracking-widest" aria-hidden>
        SYS LOCKED
      </div>
      <div className="pointer-events-none absolute right-3 top-3 text-[9px] text-slate-500/80 uppercase tracking-widest" aria-hidden>
        DB ONLINE
      </div>
    </div>
  );
}
