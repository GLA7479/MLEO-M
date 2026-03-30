import { maskForTileRotation, RAIL_TILE_EMPTY } from "../../lib/solo-v2/railLogicMasks";

const N = 1;
const E = 2;
const S = 4;
const W = 8;

function RailCellArms({ mask }) {
  const m = Math.floor(Number(mask) || 0);
  const arm = "absolute bg-amber-400/90 rounded-full";
  return (
    <div className="relative mx-auto aspect-square w-[82%] max-w-[3.25rem]">
      {(m & N) !== 0 ? (
        <div className={`${arm} left-1/2 top-0 h-[52%] w-[14%] -translate-x-1/2`} />
      ) : null}
      {(m & S) !== 0 ? (
        <div className={`${arm} bottom-0 left-1/2 h-[52%] w-[14%] -translate-x-1/2`} />
      ) : null}
      {(m & W) !== 0 ? (
        <div className={`${arm} left-0 top-1/2 h-[14%] w-[52%] -translate-y-1/2`} />
      ) : null}
      {(m & E) !== 0 ? (
        <div className={`${arm} right-0 top-1/2 h-[14%] w-[52%] -translate-y-1/2`} />
      ) : null}
    </div>
  );
}

/**
 * Full-information rail grid — all track tiles and portals are visible (Solo V2 board chrome).
 */
export default function RailLogicBoard({
  gridW,
  gridH,
  types,
  rotations,
  startIdx,
  endIdx,
  startGate,
  endGate,
  disabled = false,
  routeComplete = false,
  onCellTap,
}) {
  const w = Math.max(1, Math.floor(Number(gridW) || 1));
  const h = Math.max(1, Math.floor(Number(gridH) || 1));
  const len = w * h;
  const ty = Array.isArray(types) ? types : [];
  const rot = Array.isArray(rotations) ? rotations : [];

  const cells = [];
  for (let i = 0; i < len; i += 1) {
    const t = Math.floor(Number(ty[i]) || 0);
    const r = Math.floor(Number(rot[i]) || 0) % 4;
    const isStart = i === startIdx;
    const isEnd = i === endIdx;
    const isEmpty = t === RAIL_TILE_EMPTY;
    const mask = maskForTileRotation(t, r);
    const canTap = !isEmpty && !disabled;

    cells.push(
      <button
        key={i}
        type="button"
        onClick={() => canTap && onCellTap?.(i)}
        disabled={!canTap}
        className={`relative flex min-h-[2.65rem] min-w-0 touch-manipulation items-center justify-center rounded-lg border sm:min-h-[3.1rem] ${
          isStart
            ? "border-emerald-500/55 bg-emerald-950/35 ring-1 ring-emerald-500/25"
            : isEnd
              ? "border-sky-500/55 bg-sky-950/35 ring-1 ring-sky-500/25"
              : isEmpty
                ? "cursor-default border-zinc-800/60 bg-zinc-950/50"
                : canTap
                  ? "border-amber-700/40 bg-zinc-900/80 active:bg-zinc-800/80"
                  : "cursor-default border-amber-800/35 bg-zinc-900/65"
        } ${routeComplete && !isEmpty ? "ring-1 ring-emerald-400/20" : ""}`}
        aria-label={
          isStart
            ? `Mine start tile ${i + 1}`
            : isEnd
              ? `Exit tile ${i + 1}`
              : isEmpty
                ? `Empty ${i + 1}`
                : `Track tile ${i + 1}, tap to rotate`
        }
      >
        {!isEmpty ? <RailCellArms mask={mask} /> : null}
        {isStart ? (
          <span className="pointer-events-none absolute right-0.5 top-0.5 rounded bg-emerald-800/80 px-0.5 text-[7px] font-black text-emerald-100 sm:text-[8px]">
            IN
          </span>
        ) : null}
        {isEnd ? (
          <span className="pointer-events-none absolute right-0.5 top-0.5 rounded bg-sky-800/80 px-0.5 text-[7px] font-black text-sky-100 sm:text-[8px]">
            OUT
          </span>
        ) : null}
      </button>,
    );
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2 sm:max-w-lg">
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[9px] font-semibold uppercase tracking-wide text-zinc-400 sm:text-[10px]">
        <span>
          Portals: <span className="text-emerald-200/90">mine {String(startGate || "W")}</span>
          <span className="text-zinc-600"> · </span>
          <span className="text-sky-200/90">exit {String(endGate || "E")}</span>
        </span>
        {routeComplete ? (
          <span className="text-emerald-300/95" aria-live="polite">
            Route linked
          </span>
        ) : null}
      </div>
      <div
        className="grid w-full gap-1 rounded-xl border border-zinc-700/50 bg-zinc-950/60 p-1.5 sm:gap-1.5 sm:p-2"
        style={{ gridTemplateColumns: `repeat(${w}, minmax(0, 1fr))` }}
      >
        {cells}
      </div>
      <p className="text-[10px] font-medium leading-snug text-zinc-500 sm:text-[11px]">
        Tap a track tile to rotate it 90°. Everything you need is on the board — plan the run before you lock in.
      </p>
    </div>
  );
}
