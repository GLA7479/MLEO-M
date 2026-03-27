export default function SoloV2ActionBar({
  primaryLabel = "Primary Action",
  secondaryLabel = "Secondary",
  onPrimaryAction,
  onSecondaryAction,
  primaryDisabled = false,
  secondaryDisabled = false,
  primaryLoading = false,
  showSecondary = true,
}) {
  return (
    <div className="flex shrink-0 gap-2 rounded-xl border border-white/15 bg-black/35 p-2">
      {showSecondary ? (
        <button
          type="button"
          onClick={onSecondaryAction}
          disabled={secondaryDisabled}
          className="min-h-[44px] flex-1 rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45"
        >
          {secondaryLabel}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onPrimaryAction}
        disabled={primaryDisabled || primaryLoading}
        className="min-h-[44px] flex-[1.4] rounded-lg border border-violet-300/30 bg-violet-500/85 px-3 py-2 text-sm font-bold text-white disabled:opacity-45"
      >
        {primaryLoading ? "Please wait..." : primaryLabel}
      </button>
    </div>
  );
}
