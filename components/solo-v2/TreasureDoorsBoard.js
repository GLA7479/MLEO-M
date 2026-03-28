function pickDoorForChamber(doorHistory, chamber) {
  const list = Array.isArray(doorHistory) ? doorHistory : [];
  const hit = list.find(h => Math.floor(Number(h.chamberIndex)) === chamber);
  return hit != null ? Math.floor(Number(hit.door)) : null;
}

function DoorFace({
  chamber,
  door,
  phase,
  pickedDoor,
  trapDoor,
  revealTrap,
  pulsing,
  shaking,
  disabled,
  onPickDoor,
}) {
  const isPickedSafe = pickedDoor === door;
  const isTrapReveal = revealTrap && trapDoor === door;
  const isOtherWhenPicked = pickedDoor != null && pickedDoor !== door;

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
    if (isTrapReveal) {
      return (
        <div
          className={`${base} border-red-500/40 bg-red-950/80 text-red-200 ${shaking ? "ring-2 ring-red-400/60" : ""}`}
          aria-label="Trap"
        >
          ☠
        </div>
      );
    }
    if (isPickedSafe) {
      return (
        <div className={`${base} border-teal-400/45 bg-teal-900/40 text-teal-100`} aria-label="Safe">
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
    ? "animate-pulse border-teal-300/60 bg-teal-600/35 text-teal-50"
    : "border-teal-400/40 bg-teal-950/40 text-teal-100 hover:bg-teal-900/50";

  return (
    <button
      type="button"
      disabled={phase !== "current" || disabled}
      onClick={() => phase === "current" && !disabled && onPickDoor?.(door)}
      className={`${base} ${phase === "current" ? activeCls : ""} ${
        disabled && phase === "current" ? "cursor-not-allowed opacity-55" : ""
      } ${shaking ? "ring-2 ring-teal-300/50" : ""}`}
    >
      🚪
    </button>
  );
}

/**
 * 5×3 chambers: past locked, current tappable doors, future dimmed.
 */
export default function TreasureDoorsBoard({
  chamberCount = 5,
  doorCount = 3,
  currentChamberIndex = 0,
  doorHistory = [],
  trapDoors = null,
  revealTraps = false,
  disabled = false,
  pulseCell = null,
  shakeCell = null,
  onPickDoor,
}) {
  const rows = [];
  const chMax = Math.max(1, Math.floor(Number(chamberCount) || 5));
  const dMax = Math.max(1, Math.floor(Number(doorCount) || 3));

  for (let c = 0; c < chMax; c += 1) {
    let phase = "future";
    if (c < currentChamberIndex) phase = "past";
    if (c === currentChamberIndex) phase = "current";

    const pickedDoor = pickDoorForChamber(doorHistory, c);
    const trapDoor =
      Array.isArray(trapDoors) && trapDoors.length > c ? Math.floor(Number(trapDoors[c])) : null;

    rows.push(
      <div key={c} className="flex w-full gap-1.5 sm:gap-2">
        <div className="w-5 shrink-0 pt-2 text-center text-[9px] font-bold tabular-nums text-zinc-500 sm:w-6 sm:text-[10px]">
          {c + 1}
        </div>
        <div className="flex min-w-0 flex-1 gap-1.5 sm:gap-2">
          {Array.from({ length: dMax }).map((_, d) => (
            <DoorFace
              key={d}
              chamber={c}
              door={d}
              phase={phase}
              pickedDoor={pickedDoor}
              trapDoor={Number.isFinite(trapDoor) ? trapDoor : -1}
              revealTrap={revealTraps && Number.isFinite(trapDoor)}
              pulsing={pulseCell?.chamberIndex === c && pulseCell?.door === d}
              shaking={shakeCell?.chamberIndex === c && shakeCell?.door === d}
              disabled={disabled}
              onPickDoor={onPickDoor}
            />
          ))}
        </div>
      </div>,
    );
  }

  return <div className="flex w-full flex-col gap-1.5 sm:gap-2">{rows}</div>;
}
