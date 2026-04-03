/**
 * Floating lobby badge: seated count from live engine (does not affect card layout).
 * @param {{ activity: { seated: number, max: number } | null }} props
 */
export default function Ov2TablePickCardSeatBadge({ activity }) {
  if (!activity) return null;
  const { seated, max } = activity;
  return (
    <div
      className="pointer-events-none absolute top-1 right-1 z-[1] flex flex-col items-end gap-0.5"
      aria-label={`${seated} of ${max} seats filled`}
    >
      <span className="rounded border border-white/10 bg-black/60 px-1 py-px text-[8px] font-semibold leading-none text-zinc-200/95 tabular-nums shadow-sm">
        <span aria-hidden>👤</span> {seated}/{max}
      </span>
    </div>
  );
}
