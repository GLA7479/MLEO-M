import { useEffect, useState } from "react";

/**
 * Speed Track — flex-driven layout: SVG fills remaining viewport between header and route row
 * (no fixed max-heights that clip controls). Crisp fills/strokes only — no animated overlays or SVG filter glow.
 */

const ROUTE_LABELS = ["INSIDE LINE", "CENTER LINE", "OUTSIDE LINE"];
const ROUTE_KEYS = ["inside", "center", "outside"];

const LANE_SHAPES = [
  "M 4 178 L 102 178 L 124 36 L 72 36 Z",
  "M 106 178 L 214 178 L 196 32 L 124 32 Z",
  "M 218 178 L 316 178 L 248 36 L 200 36 Z",
];

export default function SpeedTrackBoard({
  checkpointCount = 6,
  currentCheckpointIndex = 0,
  clearedCheckpoints = [],
  routeHistory = [],
  blockedRoutes = null,
  revealBlocked = false,
  disabled = false,
  pulseLane = null,
  shakeLane = null,
  onPickRoute,
  terminalKind = null,
  failCheckpointIndex = null,
  lockedRouteIndex = null,
  hideCheckpointRibbon = false,
}) {
  const [hoverLane, setHoverLane] = useState(null);
  const [pulseFlash, setPulseFlash] = useState(false);

  const safeCp = Math.max(
    0,
    Math.min(checkpointCount - 1, Math.floor(Number(currentCheckpointIndex) || 0)),
  );
  const clearedSet = new Set(
    (clearedCheckpoints || []).map(n => Math.floor(Number(n))).filter(Number.isFinite),
  );
  const failIx =
    failCheckpointIndex != null && Number.isFinite(Number(failCheckpointIndex))
      ? Math.floor(Number(failCheckpointIndex))
      : null;

  const cpForLanes =
    revealBlocked && failIx != null ? failIx : terminalKind === "full_clear" ? checkpointCount - 1 : safeCp;

  const historySet = new Set(
    (routeHistory || [])
      .filter(
        h => h && Number(h.checkpointIndex) === cpForLanes && Number.isFinite(Number(h.route)),
      )
      .map(h => Math.floor(Number(h.route))),
  );

  const inPlay = !revealBlocked && !terminalKind;
  const showHazardCopy = inPlay && lockedRouteIndex == null;
  const showLockedLane = inPlay && lockedRouteIndex != null && Number.isFinite(Number(lockedRouteIndex));

  useEffect(() => {
    if (pulseLane != null && Number.isFinite(Number(pulseLane.routeIndex))) {
      setPulseFlash(true);
      const t = window.setTimeout(() => setPulseFlash(false), 550);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [pulseLane]);

  const lockedIx = showLockedLane ? Math.floor(Number(lockedRouteIndex)) : null;

  function laneFill(lane) {
    const blocked =
      revealBlocked && Array.isArray(blockedRoutes) && blockedRoutes[cpForLanes] === lane;
    const chosenHere = historySet.has(lane);
    const pulse = pulseLane != null && Number(pulseLane.routeIndex) === lane;
    const hover = hoverLane === lane && inPlay && !disabled;
    const lockedHere = lockedIx === lane;

    if (blocked && revealBlocked) return "#7f1d1d";
    if (revealBlocked && chosenHere && !blocked) return pulse || pulseFlash ? "#047857" : "#065f46";
    if (terminalKind === "full_clear" && chosenHere) return "#047857";
    if (inPlay) {
      if (lockedHere) return "rgba(6,182,212,0.45)";
      if (hover) return "rgba(34,211,238,0.35)";
      return "#27272a";
    }
    if (chosenHere) return "rgba(16,185,129,0.35)";
    return "#3f3f46";
  }

  function laneStroke(lane) {
    const blocked =
      revealBlocked && Array.isArray(blockedRoutes) && blockedRoutes[cpForLanes] === lane;
    const chosenHere = historySet.has(lane);
    const pulse = pulseLane != null && Number(pulseLane.routeIndex) === lane;
    const hover = hoverLane === lane && inPlay && !disabled;
    const lockedHere = lockedIx === lane;

    if (blocked && revealBlocked) return { color: "#fca5a5", width: 3 };
    if (revealBlocked && chosenHere && !blocked)
      return { color: pulse || pulseFlash ? "#6ee7b7" : "#34d399", width: 2.8 };
    if (terminalKind === "full_clear" && chosenHere) return { color: "#6ee7b7", width: 2.6 };
    if (inPlay) {
      if (lockedHere) return { color: "#67e8f9", width: 2.6 };
      if (hover) return { color: "#a5f3fc", width: 2.4 };
      return { color: "rgba(251,191,36,0.65)", width: 2 };
    }
    return { color: "#71717a", width: 1.5 };
  }

  return (
    <div className={`flex min-h-0 w-full flex-1 flex-col ${hideCheckpointRibbon ? "gap-0" : "gap-1.5"}`}>
      <style>{`
        @keyframes st-shake-lane {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-3px); }
          75% { transform: translateX(3px); }
        }
        .st-lane-shake { animation: st-shake-lane 0.6s ease-in-out both; }
      `}</style>

      {!hideCheckpointRibbon ? (
        <div className="flex shrink-0 items-stretch gap-0.5 px-0.5">
          {Array.from({ length: checkpointCount }, (_, i) => {
            const done =
              terminalKind === "full_clear" ||
              clearedSet.has(i) ||
              (failIx != null && terminalKind === "blocked" && i < failIx);
            const active = inPlay && i === safeCp;
            const lost = terminalKind === "blocked" && failIx === i;
            return (
              <div key={i} className="flex min-w-0 flex-1 flex-col items-center gap-0.5" title={`CP ${i + 1}`}>
                <div
                  className={`h-2 w-full rounded-sm ${
                    done
                      ? "bg-emerald-500"
                      : active
                        ? "bg-amber-400"
                        : lost
                          ? "bg-rose-500"
                          : "bg-zinc-600"
                  }`}
                />
                <span
                  className={`text-[8px] font-bold leading-none sm:text-[9px] ${
                    active ? "text-amber-200" : done ? "text-emerald-400" : "text-zinc-500"
                  }`}
                >
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Card: column flex; only middle row grows — route row never clipped */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-2 border-cyan-600/40 bg-zinc-900">
        <div className="shrink-0 px-2 pb-1 pt-2">
          <div className="mb-0.5 flex flex-wrap items-baseline justify-center gap-x-2 text-center">
            <span className="text-[11px] font-black uppercase tracking-widest text-cyan-200 sm:text-xs">
              {terminalKind === "full_clear"
                ? "Finish line"
                : terminalKind === "blocked"
                  ? "Wrong line"
                  : terminalKind === "cashout"
                    ? "Pit stop"
                    : `Checkpoint ${Math.min(safeCp + 1, checkpointCount)}`}
            </span>
            <span className="text-[10px] font-semibold uppercase text-zinc-500">
              {terminalKind === "full_clear"
                ? "Full clear"
                : terminalKind === "blocked"
                  ? "DNF"
                  : terminalKind === "cashout"
                    ? "Banked"
                    : "Hazard sector"}
            </span>
          </div>
          {showHazardCopy && (
            <p className="mx-auto line-clamp-3 max-w-[min(100%,320px)] text-center text-[10px] font-semibold leading-snug text-amber-100/90 sm:text-[11px]">
              One line is <span className="text-rose-300">blocked</span> — pick inside, center, or outside. Wrong line
              ends the run.
            </p>
          )}
          {showLockedLane && lockedIx != null && (
            <p className="text-center text-[10px] font-bold uppercase text-cyan-200">Line locked…</p>
          )}
          {revealBlocked && terminalKind === "blocked" && (
            <p className="text-center text-[11px] font-extrabold text-rose-200">Blocked lane shown below</p>
          )}
          {terminalKind === "cashout" && (
            <p className="text-center text-[10px] text-zinc-400">Secured payout banked.</p>
          )}
          {terminalKind === "full_clear" && (
            <p className="text-center text-[11px] font-bold text-emerald-300">All sectors clear</p>
          )}
        </div>

        {/* SVG consumes all flex space above route buttons */}
        <div className="min-h-0 flex-1 w-full min-w-0 px-1 sm:px-2">
          <svg
            viewBox="0 0 320 188"
            className="h-full w-full"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label="Three racing lanes"
          >
            <rect x="0" y="0" width="320" height="188" fill="#18181b" />

            {[0, 1, 2].map(lane => {
              const shake = shakeLane != null && Number(shakeLane.routeIndex) === lane;
              const fill = laneFill(lane);
              const stroke = laneStroke(lane);
              return (
                <g key={lane} className={shake ? "st-lane-shake" : ""} style={{ transformOrigin: "160px 94px" }}>
                  <path
                    d={LANE_SHAPES[lane]}
                    fill={fill}
                    stroke={stroke.color}
                    strokeWidth={stroke.width}
                    className="transition-colors duration-200"
                    vectorEffect="non-scaling-stroke"
                  />
                </g>
              );
            })}

            <path
              d="M 104 178 L 124 32 M 214 178 L 200 32"
              fill="none"
              stroke="rgba(34,211,238,0.45)"
              strokeWidth="1.25"
              strokeDasharray="5 8"
            />
            <line
              x1="56"
              y1="34"
              x2="264"
              y2="34"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <text x="160" y="29" textAnchor="middle" fill="#a1a1aa" fontSize="8" fontWeight="700">
              APEX
            </text>

            {revealBlocked &&
              terminalKind !== "cashout" &&
              Array.isArray(blockedRoutes) &&
              [0, 1, 2].map(lane => {
                const blocked = blockedRoutes[cpForLanes] === lane;
                const cx = [53, 160, 267][lane];
                const cy = 118;
                if (!blocked && !historySet.has(lane)) return null;
                return (
                  <text
                    key={`lbl-${lane}`}
                    x={cx}
                    y={cy}
                    textAnchor="middle"
                    fill={blocked ? "#fecaca" : "#a7f3d0"}
                    fontSize="9"
                    fontWeight="800"
                  >
                    {blocked ? "BLOCKED" : "CLEAR"}
                  </text>
                );
              })}
          </svg>
        </div>

        <div className="shrink-0 border-t border-cyan-600/30 bg-zinc-950 px-1.5 py-2 sm:px-2">
          <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
            {ROUTE_KEYS.map((key, idx) => {
              const blocked =
                revealBlocked && Array.isArray(blockedRoutes) && blockedRoutes[cpForLanes] === idx;
              const canPress = !disabled && !revealBlocked && !terminalKind;
              const hover = hoverLane === idx && canPress;
              const lockedHere = lockedIx === idx;

              return (
                <button
                  key={key}
                  type="button"
                  disabled={!canPress}
                  onClick={() => canPress && onPickRoute?.(key)}
                  onMouseEnter={() => canPress && setHoverLane(idx)}
                  onMouseLeave={() => setHoverLane(null)}
                  onFocus={() => canPress && setHoverLane(idx)}
                  onBlur={() => setHoverLane(null)}
                  className={`flex min-h-[48px] flex-col items-center justify-center rounded-xl border-2 px-0.5 py-1.5 text-center transition-colors sm:min-h-[52px] sm:px-1 ${
                    blocked
                      ? "border-rose-500 bg-rose-950/60 text-rose-50"
                      : lockedHere
                        ? "border-cyan-400 bg-cyan-950/50 text-cyan-50"
                        : canPress
                          ? hover
                            ? "border-cyan-300 bg-cyan-950/40 text-white ring-2 ring-cyan-400/50"
                            : "border-cyan-700/60 bg-zinc-800 text-cyan-100"
                          : "cursor-not-allowed border-zinc-700 bg-zinc-900/50 text-zinc-500"
                  }`}
                >
                  <span className="text-[9px] font-black uppercase leading-tight text-white sm:text-[10px]">
                    {ROUTE_LABELS[idx]}
                  </span>
                  <span className="mt-0.5 text-[7px] font-semibold uppercase text-cyan-200/80 sm:text-[8px]">
                    Racing line
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
