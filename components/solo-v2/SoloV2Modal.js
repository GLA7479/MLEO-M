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
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="absolute inset-0 flex items-end justify-center px-2 pb-2 pt-8 sm:items-center sm:p-4">
        <div
          ref={containerRef}
          role="dialog"
          aria-modal="true"
          className={`flex max-h-[88dvh] w-full ${maxWidthClass} flex-col overflow-hidden rounded-2xl border border-white/15 bg-zinc-900 shadow-2xl`}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <h3 className="pr-3 text-base font-bold text-white">{title}</h3>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-white/20 bg-white/5 px-2 py-1 text-sm text-white hover:bg-white/10"
            >
              Close
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 text-sm text-zinc-200">{children}</div>
          {footer ? <div className="border-t border-white/10 px-4 py-3">{footer}</div> : null}
        </div>
      </div>
    </div>
  );
}
