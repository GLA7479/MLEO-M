import { useEffect, useState } from "react";

function pct(v) {
  return `${Math.max(0, Math.min(1, Number(v) || 0)) * 100}%`;
}

export default function SafeZoneGauge({
  pos = 0.5,
  safeMin = 0.34,
  safeMax = 0.66,
  tierProgress = 0,
  holding = false,
  resolvedKind = null,
}) {
  const tone =
    resolvedKind === "fail"
      ? "border-rose-500/45"
      : resolvedKind
        ? "border-emerald-400/45"
        : "border-zinc-700/55";
  return (
    <div className={`relative mx-auto h-[7.5rem] w-[7.5rem] rounded-2xl border ${tone} bg-zinc-900/50 sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem]`}>
      <div className="absolute left-4 right-4 top-4 bottom-4 rounded-lg border border-zinc-700/60 bg-zinc-950/70">
        <div
          className="absolute left-0 right-0 bg-emerald-500/18"
          style={{ top: pct(1 - safeMax), height: pct(safeMax - safeMin) }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 h-[3px] w-[85%] rounded-full bg-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.55)]"
          style={{ top: `calc(${pct(1 - pos)} - 1.5px)` }}
        />
      </div>
      <div className="absolute left-2 right-2 bottom-2">
        <div className="h-2 w-full overflow-hidden rounded-full border border-zinc-700/55 bg-zinc-900/85">
          <div className="h-full bg-amber-400/70" style={{ width: pct(tierProgress) }} />
        </div>
        <p className="mt-1 text-center text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-400 sm:text-[9px]">
          {holding ? "Holding" : "Release"}
        </p>
      </div>
    </div>
  );
}

export function useSafeZoneVisualPulse(playing, uiState) {
  const [pos, setPos] = useState(0.5);
  useEffect(() => {
    const p = Number(playing?.simNow?.pos);
    if (Number.isFinite(p)) setPos(Math.max(0, Math.min(1, p)));
  }, [playing?.simNow?.pos]);

  useEffect(() => {
    if (uiState !== "active") return undefined;
    let raf = 0;
    const tick = () => {
      setPos(prev => {
        const n = prev + (Math.random() - 0.5) * 0.006;
        return Math.max(0, Math.min(1, n));
      });
      raf = window.requestAnimationFrame(tick);
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [uiState]);
  return pos;
}
