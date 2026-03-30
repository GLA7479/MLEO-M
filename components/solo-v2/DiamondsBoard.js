import { DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY } from "../../lib/solo-v2/diamondsConfig";

const DIFFICULTY_OPTIONS = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Med" },
  { key: "hard", label: "Hard" },
  { key: "expert", label: "Expert" },
];

/**
 * 5×5 Diamonds grid — hidden / safe / bomb faces (bombs only when `revealBombs`).
 * Outer layout matches `GoldRushDiggerBoard`: full width of the play-inner slot (no narrow max-width cap on desktop).
 * Risk preset row uses a fixed min-height (pills or empty) so the grid does not shift when presets hide during play.
 */
export default function DiamondsBoard({
  gridSize = 5,
  revealedSafeIndices = [],
  bombIndices = null,
  revealBombs = false,
  disabled = false,
  pulseIndex = null,
  shakeIndex = null,
  onRevealCell,
  showRiskPicker = false,
  difficulty = "medium",
  onDifficultyChange,
}) {
  const n = Math.max(2, Math.min(8, Math.floor(Number(gridSize)) || 5));
  const total = n * n;
  const safeSet = new Set((Array.isArray(revealedSafeIndices) ? revealedSafeIndices : []).map(i => Math.floor(Number(i))));
  const bombSet = revealBombs && Array.isArray(bombIndices) ? new Set(bombIndices.map(i => Math.floor(Number(i)))) : null;

  const base =
    "flex min-h-[40px] min-w-0 flex-1 items-center justify-center rounded-lg border text-lg font-black transition sm:min-h-[44px] lg:min-h-[36px] lg:text-base";

  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const isSafe = safeSet.has(i);
    const isBombShown = bombSet && bombSet.has(i);
    const pulsing = pulseIndex === i;
    const shaking = shakeIndex === i;

    let inner = null;
    if (isBombShown) {
      inner = (
        <div
          className={`${base} border-red-500/45 bg-red-950/75 text-red-200 ${shaking ? "ring-2 ring-red-400/55" : ""}`}
          aria-label="Bomb"
        >
          💣
        </div>
      );
    } else if (isSafe) {
      inner = (
        <div
          className={`${base} border-cyan-400/40 bg-cyan-950/35 text-cyan-100 ${pulsing ? "animate-pulse ring-2 ring-cyan-300/50" : ""}`}
          aria-label="Safe gem"
        >
          ✦
        </div>
      );
    } else {
      inner = (
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && onRevealCell?.(i)}
          className={`${base} border-white/15 bg-zinc-900/55 text-zinc-500 hover:bg-zinc-800/55 ${
            disabled ? "cursor-not-allowed opacity-50" : ""
          } ${shaking ? "ring-2 ring-red-400/50" : ""}`}
          aria-label={`Cell ${i + 1}`}
        >
          ?
        </button>
      );
    }
    cells.push(
      <div key={i} className="flex min-w-0 flex-1">
        {inner}
      </div>,
    );
  }

  return (
    <div
      className="flex w-full min-w-0 flex-col gap-1.5 sm:gap-2 lg:gap-1"
      aria-label="Diamonds grid"
    >
      <div
        className="flex min-h-[2.75rem] w-full shrink-0 flex-nowrap items-center justify-center gap-1 overflow-x-auto overflow-y-hidden px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-1.5"
        aria-hidden={!showRiskPicker}
      >
        {showRiskPicker
          ? DIFFICULTY_OPTIONS.map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => onDifficultyChange?.(opt.key)}
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[9px] font-bold sm:py-1 sm:text-[10px] ${
                  difficulty === opt.key
                    ? "border-amber-400/50 bg-amber-950/50 text-amber-100"
                    : "border-white/12 bg-zinc-900/40 text-zinc-400 hover:border-white/20"
                }`}
              >
                {opt.label} ({DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY[opt.key] ?? "?"}💣)
              </button>
            ))
          : null}
      </div>

      {Array.from({ length: n }, (_, row) => (
        <div key={row} className="flex w-full min-w-0 gap-1.5 sm:gap-2 lg:gap-1">
          {cells.slice(row * n, row * n + n)}
        </div>
      ))}
    </div>
  );
}
