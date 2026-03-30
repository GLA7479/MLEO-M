/**
 * Surge Cashout — central live multiplier + primary actions (Solo V2 styling).
 */
export default function SurgeCashoutBoard({
  phase,
  multiplier = 1,
  busy = false,
  onBegin,
  onCashOut,
  beginDisabled = false,
  cashOutDisabled = false,
  cashOutLoading = false,
  terminalKind = null,
  crashMultiplier = null,
  cashedMultiplier = null,
}) {
  const m = Number(multiplier);
  const display = Number.isFinite(m) ? m : 1;
  const multLabel = `${display.toFixed(2)}×`;

  const showBegin = phase === "pre";
  const showCashOut = phase === "live";
  const showTerminal = phase === "terminal";

  let statusLabel = "Live surge";
  let statusSub = "Multiplier is climbing — cash out before it crashes.";
  let ringClass =
    "shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_28px_rgba(245,158,11,0.15)]";

  if (phase === "pre") {
    statusLabel = "Pre-round";
    statusSub = "Lock in your stake, then begin the surge at 1.00×.";
    ringClass = "shadow-[inset_0_0_0_1px_rgba(113,113,122,0.35)]";
  } else if (showTerminal) {
    if (terminalKind === "cashout") {
      statusLabel = "Cashed out";
      statusSub =
        cashedMultiplier != null && Number.isFinite(Number(cashedMultiplier))
          ? `Secured at ${Number(cashedMultiplier).toFixed(2)}×`
          : "Payout secured.";
      ringClass =
        "shadow-[0_0_0_1px_rgba(52,211,153,0.35),0_0_24px_rgba(16,185,129,0.18)]";
    } else {
      statusLabel = "Crashed";
      statusSub =
        crashMultiplier != null && Number.isFinite(Number(crashMultiplier))
          ? `Run ended at ${Number(crashMultiplier).toFixed(2)}×`
          : "The curve hit the crash point.";
      ringClass =
        "shadow-[0_0_0_1px_rgba(244,63,94,0.35),0_0_24px_rgba(225,29,72,0.16)]";
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col items-stretch gap-3 sm:gap-4">
      <div
        className={`relative overflow-hidden rounded-2xl border-2 border-amber-900/40 bg-gradient-to-b from-zinc-900/90 to-zinc-950 p-3 sm:p-4 ${ringClass}`}
        style={{ background: "linear-gradient(165deg, rgba(39,39,42,0.95), rgba(9,9,11,0.98))" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 opacity-[0.14]"
          style={{
            background: "linear-gradient(12deg, transparent 20%, rgba(245,158,11,0.5) 85%, transparent 100%)",
          }}
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-1">
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-200/70 sm:text-[10px]">{statusLabel}</p>
          <p
            className={`font-black tabular-nums leading-none tracking-tight sm:tracking-tighter ${
              phase === "live"
                ? "text-[2.85rem] text-amber-100 sm:text-[3.35rem]"
                : showTerminal && terminalKind === "cashout"
                  ? "text-[2.55rem] text-emerald-200 sm:text-[3.1rem]"
                  : showTerminal
                    ? "text-[2.55rem] text-rose-100 sm:text-[3.1rem]"
                    : "text-[2.35rem] text-zinc-200 sm:text-[2.85rem]"
            }`}
          >
            {multLabel}
          </p>
          <p className="max-w-[18rem] px-1 text-[10px] font-semibold leading-snug text-zinc-400 sm:text-[11px]">{statusSub}</p>
        </div>
      </div>

      {showBegin ? (
        <button
          type="button"
          onClick={onBegin}
          disabled={beginDisabled || busy}
          className={`min-h-[48px] w-full rounded-xl border px-4 py-2.5 text-xs font-extrabold uppercase tracking-wide sm:text-sm ${
            beginDisabled || busy
              ? "cursor-not-allowed border-white/15 bg-white/5 text-zinc-500"
              : "border-amber-400/55 bg-amber-500/15 text-amber-50 hover:bg-amber-500/25 active:bg-amber-500/30"
          }`}
        >
          Begin surge
        </button>
      ) : null}

      {showCashOut ? (
        <button
          type="button"
          onClick={onCashOut}
          disabled={cashOutDisabled || cashOutLoading || busy}
          className={`min-h-[52px] w-full rounded-xl border-2 px-4 py-3 text-sm font-black uppercase tracking-wide sm:min-h-[56px] sm:text-base ${
            cashOutDisabled || cashOutLoading || busy
              ? "cursor-not-allowed border-white/12 bg-white/5 text-zinc-500"
              : "border-emerald-400/60 bg-emerald-950/50 text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.12)] hover:bg-emerald-900/45 active:bg-emerald-900/55"
          }`}
        >
          {cashOutLoading ? "Cashing out…" : "Cash out"}
        </button>
      ) : null}

      {showTerminal ? (
        <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500 sm:text-[11px]">
          Press START RUN for the next surge.
        </p>
      ) : null}
    </div>
  );
}
