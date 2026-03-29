const ZONE_TILES = [
  { zone: "low", label: "LOW", hint: "3–8" },
  { zone: "mid", label: "MID", hint: "9–11" },
  { zone: "high", label: "HIGH", hint: "12–18" },
  { zone: "triple", label: "TRIPLE", hint: "SAME FACE" },
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
      className={`grid w-[4.95rem] shrink-0 grid-cols-3 gap-px rounded-xl border-2 p-2 sm:w-[4.6rem] sm:p-1.5 ${
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
            className={`h-2 w-2 rounded-full ${
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
 * Three dice + total — sits in the coin-family `diceSlot` (Quick Flip / Dice Pick rhythm).
 * No outer card; parent `DicePickBoard` owns chrome and spacing.
 */
export function TripleDiceDiceCluster({ diceValues = [1, 1, 1], diceMuted = false, totalDisplay = "—", rolling = false }) {
  const d0 = diceValues[0] ?? 1;
  const d1 = diceValues[1] ?? 1;
  const d2 = diceValues[2] ?? 1;

  return (
    <div className="flex min-h-0 w-full flex-col items-center justify-center gap-0 sm:gap-0.5">
      <div className="flex shrink-0 items-center justify-center gap-2 sm:gap-2.5">
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
  );
}

/**
 * Four-lane picker + Roll — coin-family `choiceSlot`; footer anchor comes from `DicePickBoard`.
 */
export function TripleDiceZoneRollPanel({
  selectedZone = "mid",
  onZoneChange,
  rolling = false,
  onRoll,
  rollDisabled = false,
  optionPickerDisabled = false,
}) {
  return (
    <div className="flex w-full flex-col">
      <div className="mx-auto grid w-full max-w-[17.75rem] grid-cols-2 gap-2 sm:max-w-none sm:gap-3 lg:gap-6">
        {ZONE_TILES.map(t => {
          const active = zoneTileMatches(t, selectedZone);
          return (
            <button
              key={t.zone}
              type="button"
              disabled={optionPickerDisabled}
              onClick={() => onZoneChange?.(t.zone)}
              className={`flex min-h-[3.35rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-2 text-center shadow-sm transition sm:min-h-[3rem] sm:rounded-[1.05rem] sm:px-2.5 sm:py-1.5 lg:min-h-[5.25rem] lg:rounded-[1.12rem] ${
                active
                  ? "border-violet-300 bg-violet-600/25 text-white shadow-violet-900/30 ring-2 ring-inset ring-violet-400/20"
                  : "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-zinc-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] hover:border-amber-500/55 hover:from-zinc-800 hover:to-zinc-950 active:scale-[0.98]"
              } disabled:cursor-not-allowed disabled:opacity-[0.42]`}
            >
              <span className={`text-[13px] font-black leading-tight tracking-wide sm:text-sm lg:text-base ${active ? "text-white" : "text-amber-50"}`}>
                {t.label}
              </span>
              <span
                className={`mt-1 text-[10px] font-semibold uppercase leading-tight tracking-[0.12em] sm:mt-0.5 sm:text-[11px] lg:text-[11px] ${
                  active ? "text-violet-100" : "text-white/38"
                }`}
              >
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
        className={`mx-auto mt-2 flex min-h-[44px] w-full max-w-[17.75rem] flex-col items-center justify-center rounded-2xl border-2 px-2 py-1.5 text-center transition-colors sm:mt-3 sm:max-w-none sm:min-h-[2.4rem] sm:py-2 lg:min-h-8 ${
          rollDisabled || rolling
            ? "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
            : "border-amber-400/55 bg-amber-950/35 text-amber-50 ring-2 ring-amber-500/20 hover:bg-amber-900/35"
        }`}
      >
        <span className="text-[10px] font-black uppercase leading-tight sm:text-xs">{rolling ? "Rolling…" : "Roll"}</span>
      </button>
    </div>
  );
}
