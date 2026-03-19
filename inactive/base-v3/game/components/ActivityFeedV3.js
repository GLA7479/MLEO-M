export function ActivityFeedV3({ items, mode = "mobile" }) {
  const list = Array.isArray(items) ? items.slice(0, mode === "desktop" ? 8 : 1) : [];

  if (mode === "desktop") {
    return (
      <div className="space-y-2 p-4">
        {list.length === 0 ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-400">
            Your base is idle. Make a move.
          </div>
        ) : (
          list.map((it, idx) => (
            <div
              key={it?.id ?? idx}
              className={`rounded-2xl border px-4 py-3 ${
                it?.type === "error"
                  ? "border-red-500/30 bg-red-950/20 text-red-100"
                  : "border-slate-800 bg-slate-950/60 text-slate-200"
              }`}
            >
              <div className="text-[10px] uppercase tracking-[0.24em] opacity-60">
                {it?.type === "error" ? "Warning" : "Event"}
              </div>
              <div className="mt-1 text-sm leading-6">{it?.message ?? "Event"}</div>
            </div>
          ))
        )}
      </div>
    );
  }

  if (list.length === 0) return null;

  const item = list[0];

  return (
    <div className="w-full pb-1">
      <div
        className={`rounded-2xl border px-3 py-2 text-[11px] ${
          item?.type === "error"
            ? "border-red-500/30 bg-red-950/20 text-red-100"
            : "border-slate-800 bg-slate-950/70 text-slate-300"
        }`}
      >
        {item?.message ?? "Event"}
      </div>
    </div>
  );
}
