function pickColumnForRow(digHistory, row) {
  const list = Array.isArray(digHistory) ? digHistory : [];
  const hit = list.find(h => Math.floor(Number(h.rowIndex)) === row);
  return hit != null ? Math.floor(Number(hit.column)) : null;
}

function CellFace({ row, col, phase, pickedCol, bombCol, revealBomb, pulsing, shaking, disabled, onDigColumn }) {
  const isPickedSafe = pickedCol === col;
  const isBombReveal = revealBomb && bombCol === col;
  const isOtherWhenPicked = pickedCol != null && pickedCol !== col;

  const base =
    "flex min-h-[40px] flex-1 items-center justify-center rounded-lg border text-lg font-black transition sm:min-h-[44px]";

  if (phase === "future") {
    return (
      <div
        className={`${base} border-white/10 bg-black/25 text-zinc-600 opacity-45`}
        aria-hidden
      >
        —
      </div>
    );
  }

  if (phase === "past") {
    if (isBombReveal) {
      return (
        <div
          className={`${base} border-red-500/40 bg-red-950/80 text-red-200 ${shaking ? "ring-2 ring-red-400/60" : ""}`}
          aria-label="Bomb"
        >
          💣
        </div>
      );
    }
    if (isPickedSafe) {
      return (
        <div className={`${base} border-amber-400/45 bg-amber-900/40 text-amber-100`} aria-label="Gold">
          ✦
        </div>
      );
    }
    if (revealBomb && isOtherWhenPicked) {
      return (
        <div className={`${base} border-white/15 bg-white/[0.04] text-zinc-500`} aria-hidden>
          ○
        </div>
      );
    }
    return (
      <div className={`${base} border-white/12 bg-zinc-900/50 text-zinc-500`} aria-hidden>
        ○
      </div>
    );
  }

  const activeCls = pulsing
    ? "animate-pulse border-amber-300/60 bg-amber-600/35 text-amber-50"
    : "border-amber-400/40 bg-amber-950/40 text-amber-100 hover:bg-amber-900/50";

  return (
    <button
      type="button"
      disabled={phase !== "current" || disabled}
      onClick={() => phase === "current" && !disabled && onDigColumn?.(col)}
      className={`${base} ${phase === "current" ? activeCls : ""} ${
        disabled && phase === "current" ? "cursor-not-allowed opacity-55" : ""
      } ${shaking ? "ring-2 ring-amber-300/50" : ""}`}
    >
      ⛏
    </button>
  );
}

/**
 * 6×3 dig grid: past rows locked, current row tappable, future dimmed.
 * @param {object} props
 * @param {number} props.currentRowIndex
 * @param {Array} props.digHistory `{ rowIndex, column }[]`
 * @param {number[]|null} props.bombColumns full row map when terminal / reveal
 * @param {boolean} props.revealBombs
 * @param {boolean} props.disabled
 * @param {{ rowIndex: number, column: number } | null} props.pulseCell
 * @param {{ rowIndex: number, column: number } | null} props.shakeCell
 * @param {(col: number) => void} props.onDigColumn
 */
export default function GoldRushDiggerBoard({
  rowCount = 6,
  columnCount = 3,
  currentRowIndex = 0,
  digHistory = [],
  bombColumns = null,
  revealBombs = false,
  disabled = false,
  pulseCell = null,
  shakeCell = null,
  onDigColumn,
}) {
  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    let phase = "future";
    if (r < currentRowIndex) phase = "past";
    if (r === currentRowIndex) phase = "current";

    const pickedCol = pickColumnForRow(digHistory, r);
    const bombCol =
      Array.isArray(bombColumns) && bombColumns.length > r ? Math.floor(Number(bombColumns[r])) : null;

    rows.push(
      <div key={r} className="flex w-full gap-1.5 sm:gap-2">
        <div className="w-5 shrink-0 pt-2 text-center text-[9px] font-bold tabular-nums text-zinc-500 sm:w-6 sm:text-[10px]">
          {r + 1}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 sm:gap-2">
          {Array.from({ length: columnCount }).map((_, c) => (
            <CellFace
              key={c}
              row={r}
              col={c}
              phase={phase}
              pickedCol={pickedCol}
              bombCol={Number.isFinite(bombCol) ? bombCol : -1}
              revealBomb={revealBombs && Number.isFinite(bombCol)}
              pulsing={pulseCell?.rowIndex === r && pulseCell?.column === c}
              shaking={shakeCell?.rowIndex === r && shakeCell?.column === c}
              disabled={disabled}
              onDigColumn={onDigColumn}
            />
          ))}
        </div>
      </div>,
    );
  }

  return <div className="flex w-full flex-col gap-1.5 sm:gap-2">{rows}</div>;
}
