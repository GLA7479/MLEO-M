/**
 * Solo V2 Dice Pick — d6 face display (idle / rolling / resolved).
 */
function Dot({ className = "" }) {
  return <span className={`block h-2 w-2 rounded-full bg-zinc-100 shadow-inner sm:h-2.5 sm:w-2.5 ${className}`} />;
}

function Face({ n }) {
  const grid = "grid h-full w-full grid-cols-3 grid-rows-3 gap-0.5 p-2 sm:gap-1 sm:p-3";
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
          {pos ? <Dot /> : null}
        </div>
      ))}
    </div>
  );
}

export default function DicePickDisplay({ phase, resolvedRoll }) {
  const showRoll = phase === "resolved" && Number.isFinite(Number(resolvedRoll));
  const n = showRoll ? Math.min(6, Math.max(1, Math.floor(Number(resolvedRoll)))) : 1;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`relative flex h-36 w-36 items-center justify-center rounded-2xl border-2 border-amber-400/40 bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 shadow-xl shadow-black/40 sm:h-44 sm:w-44 ${
          phase === "rolling" ? "animate-pulse ring-2 ring-amber-400/50" : ""
        }`}
      >
        {phase === "rolling" ? (
          <span className="text-3xl font-black tabular-nums text-amber-200/90 sm:text-4xl" aria-hidden>
            ···
          </span>
        ) : (
          <Face n={n} />
        )}
      </div>
      {showRoll ? (
        <p className="text-sm font-bold tabular-nums text-amber-200/95 sm:text-base">
          Rolled <span className="text-white">{n}</span>
        </p>
      ) : (
        <p className="invisible text-sm sm:text-base" aria-hidden>
          Rolled 6
        </p>
      )}
    </div>
  );
}
