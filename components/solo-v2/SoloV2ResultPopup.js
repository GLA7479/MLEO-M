/**
 * Unified Solo V2 result overlay (Dice Pick reference style).
 * Centered, non-flowing, pointer-events none — parent must be `relative` + `overflow-hidden` as today.
 *
 * All Solo V2 games must use this duration for auto-dismiss, then reset UI so the player can
 * adjust wager and start the next round with a single primary action (no separate "play again").
 */
export const SOLO_V2_RESULT_POPUP_AUTO_DISMISS_MS = 2000;

/** @param {{ isWin?: boolean; deltaLabel?: string; tone?: "win" | "lose" | "push" }} props */
export function SoloV2ResultPopupVaultLine({ isWin, deltaLabel, tone }) {
  if (deltaLabel == null || deltaLabel === "") {
    return (
      <div className="invisible text-[11px] font-bold tabular-nums" aria-hidden>
        Vault +0
      </div>
    );
  }
  const t = tone ?? (isWin ? "win" : "lose");
  const colorClass =
    t === "push" ? "text-zinc-200" : t === "win" ? "text-emerald-200" : "text-red-200";
  return (
    <div className={`text-[11px] font-bold tabular-nums ${colorClass}`}>
      Vault {deltaLabel}
    </div>
  );
}

/**
 * @param {{ open: boolean; isWin: boolean; resultTone?: "win" | "lose" | "push"; animationKey?: string; children?: import("react").ReactNode; vaultSlot?: import("react").ReactNode }} props
 */
export default function SoloV2ResultPopup({ open, isWin, resultTone, animationKey, children, vaultSlot }) {
  if (!open) return null;

  const tone = resultTone ?? (isWin ? "win" : "lose");
  const shellClass =
    tone === "win"
      ? "border-emerald-400/40 bg-emerald-950/95 text-emerald-50"
      : tone === "push"
        ? "border-zinc-500/35 bg-zinc-900/95 text-zinc-100"
        : "border-red-400/40 bg-red-950/95 text-red-50";

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-3 py-2">
      <div
        key={animationKey}
        className="w-[88%] max-w-[17.5rem] animate-dice-land-pop"
        role="status"
      >
        <div className={`rounded-xl border px-3.5 py-2.5 text-center shadow-md shadow-black/30 ${shellClass}`}>
          {children}
          <div className="mt-1.5 min-h-[2rem] border-t border-white/10 pt-1.5">
            {vaultSlot != null ? (
              vaultSlot
            ) : (
              <SoloV2ResultPopupVaultLine isWin={isWin} tone={tone} deltaLabel="" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
