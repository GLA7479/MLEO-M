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
  /** Stronger hover/active/focus for Overview scan-to-tap (Overview only). */
  overviewTapRow = false,
}) {
  const isOpen = openInnerPanel === panelKey;

  const pillCls = subtlePill
    ? "border-white/[0.07] bg-white/[0.035] text-white/50 group-hover:border-white/[0.11] group-hover:bg-white/[0.055] group-hover:text-white/68 group-active:border-white/[0.12] group-active:bg-white/[0.06]"
    : "border-white/10 bg-white/5 text-white group-hover:border-white/15 group-hover:bg-white/10 group-active:border-white/16 group-active:bg-white/[0.11]";

  const rowInteract = overviewTapRow
    ? "rounded-xl transition duration-150 ease-out hover:bg-white/[0.075] active:bg-white/[0.1] active:scale-[0.993] motion-reduce:active:scale-100 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
    : "transition hover:bg-white/[0.06] active:bg-white/[0.08]";

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => toggleInnerPanel(panelKey)}
      className={`group flex w-full touch-manipulation items-center justify-between rounded-2xl text-left outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 ${rowInteract} ${
        compact
          ? "min-h-[40px] gap-2 py-0.5 pl-0.5 pr-0.5 sm:min-h-[44px]"
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
