const ZONE_TILES = [
  { zone: "low", label: "LOW", hint: "3–8" },
  { zone: "mid", label: "MID", hint: "9–11" },
  { zone: "high", label: "HIGH", hint: "12–18" },
  { zone: "triple", label: "TRIPLE", hint: "Same face" },
];

/** @param {{ zone: string, label: string, hint: string }} t */
function zoneTileMatches(t, selectedZone) {
  return t.zone === selectedZone;
}

/** 3×3 pip layout for values 1–6 */
function PipDie({ value, rolling, muted }) {
  const v = Math.min(6, Math.max(1, Math.floor(Number(value)) || 1));
  const on = pos => {
    const p = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    }[v];
    return p.includes(pos);
  };
  return (
    <div
      className={`grid w-[3.85rem] shrink-0 grid-cols-3 gap-px rounded-xl border-2 p-1.5 sm:w-[4.35rem] sm:p-1.5 ${
        muted
          ? "border-zinc-700 bg-zinc-950"
          : rolling
            ? "border-violet-500/80 bg-zinc-900"
            : "border-violet-600/70 bg-zinc-900"
      } ${rolling ? "motion-safe:animate-pulse" : ""}`}
    >
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map(pos => (
        <div key={pos} className="flex aspect-square items-center justify-center">
          <span
            className={`h-1.5 w-1.5 rounded-full sm:h-1.5 sm:w-1.5 ${
              on(pos)
                ? muted
                  ? "bg-zinc-500"
                  : "bg-violet-200 shadow-[0_0_6px_rgba(196,181,253,0.45)]"
                : "bg-transparent"
            } ${rolling ? "opacity-80" : ""}`}
          />
        </div>
      ))}
    </div>
  );
}

/**
 * Triple Dice — board only: status → dice → total → 2×2 zones + Roll.
 * Middle band flexes so the footer (selector + Roll) stays visible on desktop without scroll.
 */
export default function TripleDiceBoard({
  sessionNotice = "",
  statusTop = "\u00a0",
  statusSub = "\u00a0",
  diceValues = [1, 1, 1],
  diceMuted = false,
  totalDisplay = "—",
  selectedZone = "mid",
  onZoneChange,
  rolling = false,
  onRoll,
  rollDisabled = false,
  optionPickerDisabled = false,
}) {
  const showSession = Boolean(sessionNotice);
  const d0 = diceValues[0] ?? 1;
  const d1 = diceValues[1] ?? 1;
  const d2 = diceValues[2] ?? 1;

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-2xl border-2 border-violet-600/40 bg-zinc-900">
      <div className="flex h-5 shrink-0 items-center justify-center px-2 sm:h-6">
        <p
          className={`truncate text-center text-[10px] text-emerald-200/75 sm:text-[11px] ${
            showSession ? "opacity-100" : "opacity-0"
          }`}
        >
          {showSession ? sessionNotice : "\u00a0"}
        </p>
      </div>

      <div className="shrink-0 px-3 pb-0.5 pt-0.5 text-center sm:px-4 sm:pb-1">
        <p className="min-h-[1.2rem] text-[12px] font-bold leading-tight text-white sm:text-sm">{statusTop}</p>
        <p className="mt-0.5 min-h-[1rem] text-[10px] leading-snug text-zinc-400 sm:text-xs">{statusSub}</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center gap-0.5 px-2 py-0.5 sm:gap-1 sm:px-3 sm:py-1">
        <div className="flex shrink-0 items-center justify-center gap-2 sm:gap-3">
          <PipDie value={d0} rolling={rolling} muted={diceMuted} />
          <PipDie value={d1} rolling={rolling} muted={diceMuted} />
          <PipDie value={d2} rolling={rolling} muted={diceMuted} />
        </div>

        <div className="flex h-7 shrink-0 items-center justify-center sm:h-8">
          <p className="text-base font-black tabular-nums text-violet-100 sm:text-lg" aria-live="polite">
            Total <span className="text-amber-100/95">{totalDisplay}</span>
          </p>
        </div>
      </div>

      <div className="shrink-0 border-t border-violet-600/30 bg-zinc-950 px-2 pb-2 pt-1.5 sm:px-3 sm:pb-2 sm:pt-2">
        <div className="mx-auto grid w-full max-w-[16rem] grid-cols-2 gap-1.5 sm:max-w-[17rem] sm:gap-2">
          {ZONE_TILES.map(t => {
            const active = zoneTileMatches(t, selectedZone);
            return (
              <button
                key={t.zone}
                type="button"
                disabled={optionPickerDisabled}
                onClick={() => onZoneChange?.(t.zone)}
                className={`flex min-h-[2.5rem] flex-col items-center justify-center rounded-lg border-2 px-1 py-1 text-center transition sm:min-h-[2.65rem] sm:py-1 ${
                  active
                    ? "border-violet-400 bg-violet-950/60 text-violet-50"
                    : "border-violet-800/60 bg-zinc-800 text-violet-100 hover:border-violet-600"
                } disabled:cursor-not-allowed disabled:opacity-45`}
              >
                <span className="text-[11px] font-black leading-none sm:text-xs">{t.label}</span>
                <span className="mt-0.5 text-[8px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[9px]">
                  {t.hint}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          disabled={rollDisabled || rolling}
          onClick={() => onRoll?.()}
          className={`mx-auto mt-1.5 flex min-h-[44px] w-full max-w-[16rem] flex-col items-center justify-center rounded-xl border-2 px-2 py-1.5 text-center transition-colors sm:mt-2 sm:max-w-[17rem] sm:min-h-[46px] sm:py-2 ${
            rollDisabled || rolling
              ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
              : "border-violet-400 bg-violet-950/50 text-violet-50 ring-2 ring-violet-500/25 hover:bg-violet-900/40"
          }`}
        >
          <span className="text-[10px] font-black uppercase leading-tight text-white sm:text-xs">
            {rolling ? "Rolling…" : "Roll"}
          </span>
        </button>
      </div>
    </div>
  );
}
