/**
 * Full-width row tap target (desktop overlay + mobile) — same UX as "Available action" list rows.
 * OPEN/CLOSE pill stays visible on the right; entire row toggles the inner panel.
 */
export function ExpandablePanelSectionHeader({
  panelKey,
  openInnerPanel,
  toggleInnerPanel,
  children,
  compact = false,
  /** Softer OPEN/CLOSE pill for low-emphasis Overview rows (tertiary). */
  subtlePill = false,
}) {
  const isOpen = openInnerPanel === panelKey;

  const pillCls = subtlePill
    ? "border-white/[0.07] bg-white/[0.035] text-white/50 group-hover:border-white/[0.1] group-hover:bg-white/[0.05] group-hover:text-white/65"
    : "border-white/10 bg-white/5 text-white group-hover:border-white/15 group-hover:bg-white/10";

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => toggleInnerPanel(panelKey)}
      className={`group flex w-full touch-manipulation items-center justify-between rounded-2xl text-left outline-none transition hover:bg-white/[0.06] active:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-400/35 ${
        compact
          ? "min-h-[40px] gap-2 py-0.5 pl-0.5 pr-0.5"
          : "min-h-[44px] gap-3 py-1.5 pl-1 pr-1"
      }`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span
        className={`pointer-events-none shrink-0 rounded-lg border font-semibold ${pillCls} ${
          compact ? "px-2 py-1 text-[10px]" : "rounded-xl px-3 py-1.5 text-xs"
        }`}
      >
        {isOpen ? "CLOSE" : "OPEN"}
      </span>
    </button>
  );
}
