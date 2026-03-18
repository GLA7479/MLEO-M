function formatMs(ms) {
  if (ms <= 0) return "Ready";
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remMin = minutes % 60;
    return `${hours}h ${remMin}m`;
  }
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
  return `${seconds}s`;
}

export function ExpeditionPanel({ state, onLaunch }) {
  const readyAt = Number(state?.expeditionReadyAt || 0);
  const now = Date.now();
  const msLeft = Math.max(0, readyAt - now);
  const ready = msLeft <= 0;

  const canLaunch =
    ready &&
    Number(state?.resources?.DATA || 0) >= 4 &&
    Number(state?.resources?.ENERGY || 0) >= 24; // mirrors existing config intent

  const bayLevel = Number(state?.buildings?.expeditionBay || 0);

  return (
    <div className="mt-3 rounded border border-sky-700/60 bg-sky-950/50 p-2 text-xs text-sky-100">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
            Expedition Console
          </span>
          <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-100">
            Bay Lv {bayLevel}
          </span>
        </div>
        <span
          className={`text-[10px] ${
            ready ? "text-emerald-300" : "text-sky-300"
          }`}
        >
          {ready ? "Ready for launch" : `Cooldown: ${formatMs(msLeft)}`}
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between text-[11px]">
        <div className="text-sky-200">
          Send a field team to recover mixed resources and rare MLEO.
        </div>
      </div>

      <button
        type="button"
        disabled={!canLaunch}
        onClick={() => onLaunch?.({})}
        className="w-full rounded bg-sky-500 px-2 py-1 text-[11px] font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
      >
        {canLaunch ? "Launch Expedition" : "Expedition unavailable"}
      </button>
    </div>
  );
}

