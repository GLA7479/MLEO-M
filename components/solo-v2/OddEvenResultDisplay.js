import { useEffect, useState } from "react";

/** Same footprint as QuickFlipCoinDisplay — idle / rolling / resolved number + parity. */
function FaceNeutral() {
  return (
    <div
      className="flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-dashed border-amber-400/45 bg-gradient-to-br from-zinc-600/90 via-zinc-800 to-zinc-950 shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)] sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem]"
      aria-hidden
    >
      <span className="text-[2.75rem] font-black leading-none text-zinc-400/95 sm:text-[3.25rem] lg:text-[4rem]">?</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">Pick</span>
    </div>
  );
}

function FaceOdd({ pulsing }) {
  return (
    <div
      className={`flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-emerald-400/75 bg-gradient-to-br from-emerald-700/90 via-emerald-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)] sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem] ${
        pulsing ? "motion-safe:animate-pulse" : ""
      }`}
      aria-hidden
    >
      <span className="text-[3.25rem] font-black leading-none text-emerald-100 drop-shadow sm:text-6xl lg:text-7xl">O</span>
      <span className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-200/90 sm:text-xs">Odd</span>
    </div>
  );
}

function FaceEven({ pulsing }) {
  return (
    <div
      className={`flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-violet-400/75 bg-gradient-to-br from-violet-700/90 via-violet-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)] sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem] ${
        pulsing ? "motion-safe:animate-pulse" : ""
      }`}
      aria-hidden
    >
      <span className="text-[3.25rem] font-black leading-none text-violet-100 drop-shadow sm:text-6xl lg:text-7xl">E</span>
      <span className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wide text-violet-200/90 sm:text-xs">Even</span>
    </div>
  );
}

function FaceResolved({ value, parity }) {
  const isOdd = parity === "odd";
  return (
    <div
      className={`flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem] ${
        isOdd
          ? "border-emerald-400/75 bg-gradient-to-br from-emerald-700/90 via-emerald-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)]"
          : "border-violet-400/75 bg-gradient-to-br from-violet-700/90 via-violet-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)]"
      }`}
      aria-label={`Rolled ${value}, ${parity}`}
    >
      <span
        className={`text-[2.5rem] font-black leading-none tabular-nums drop-shadow sm:text-[3rem] lg:text-[3.5rem] ${
          isOdd ? "text-emerald-100" : "text-violet-100"
        }`}
      >
        {value}
      </span>
      <span
        className={`mt-1 text-[11px] font-extrabold uppercase tracking-wide sm:text-xs ${
          isOdd ? "text-emerald-200/90" : "text-violet-200/90"
        }`}
      >
        {isOdd ? "Odd" : "Even"}
      </span>
    </div>
  );
}

/**
 * @param {{ phase: 'idle'|'rolling'|'resolved'; resolvedValue?: number | null; resolvedParity?: 'odd'|'even' | null }} p
 */
export default function OddEvenResultDisplay({ phase, resolvedValue, resolvedParity }) {
  const [showOdd, setShowOdd] = useState(true);

  useEffect(() => {
    if (phase !== "rolling") return undefined;
    const id = window.setInterval(() => {
      setShowOdd(v => !v);
    }, 160);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "rolling") setShowOdd(true);
  }, [phase]);

  const locked =
    phase === "resolved" &&
    resolvedParity != null &&
    (resolvedParity === "odd" || resolvedParity === "even") &&
    resolvedValue != null &&
    Number.isFinite(Number(resolvedValue))
      ? { value: Math.floor(Number(resolvedValue)), parity: resolvedParity }
      : null;

  return (
    <div className="flex flex-col items-center justify-center" aria-live={phase === "rolling" ? "polite" : "off"}>
      <div
        className={`relative flex items-center justify-center perspective-[520px] ${
          phase === "rolling" ? "motion-safe:animate-qf-coin-wobble" : ""
        }`}
      >
        {phase === "idle" ? <FaceNeutral /> : null}
        {phase === "rolling" ? showOdd ? <FaceOdd pulsing /> : <FaceEven pulsing /> : null}
        {locked ? <FaceResolved value={locked.value} parity={locked.parity} /> : null}
        {phase === "resolved" && !locked ? <FaceNeutral /> : null}
      </div>
    </div>
  );
}
