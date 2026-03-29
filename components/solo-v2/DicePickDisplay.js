import { useEffect, useState } from "react";

/**
 * Solo V2 Dice Pick — single d6 hero (idle / rolling / resolved). Visual only; rules stay server-side.
 */
function Pip() {
  return (
    <span
      className="block h-2.5 w-2.5 rounded-full bg-gradient-to-br from-white via-zinc-100 to-zinc-400 shadow-[inset_0_-2px_4px_rgba(0,0,0,0.45),0_1px_2px_rgba(255,255,255,0.35)] ring-1 ring-black/25 sm:h-3 sm:w-3"
      aria-hidden
    />
  );
}

function Face({ n }) {
  const grid = "grid h-full w-full grid-cols-3 grid-rows-3 gap-x-1 gap-y-1 p-2.5 sm:gap-x-1.5 sm:gap-y-1.5 sm:p-3.5";
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
    <div className="relative flex h-full w-full flex-col items-center justify-center gap-1 px-3">
      <span
        className="select-none font-black tabular-nums text-[2.75rem] leading-none text-amber-200/25 sm:text-[3.25rem]"
        aria-hidden
      >
        ?
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">d6</span>
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
    <div className="flex w-full max-w-[17rem] flex-col items-center sm:max-w-[19rem] lg:max-w-[21rem]">
      <div
        className={`relative ${phase === "idle" ? "animate-dice-idle-float" : ""} ${
          phase === "rolling" ? "animate-dice-roll-tumble" : ""
        }`}
      >
        {phase === "idle" ? (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl sm:rounded-3xl"
            aria-hidden
          >
            <div className="absolute inset-0 animate-dice-idle-sheen bg-gradient-to-r from-transparent via-white/[0.07] to-transparent" />
          </div>
        ) : null}

        {/* Single die surface — no outer drop shadow blob, no second “backdrop” panel */}
        <div
          className={[
            "relative flex h-[10.25rem] w-[10.25rem] items-center justify-center rounded-2xl p-4 sm:h-[12.25rem] sm:w-[12.25rem] sm:rounded-3xl sm:p-5 lg:h-[13.5rem] lg:w-[13.5rem] lg:p-6",
            "border border-white/[0.12]",
            "bg-gradient-to-b from-zinc-800 to-zinc-950",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.11),inset_0_-4px_14px_rgba(0,0,0,0.42)]",
            phase === "rolling" ? "border-amber-400/35" : "",
          ].join(" ")}
        >
          <div className="relative z-[1] h-[82%] w-[82%]">
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
