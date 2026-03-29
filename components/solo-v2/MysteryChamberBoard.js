import { MYSTERY_CHAMBER_SIGIL_GLYPHS } from "../../lib/solo-v2/mysteryChamberConfig";

/**
 * @typedef {"idle" | "pending" | "safe" | "fail" | "muted"} SigilVisual
 */

function SigilTile({ index, visual, disabled, onPick, revealPulse }) {
  const glyph = MYSTERY_CHAMBER_SIGIL_GLYPHS[index] || "?";

  const shell =
    "group relative flex h-full min-h-[5.65rem] w-full flex-col items-center justify-center rounded-2xl border-2 text-center shadow-sm transition-[transform,box-shadow,border-color,background-color] duration-150 sm:min-h-[6.45rem] sm:rounded-[1.05rem] lg:min-h-[6.75rem]";

  let face =
    "border-amber-700/45 bg-gradient-to-b from-zinc-800/95 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";

  if (visual === "safe") {
    face =
      "border-emerald-400/65 bg-gradient-to-b from-emerald-900/55 to-emerald-950/90 text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_0_1px_rgba(16,185,129,0.12)] ";
  } else if (visual === "fail") {
    face =
      "border-rose-500/70 bg-gradient-to-b from-rose-900/50 to-rose-950/90 text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] ";
  } else if (visual === "muted") {
    face =
      "border-zinc-700/70 bg-zinc-950/90 text-zinc-600 shadow-none saturate-50 ";
  } else if (visual === "pending") {
    face =
      "border-amber-300/55 bg-gradient-to-b from-amber-900/35 to-zinc-950 text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_2px_rgba(251,191,36,0.22)] ring-2 ring-amber-400/30 " +
      (revealPulse ? "motion-safe:animate-pulse " : "");
  } else {
    face +=
      "enabled:hover:border-amber-500/55 enabled:hover:from-zinc-800 enabled:hover:to-zinc-950 enabled:active:scale-[0.98] enabled:active:border-amber-400/50 ";
  }

  const isLocked = visual === "safe" || visual === "fail" || visual === "muted";
  const dimmed = disabled && !isLocked;

  return (
    <button
      type="button"
      className={`${shell} ${face}${
        dimmed ? "cursor-not-allowed opacity-[0.42] " : ""
      }focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-400/35 disabled:cursor-not-allowed`}
      disabled={disabled}
      onClick={() => onPick?.(index)}
    >
      <span className="absolute left-2 top-2 text-[8px] font-bold uppercase tracking-[0.18em] text-white/30 sm:left-2.5 sm:top-2.5 sm:text-[9px]">
        {index + 1}
      </span>
      <span
        className={`mt-1 select-none font-serif text-[2.15rem] font-black leading-none tabular-nums tracking-tight sm:text-[2.55rem] lg:text-[2.7rem] ${
          visual === "idle" ? "text-amber-100/95" : ""
        }`}
        aria-hidden
      >
        {glyph}
      </span>
      <span className="mt-1.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-white/38 sm:text-[10px]">
        {visual === "safe" ? "Safe" : visual === "fail" ? "Wrong" : visual === "muted" ? "—" : "Choose"}
      </span>
    </button>
  );
}

/**
 * Inner ladder playfield only — outer notice / strip / payout / exit live on the page (Gold Rush Digger template).
 */
export default function MysteryChamberBoard({
  sigilVisuals = ["idle", "idle", "idle", "idle"],
  sigilPickDisabled = false,
  onSigilPick,
  revealPulse = false,
}) {
  return (
    <div
      className="mx-auto grid w-full max-w-[17.75rem] grid-cols-2 grid-rows-2 gap-2 sm:mx-0 sm:max-w-none sm:grid-cols-4 sm:grid-rows-1 sm:gap-3 lg:gap-3.5"
      role="group"
      aria-label="Sigils"
    >
      {[0, 1, 2, 3].map(i => (
        <SigilTile
          key={i}
          index={i}
          visual={sigilVisuals[i] || "idle"}
          disabled={sigilPickDisabled || ["safe", "fail", "muted"].includes(sigilVisuals[i])}
          onPick={onSigilPick}
          revealPulse={revealPulse && sigilVisuals[i] === "pending"}
        />
      ))}
    </div>
  );
}
