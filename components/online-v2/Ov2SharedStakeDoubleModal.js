"use client";

import { useId, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_DANGER =
  "rounded-lg border border-rose-500/24 bg-gradient-to-b from-rose-950/55 to-rose-950 px-3 py-2 text-[11px] font-semibold text-rose-100/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * Shared stake-double response (Four Line reference): full-screen dim + centered amber card.
 * Portaled to `document.body` at z-[95] (below match-finish z-[100], above HUD overlays z-[60]).
 * @param {{ open: boolean, proposedMult: unknown, stakeMultiplier: unknown, busy: boolean, onAccept: () => void, onDecline: () => void }} props
 */
export default function Ov2SharedStakeDoubleModal({ open, proposedMult, stakeMultiplier, busy, onAccept, onDecline }) {
  const promptId = useId();
  const [container, setContainer] = useState(/** @type {HTMLElement | null} */ (null));
  useLayoutEffect(() => {
    setContainer(document.body);
  }, []);

  if (!open) return null;
  const pm = proposedMult != null ? String(proposedMult) : "";
  const sm = stakeMultiplier != null ? String(stakeMultiplier) : "";

  const node = (
    <div className="pointer-events-auto fixed inset-0 z-[95] flex max-h-[100dvh] items-center justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px]">
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-500/35 bg-gradient-to-b from-amber-950/95 to-zinc-950 p-4 shadow-2xl shadow-black/40"
        role="dialog"
        aria-modal="true"
        aria-labelledby={promptId}
      >
        <p id={promptId} className="text-[11px] leading-snug text-amber-100/92">
          Opponent proposes table ×{pm}. Declining or timing out ends the round at the current ×{sm}.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          <button type="button" disabled={busy} className={BTN_PRIMARY + " w-full"} onClick={onAccept}>
            Accept ×{pm}
          </button>
          <button type="button" disabled={busy} className={BTN_DANGER + " w-full"} onClick={onDecline}>
            Decline
          </button>
        </div>
      </div>
    </div>
  );

  if (!container) return null;
  return createPortal(node, container);
}
