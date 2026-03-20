export function EventStrip({ items, max }) {
  const list = (items || []).slice(0, max);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-slate-300">
          Base activity
        </span>
        <span className="text-[10px] text-slate-500">
          Last {max} events
        </span>
      </div>

      {list.length === 0 ? (
        <div className="rounded-md bg-slate-950/60 px-2 py-1.5 text-[11px] text-slate-500">
          No recent events. Your base awaits your command.
        </div>
      ) : (
        <ul className="space-y-1 text-[11px] text-slate-200 sm:flex sm:flex-wrap sm:gap-1.5 sm:space-y-0">
          {list.map((item) => (
            <li
              key={item.id}
              className="rounded-md bg-slate-900/80 px-2 py-1 sm:rounded-full"
            >
              {item.message || "Event"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

