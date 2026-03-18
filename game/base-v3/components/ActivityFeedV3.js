export function ActivityFeedV3({ items }) {
  const list = Array.isArray(items) ? items.slice(-4).reverse() : [];

  return (
    <div className="w-full px-3 pb-3">
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar text-[10px] text-slate-300">
        {list.length === 0 ? (
          <span className="text-slate-500">Your base is idle. Make a move.</span>
        ) : (
          list.map((it, idx) => (
            <div
              key={it?.id ?? idx}
              className={`shrink-0 rounded-full border px-2 py-1 ${
                it?.type === "error"
                  ? "border-red-500/40 bg-red-950/30 text-red-200"
                  : "border-slate-800/80 bg-slate-950/90 text-slate-300"
              }`}
            >
              {it?.message ?? "Event"}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
