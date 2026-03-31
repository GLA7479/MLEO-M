/** Chrome control style aligned with Solo V2 `SoloV2TopHud` pills. */
export const OV2_HUD_CHROME_BTN =
  "inline-flex h-9 shrink-0 touch-manipulation select-none items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.06] px-3 text-[11px] font-semibold text-white/90 shadow-sm shadow-black/15 transition-colors hover:border-white/18 hover:bg-white/[0.1] active:bg-white/[0.14] sm:h-9 sm:px-3 sm:text-[11px] lg:h-8 lg:min-h-[32px] lg:px-3 lg:text-[11px]";

/**
 * In-place overlay for OV2 game Info / Menu (short content; keeps main column no-scroll).
 */
export function OnlineV2GameOverlay({ open, title, onClose, children, labelledBy }) {
  if (!open) return null;
  return (
    <div className="absolute inset-0 z-[60] flex items-end justify-center sm:items-center" role="presentation">
      <button
        type="button"
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="relative z-10 m-auto flex max-h-[min(72dvh,420px)] w-[min(92vw,22rem)] flex-col rounded-xl border border-white/15 bg-zinc-950/95 shadow-xl sm:max-h-[min(70dvh,480px)] sm:w-[min(90vw,26rem)] lg:w-[24rem]"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2">
          <h2 id={labelledBy} className="text-sm font-extrabold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-white/15 bg-white/10 px-2 py-1 text-[11px] font-semibold text-white"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2 text-[11px] leading-snug text-zinc-300 sm:text-xs">{children}</div>
      </div>
    </div>
  );
}
