import Link from "next/link";

// Compact utility tray for system-wide actions. Mobile portrait only. Not inside building sheets.

export function BaseUtilityTrayV3({
  hubHref,
  busy,
  onExpedition,
  onMaintenance,
  onShipToVault,
  onHireCrew,
  onClaimMission,
  claimableMissionKeys,
}) {
  const hasClaimable = Array.isArray(claimableMissionKeys) && claimableMissionKeys.length > 0;
  const handleMissionClick = onClaimMission && (hasClaimable ? () => onClaimMission(claimableMissionKeys[0]) : null);

  const buttons = [
    { id: "exp", label: "EXP", title: "Expedition", onClick: onExpedition },
    { id: "maint", label: "MNT", title: "Maintenance", onClick: onMaintenance },
    { id: "ship", label: "SHIP", title: "Ship to vault", onClick: onShipToVault },
    { id: "crew", label: "CREW", title: "Hire crew", onClick: onHireCrew },
    ...(onClaimMission ? [{ id: "mission", label: "MISS", title: "Claim mission", onClick: handleMissionClick, highlight: hasClaimable }] : []),
  ].filter(Boolean);

  return (
    <div className="w-full px-2 pb-2">
      <div className="flex flex-wrap gap-1.5 justify-center items-center rounded-xl bg-slate-900/50 border border-slate-700/50 px-2 py-1.5">
        {hubHref && (
          <Link
            href={hubHref}
            className="rounded-lg border border-slate-600/60 bg-slate-800/80 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-300 hover:bg-slate-700/80 hover:text-slate-100 transition touch-manipulation"
          >
            ← Hub
          </Link>
        )}
        {buttons.map((b) => (
          <button
            key={b.id}
            type="button"
            title={b.title}
            onClick={b.onClick || undefined}
            disabled={busy || (b.id === "mission" && !handleMissionClick)}
            className={`
              rounded-lg px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide
              transition touch-manipulation
              ${b.highlight
                ? "bg-amber-500/20 border border-amber-500/50 text-amber-200"
                : "bg-slate-800/80 border border-slate-600/60 text-slate-300 hover:bg-slate-700/80 hover:text-slate-100"}
              disabled:opacity-50 disabled:pointer-events-none
            `}
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
}
