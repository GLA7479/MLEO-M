/**
 * Hi-Lo Cards playfield — fixed card stage + fixed action row (no layout jump).
 * Merged slot for DicePickBoard `mergedPlayfieldSlot` only.
 */

const CELL_DIM = "h-[10.5rem] w-[6.85rem] shrink-0 sm:h-52 sm:w-36";

function EmptyCardCell() {
  return <div className={`${CELL_DIM} rounded-xl border border-transparent`} aria-hidden />;
}

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
      className={`relative flex ${CELL_DIM} flex-col rounded-xl border-2 bg-zinc-900/90 ${ring} ${className}`}
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
      className={`relative flex ${CELL_DIM} flex-col rounded-xl border-2 border-indigo-400/50 bg-gradient-to-br from-indigo-950 via-zinc-900 to-violet-950 shadow-inner ${className}`}
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

/** Reveal stays inside fixed cell: opacity crossfade only (no scale / vertical pop). Hit·Miss below card. */
function NextCardReveal({ card, faceUp, outcome }) {
  if (!card?.rank) return <EmptyCardCell />;
  const tone = faceUp ? (outcome === "win" ? "win" : outcome === "loss" ? "loss" : "neutral") : "neutral";
  return (
    <div className={`relative ${CELL_DIM}`}>
      <div className="relative h-full w-full overflow-hidden rounded-xl">
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-out ${
            faceUp ? "pointer-events-none opacity-0" : "opacity-100"
          }`}
        >
          <CardBackFace />
        </div>
        <div
          className={`absolute inset-0 flex items-center justify-center transition-opacity ease-out ${
            faceUp ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
          style={{ transitionDuration: "450ms" }}
        >
          <PlayingCard rank={card.rank} suit={card.suit || "♠"} tone={tone} />
        </div>
      </div>
      {faceUp && outcome === "win" ? (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 z-20 rounded bg-emerald-600/95 py-0.5 text-center text-[8px] font-black uppercase tracking-wide text-white shadow-sm ring-1 ring-emerald-200/50">
          Hit
        </div>
      ) : null}
      {faceUp && outcome === "loss" ? (
        <div className="pointer-events-none absolute inset-x-1 bottom-1 z-20 rounded bg-rose-600/95 py-0.5 text-center text-[8px] font-black uppercase tracking-wide text-white shadow-sm ring-1 ring-rose-200/45">
          Miss
        </div>
      ) : null}
    </div>
  );
}

function DrawingPlaceholder() {
  return (
    <div
      className={`flex ${CELL_DIM} flex-col items-center justify-center rounded-xl border border-dashed border-zinc-600/50 bg-zinc-900/40`}
    >
      <span className="px-1 text-[9px] font-medium uppercase tracking-wide text-zinc-500">Next card</span>
      <span className="mt-0.5 text-[10px] text-zinc-400 animate-pulse sm:text-xs">Drawing…</span>
    </div>
  );
}

function HiLoChoiceButtons({
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
    <div className="flex w-full flex-col">
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
        <div className="grid min-h-[44px] w-full grid-cols-3 gap-1.5 sm:min-h-12 sm:gap-2" aria-hidden>
          <span className="invisible min-h-[44px] rounded-xl sm:min-h-12" />
          <span className="invisible min-h-[44px] rounded-xl sm:min-h-12" />
          <span className="invisible min-h-[44px] rounded-xl sm:min-h-12" />
        </div>
      )}
    </div>
  );
}

/**
 * Single playfield: fixed-height L·R card row + actions pinned under cards on mobile,
 * beside cards on desktop — buttons column height tracks card stage (no vertical recenter jump).
 */
export function HighLowCardsMergedPlayfield({
  currentCard,
  revealCardData,
  revealFaceUp,
  revealOutcome,
  resolving,
  uiState,
  playing,
  guessControlsLocked,
  showActionRow,
  onHigh,
  onLow,
  onCashOut,
}) {
  const leftCell = currentCard?.rank ? (
    <PlayingCard rank={currentCard.rank} suit={currentCard.suit || "♠"} />
  ) : (
    <EmptyCardCell />
  );

  const rightCell = revealCardData?.rank ? (
    <NextCardReveal card={revealCardData} faceUp={revealFaceUp} outcome={revealOutcome} />
  ) : resolving ? (
    <DrawingPlaceholder />
  ) : (
    <EmptyCardCell />
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-8">
      {/* Fixed card stage: always two cells side-by-side; same height always */}
      <div className="flex min-h-0 flex-1 items-center justify-center lg:flex-[1.2] lg:items-center">
        <div className="flex h-[10.5rem] flex-row flex-nowrap items-center justify-center gap-2 sm:h-52 sm:gap-3">
          <div className="flex shrink-0 items-center justify-center">{leftCell}</div>
          <div className="flex shrink-0 items-center justify-center">{rightCell}</div>
        </div>
      </div>

      {/* Actions: bottom of playfield on mobile; desktop column matches stretch, centers controls */}
      <div className="mt-auto flex w-full shrink-0 flex-col justify-center lg:mt-0 lg:w-[min(30rem,44%)] lg:min-w-[18rem] lg:self-stretch lg:justify-center">
        <HiLoChoiceButtons
          uiState={uiState}
          playing={playing}
          guessControlsLocked={guessControlsLocked}
          showActionRow={showActionRow}
          onHigh={onHigh}
          onLow={onLow}
          onCashOut={onCashOut}
        />
      </div>
    </div>
  );
}
