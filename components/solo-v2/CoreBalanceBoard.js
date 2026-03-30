const METER_META = [
  { key: "heat", label: "Heat", short: "H" },
  { key: "pressure", label: "Pressure", short: "P" },
  { key: "charge", label: "Charge", short: "C" },
];

function barTone(zone) {
  if (zone === "danger") return "from-rose-600/90 to-orange-500/85";
  if (zone === "warn") return "from-amber-600/80 to-amber-500/70";
  return "from-emerald-600/70 to-cyan-600/65";
}

function ringTone(zone) {
  if (zone === "danger") return "border-rose-500/55 shadow-[0_0_12px_rgba(244,63,94,0.35)]";
  if (zone === "warn") return "border-amber-500/50 shadow-[0_0_10px_rgba(245,158,11,0.2)]";
  return "border-zinc-600/55";
}

/**
 * Three vertical system meters — mobile-first, high-contrast danger read.
 */
export default function CoreBalanceBoard({ playing }) {
  if (!playing) return null;

  const zones = playing.zones || {};

  return (
    <div className="flex w-full max-w-md justify-center gap-2 sm:max-w-lg sm:gap-3" aria-label="Core meters">
      {METER_META.map(({ key, label, short }) => {
        const v = Math.max(0, Math.min(100, Math.floor(Number(playing[key]) || 0)));
        const pct = v;
        const z = zones[key] || "ok";
        return (
          <div key={key} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[9px] font-extrabold uppercase tracking-[0.18em] text-amber-200/70 sm:text-[10px]">
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </span>
            <div
              className={`relative h-[8.5rem] w-full max-w-[4.75rem] overflow-hidden rounded-xl border-2 bg-zinc-950/80 sm:h-[9.5rem] ${ringTone(z)}`}
            >
              <div className="absolute inset-x-0 bottom-0 top-0 flex flex-col justify-end p-1">
                <div
                  className={`w-full rounded-lg bg-gradient-to-t ${barTone(z)} transition-[height] duration-300 ease-out`}
                  style={{ height: `${pct}%`, minHeight: pct > 0 ? "4px" : "0" }}
                />
              </div>
              <div className="pointer-events-none absolute inset-x-1 top-1 flex justify-center">
                <span className="rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white/95 sm:text-[11px]">
                  {v}
                </span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
