import { useEffect, useRef } from "react";

export default function SoloV2Modal({
  open,
  title,
  onClose,
  children,
  footer = null,
  maxWidthClass = "max-w-md",
}) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = event => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div
        className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] sm:p-6"
      >
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          className={`pointer-events-auto flex max-h-[min(85dvh,calc(100dvh-2rem))] w-full ${maxWidthClass} flex-col overflow-hidden rounded-3xl border border-white/12 bg-zinc-900/95 shadow-2xl shadow-black/50 ring-1 ring-white/[0.06]`}
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4 sm:px-6 sm:py-4">
            <h3 className="min-w-0 flex-1 text-lg font-extrabold tracking-tight text-white sm:text-xl">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-zinc-100 transition hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 text-sm leading-relaxed text-zinc-200/95 sm:px-6 sm:py-6">
            {children}
          </div>
          {footer ? (
            <div className="shrink-0 border-t border-white/[0.08] px-5 py-4 sm:px-6">{footer}</div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
