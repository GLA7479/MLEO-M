import { BUILDINGS } from "../../base-v2/data/buildings";
import { buildingCost, canAfford } from "../../base-v2/utils/buildings";

function getBuildingLevel(state, key) {
  const raw = state?.buildings?.[key];
  if (typeof raw === "number") return raw;
  if (raw && typeof raw === "object" && typeof raw.level === "number") return raw.level;
  return 0;
}

export function BuildingSheetV3({
  base,
  buildingKey,
  busy,
  onClose,
  onBuild,
  onExpedition,
  onMaintenance,
  onInstallModule,
  onResearch,
  onShipToVault,
  onSpendFromVault,
  onHireCrew,
  onClaimMission,
}) {
  if (!buildingKey) return null;

  const def = BUILDINGS.find((b) => b.key === buildingKey);
  if (!def) return null;

  const level = getBuildingLevel(base, buildingKey);
  const resources = base?.resources ?? {};
  const nextCost = buildingCost(def, level);
  const affordable = canAfford(resources, nextCost);
  const locked = level <= 0 && (def.requires?.length ?? 0) > 0;

  const primaryAction = (() => {
    if (buildingKey === "expeditionBay") return { label: "Launch expedition", onClick: onExpedition };
    if (buildingKey === "repairBay") return { label: "Perform maintenance", onClick: onMaintenance };
    return { label: level === 0 ? "Construct" : "Upgrade", onClick: () => onBuild(buildingKey) };
  })();

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center sm:justify-end pointer-events-none">
      <div
        className="absolute inset-0 bg-black/50 pointer-events-auto"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="relative pointer-events-auto w-full sm:max-w-sm sm:mr-4 sm:mb-4 rounded-t-3xl sm:rounded-3xl border border-slate-800 bg-slate-950/95 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={`${def.name} details`}
      >
        <div className="mx-auto mb-1 mt-2 h-1 w-10 rounded-full bg-slate-600 sm:hidden" />
        <div className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-slate-100">{def.name}</div>
              <div className="text-[11px] text-slate-500">
                Lv.{level} · {locked ? "Locked" : "Online"}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition"
              aria-label="Close"
            >
              ✕
            </button>
          </div>

          <p className="text-xs text-slate-300">{def.desc}</p>

          {locked && (def.requires?.length ?? 0) > 0 && (
            <div className="rounded-xl bg-slate-900/80 border border-amber-500/40 p-2 text-[11px] text-amber-200 space-y-1">
              <div className="font-medium">Requirements</div>
              <ul className="space-y-0.5">
                {def.requires.map((r) => {
                  const cur = getBuildingLevel(base, r.key);
                  const ok = cur >= (r.lvl ?? 1);
                  return (
                    <li key={r.key} className={ok ? "text-emerald-300" : ""}>
                      {r.key} Lv.{r.lvl} {ok ? "✓" : `(current ${cur})`}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-xl bg-slate-900/80 p-2">
              <div className="font-medium text-slate-200 mb-1">Next level cost</div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(nextCost).length === 0 ? (
                  <span className="text-slate-500">—</span>
                ) : (
                  Object.entries(nextCost).map(([k, v]) => (
                    <span key={k} className="rounded-full bg-slate-800 px-1.5 py-0.5">
                      {k} {Math.round(Number(v))}
                    </span>
                  ))
                )}
              </div>
            </div>
            <div className="rounded-xl bg-slate-900/80 p-2">
              <div className="font-medium text-slate-200 mb-1">Effect</div>
              <div className="text-slate-400">
                {def.outputs && Object.keys(def.outputs).length > 0
                  ? Object.entries(def.outputs).map(([k, v]) => `${k} +${v}`).join(", ")
                  : def.power
                  ? `+${def.power.cap ?? 0} cap, +${def.power.regen ?? 0} regen`
                  : "—"}
              </div>
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
            className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 disabled:opacity-50 disabled:pointer-events-none text-sm font-semibold py-2.5 text-slate-950 transition"
          >
            {busy ? "…" : primaryAction.label}
          </button>
        </div>
      </div>
    </div>
  );
}
