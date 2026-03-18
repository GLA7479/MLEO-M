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

  const data = Number(state?.resources?.DATA || 0);
  const energy = Number(state?.resources?.ENERGY || 0);

  return (
    <div className="rounded-md bg-sky-950/40 p-2 text-xs text-sky-100">
      <div className="mb-1 flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-200">
            Expedition
          </div>
          <div className="text-[10px] text-sky-300">
            {ready ? "Ready for launch" : `Cooldown: ${formatMs(msLeft)}`}
          </div>
        </div>
        <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-100">
          Bay Lv {bayLevel}
        </span>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-sky-200">
        <span className="rounded-full bg-slate-900/60 px-2 py-0.5">
          Needs ≥ 4 DATA ({data.toFixed(0)})
        </span>
        <span className="rounded-full bg-slate-900/60 px-2 py-0.5">
          Needs ≥ 24 ENERGY ({energy.toFixed(0)})
        </span>
      </div>

      <button
        type="button"
        disabled={!canLaunch}
        onClick={() => onLaunch?.({})}
        className="mt-1 w-full rounded-md bg-sky-500 px-2 py-1.5 text-[11px] font-medium text-slate-950 hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
      >
        {canLaunch ? "Launch expedition" : "Expedition unavailable"}
      </button>
    </div>
  );
}

