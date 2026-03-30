function pickColumnForRow(digHistory, row) {
  const list = Array.isArray(digHistory) ? digHistory : [];
  const hit = list.find(h => Math.floor(Number(h.rowIndex)) === row);
  return hit != null ? Math.floor(Number(hit.column)) : null;
}

/**
 * @param {object} p
 * @param {number} p.row
 * @param {number} p.col
 * @param {'future'|'past'|'current'} p.phase
 * @param {number|null} p.pickedCol
 * @param {number|null} p.safeCol — when terminal reveal
 * @param {boolean} p.revealTerminal
 * @param {boolean} p.pulsing
 * @param {boolean} p.shaking
 * @param {boolean} p.disabled
 * @param {(col: number) => void} p.onPickTile
 */
function PathTileFace({ row, col, phase, pickedCol, safeCol, revealTerminal, pulsing, shaking, disabled, onPickTile }) {
  const base =
    "flex min-h-[40px] flex-1 items-center justify-center rounded-lg border text-lg font-black transition sm:min-h-[44px] lg:min-h-[36px] lg:text-base";

  if (phase === "future") {
    return (
      <div className={`${base} border-white/10 bg-black/25 text-zinc-600 opacity-45`} aria-hidden>
        —
      </div>
    );
  }

  if (phase === "past") {
    const pickedHere = pickedCol === col;
    const safeHere = revealTerminal && safeCol === col;
    const failTile = revealTerminal && safeCol != null && col !== safeCol;

    if (revealTerminal && safeHere) {
      return (
        <div className={`${base} border-cyan-400/50 bg-cyan-950/50 text-cyan-100`} aria-label="Safe path">
          ✦
        </div>
      );
    }
    if (revealTerminal && failTile) {
      const wrongPick = pickedHere && !safeHere;
      return (
        <div
          className={`${base} border-white/12 bg-zinc-900/55 text-zinc-500 ${
            wrongPick && shaking ? "ring-2 ring-red-400/55" : ""
          }`}
          aria-label={wrongPick ? "Failed pick" : "Unsafe tile"}
        >
          ×
        </div>
      );
    }
    if (!revealTerminal && pickedHere) {
      return (
        <div className={`${base} border-cyan-400/45 bg-cyan-950/35 text-cyan-100`} aria-label="Cleared">
          ✦
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
    ? "animate-pulse border-cyan-300/60 bg-cyan-800/35 text-cyan-50"
    : "border-cyan-400/40 bg-cyan-950/35 text-cyan-100 hover:bg-cyan-900/45";

  return (
    <button
      type="button"
      disabled={phase !== "current" || disabled}
      onClick={() => phase === "current" && !disabled && onPickTile?.(col)}
      className={`${base} ${phase === "current" ? activeCls : ""} ${
        disabled && phase === "current" ? "cursor-not-allowed opacity-55" : ""
      } ${shaking ? "ring-2 ring-cyan-300/45" : ""}`}
    >
      ◆
    </button>
  );
}

/**
 * Six rows × three path tiles — outer dimensions match {@link GoldRushDiggerBoard}; safe column sealed server-side until resolve.
 */
export default function CrystalPathBoard({
  rowCount = 6,
  columnCount = 3,
  currentRowIndex = 0,
  digHistory = [],
  safeColumns = null,
  revealTerminal = false,
  disabled = false,
  pulseCell = null,
  shakeCell = null,
  onPickTile,
}) {
  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    let phase = "future";
    if (r < currentRowIndex) phase = "past";
    if (r === currentRowIndex) phase = "current";

    const pickedCol = pickColumnForRow(digHistory, r);
    const safeCol =
      Array.isArray(safeColumns) && safeColumns.length > r ? Math.floor(Number(safeColumns[r])) : null;

    rows.push(
      <div key={r} className="flex w-full gap-1.5 sm:gap-2 lg:gap-1">
        <div className="w-5 shrink-0 pt-2 text-center text-[9px] font-bold tabular-nums text-zinc-500 sm:w-6 sm:text-[10px] lg:w-5 lg:pt-1 lg:text-[9px]">
          {r + 1}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 sm:gap-2 lg:gap-1">
          {Array.from({ length: columnCount }).map((_, c) => (
            <PathTileFace
              key={c}
              row={r}
              col={c}
              phase={phase}
              pickedCol={pickedCol}
              safeCol={Number.isFinite(safeCol) ? safeCol : null}
              revealTerminal={revealTerminal}
              pulsing={pulseCell?.rowIndex === r && pulseCell?.column === c}
              shaking={shakeCell?.rowIndex === r && shakeCell?.column === c}
              disabled={disabled}
              onPickTile={onPickTile}
            />
          ))}
        </div>
      </div>,
    );
  }

  return <div className="flex w-full flex-col gap-1.5 sm:gap-2 lg:gap-1">{rows}</div>;
}
