import styles from "./TreasureDoorsBoard.module.css";

function pickDoorForChamber(doorHistory, chamber) {
  const list = Array.isArray(doorHistory) ? doorHistory : [];
  const hit = list.find(h => Math.floor(Number(h.chamberIndex)) === chamber);
  return hit != null ? Math.floor(Number(hit.door)) : null;
}

function stripLabel(i) {
  return String(i + 1);
}

/**
 * Chamber-first temple run: progress strip + hero doors (not a dig grid).
 * Props unchanged vs server contract consumers.
 */
export default function TreasureDoorsBoard({
  chamberCount = 5,
  doorCount = 3,
  currentChamberIndex = 0,
  doorHistory = [],
  trapDoors = null,
  revealTraps = false,
  disabled = false,
  /** When set for the **current** hero chamber, that door stays marked and the others are inactive. */
  lockedDoorIndex = null,
  pulseCell = null,
  shakeCell = null,
  onPickDoor,
  /** Terminal recap: `trap` | `full_clear` | `cashout` */
  terminalKind = null,
  finalChamberIndex = null,
  lastPickDoor = null,
  hideChamberRunStrip = false,
}) {
  const chMax = Math.max(1, Math.floor(Number(chamberCount) || 5));
  const dMax = Math.max(1, Math.floor(Number(doorCount) || 3));
  const cur = Math.min(chMax - 1, Math.max(0, Math.floor(Number(currentChamberIndex) || 0)));

  const isTerminalRecap = Boolean(revealTraps);
  const fk = terminalKind != null ? String(terminalKind) : "";
  const finalCh =
    finalChamberIndex != null && Number.isFinite(Number(finalChamberIndex))
      ? Math.floor(Number(finalChamberIndex))
      : null;
  const lastDoor =
    lastPickDoor != null && Number.isFinite(Number(lastPickDoor)) ? Math.floor(Number(lastPickDoor)) : null;

  const lockedDoor =
    lockedDoorIndex != null && Number.isFinite(Number(lockedDoorIndex))
      ? Math.min(dMax - 1, Math.max(0, Math.floor(Number(lockedDoorIndex))))
      : null;
  const chamberPickCommitted = !isTerminalRecap && lockedDoor != null;

  /** Chamber shown in hero for terminal recap (trap = fail chamber; full clear = last vault). */
  let heroCh = cur;
  if (isTerminalRecap) {
    if (fk === "trap" && finalCh != null && finalCh >= 0 && finalCh < chMax) {
      heroCh = finalCh;
    } else if (fk === "full_clear") {
      heroCh = chMax - 1;
    } else if (fk === "cashout") {
      const hist = Array.isArray(doorHistory) ? doorHistory : [];
      const maxIdx = hist.reduce((m, h) => {
        const c = Math.floor(Number(h.chamberIndex));
        return Number.isFinite(c) ? Math.max(m, c) : m;
      }, -1);
      heroCh = maxIdx >= 0 ? Math.min(chMax - 1, maxIdx) : 0;
    } else {
      heroCh = chMax - 1;
    }
  }

  function stripPhaseForIndex(i) {
    if (!isTerminalRecap) {
      if (i < cur) return "cleared";
      if (i === cur) return "current";
      return "future";
    }
    if (fk === "trap" && finalCh === i) return "trap";
    if (pickDoorForChamber(doorHistory, i) != null) return "cleared";
    return "future";
  }

  return (
    <div
      className={`flex w-full min-h-0 flex-1 flex-col overflow-hidden px-0.5 sm:overflow-visible ${hideChamberRunStrip ? "gap-1 sm:gap-1.5" : "gap-2 sm:gap-2.5"}`}
    >
      {/* Chamber progress — reads as a run, not rows of cells */}
      {!hideChamberRunStrip ? (
        <div className="shrink-0">
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[11px]">
            Chamber run
          </p>
          <div className="flex items-end justify-center gap-2 sm:gap-2.5">
            {Array.from({ length: chMax }).map((_, i) => {
              const phase = stripPhaseForIndex(i);
              const base =
                "relative flex h-12 w-10 shrink-0 flex-col items-center justify-center rounded-lg border text-sm font-black tabular-nums sm:h-14 sm:w-12 sm:text-base";
              let cls = "border-zinc-500/80 bg-zinc-950 text-zinc-500 opacity-65";
              let inner = stripLabel(i);
              if (phase === "cleared") {
                cls =
                  "border-amber-400/85 bg-zinc-900 text-amber-50 opacity-100 ring-2 ring-amber-600/45";
                inner = "✓";
              } else if (phase === "current") {
                cls =
                  "border-amber-300 bg-zinc-900 text-amber-50 opacity-100 ring-[3px] ring-amber-400/70";
              } else if (phase === "trap") {
                cls =
                  "border-red-400/80 bg-zinc-950 text-red-100 opacity-100 ring-2 ring-red-700/55";
                inner = "☠";
              }
              return (
                <div key={i} className="flex shrink-0 flex-col items-center gap-1">
                  <div className={base + " " + cls} aria-label={`Chamber ${i + 1} ${phase}`}>
                    {inner}
                  </div>
                  <span className="text-[10px] font-semibold tabular-nums text-zinc-500 sm:text-[11px]">{i + 1}</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Hero: one chamber, three doors — flat card, no halo behind */}
      <div className="relative flex min-h-0 flex-1 flex-col justify-center sm:min-h-auto">
        <div className="relative mx-auto w-full max-w-[21rem] rounded-xl border border-zinc-700/90 bg-zinc-950 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:max-w-[22rem] sm:p-3.5">
          {/* Subtle chamber-cleared flash (opacity only — no box-shadow spill). */}
          {pulseCell != null &&
          !isTerminalRecap &&
          Number.isFinite(Number(pulseCell.chamberIndex)) &&
          pulseCell.chamberIndex !== cur ? (
            <div
              className={`pointer-events-none absolute inset-0 z-[2] rounded-xl bg-amber-400/10 ${styles.doorGlow}`}
              aria-hidden
            />
          ) : null}

          <div className="relative flex min-h-[118px] w-full justify-center sm:min-h-[136px]">
            <div className="flex items-stretch justify-center gap-5 sm:gap-6">
            {Array.from({ length: dMax }).map((_, door) => {
              const pulsing =
                pulseCell != null &&
                pulseCell.chamberIndex === cur &&
                pulseCell.door === door;
              const shaking = shakeCell?.chamberIndex === cur && shakeCell?.door === door;

              let recapLabel = null;
              if (isTerminalRecap && Array.isArray(trapDoors) && trapDoors.length > heroCh) {
                const t = Math.floor(Number(trapDoors[heroCh]));
                const pickedHere = pickDoorForChamber(doorHistory, heroCh);
                if (Number.isFinite(t)) {
                  if (fk === "trap" && heroCh === finalCh) {
                    if (door === t && lastDoor === door) recapLabel = "trap_opened";
                    else if (door === t) recapLabel = "trap";
                    else recapLabel = "safe";
                  } else if (fk === "full_clear" && pickedHere != null) {
                    if (door === pickedHere) recapLabel = "picked_safe";
                    else if (door === t) recapLabel = "trap";
                    else recapLabel = "safe";
                  } else if (fk === "cashout" && pickedHere != null) {
                    if (door === pickedHere) recapLabel = "picked_safe";
                    else if (door === t) recapLabel = "trap";
                    else recapLabel = "safe";
                  } else if (Number.isFinite(t)) {
                    if (door === t) recapLabel = "trap";
                    else recapLabel = "safe";
                  }
                }
              }

              const isCommittedHere = chamberPickCommitted && lockedDoor === door;
              const isDimmedUnpicked = chamberPickCommitted && lockedDoor !== door;
              const interactive = !isTerminalRecap && !disabled && !chamberPickCommitted;
              const doorBase =
                "relative flex h-full min-h-[110px] w-full flex-col items-stretch justify-between overflow-hidden rounded-lg border px-0 pb-2 pt-2 transition sm:min-h-[128px]";

              const stoneIdle =
                "border-zinc-600 bg-zinc-900/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";
              const stoneActive =
                interactive
                  ? "cursor-pointer border-zinc-500 hover:border-zinc-400 hover:bg-zinc-900 active:scale-[0.99]"
                  : "border-zinc-700 opacity-75";
              const stoneCommittedPick =
                "cursor-default border-amber-400/90 bg-amber-950/35 opacity-100 ring-2 ring-amber-500/50 shadow-[inset_0_1px_0_rgba(251,191,36,0.08)]";
              const stoneLockedOut =
                "cursor-not-allowed border-zinc-800 bg-zinc-950/80 opacity-[0.48] saturate-[0.65]";

              const recapTrap = recapLabel === "trap" || recapLabel === "trap_opened";
              const recapTrapOpened = recapLabel === "trap_opened";

              return (
                <div key={door} className="relative w-[4.35rem] shrink-0 sm:w-[4.85rem]">
                  <button
                    type="button"
                    disabled={!interactive}
                    onClick={() => interactive && onPickDoor?.(door)}
                    className={`${doorBase} ${stoneIdle} ${
                      isCommittedHere
                        ? stoneCommittedPick
                        : isDimmedUnpicked
                          ? stoneLockedOut
                          : !isTerminalRecap
                            ? stoneActive
                            : ""
                    } ${recapTrapOpened ? "border-red-500/80 bg-red-950/40" : ""} ${
                      recapTrap && !recapTrapOpened ? "border-red-900/50 bg-zinc-950" : ""
                    }`}
                  >
                    {/* Door silhouette: frame + inset panel + hinge strip */}
                    <div
                      className="absolute inset-x-1.5 top-2 bottom-[2.75rem] rounded border border-zinc-600/90 bg-zinc-950"
                      aria-hidden
                    />
                    <div
                      className="absolute bottom-[2.75rem] left-2 top-2 w-0.5 rounded-sm bg-zinc-800"
                      aria-hidden
                    />
                    <div
                      className="absolute right-[22%] top-[38%] h-2 w-2 -translate-y-1/2 rounded-full border border-zinc-600 bg-zinc-800"
                      aria-hidden
                    />
                    <div className="pointer-events-none absolute inset-x-1.5 top-2 bottom-[2.75rem] z-[1] flex items-end justify-center pb-[18%] sm:pb-[20%]">
                      <span className="text-xl font-semibold tabular-nums leading-none text-zinc-200 sm:text-2xl">
                        {door + 1}
                      </span>
                    </div>
                    <div className="relative z-[1] flex flex-1 flex-col items-center justify-end px-1">
                      <span className="mt-1 text-[9px] font-medium uppercase tracking-[0.14em] text-zinc-500 sm:text-[10px]">
                        Door
                      </span>
                    </div>

                    {isCommittedHere ? (
                      <span className="relative z-[1] mt-0.5 text-[8px] font-bold uppercase tracking-wide text-amber-200/95">
                        Your pick
                      </span>
                    ) : null}

                    {pulsing ? (
                      <div
                        className={`pointer-events-none absolute inset-0 rounded-lg bg-amber-400/12 ${styles.doorGlow}`}
                        aria-hidden
                      />
                    ) : null}
                    {shaking ? (
                      <>
                        <div
                          className={`pointer-events-none absolute inset-0 rounded-lg ${styles.doorShake}`}
                          aria-hidden
                        />
                        <div
                          className={`pointer-events-none absolute inset-0 rounded-lg bg-red-600/15 ${styles.crackPulse}`}
                          aria-hidden
                        />
                        <div
                          className="pointer-events-none absolute inset-x-1.5 top-2 bottom-11 opacity-50"
                          style={{
                            background:
                              "repeating-linear-gradient(135deg, transparent, transparent 7px, rgba(127,29,29,0.22) 7px, rgba(127,29,29,0.22) 8px)",
                          }}
                          aria-hidden
                        />
                      </>
                    ) : null}

                    {isTerminalRecap && recapTrapOpened ? (
                      <span className="relative z-[1] mt-1 text-lg" aria-label="Trap triggered">
                        ☠
                      </span>
                    ) : null}
                    {isTerminalRecap && recapLabel === "trap" && !recapTrapOpened ? (
                      <span className="relative z-[1] mt-1 text-xs font-bold uppercase tracking-wide text-red-300/70">
                        Trap
                      </span>
                    ) : null}
                    {isTerminalRecap && (recapLabel === "safe" || recapLabel === "picked_safe") ? (
                      <span className="relative z-[1] mt-1 text-base text-amber-200/90" aria-label="Safe passage">
                        ✦
                      </span>
                    ) : null}
                    {isTerminalRecap && recapLabel === "picked_safe" ? (
                      <span className="relative z-[1] mt-0.5 text-[8px] font-bold uppercase text-amber-300/80">
                        Your pick
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
