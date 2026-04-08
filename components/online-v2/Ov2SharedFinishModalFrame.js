"use client";

import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Shared round-result shell (Four Line reference): full-screen dim + scrollable zinc card.
 * Rendered via `createPortal(..., document.body)` so it always covers the full viewport above shell chrome.
 * - `finish` — z-[100], bottom sheet on small viewports (match result).
 * - `center` — z-[90], centered (e.g. MeldMatch “finish hand”; below stake-double z-[95] if both existed).
 * @param {{ children: import("react").ReactNode, titleId?: string, variant?: "finish" | "center" }} props
 */
export default function Ov2SharedFinishModalFrame({ children, titleId, variant = "finish" }) {
  const [container, setContainer] = useState(/** @type {HTMLElement | null} */ (null));
  useLayoutEffect(() => {
    setContainer(document.body);
  }, []);

  const outer =
    variant === "center"
      ? "pointer-events-auto fixed inset-0 z-[90] flex max-h-[100dvh] items-center justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]"
      : "pointer-events-auto fixed inset-0 z-[100] flex max-h-[100dvh] items-end justify-center bg-black/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center";

  const node = (
    <div className={outer}>
      <div
        className="max-h-[min(92dvh,640px)] w-full max-w-sm overflow-y-auto overflow-x-hidden rounded-2xl border border-white/12 bg-gradient-to-b from-zinc-900/98 to-zinc-950 shadow-2xl shadow-black/50"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId || undefined}
      >
        {children}
      </div>
    </div>
  );

  if (!container) return null;
  return createPortal(node, container);
}
