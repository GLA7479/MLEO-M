export default function SoloV2TopHud({ title, subtitle = "", onBack, onOpenInfo, onOpenMenu, rightSlot = null }) {
  return (
    <header className="relative flex w-full shrink-0 items-center gap-2 py-1.5 sm:py-2">
      <div className="flex min-w-0 shrink-0 items-center gap-2">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
          >
            Back
          </button>
        ) : null}
      </div>

      <div className="pointer-events-none absolute left-1/2 top-1/2 min-w-0 max-w-[58%] -translate-x-1/2 -translate-y-1/2 text-center sm:max-w-[65%]">
        <h1 className="truncate text-base font-extrabold tracking-tight text-white sm:text-lg">{title}</h1>
        {subtitle ? <p className="truncate text-xs text-zinc-400 sm:text-sm">{subtitle}</p> : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onOpenInfo}
          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
          aria-label="Help and statistics"
        >
          Info
        </button>
        <button
          type="button"
          onClick={onOpenMenu}
          className="rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold text-white"
        >
          Menu
        </button>
        {rightSlot}
      </div>
    </header>
  );
}
