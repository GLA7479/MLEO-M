export default function SoloV2TopHud({
  title,
  subtitle = "",
  balanceLabel = "Vault",
  balanceValue = "--",
  onBack,
  onOpenStats,
  onOpenHelp,
  rightSlot = null,
}) {
  return (
    <header className="flex shrink-0 items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-2 py-2">
      <div className="flex shrink-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
          >
            Back
          </button>
        ) : null}
        <div className="rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs">
          <span className="text-zinc-300">{balanceLabel}: </span>
          <span className="font-semibold text-emerald-300">{balanceValue}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1 text-center">
        <h1 className="truncate text-sm font-extrabold text-white sm:text-base">{title}</h1>
        {subtitle ? <p className="truncate text-[11px] text-zinc-300">{subtitle}</p> : null}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onOpenStats}
          className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
        >
          Stats
        </button>
        <button
          type="button"
          onClick={onOpenHelp}
          className="rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-white"
        >
          Help
        </button>
        {rightSlot}
      </div>
    </header>
  );
}
