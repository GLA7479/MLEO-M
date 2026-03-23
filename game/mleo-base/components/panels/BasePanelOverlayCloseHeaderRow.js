/**
 * Full-width header row for BASE tab overlays: same close action as the visible Close pill.
 * Desktop vs mobile differ only in padding and focus ring token (match prior layouts).
 */
export function BasePanelOverlayCloseHeaderRow({
  onClose,
  ariaLabel,
  bankedBadge,
  children,
  variant = "mobile",
}) {
  const isDesktop = variant === "desktop";
  const rowPad = isDesktop ? "px-5 py-4" : "px-4 py-3";
  const focusRing = isDesktop
    ? "focus-visible:ring-cyan-400/45"
    : "focus-visible:ring-cyan-400/50";
  const closePillPad = isDesktop ? "px-4 py-2.5" : "px-3 py-2.5";
  const rightClusterGap = isDesktop ? "gap-3" : "gap-2";

  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={ariaLabel}
      className={`group flex w-full items-center justify-between gap-3 border-b border-white/10 ${rowPad} text-left outline-none transition hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset ${focusRing} focus-visible:ring-offset-0`}
    >
      <div className="min-w-0 pointer-events-none">{children}</div>
      <div className={`flex shrink-0 items-center pointer-events-none ${rightClusterGap}`}>
        {bankedBadge}
        <span
          aria-hidden
          className={`rounded-2xl border border-white/10 bg-white/5 text-sm font-bold text-white/90 group-hover:border-white/12 group-hover:bg-white/[0.09] ${closePillPad}`}
        >
          Close
        </span>
      </div>
    </button>
  );
}
