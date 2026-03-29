/**
 * Compact non-interactive payout metadata for ladder-style Solo V2 boards
 * (Speed Track, Gold Rush Digger, Treasure Doors). Lives in the board header row only.
 */
export default function SoloV2BoardPayoutChip({ label, value }) {
  return (
    <aside
      className="pointer-events-none flex max-w-[min(11rem,42vw)] shrink-0 items-baseline gap-1.5 rounded-md border border-amber-900/45 bg-zinc-800/55 px-1.5 py-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:max-w-[12.5rem] sm:gap-2 sm:px-2 sm:py-1"
      aria-label={`${label} ${value}`}
    >
      <span className="min-w-0 shrink truncate text-[6px] font-bold uppercase leading-none tracking-[0.08em] text-amber-200/50 sm:text-[7px]">
        {label}
      </span>
      <span className="shrink-0 truncate text-[10px] font-black tabular-nums leading-none text-amber-100 sm:text-xs">
        {value}
      </span>
    </aside>
  );
}
