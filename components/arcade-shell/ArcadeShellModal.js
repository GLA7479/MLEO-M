import { useEffect, useRef } from "react";

/**
 * Presentation-only modal shell (markup/classes aligned with `pages/arcade.js` Modal).
 */
export default function ArcadeShellModal({
  open,
  onClose,
  children,
  title = "🎮 How to Play",
  sheetOnMobile = false,
}) {
  const modalRef = useRef(null);
  const closeBtnRef = useRef(null);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const root = modalRef.current;
      if (!root) return;
      const focusable = root.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    const prevActive = document.activeElement;
    closeBtnRef.current?.focus();
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (prevActive && typeof prevActive.focus === "function") {
        prevActive.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]" role="presentation">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={`absolute inset-0 flex justify-center px-0 sm:px-4 ${
          sheetOnMobile ? "items-end pb-0 sm:items-center sm:pb-0" : "items-center"
        }`}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          className={`w-full max-w-sm overflow-auto border border-zinc-800 bg-zinc-900 shadow-2xl ${
            sheetOnMobile
              ? "max-h-[88dvh] rounded-t-2xl sm:max-h-[85vh] sm:rounded-2xl"
              : "max-h-[85vh] rounded-2xl"
          }`}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-800 bg-zinc-900 px-5 py-4">
            <h3 className="pr-2 text-lg font-bold text-white sm:text-xl">{title}</h3>
            <button
              ref={closeBtnRef}
              type="button"
              onClick={onClose}
              className="rounded-lg px-3 py-1 text-zinc-300 hover:bg-zinc-800 hover:text-white"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
          <div className="space-y-4 px-5 py-6 leading-relaxed text-zinc-200">{children}</div>
        </div>
      </div>
    </div>
  );
}
