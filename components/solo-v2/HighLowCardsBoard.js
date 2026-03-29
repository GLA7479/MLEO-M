/**
 * Hi-Lo Cards inner playfield for DicePickBoard slots (coin family).
 * Card faces and reveal animation stay game-specific; chrome lives on the page shell.
 */

function PlayingCard({ rank, suit, tone = "neutral", className = "" }) {
  const isRed = suit === "♥" || suit === "♦";
  const color = isRed ? "text-red-500" : "text-zinc-100";
  const ring =
    tone === "win"
      ? "ring-2 ring-emerald-400/90 shadow-[0_0_24px_rgba(52,211,153,0.35)]"
      : tone === "loss"
        ? "ring-2 ring-rose-500/90 shadow-[0_0_22px_rgba(244,63,94,0.35)]"
        : "border-white/20 shadow-lg";
  return (
    <div
      className={`relative flex h-[10.5rem] w-[6.85rem] flex-col rounded-xl border-2 bg-zinc-900/90 sm:h-52 sm:w-36 ${ring} ${className}`}
    >
      <div className={`absolute left-1.5 top-1.5 flex flex-col leading-none sm:left-2 sm:top-2 ${color}`}>
        <span className="text-xl font-serif font-bold sm:text-3xl">{rank}</span>
        <span className="text-lg font-serif sm:text-2xl">{suit}</span>
      </div>
      <div className={`absolute bottom-1.5 right-1.5 flex rotate-180 flex-col leading-none sm:bottom-2 sm:right-2 ${color}`}>
        <span className="text-xl font-serif font-bold sm:text-3xl">{rank}</span>
        <span className="text-lg font-serif sm:text-2xl">{suit}</span>
      </div>
    </div>
  );
}

function CardBackFace({ className = "" }) {
  return (
    <div
      className={`relative flex h-[10.5rem] w-[6.85rem] flex-col rounded-xl border-2 border-indigo-400/50 bg-gradient-to-br from-indigo-950 via-zinc-900 to-violet-950 shadow-inner sm:h-52 sm:w-36 ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 rounded-[10px] bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.12),transparent_45%)]" />
      <span className="m-auto select-none text-4xl opacity-90 drop-shadow-lg sm:text-5xl" aria-hidden>
        🃏
      </span>
      <span className="absolute bottom-2 left-0 right-0 text-center text-[9px] font-bold uppercase tracking-[0.2em] text-indigo-200/50">
        Hi-Lo
      </span>
    </div>
  );
}

function NextCardReveal({ card, faceUp, outcome }) {
  if (!card?.rank) return null;
  const tone = faceUp ? (outcome === "win" ? "win" : outcome === "loss" ? "loss" : "neutral") : "neutral";
  return (
    <div className="relative flex h-[10.5rem] w-[6.85rem] shrink-0 flex-col items-center justify-center sm:h-52 sm:w-36">
      <div
        className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ease-out ${
          faceUp ? "pointer-events-none scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
      >
        <CardBackFace />
      </div>
      <div
        className={`transition-all ease-out ${
          faceUp ? "scale-100 opacity-100" : "pointer-events-none scale-[0.92] opacity-0"
        }`}
        style={{ transitionDuration: "450ms" }}
      >
        <PlayingCard rank={card.rank} suit={card.suit || "♠"} tone={tone} />
      </div>
      {faceUp && outcome === "win" ? (
        <div className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-emerald-500/95 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white shadow-md ring-1 ring-emerald-200/60">
          Hit
        </div>
      ) : null}
      {faceUp && outcome === "loss" ? (
        <div className="pointer-events-none absolute -top-1.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full bg-rose-600/95 px-1.5 py-px text-[9px] font-black uppercase tracking-wide text-white shadow-md ring-1 ring-rose-200/50">
          Miss
        </div>
      ) : null}
    </div>
  );
}

/** Current + next card column — DicePickBoard `diceSlot`. */
export function HighLowCardsDiceSlot({
  currentCard,
  revealCardData,
  revealFaceUp,
  revealOutcome,
  resolving,
}) {
  return (
    <div className="flex min-h-[10.5rem] w-full shrink-0 flex-col items-center justify-center gap-2 sm:min-h-[13rem] sm:flex-row sm:items-start sm:gap-3">
      {currentCard?.rank ? <PlayingCard rank={currentCard.rank} suit={currentCard.suit || "♠"} /> : null}
      {revealCardData?.rank ? (
        <NextCardReveal card={revealCardData} faceUp={revealFaceUp} outcome={revealOutcome} />
      ) : resolving ? (
        <div className="flex h-[10.5rem] w-[6.85rem] shrink-0 flex-col items-center justify-center rounded-xl border border-dashed border-zinc-600/50 bg-zinc-900/40 sm:h-52 sm:w-36">
          <span className="px-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500">Next card</span>
          <span className="mt-0.5 text-[10px] text-zinc-400 animate-pulse sm:text-xs">Drawing…</span>
        </div>
      ) : null}
    </div>
  );
}

/** HIGHER / CASH OUT / LOWER — DicePickBoard `choiceSlot`. */
export function HighLowCardsChoiceSlot({
  uiState,
  playing,
  guessControlsLocked,
  onHigh,
  onLow,
  onCashOut,
  showActionRow,
}) {
  const runUi = (uiState === "playing" || uiState === "resolving") && playing;
  const canAct = uiState === "playing" && playing;

  return (
    <div className="flex min-h-[4.25rem] w-full flex-col justify-center sm:min-h-[4.75rem]">
      {showActionRow && runUi ? (
        <div className="grid w-full grid-cols-3 gap-1.5 sm:gap-2">
          <button
            type="button"
            disabled={!canAct || guessControlsLocked}
            onClick={() => onHigh?.()}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-700 text-[10px] font-bold leading-tight text-white shadow-md disabled:pointer-events-none disabled:opacity-40 sm:h-12 sm:text-sm"
          >
            HIGHER
          </button>
          <button
            type="button"
            disabled={!canAct || !playing?.canCashOut || guessControlsLocked}
            onClick={() => onCashOut?.()}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-sky-600 to-indigo-700 text-[10px] font-bold leading-tight text-white shadow-md disabled:pointer-events-none disabled:opacity-30 sm:h-12 sm:text-sm"
          >
            CASH OUT
          </button>
          <button
            type="button"
            disabled={!canAct || guessControlsLocked}
            onClick={() => onLow?.()}
            className="min-h-[44px] rounded-xl bg-gradient-to-r from-rose-600 to-red-700 text-[10px] font-bold leading-tight text-white shadow-md disabled:pointer-events-none disabled:opacity-40 sm:h-12 sm:text-sm"
          >
            LOWER
          </button>
        </div>
      ) : (
        <div className="min-h-[4.25rem] w-full sm:min-h-[4.75rem]" aria-hidden />
      )}
    </div>
  );
}
