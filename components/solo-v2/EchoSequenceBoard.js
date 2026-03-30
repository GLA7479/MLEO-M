const SYMBOL_LABEL = {
  red: "R",
  blue: "B",
  green: "G",
  gold: "Y",
  violet: "V",
};

const SYMBOL_CLASS = {
  red: "bg-rose-500/25 border-rose-300/40 text-rose-100",
  blue: "bg-sky-500/25 border-sky-300/40 text-sky-100",
  green: "bg-emerald-500/25 border-emerald-300/40 text-emerald-100",
  gold: "bg-amber-500/25 border-amber-300/40 text-amber-100",
  violet: "bg-violet-500/25 border-violet-300/40 text-violet-100",
};

function SymbolChip({ s }) {
  const key = String(s || "");
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-md border text-sm font-black sm:h-10 sm:w-10 ${SYMBOL_CLASS[key] || "bg-zinc-800 border-zinc-600 text-zinc-100"}`}
      aria-hidden
    >
      {SYMBOL_LABEL[key] || "?"}
    </span>
  );
}

export default function EchoSequenceBoard({
  phase = "reveal",
  currentRound = null,
  revealVisible = true,
  onChooseOption,
  disabled = false,
  chosenOptionKey = null,
  correctOptionKey = null,
  terminalKind = null,
}) {
  const options = Array.isArray(currentRound?.options) ? currentRound.options : [];
  const seq = Array.isArray(currentRound?.correctSequence) ? currentRound.correctSequence : [];
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3">
      <div className="min-h-[3rem] w-full">
        <div className="flex min-h-[3rem] items-center justify-center gap-1.5 sm:gap-2">
          {revealVisible ? seq.map((s, i) => <SymbolChip key={`${s}-${i}`} s={s} />) : <p className="text-xs text-zinc-500">Memorize the pattern</p>}
        </div>
      </div>
      <div className="grid w-full max-w-xl grid-cols-2 gap-2 sm:gap-3">
        {options.map((opt) => {
          const key = String(opt?.key || "");
          const optionSeq = Array.isArray(opt?.seq) ? opt.seq : [];
          const isChosen = key === chosenOptionKey;
          const isCorrect = terminalKind && key === correctOptionKey;
          return (
            <button
              key={key}
              type="button"
              disabled={disabled || phase !== "choose"}
              onClick={() => onChooseOption?.(key)}
              className={`rounded-lg border p-2 text-left ${isChosen ? "border-amber-300/70 bg-amber-950/40" : "border-zinc-700/60 bg-zinc-900/45"} ${isCorrect ? "ring-2 ring-emerald-400/50" : ""} ${disabled || phase !== "choose" ? "cursor-not-allowed opacity-70" : "hover:border-amber-400/60"}`}
            >
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-zinc-400">Option {key}</p>
              <div className="flex flex-wrap gap-1">{optionSeq.map((s, i) => <SymbolChip key={`${key}-${s}-${i}`} s={s} />)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
