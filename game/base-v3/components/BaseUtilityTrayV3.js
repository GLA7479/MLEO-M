import Link from "next/link";

const EXPEDITION_REQUIREMENTS = { ENERGY: 36, DATA: 4 };

function getStatus(base, claimableMissionKeys) {
  const res = base?.resources ?? {};
  const energy = Number(res.ENERGY ?? 0);
  const data = Number(res.DATA ?? 0);
  const banked = Number(base?.bankedMleo ?? 0);
  const stability = Number(base?.stability ?? 100);
  const missionReady = Array.isArray(claimableMissionKeys) && claimableMissionKeys.length > 0;

  return {
    expeditionReady: energy >= EXPEDITION_REQUIREMENTS.ENERGY && data >= EXPEDITION_REQUIREMENTS.DATA,
    shipReady: banked >= 120,
    maintenanceWarn: stability < 75 || Number(base?.maintenanceDue ?? 0) >= 1,
    missionReady,
  };
}

function toneClass(active, warn) {
  if (warn) return "border-amber-500/40 bg-amber-950/25 text-amber-100";
  if (active) return "border-emerald-500/40 bg-emerald-950/25 text-emerald-100";
  return "border-slate-700/70 bg-slate-900/75 text-slate-300";
}

export function BaseUtilityTrayV3({
  base,
  hubHref,
  busy,
  sheetOpen,
  onExpedition,
  onMaintenance,
  onShipToVault,
  onHireCrew,
  onClaimMission,
  claimableMissionKeys,
}) {
  const status = getStatus(base, claimableMissionKeys);
  const hasClaimable = Array.isArray(claimableMissionKeys) && claimableMissionKeys.length > 0;
  const handleMissionClick = onClaimMission && hasClaimable ? () => onClaimMission(claimableMissionKeys[0]) : null;

  const items = [
    {
      id: "exp",
      label: "Expedition",
      short: "EXP",
      onClick: onExpedition,
      active: status.expeditionReady,
    },
    {
      id: "maint",
      label: "Maintenance",
      short: "MNT",
      onClick: onMaintenance,
      warn: status.maintenanceWarn,
    },
    {
      id: "ship",
      label: "Ship",
      short: "SHIP",
      onClick: onShipToVault,
      active: status.shipReady,
    },
    {
      id: "crew",
      label: "Crew",
      short: "CREW",
      onClick: onHireCrew,
    },
    {
      id: "mission",
      label: "Mission",
      short: "MISS",
      onClick: handleMissionClick,
      active: status.missionReady,
      disabled: !handleMissionClick,
    },
  ];

  return (
    <>
      {/* Mobile dock */}
      <div
        className={`
          md:hidden shrink-0 px-0 pb-[calc(0.35rem+env(safe-area-inset-bottom))]
          transition-all duration-200
          ${sheetOpen ? "opacity-35" : "opacity-100"}
          ${sheetOpen ? "pointer-events-none" : ""}
        `}
      >
        <div className="flex items-center justify-center gap-1.5 rounded-[22px] border border-slate-800 bg-slate-950/80 px-2 py-2 backdrop-blur">
          {hubHref && (
            <Link
              href={hubHref}
              className="rounded-xl border border-slate-700/70 bg-slate-900/75 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-300"
            >
              Hub
            </Link>
          )}

          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick || undefined}
              disabled={busy || item.disabled}
              className={`rounded-xl px-2.5 py-2 text-[10px] font-semibold uppercase tracking-wide transition touch-manipulation disabled:opacity-45 disabled:pointer-events-none ${toneClass(
                item.active,
                item.warn
              )}`}
            >
              {item.short}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop side rail */}
      <div className="hidden md:flex md:absolute md:right-4 md:top-1/2 md:z-30 md:-translate-y-1/2 md:flex-col md:gap-2">
        {hubHref && (
          <Link
            href={hubHref}
            className="rounded-2xl border border-slate-700/70 bg-slate-950/80 px-4 py-3 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-300 backdrop-blur"
          >
            Hub
          </Link>
        )}

        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick || undefined}
            disabled={busy || item.disabled}
            className={`min-w-[108px] rounded-2xl border px-4 py-3 text-left transition disabled:opacity-45 disabled:pointer-events-none ${toneClass(
              item.active,
              item.warn
            )}`}
          >
            <div className="text-[10px] uppercase tracking-[0.22em] opacity-70">{item.short}</div>
            <div className="mt-1 text-sm font-semibold">{item.label}</div>
          </button>
        ))}
      </div>
    </>
  );
}
