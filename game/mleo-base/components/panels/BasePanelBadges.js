/** Shared small badges used across Build / Development tab panels (identical visuals). */

export function PanelAvailabilityBadge() {
  return (
    <span className="inline-flex items-center justify-center rounded-full bg-cyan-400 px-2 py-1 text-[10px] font-black tracking-[0.14em] text-slate-950">
      AVAILABLE
    </span>
  );
}

/** `structures` vs `development` keep distinct ring tokens on cyan tab headers (unchanged visuals). */
export function PanelTabCountBadge({
  count,
  title,
  onBrightTab = false,
  brightTabStyle = "development",
}) {
  const n = Number(count || 0);
  if (!n) return null;

  const onBrightClass =
    brightTabStyle === "structures"
      ? "bg-slate-950 text-cyan-300 ring-1 ring-cyan-900/40"
      : "bg-slate-950 text-cyan-300 ring-1 ring-white/15";

  return (
    <span
      title={title || ""}
      className={`inline-flex min-w-6 h-6 shrink-0 items-center justify-center rounded-full px-2 text-[11px] font-black ${
        onBrightTab ? onBrightClass : "bg-cyan-400 text-slate-950"
      }`}
    >
      {n > 99 ? "99+" : n}
    </span>
  );
}
