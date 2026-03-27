import { useEffect, useState } from "react";

/**
 * Quick Flip coin visuals only — idle / flipping / resolved.
 * Flipping alternates Heads vs Tails faces (not a single static glyph); resolved locks to server outcome.
 */
function CoinFaceNeutral() {
  return (
    <div
      className="flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-dashed border-amber-400/45 bg-gradient-to-br from-zinc-600/90 via-zinc-800 to-zinc-950 shadow-[inset_0_2px_12px_rgba(0,0,0,0.45)] sm:h-[9rem] sm:w-[9rem]"
      aria-hidden
    >
      <span className="text-[2.75rem] font-black leading-none text-zinc-400/95 sm:text-[3.25rem]">?</span>
      <span className="mt-1 text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500 sm:text-[11px]">Pick</span>
    </div>
  );
}

function CoinFaceHeads() {
  return (
    <div
      className="flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-emerald-400/75 bg-gradient-to-br from-emerald-700/90 via-emerald-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)] sm:h-[9rem] sm:w-[9rem]"
      aria-hidden
    >
      <span className="text-[3.25rem] font-black leading-none text-emerald-100 drop-shadow sm:text-6xl">H</span>
      <span className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wide text-emerald-200/90 sm:text-xs">
        Heads
      </span>
    </div>
  );
}

function CoinFaceTails() {
  return (
    <div
      className="flex h-[7.5rem] w-[7.5rem] shrink-0 flex-col items-center justify-center rounded-full border-[3px] border-violet-400/75 bg-gradient-to-br from-violet-700/90 via-violet-900 to-zinc-950 shadow-[inset_0_2px_14px_rgba(0,0,0,0.5)] sm:h-[9rem] sm:w-[9rem]"
      aria-hidden
    >
      <span className="text-[3.25rem] font-black leading-none text-violet-100 drop-shadow sm:text-6xl">T</span>
      <span className="mt-0.5 text-[11px] font-extrabold uppercase tracking-wide text-violet-200/90 sm:text-xs">
        Tails
      </span>
    </div>
  );
}

export default function QuickFlipCoinDisplay({ phase, resolvedFace }) {
  const [flipShowHeads, setFlipShowHeads] = useState(true);

  useEffect(() => {
    if (phase !== "flipping") return undefined;
    const id = window.setInterval(() => {
      setFlipShowHeads(v => !v);
    }, 160);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === "flipping") setFlipShowHeads(true);
  }, [phase]);

  const locked =
    phase === "resolved" && (resolvedFace === "heads" || resolvedFace === "tails") ? resolvedFace : null;

  return (
    <div className="flex flex-col items-center justify-center" aria-live={phase === "flipping" ? "polite" : "off"}>
      <div
        className={`relative flex items-center justify-center perspective-[520px] ${
          phase === "flipping" ? "motion-safe:animate-qf-coin-wobble" : ""
        }`}
      >
        {phase === "idle" ? <CoinFaceNeutral /> : null}
        {phase === "flipping" ? flipShowHeads ? <CoinFaceHeads /> : <CoinFaceTails /> : null}
        {phase === "resolved" && locked === "heads" ? <CoinFaceHeads /> : null}
        {phase === "resolved" && locked === "tails" ? <CoinFaceTails /> : null}
        {phase === "resolved" && !locked ? <CoinFaceNeutral /> : null}
      </div>
    </div>
  );
}
