/**
 * 5×5 Diamonds grid — hidden / safe / bomb faces (bombs only when `revealBombs`).
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
      {Array.from({ length: n }, (_, row) => (
        <div key={row} className="flex w-full min-w-0 justify-center gap-0.5 sm:gap-1">
          {cells.slice(row * n, row * n + n)}
        </div>
      ))}
    </div>
  );
}
