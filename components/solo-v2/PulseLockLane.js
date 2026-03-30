import { useEffect, useState } from "react";
import { markerPhase01 } from "../../lib/solo-v2/pulseLockConfig";

function ticksToUnit(t) {
  return Math.max(0, Math.min(1, Math.floor(Number(t) || 0) / 10000));
}

/**
 * Quick Flip playfield slot: timing lane + moving marker + target zones (display is illustrative; server resolves on LOCK).
 */
export default function PulseLockLane({ playing, lanePhase, markerPos01, resolvedPositionTicks, resolvedHitQuality }) {
  const c = playing ? ticksToUnit(playing.centerTicks) : 0.5;
  const rP = playing ? ticksToUnit(playing.rPerfectTicks) : 0.04;
  const rG = playing ? ticksToUnit(playing.rGoodTicks) : 0.12;
  const rE = playing ? ticksToUnit(playing.rEdgeTicks) : 0.22;

  const marker =
    lanePhase === "resolved" && resolvedPositionTicks != null
      ? ticksToUnit(resolvedPositionTicks)
      : typeof markerPos01 === "number" && Number.isFinite(markerPos01)
        ? Math.max(0, Math.min(1, markerPos01))
        : lanePhase === "idle"
          ? 0.5
          : typeof markerPos01 === "number"
            ? markerPos01
            : 0;

  const hq = String(resolvedHitQuality || "").toLowerCase();
  const ringClass =
    hq === "perfect"
      ? "ring-2 ring-emerald-400/55"
      : hq === "good"
        ? "ring-2 ring-amber-300/45"
        : hq === "edge"
          ? "ring-2 ring-violet-400/45"
          : hq === "miss"
            ? "ring-2 ring-rose-500/40"
            : "";

  return (
    <div
      className={`relative mx-auto flex h-[7.5rem] w-[7.5rem] flex-col items-center justify-center sm:h-[9rem] sm:w-[9rem] lg:h-[11rem] lg:w-[11rem] ${ringClass} rounded-2xl`}
    >
      <div className="relative h-16 w-full max-w-[11rem] px-1 sm:h-[4.5rem] sm:max-w-[13rem] lg:h-20 lg:max-w-[15rem]">
        <div className="absolute inset-x-1 top-1/2 h-3 -translate-y-1/2 overflow-hidden rounded-full border border-zinc-600/60 bg-zinc-900/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
          {playing ? (
            <>
              <div
                className="absolute top-0 bottom-0 bg-violet-500/12"
                style={{
                  left: `${Math.max(0, (c - rE) * 100)}%`,
                  width: `${Math.min(100, 2 * rE * 100)}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-amber-400/18"
                style={{
                  left: `${Math.max(0, (c - rG) * 100)}%`,
                  width: `${Math.min(100, 2 * rG * 100)}%`,
                }}
              />
              <div
                className="absolute top-0 bottom-0 bg-emerald-400/22"
                style={{
                  left: `${Math.max(0, (c - rP) * 100)}%`,
                  width: `${Math.min(100, 2 * rP * 100)}%`,
                }}
              />
            </>
          ) : (
            <div className="absolute inset-0 bg-zinc-800/80" />
          )}
          <div
            className="absolute top-0 bottom-0 w-[3px] -translate-x-1/2 rounded-full bg-amber-200 shadow-[0_0_12px_rgba(251,191,36,0.55)]"
            style={{ left: `${marker * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.12em] text-zinc-500 sm:text-[9px]">
          {lanePhase === "resolved" && hq
            ? hq === "miss"
              ? "Miss"
              : `${hq.charAt(0).toUpperCase() + hq.slice(1)} hit`
            : lanePhase === "sweeping"
              ? "Lock in the zone"
              : "Timing lane"}
        </p>
      </div>
    </div>
  );
}

/** Hook: server-aligned marker motion for sweeping (display only). */
export function usePulseLockSweepAnimation(playing, lanePhase) {
  const [marker01, setMarker01] = useState(0.5);

  useEffect(() => {
    if (lanePhase !== "sweeping" || !playing?.roundStartAt || !playing.sweepPeriodMs) {
      return undefined;
    }
    const startMs = new Date(playing.roundStartAt).getTime();
    if (!Number.isFinite(startMs)) return undefined;
    let raf;
    const loop = () => {
      const now = Date.now();
      const p = markerPhase01(now, startMs, playing.sweepPeriodMs);
      setMarker01(p);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [lanePhase, playing?.roundStartAt, playing?.sweepPeriodMs]);

  return lanePhase === "sweeping" || lanePhase === "locking" ? marker01 : null;
}
