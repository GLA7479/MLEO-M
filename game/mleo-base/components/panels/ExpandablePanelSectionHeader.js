/**
 * Full-width row tap target (desktop overlay + mobile) — same UX as "Available action" list rows.
 * OPEN/CLOSE pill stays visible on the right; entire row toggles the inner panel.
 */
export function ExpandablePanelSectionHeader({ panelKey, openInnerPanel, toggleInnerPanel, children }) {
  const isOpen = openInnerPanel === panelKey;

  return (
    <button
      type="button"
      aria-expanded={isOpen}
      onClick={() => toggleInnerPanel(panelKey)}
      className="group flex w-full min-h-[44px] touch-manipulation items-center justify-between gap-3 rounded-2xl py-1.5 pl-1 pr-1 text-left outline-none transition hover:bg-white/[0.06] active:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-cyan-400/35"
    >
      <div className="min-w-0 flex-1">{children}</div>
      <span className="pointer-events-none shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white group-hover:border-white/15 group-hover:bg-white/10">
        {isOpen ? "CLOSE" : "OPEN"}
      </span>
    </button>
  );
}
