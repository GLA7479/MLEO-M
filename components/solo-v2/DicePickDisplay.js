import { useEffect, useState } from "react";

/**
 * Solo V2 Dice Pick — single d6 hero (idle / rolling / resolved). Visual only; rules stay server-side.
 */
function Pip() {
  return (
    <span
      className="block h-2 w-2 rounded-full bg-gradient-to-br from-white via-zinc-100 to-zinc-400 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.45),0_1px_2px_rgba(255,255,255,0.35)] ring-1 ring-black/25 sm:h-2.5 sm:w-2.5 lg:h-3 lg:w-3"
      aria-hidden
    />
  );
}

function Face({ n }) {
  const grid =
    "grid h-full w-full grid-cols-3 grid-rows-3 gap-x-0.5 gap-y-0.5 p-1.5 sm:gap-x-1 sm:gap-y-1 sm:p-2.5 lg:gap-x-1.5 lg:gap-y-1.5 lg:p-3";
  const positions = {
    1: [null, null, null, null, "c", null, null, null, null],
    2: ["tl", null, null, null, null, null, null, null, "br"],
    3: ["tl", null, null, null, "c", null, null, null, "br"],
    4: ["tl", null, "tr", null, null, null, "bl", null, "br"],
    5: ["tl", null, "tr", null, "c", null, "bl", null, "br"],
    6: ["tl", null, "tr", "ml", null, "mr", "bl", null, "br"],
  };
  const map = positions[n] || positions[1];
  return (
    <div className={grid}>
      {map.map((pos, i) => (
        <div key={i} className="flex items-center justify-center">
          {pos ? <Pip /> : null}
        </div>
      ))}
    </div>
  );
}

function IdleFace() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-0.5 px-2 sm:gap-1 sm:px-2.5">
      <span
        className="select-none font-black tabular-nums text-[2.35rem] leading-none text-amber-200/25 sm:text-[2.85rem] lg:text-[3.25rem]"
        aria-hidden
      >
        ?
      </span>
      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">d6</span>
    </div>
  );
}

export default function DicePickDisplay({ phase, resolvedRoll, hideSubcaption = false }) {
  const [cycleTick, setCycleTick] = useState(0);

  useEffect(() => {
    if (phase !== "rolling") return undefined;
    const id = window.setInterval(() => {
      setCycleTick(t => t + 1);
    }, 95);
    return () => window.clearInterval(id);
  }, [phase]);

  const showResolved = phase === "resolved" && Number.isFinite(Number(resolvedRoll));
  const n = showResolved ? Math.min(6, Math.max(1, Math.floor(Number(resolvedRoll)))) : null;
  const tumbleFace = phase === "rolling" ? (cycleTick % 6) + 1 : 1;

  return (
    <div className="flex flex-col items-center justify-center" aria-live={phase === "rolling" ? "polite" : "off"}>
      <div
        className={`relative flex items-center justify-center ${phase === "idle" ? "animate-dice-idle-float" : ""} ${
          phase === "rolling" ? "animate-dice-roll-tumble" : ""
        }`}
      >
        {phase === "idle" ? (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl sm:rounded-2xl lg:rounded-2xl"
            aria-hidden
          >
            <div className="absolute inset-0 animate-dice-idle-sheen bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
        ) : null}

        {/* Die footprint matches QuickFlipCoinDisplay (7.5 / 9 / 11 rem) for board composition parity */}
        <div
          className={[
            "relative flex h-[7.5rem] w-[7.5rem] items-center justify-center rounded-2xl p-2.5 sm:h-[9rem] sm:w-[9rem] sm:p-3 lg:h-[11rem] lg:w-[11rem] lg:p-4",
            "border border-white/[0.12]",
            "bg-gradient-to-b from-zinc-800 to-zinc-950",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.11),inset_0_-4px_14px_rgba(0,0,0,0.42)]",
            phase === "rolling" ? "border-amber-400/35" : "",
          ].join(" ")}
        >
          <div className="relative z-[1] h-[86%] w-[86%]">
            {phase === "idle" ? <IdleFace /> : null}
            {phase === "rolling" ? (
              <div key={tumbleFace} className="h-full w-full">
                <Face n={tumbleFace} />
              </div>
            ) : null}
            {showResolved ? (
              <div key={`${n}-resolved`} className="h-full w-full animate-dice-land-pop">
                <Face n={n} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {!hideSubcaption ? (
        <div
          className="mt-3 flex w-full flex-col items-center gap-1 sm:mt-3.5"
          style={{ minHeight: "3.25rem" }}
        >
          <div className="flex min-h-[1.25rem] w-full items-center justify-center px-1">
            {phase === "idle" ? (
              <p className="text-center text-[11px] font-medium leading-snug text-zinc-500 sm:text-xs">
                One die · pick <span className="text-zinc-400">LOW</span> or{" "}
                <span className="text-zinc-400">HIGH</span>
              </p>
            ) : null}
            {phase === "rolling" ? (
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/90 sm:text-sm">Rolling…</p>
            ) : null}
            {phase === "resolved" ? (
              <span className="invisible text-xs" aria-hidden>
                Rolling…
              </span>
            ) : null}
          </div>
          <div className="min-h-[1rem]" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}
