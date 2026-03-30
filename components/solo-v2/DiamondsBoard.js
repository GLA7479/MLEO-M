import { DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY } from "../../lib/solo-v2/diamondsConfig";

const DIFFICULTY_OPTIONS = [
  { key: "easy", label: "Easy" },
  { key: "medium", label: "Med" },
  { key: "hard", label: "Hard" },
  { key: "expert", label: "Expert" },
];

/**
 * 5×5 Diamonds grid — hidden / safe / bomb faces (bombs only when `revealBombs`).
 * Optional idle risk row lives inside this single playfield root (matches one-child play-inner pattern).
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
    "flex aspect-square min-h-0 w-full max-w-[3.25rem] flex-1 items-center justify-center rounded-md border text-sm font-black transition sm:max-w-[3.5rem] sm:text-base lg:max-w-[3rem] lg:text-sm";

  const cells = [];
  for (let i = 0; i < total; i += 1) {
    const isSafe = safeSet.has(i);
    const isBombShown = bombSet && bombSet.has(i);
    const hidden = !isSafe && !isBombShown;
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
    cells.push(<div key={i} className="flex min-w-0 flex-1 justify-center p-0.5 sm:p-1">{inner}</div>);
  }

  return (
    <div className="flex w-full max-w-[min(100%,20rem)] flex-col gap-1 self-center sm:max-w-[22rem]" aria-label="Diamonds grid">
      {showRiskPicker ? (
        <div className="mb-1 flex flex-wrap items-center justify-center gap-1 px-0.5">
          {DIFFICULTY_OPTIONS.map(opt => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onDifficultyChange?.(opt.key)}
              className={`rounded-md border px-2 py-0.5 text-[9px] font-bold sm:py-1 sm:text-[10px] ${
                difficulty === opt.key
                  ? "border-amber-400/50 bg-amber-950/50 text-amber-100"
                  : "border-white/12 bg-zinc-900/40 text-zinc-400 hover:border-white/20"
              }`}
            >
              {opt.label} ({DIAMONDS_BOMB_COUNT_FOR_DIFFICULTY[opt.key] ?? "?"}💣)
            </button>
          ))}
        </div>
      ) : null}
      {Array.from({ length: n }, (_, row) => (
        <div key={row} className="flex w-full min-w-0 justify-center gap-0.5 sm:gap-1">
          {cells.slice(row * n, row * n + n)}
        </div>
      ))}
    </div>
  );
}
