function pickColumnForRow(digHistory, row) {
  const list = Array.isArray(digHistory) ? digHistory : [];
  const hit = list.find(h => Math.floor(Number(h.rowIndex)) === row);
  return hit != null ? Math.floor(Number(hit.column)) : null;
}

function DoorFace({ row, col, phase, pickedCol, trapCol, revealTrap, pulsing, shaking, disabled, onPickDoor }) {
  const isPickedSafe = pickedCol === col;
  const isTrapReveal = revealTrap && trapCol === col;
  const isOtherWhenPicked = pickedCol != null && pickedCol !== col;

  const base =
    "flex min-h-[40px] flex-1 items-center justify-center rounded-lg border text-lg font-black transition sm:min-h-[44px] lg:min-h-[36px] lg:text-base";

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
    if (isTrapReveal) {
      return (
        <div
          className={`${base} border-red-500/40 bg-red-950/80 text-red-200 ${shaking ? "ring-2 ring-red-400/60" : ""}`}
          aria-label="Trap"
        >
          💣
        </div>
      );
    }
    if (isPickedSafe) {
      return (
        <div className={`${base} border-amber-400/45 bg-amber-900/40 text-amber-100`} aria-label="Safe">
          ✦
        </div>
      );
    }
    if (revealTrap && isOtherWhenPicked) {
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
      onClick={() => phase === "current" && !disabled && onPickDoor?.(col)}
      className={`${base} ${phase === "current" ? activeCls : ""} ${
        disabled && phase === "current" ? "cursor-not-allowed opacity-55" : ""
      } ${shaking ? "ring-2 ring-amber-300/50" : ""}`}
    >
      🚪
    </button>
  );
}

/**
 * Six stages × three doors — layout grid matches {@link GoldRushDiggerBoard} spacing; door mechanic only.
 */
export default function VaultDoorsBoard({
  rowCount = 6,
  columnCount = 3,
  currentRowIndex = 0,
  digHistory = [],
  bombColumns = null,
  revealBombs = false,
  disabled = false,
  pulseCell = null,
  shakeCell = null,
  onPickDoor,
}) {
  const rows = [];
  for (let r = 0; r < rowCount; r += 1) {
    let phase = "future";
    if (r < currentRowIndex) phase = "past";
    if (r === currentRowIndex) phase = "current";

    const pickedCol = pickColumnForRow(digHistory, r);
    const trapCol =
      Array.isArray(bombColumns) && bombColumns.length > r ? Math.floor(Number(bombColumns[r])) : null;

    rows.push(
      <div key={r} className="flex w-full gap-1.5 sm:gap-2 lg:gap-1">
        <div className="w-5 shrink-0 pt-2 text-center text-[9px] font-bold tabular-nums text-zinc-500 sm:w-6 sm:text-[10px] lg:w-5 lg:pt-1 lg:text-[9px]">
          {r + 1}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 sm:gap-2 lg:gap-1">
          {Array.from({ length: columnCount }).map((_, c) => (
            <DoorFace
              key={c}
              row={r}
              col={c}
              phase={phase}
              pickedCol={pickedCol}
              trapCol={Number.isFinite(trapCol) ? trapCol : -1}
              revealTrap={revealBombs && Number.isFinite(trapCol)}
              pulsing={pulseCell?.rowIndex === r && pulseCell?.column === c}
              shaking={shakeCell?.rowIndex === r && shakeCell?.column === c}
              disabled={disabled}
              onPickDoor={onPickDoor}
            />
          ))}
        </div>
      </div>,
    );
  }

  return <div className="flex w-full flex-col gap-1.5 sm:gap-2 lg:gap-1">{rows}</div>;
}
