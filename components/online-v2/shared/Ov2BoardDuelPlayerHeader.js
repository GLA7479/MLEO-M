"use client";

const MISSED_MAX = 3;

/**
 * Shared 2-seat HUD for OV2 board duels (Checkers + Chess), aligned with FourLine player windows.
 *
 * @param {{
 *   game: "checkers" | "chess",
 *   seat0Label: string,
 *   seat1Label: string,
 *   mySeat: null|0|1,
 *   indicatorSeat: null|0|1,
 *   phase: string,
 *   missedStreakBySeat: { 0: number, 1: number },
 *   chessShowCheckOnTurn?: boolean,
 *   mustRespondDouble?: boolean,
 * }} props
 */
export default function Ov2BoardDuelPlayerHeader({
  game,
  seat0Label,
  seat1Label,
  mySeat,
  indicatorSeat,
  phase,
  missedStreakBySeat,
  chessShowCheckOnTurn = false,
  mustRespondDouble = false,
}) {
  const playing = phase === "playing";
  const active0 = playing && indicatorSeat === 0;
  const active1 = playing && indicatorSeat === 1;

  const sideTitle = seat => {
    if (game === "chess") return seat === 0 ? "White" : "Black";
    /* checkers: server owner 0 uses dark men (1,2), owner 1 light (3,4) — matches board tint */
    return seat === 0 ? "Dark" : "Light";
  };

  const lineForSeat = seat => {
    if (phase === "finished") return "Finished";
    if (!playing) return "";
    if (mustRespondDouble && Number(seat) === Number(indicatorSeat)) return "Respond to stake";
    if (indicatorSeat !== seat) {
      const m = Math.max(
        0,
        Math.min(MISSED_MAX, Number(missedStreakBySeat?.[seat] ?? missedStreakBySeat?.[String(seat)] ?? 0) || 0)
      );
      return `Waiting · ${m}/${MISSED_MAX}`;
    }
    if (game === "chess" && chessShowCheckOnTurn) return "Your turn · Check";
    return "Your turn";
  };

  const line0 = lineForSeat(0);
  const line1 = lineForSeat(1);

  const dot0 =
    game === "chess"
      ? "border-zinc-200/30 bg-gradient-to-b from-zinc-100 to-zinc-400"
      : "border-zinc-500/30 bg-gradient-to-b from-zinc-500 to-zinc-800";
  const dot1 =
    game === "chess"
      ? "border-zinc-800/50 bg-gradient-to-b from-zinc-700 to-zinc-950"
      : "border-amber-300/25 bg-gradient-to-b from-amber-100 to-amber-700";

  return (
    <div className="mb-2 grid w-full shrink-0 grid-cols-2 gap-1.5 sm:mb-2.5 sm:gap-1">
      <div
        className={`min-w-0 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-1.5 ${
          active0
            ? "border-sky-400/40 bg-gradient-to-br from-sky-950/45 to-zinc-900/90 shadow-[0_0_0_1px_rgba(56,189,248,0.18)]"
            : "border-white/[0.1] bg-zinc-900/55"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`h-6 w-6 shrink-0 rounded-full border shadow-sm ${dot0}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-sky-200/95">{sideTitle(0)}</span>
              {mySeat === 0 ? (
                <span className="rounded bg-sky-500/25 px-1 py-px text-[9px] font-semibold uppercase text-sky-100">You</span>
              ) : mySeat === 1 ? (
                <span className="rounded bg-zinc-700/50 px-1 py-px text-[9px] font-medium text-zinc-400">Opponent</span>
              ) : null}
            </div>
            <p className="truncate text-[11px] font-medium leading-tight text-zinc-100 sm:text-xs" title={seat0Label}>
              {seat0Label}
            </p>
          </div>
        </div>
        <div className="mt-1 flex min-h-[1.125rem] items-end">
          {line0 ? (
            <p
              className={`min-w-0 truncate text-[8px] font-semibold uppercase leading-tight tracking-wide tabular-nums sm:text-[9px] ${
                phase === "finished" ? "text-zinc-500" : active0 ? "text-sky-300/95" : "text-zinc-500"
              }`}
            >
              {line0}
            </p>
          ) : null}
        </div>
      </div>
      <div
        className={`min-w-0 rounded-lg border px-2 py-1.5 sm:px-2.5 sm:py-1.5 ${
          active1
            ? "border-amber-400/40 bg-gradient-to-br from-amber-950/40 to-zinc-900/90 shadow-[0_0_0_1px_rgba(251,191,36,0.18)]"
            : "border-white/[0.1] bg-zinc-900/55"
        }`}
      >
        <div className="flex items-center gap-1.5">
          <span className={`h-6 w-6 shrink-0 rounded-full border shadow-sm ${dot1}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] font-bold uppercase tracking-wide text-amber-200/95">{sideTitle(1)}</span>
              {mySeat === 1 ? (
                <span className="rounded bg-amber-500/25 px-1 py-px text-[9px] font-semibold uppercase text-amber-100">You</span>
              ) : mySeat === 0 ? (
                <span className="rounded bg-zinc-700/50 px-1 py-px text-[9px] font-medium text-zinc-400">Opponent</span>
              ) : null}
            </div>
            <p className="truncate text-[11px] font-medium leading-tight text-zinc-100 sm:text-xs" title={seat1Label}>
              {seat1Label}
            </p>
          </div>
        </div>
        <div className="mt-1 flex min-h-[1.125rem] items-end">
          {line1 ? (
            <p
              className={`min-w-0 truncate text-[8px] font-semibold uppercase leading-tight tracking-wide tabular-nums sm:text-[9px] ${
                phase === "finished" ? "text-zinc-500" : active1 ? "text-amber-300/95" : "text-zinc-500"
              }`}
            >
              {line1}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
