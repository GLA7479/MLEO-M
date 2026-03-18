import { BUILDINGS } from "../../base-v2/data/buildings";
import { buildingCost, canAfford } from "../../base-v2/utils/buildings";
import { getBuildingIdentity } from "../data/buildingIdentity";

const EXPEDITION_REQUIREMENTS = { ENERGY: 36, DATA: 4 };

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
    tradeHub: "Gold flow hub. Keeps the economy liquid.",
    salvage: "Scrap recovery. Feeds the mid-game chain.",
    refinery: "Conversion chain. ORE + SCRAP → banked MLEO.",
    powerCell: "Energy core. Cap + regeneration.",
    minerControl: "Miners ecosystem link. Improves quality control.",
    arcadeHub: "Arcade ecosystem link. Improves mission rewards.",
    expeditionBay: "Expedition readiness. Consumes ENERGY + DATA.",
    logisticsCenter: "Export lane. Shipping efficiency & quality.",
    researchLab: "DATA generation. Research progression.",
    repairBay: "Maintenance lane. Stability support.",
  };
  return roles[key] || def?.desc?.slice(0, 50) || "Base building.";
}

function fmt(n) {
  return Math.round(Number(n) * 100) / 100;
}

function renderRoleMetrics({ buildingKey, def, level }) {
  const lvl = Math.max(1, level || 0);

  if (buildingKey === "powerCell" && def?.power) {
    return [
      { label: "ENERGY CAP", value: `+${fmt((def.power.cap ?? 0) * lvl)}` },
      { label: "REGEN", value: `+${fmt((def.power.regen ?? 0) * lvl)}/t` },
    ];
  }

  if (buildingKey === "refinery" && def?.convert) {
    const c = def.convert;
    return [
      { label: "INPUT", value: `${fmt(c.ORE ?? 0)} ORE + ${fmt(c.SCRAP ?? 0)} SCRAP` },
      { label: "OUTPUT", value: `${fmt(c.MLEO ?? 0)} MLEO` },
    ];
  }

  if (buildingKey === "tradeHub") {
    const gold = def?.outputs?.GOLD ?? 0;
    return [
      { label: "GOLD FLOW", value: `+${fmt(gold * lvl)}` },
      { label: "ROLE", value: "Economy support" },
    ];
  }

  if (buildingKey === "salvage") {
    const scrap = def?.outputs?.SCRAP ?? 0;
    return [
      { label: "SCRAP", value: `+${fmt(scrap * lvl)}` },
      { label: "FEEDS", value: "Refinery chain" },
    ];
  }

  if (buildingKey === "quarry") {
    const ore = def?.outputs?.ORE ?? 0;
    return [
      { label: "ORE", value: `+${fmt(ore * lvl)}` },
      { label: "ROLE", value: "Production" },
    ];
  }

  if (buildingKey === "researchLab") {
    const data = def?.outputs?.DATA ?? 0;
    return [
      { label: "DATA", value: `+${fmt(data * lvl)}` },
      { label: "ROLE", value: "Research" },
    ];
  }

  if (buildingKey === "minerControl") {
    const data = def?.outputs?.DATA ?? 0;
    return [
      { label: "LINK", value: "MINERS" },
      { label: "DATA", value: `+${fmt(data * lvl)}` },
    ];
  }

  if (buildingKey === "arcadeHub") {
    const data = def?.outputs?.DATA ?? 0;
    return [
      { label: "LINK", value: "ARCADE" },
      { label: "DATA", value: `+${fmt(data * lvl)}` },
    ];
  }

  if (buildingKey === "logisticsCenter") {
    const data = def?.outputs?.DATA ?? 0;
    return [
      { label: "LANE", value: "EXPORT" },
      { label: "DATA", value: `+${fmt(data * lvl)}` },
    ];
  }

  if (buildingKey === "repairBay") {
    return [
      { label: "LANE", value: "MAINT" },
      { label: "ROLE", value: "Stability" },
    ];
  }

  if (buildingKey === "expeditionBay") {
    return [
      { label: "LANE", value: "EXPED" },
      { label: "READY", value: "Requires ENERGY+DATA" },
    ];
  }

  return [];
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
  const roleMetrics = renderRoleMetrics({ buildingKey, def, level });

  const canLaunchExpedition =
    Number(resources?.ENERGY ?? 0) >= EXPEDITION_REQUIREMENTS.ENERGY &&
    Number(resources?.DATA ?? 0) >= EXPEDITION_REQUIREMENTS.DATA;

  const primaryAction = (() => {
    if (buildingKey === "expeditionBay") return { label: "Launch expedition", onClick: onExpedition, requires: EXPEDITION_REQUIREMENTS, gate: !canLaunchExpedition };
    if (buildingKey === "repairBay") return { label: "Maintenance", onClick: onMaintenance };
    return { label: level === 0 ? "Construct" : "Upgrade", onClick: () => onBuild(buildingKey) };
  })();

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center md:items-center md:justify-end md:pr-5 md:pb-5 pointer-events-none">
      <div
        className="absolute inset-0 bg-black/55 md:bg-black/35 pointer-events-auto animate-base-v3-sheet-backdrop"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="
          relative pointer-events-auto w-full max-h-[78vh] overflow-y-auto
          rounded-t-3xl border-t border-slate-700
          md:w-[420px] md:max-w-[420px] md:max-h-[82vh]
          md:rounded-2xl md:border md:border-slate-700 md:border-t md:shadow-2xl
          bg-slate-950/98 shadow-2xl animate-base-v3-sheet-enter
          pb-[calc(env(safe-area-inset-bottom)+0.5rem)] md:pb-4
        "
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} details`}
      >
        <div className="sticky top-0 z-10 flex justify-center pt-2.5 pb-1 bg-slate-950/98 md:hidden">
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

          {roleMetrics.length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-xs">
              {roleMetrics.slice(0, 4).map((m) => (
                <div key={m.label} className="rounded-xl bg-slate-900/80 px-3 py-2">
                  <div className="font-medium text-slate-400 mb-1">{m.label}</div>
                  <div className="text-slate-200 text-[11px] leading-snug">{m.value}</div>
                </div>
              ))}
            </div>
          )}

          {buildingKey === "expeditionBay" && (
            <div className="rounded-xl bg-slate-900/70 border border-slate-700/60 px-3 py-2 text-xs space-y-1">
              <div className="font-medium text-slate-300">Launch requirements</div>
              <div className="flex flex-wrap gap-1">
                <span className={`rounded px-1.5 py-0.5 ${canLaunchExpedition ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800 text-slate-300"}`}>
                  ENERGY {EXPEDITION_REQUIREMENTS.ENERGY} (you: {Math.floor(Number(resources?.ENERGY ?? 0))})
                </span>
                <span className={`rounded px-1.5 py-0.5 ${canLaunchExpedition ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800 text-slate-300"}`}>
                  DATA {EXPEDITION_REQUIREMENTS.DATA} (you: {Math.floor(Number(resources?.DATA ?? 0))})
                </span>
              </div>
              {!canLaunchExpedition && (
                <div className="text-[11px] text-slate-400">
                  Generate DATA (Lab / Miner / Arcade) and build Energy (Power Cell) before launching.
                </div>
              )}
            </div>
          )}

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
              (primaryAction.label === "Launch expedition" && primaryAction.gate) ||
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
