export function EventStrip({ items, max }) {
  const list = (items || []).slice(0, max);

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold tracking-wide text-slate-300">
          BASE FEED
        </span>
        <span className="text-[10px] text-slate-500">
          Showing last {max} events
        </span>
      </div>
      <div className="flex gap-2 overflow-x-auto text-[11px] text-slate-300">
        {list.length === 0 && (
          <span className="text-slate-500">
            No recent events. Your base awaits your command.
          </span>
        )}
        {list.map((item) => (
          <span
            key={item.id}
            className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 whitespace-nowrap"
          >
            {item.message || "Event"}
          </span>
        ))}
      </div>
    </div>
  );
}

