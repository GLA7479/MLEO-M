/**
 * Draft tri-choice + run log strip — Solo V2 board frame handles outer chrome.
 */
export default function RelicDraftBoard({
  offers = [],
  lastEncounter = null,
  round = 1,
  maxRounds = 5,
  modifiersLine = "",
  picks = [],
  disabled = false,
  onPick,
}) {
  return (
    <div className="flex w-full max-w-md flex-col gap-3 sm:max-w-lg">
      <div className="flex items-center justify-between px-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-amber-200/55 sm:text-[10px]">
        <span>
          Round {round} / {maxRounds}
        </span>
        <span className="line-clamp-1 max-w-[14rem] text-[8px] font-semibold normal-case tracking-normal text-zinc-500 sm:text-[9px]">
          {modifiersLine}
        </span>
      </div>

      {lastEncounter ? (
        <div
          className={`rounded-xl border px-3 py-2 text-center text-[11px] font-bold sm:text-xs ${
            lastEncounter.absorbed
              ? "border-violet-500/40 bg-violet-950/30 text-violet-100"
              : lastEncounter.encounterOk
                ? "border-emerald-500/40 bg-emerald-950/25 text-emerald-100"
                : "border-rose-500/40 bg-rose-950/30 text-rose-100"
          }`}
        >
          {lastEncounter.absorbed
            ? "Encounter slipped — Second Wind held the line."
            : lastEncounter.encounterOk
              ? "Encounter cleared."
              : "Encounter failed."}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2">
        {offers.map(o => (
          <button
            key={o.key}
            type="button"
            disabled={disabled}
            onClick={() => onPick?.(o.key)}
            className={`flex min-h-[5.5rem] flex-col items-stretch rounded-xl border px-2.5 py-2 text-left transition-colors sm:min-h-[6.25rem] ${
              disabled
                ? "cursor-not-allowed border-white/10 bg-white/5 text-zinc-500"
                : "border-amber-700/45 bg-gradient-to-b from-zinc-800/90 to-zinc-950/90 text-amber-50 hover:border-amber-500/50 hover:from-zinc-800"
            }`}
          >
            <span className="text-[10px] font-black uppercase leading-tight tracking-wide text-amber-100 sm:text-[11px]">
              {o.label}
            </span>
            <span className="mt-1.5 text-[9px] font-medium leading-snug text-zinc-400 sm:text-[10px]">{o.blurb}</span>
          </button>
        ))}
      </div>

      {picks.length > 0 ? (
        <div className="rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5 text-left">
          <p className="text-[8px] font-extrabold uppercase tracking-wider text-zinc-500">Run loadout</p>
          <ul className="mt-1 space-y-0.5 text-[9px] font-semibold text-zinc-400 sm:text-[10px]">
            {picks.map((p, i) => (
              <li key={`${p.round}-${p.key}-${i}`}>
                R{p.round}: {p.label}
                {p.absorbed ? " · absorbed" : !p.encounterOk ? " · bruised" : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
