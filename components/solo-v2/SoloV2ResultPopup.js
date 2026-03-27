/**
 * Unified Solo V2 result overlay (Dice Pick reference style).
 * Centered, non-flowing, pointer-events none — parent must be `relative` + `overflow-hidden` as today.
 */
export function SoloV2ResultPopupVaultLine({ isWin, deltaLabel }) {
  if (deltaLabel == null || deltaLabel === "") {
    return (
      <div className="invisible text-[11px] font-bold tabular-nums" aria-hidden>
        Vault +0
      </div>
    );
  }
  return (
    <div
      className={`text-[11px] font-bold tabular-nums ${isWin ? "text-emerald-200" : "text-red-200"}`}
    >
      Vault {deltaLabel}
    </div>
  );
}

export default function SoloV2ResultPopup({ open, isWin, animationKey, children, vaultSlot }) {
  if (!open) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-3 py-2">
      <div
        key={animationKey}
        className="w-[88%] max-w-[17.5rem] animate-dice-land-pop"
        role="status"
      >
        <div
          className={`rounded-xl border px-3.5 py-2.5 text-center shadow-md shadow-black/30 ${
            isWin
              ? "border-emerald-400/40 bg-emerald-950/95 text-emerald-50"
              : "border-red-400/40 bg-red-950/95 text-red-50"
          }`}
        >
          {children}
          <div className="mt-1.5 min-h-[2rem] border-t border-white/10 pt-1.5">
            {vaultSlot != null ? vaultSlot : <SoloV2ResultPopupVaultLine isWin={isWin} deltaLabel="" />}
          </div>
        </div>
      </div>
    </div>
  );
}
