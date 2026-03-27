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
        className="select-none font-black tabular-nums text-[2.75rem] leading-none text-amber-200/[0.22] drop-shadow-[0_2px_12px_rgba(251,191,36,0.12)] sm:text-[3.25rem]"
        aria-hidden
      >
        ?
      </span>
      <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">d6</span>
    </div>
  );
}

export default function DicePickDisplay({ phase, resolvedRoll, resolvedIsWin, resultToast }) {
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

  const winLoseKnown = showResolved && typeof resolvedIsWin === "boolean";

  return (
    <div className="flex w-full max-w-[17rem] flex-col items-center sm:max-w-[19rem]">
      <div
        className={`relative ${phase === "idle" ? "animate-dice-idle-float" : ""} ${
          phase === "rolling" ? "animate-dice-roll-tumble" : ""
        }`}
      >
        {phase === "idle" ? (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden rounded-[1.35rem] sm:rounded-[1.5rem]"
            aria-hidden
          >
            <div className="absolute inset-0 animate-dice-idle-sheen bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
        ) : null}

        <div
          className={[
            "relative flex h-[10.25rem] w-[10.25rem] items-center justify-center rounded-[1.35rem] sm:h-[12.25rem] sm:w-[12.25rem] sm:rounded-[1.5rem]",
            "bg-gradient-to-br from-zinc-500/[0.35] via-zinc-900 to-zinc-950",
            "shadow-[inset_0_1px_0_rgba(255,255,255,0.14),inset_0_-10px_24px_rgba(0,0,0,0.5),0_16px_40px_rgba(0,0,0,0.55),0_0_0_1px_rgba(255,255,255,0.07)]",
            "ring-1 ring-amber-400/20",
            phase === "rolling" ? "ring-amber-400/50" : "",
            showResolved && winLoseKnown
              ? resolvedIsWin
                ? "ring-emerald-400/55"
                : "ring-red-400/45"
              : "",
          ].join(" ")}
        >
          <div
            className={[
              "absolute inset-[5px] rounded-[1.05rem] sm:inset-[6px] sm:rounded-[1.2rem]",
              "bg-gradient-to-b from-zinc-800/90 to-zinc-950",
              "shadow-[inset_0_2px_6px_rgba(0,0,0,0.55)]",
            ].join(" ")}
          />

          <div className="relative z-[1] h-[78%] w-[78%]">
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

      {/* Fixed-height feedback: no layout shift when copy changes */}
      <div
        className="mt-3 flex w-full flex-col items-center gap-1 sm:mt-3.5"
        style={{ minHeight: "5.25rem" }}
        aria-live="polite"
      >
        <div className="flex min-h-[1.375rem] w-full items-center justify-center px-1">
          {phase === "idle" ? (
            <p className="text-center text-[11px] font-medium leading-snug text-zinc-500 sm:text-xs">
              One die · pick <span className="text-zinc-400">LOW</span> or{" "}
              <span className="text-zinc-400">HIGH</span>
            </p>
          ) : null}
          {phase === "rolling" ? (
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-200/90 sm:text-sm">Rolling…</p>
          ) : null}
          {showResolved && winLoseKnown ? (
            <span
              className={[
                "rounded-full px-3 py-0.5 text-[11px] font-black uppercase tracking-widest sm:text-xs",
                resolvedIsWin
                  ? "bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-400/35"
                  : "bg-red-500/15 text-red-200 ring-1 ring-red-400/30",
              ].join(" ")}
            >
              {resolvedIsWin ? "You win" : "You lose"}
            </span>
          ) : null}
          {showResolved && !winLoseKnown ? (
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Result</span>
          ) : null}
        </div>

        <div className="flex min-h-[1.375rem] w-full items-center justify-center">
          {showResolved ? (
            <p className="text-sm font-bold tabular-nums text-zinc-200 sm:text-base">
              Rolled <span className="text-white">{n}</span>
              <span className="ml-1.5 text-xs font-semibold text-zinc-500 sm:text-sm">
                {n <= 3 ? "· low zone" : "· high zone"}
              </span>
            </p>
          ) : (
            <p className="invisible text-sm tabular-nums sm:text-base" aria-hidden>
              Rolled 6 · high zone
            </p>
          )}
        </div>

        <div className="flex min-h-[1.25rem] w-full items-center justify-center px-1">
          {resultToast ? (
            <p
              className={[
                "text-center text-[11px] font-semibold tabular-nums sm:text-xs",
                resultToast.isWin ? "text-emerald-200/90" : "text-red-200/85",
              ].join(" ")}
            >
              Vault {resultToast.deltaLabel}
            </p>
          ) : (
            <p className="invisible text-[11px] sm:text-xs" aria-hidden>
              Vault +0
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
