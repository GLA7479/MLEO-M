"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatCardShort, handTotal } from "../../../lib/solo-v2/challenge21HandMath";
import {
  OV2_C21_BETTING_MS,
  OV2_C21_BETWEEN_MS,
  OV2_C21_INSURANCE_MS,
  OV2_C21_TURN_MS,
} from "../../../lib/online-v2/c21/ov2C21ClientConstants";
import { getOv2C21LegalFlags } from "../../../lib/online-v2/c21/ov2C21LegalMoves";

const SEAT_RING = ["ring-emerald-400", "ring-sky-400", "ring-violet-400", "ring-fuchsia-400", "ring-amber-400", "ring-slate-400"];

function fmt(n) {
  const x = Math.floor(Number(n) || 0);
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
  return String(x);
}

function phaseEndsMs(v) {
  if (v == null) return 0;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const p = Date.parse(String(v));
  return Number.isFinite(p) ? p : 0;
}

function secsLeft(phaseEndsAt) {
  const t = phaseEndsMs(phaseEndsAt);
  if (!t) return 0;
  return Math.max(0, Math.ceil((t - Date.now()) / 1000));
}

function phaseDurationMs(phase) {
  if (phase === "betting") return OV2_C21_BETTING_MS;
  if (phase === "insurance") return OV2_C21_INSURANCE_MS;
  if (phase === "acting") return OV2_C21_TURN_MS;
  if (phase === "between_rounds") return OV2_C21_BETWEEN_MS;
  return 0;
}

/** Visible phase label (internal `phase` stays server-shaped). */
function phaseDisplayLabel(phase) {
  if (phase === "betting") return "Play window";
  if (phase === "between_rounds") return "Reveal";
  if (phase === "insurance") return "Side cover";
  if (phase === "acting") return "Play";
  return String(phase || "").replace(/_/g, " ") || "—";
}

function CardFace({ code, small }) {
  if (!code) return <span className="text-white/40">—</span>;
  const s = formatCardShort(code);
  const cls = small ? "min-w-[2.1rem] px-1 py-0.5 text-[10px]" : "min-w-[2.35rem] px-1.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-md border border-white/25 bg-black/50 font-bold text-white ${cls}`}
    >
      {s}
    </span>
  );
}

export default function Ov2C21Screen({
  roomId,
  engine,
  tableStakeUnits,
  participantKey,
  displayName,
  onOperate,
  operateBusy,
}) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [actionLock, setActionLock] = useState(false);
  const [resultToastOpen, setResultToastOpen] = useState(false);
  const lastToastRoundRef = useRef(null);
  const resultToastTimerRef = useRef(null);
  const actionLockRef = useRef(false);
  const betLockRef = useRef(false);
  const sitLockRef = useRef(false);
  const engineRef = useRef(engine);
  engineRef.current = engine;

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const phase = engine?.phase || "betting";

  useEffect(() => {
    actionLockRef.current = false;
    setActionLock(false);
  }, [phase]);
  const minBet = Math.max(100, Math.floor(Number(tableStakeUnits) || 100));
  const maxBet = Math.min(minBet * 200, 10_000_000);

  const seatsForUi = useMemo(() => {
    const raw = engine?.seats;
    if (Array.isArray(raw) && raw.length === 6) return raw;
    return Array.from({ length: 6 }, (_, i) => ({
      seatIndex: i,
      participantKey: null,
      displayName: null,
      inRound: false,
      roundBet: 0,
      intendedBet: 0,
      hands: [],
    }));
  }, [engine?.seats]);

  const mySeat = useMemo(() => {
    if (!participantKey) return null;
    return seatsForUi.find(s => s.participantKey === participantKey) || null;
  }, [seatsForUi, participantKey]);

  const mySummary = engine?.lastRoundSummaries?.byParticipantKey?.[participantKey] || null;

  const summaryDismissRound = useMemo(() => {
    const sr = Math.floor(Number(mySummary?.settledRoundSeq) || 0);
    const er = Math.floor(Number(engine?.roundSeq) || 0);
    return sr > 0 ? sr : er;
  }, [mySummary?.settledRoundSeq, engine?.roundSeq]);

  const summaryMatchesEngineRound = useMemo(() => {
    if (!mySummary) return false;
    const sr = Math.floor(Number(mySummary.settledRoundSeq) || 0);
    const er = Math.floor(Number(engine?.roundSeq) || 0);
    if (sr <= 0) return true;
    return sr === er;
  }, [mySummary, engine?.roundSeq]);

  const shouldShowResultToast =
    Boolean(mySummary) &&
    summaryMatchesEngineRound &&
    phase === "between_rounds" &&
    Boolean(participantKey);

  useEffect(() => {
    if (!shouldShowResultToast || !roomId || !summaryDismissRound) {
      setResultToastOpen(false);
      return undefined;
    }
    try {
      const storageKey = `ov2_c21_rt_${roomId}_${summaryDismissRound}`;
      if (sessionStorage.getItem(storageKey) === "1") {
        lastToastRoundRef.current = summaryDismissRound;
        return undefined;
      }
    } catch {
      /* ignore */
    }
    if (lastToastRoundRef.current === summaryDismissRound) return undefined;
    lastToastRoundRef.current = summaryDismissRound;
    setResultToastOpen(true);
    if (resultToastTimerRef.current) window.clearTimeout(resultToastTimerRef.current);
    resultToastTimerRef.current = window.setTimeout(() => {
      setResultToastOpen(false);
      try {
        if (roomId) sessionStorage.setItem(`ov2_c21_rt_${roomId}_${summaryDismissRound}`, "1");
      } catch {
        /* ignore */
      }
      resultToastTimerRef.current = null;
    }, 2000);
    return () => {
      if (resultToastTimerRef.current) {
        window.clearTimeout(resultToastTimerRef.current);
        resultToastTimerRef.current = null;
      }
    };
  }, [shouldShowResultToast, roomId, summaryDismissRound]);

  const guardAction = useCallback(
    fn => async () => {
      if (actionLockRef.current || operateBusy) return;
      actionLockRef.current = true;
      setActionLock(true);
      try {
        await fn();
      } finally {
        window.setTimeout(() => {
          actionLockRef.current = false;
          setActionLock(false);
        }, 520);
      }
    },
    [operateBusy],
  );

  const timerLabel = useMemo(() => {
    const left = secsLeft(engine?.phaseEndsAt);
    const dur = phaseDurationMs(phase) / 1000;
    const label = phaseDisplayLabel(phase);
    if (phase === "acting" && engine?.turnDeadline) {
      const tl = Math.max(0, Math.ceil((phaseEndsMs(engine.turnDeadline) - nowTick) / 1000));
      const si = engine?.currentTurn?.seatIndex;
      const seatBit = typeof si === "number" ? ` · Seat ${si + 1}` : "";
      return `Turn${seatBit} · ${tl}s / ${Math.round(OV2_C21_TURN_MS / 1000)}s`;
    }
    if (dur > 0) return `${label} · ${left}s / ${dur}s`;
    return label;
  }, [engine, phase, nowTick]);

  const currentTurn = engine?.currentTurn;
  const isMyTurn =
    currentTurn != null &&
    mySeat &&
    currentTurn.seatIndex === mySeat.seatIndex &&
    phase === "acting";

  const legal = useMemo(
    () => getOv2C21LegalFlags({ phase, engine, participantKey }),
    [phase, engine, participantKey],
  );

  const showInsuranceModal = Boolean(legal.insuranceYes || legal.insuranceNo);

  const roleLabel = useMemo(() => {
    if (!participantKey) return "";
    if (!mySeat) {
      return "Spectating · open seat to play · no seat held (two missed table minimum plays unseats)";
    }
    if (mySeat.inRound) {
      if (phase === "acting" && isMyTurn) return "Acting now · your hand · in this round";
      if (phase === "acting") return "In this round · waiting for another seat";
      if (phase === "insurance") return "In this round · side cover choice";
      if (phase === "betting") return "Seated · in this round · choose play before lock";
      if (phase === "between_rounds") return "Seated · in this round · reveal (cards stay until next play window)";
      return "In this round";
    }
    return "Seated · not in this round · you join on next lock";
  }, [participantKey, mySeat, phase, isMyTurn]);

  const dealer = engine?.dealerHand || [];
  const dealerHidden = Boolean(engine?.dealerHidden);

  const playAmountOptions = useMemo(() => {
    const mults = [1, 2, 5, 10];
    const amounts = mults.map(m => Math.min(maxBet, minBet * m));
    return [...new Set(amounts)];
  }, [maxBet, minBet]);

  const applyQuickBet = useCallback(
    async amount => {
      const e = engineRef.current;
      if (e?.phase !== "betting" || betLockRef.current || operateBusy) return;
      const n = Math.max(0, Math.floor(Number(amount) || 0));
      if (n < minBet || n > maxBet) return;
      if (!playAmountOptions.includes(n)) return;
      betLockRef.current = true;
      try {
        await onOperate("set_bet", { amount: n });
      } finally {
        window.setTimeout(() => {
          betLockRef.current = false;
        }, 380);
      }
    },
    [maxBet, minBet, onOperate, operateBusy, playAmountOptions],
  );

  const trySit = useCallback(
    idx => {
      if (sitLockRef.current || operateBusy) return;
      sitLockRef.current = true;
      void onOperate("sit", { seatIndex: idx, displayName: displayName || "Guest" }).finally(() => {
        window.setTimeout(() => {
          sitLockRef.current = false;
        }, 450);
      });
    },
    [displayName, onOperate, operateBusy],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-hidden text-white">
      <div className="shrink-0 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-center text-[11px] text-zinc-300">
        {roleLabel ? <div className="mb-0.5 text-[10px] leading-tight text-zinc-400">{roleLabel}</div> : null}
        <div className="font-semibold text-emerald-200/90">{timerLabel}</div>
        {mySeat ? (
          <div className="mt-0.5 text-[9px] text-zinc-500">
            Table min play {fmt(minBet)}
            {mySeat.inRound ? " · committed this round" : " · not in this round yet"}
          </div>
        ) : (
          <div className="mt-0.5 text-[9px] text-zinc-500">You are not seated on this table.</div>
        )}
      </div>

      {/* Dealer */}
      <div className="shrink-0 rounded-xl border border-amber-900/40 bg-gradient-to-b from-zinc-900/90 to-black/60 px-2 py-2">
        <div className="text-center text-[10px] font-bold uppercase tracking-wide text-amber-200/80">House</div>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1">
          {dealer.length === 0 ? (
            <span className="text-xs text-white/50">—</span>
          ) : (
            dealer.map((c, i) => (
              <CardFace key={`d${i}`} code={dealerHidden && i === 1 ? null : c} small />
            ))
          )}
        </div>
        {!dealerHidden && dealer.length > 0 ? (
          <div className="mt-1 text-center text-[10px] text-zinc-400">Total {handTotal(dealer)}</div>
        ) : null}
      </div>

      {/* Seats */}
      <div className="grid min-h-0 shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-6">
        {seatsForUi.map((seat, idx) => {
          const taken = Boolean(seat.participantKey);
          const mine = seat.participantKey === participantKey;
          const ring = SEAT_RING[idx % SEAT_RING.length];
          const isActingSeat = phase === "acting" && currentTurn?.seatIndex === idx;
          const actingHere = isActingSeat ? `ring-2 ring-sky-400 ring-offset-1 ring-offset-black/80` : "";
          const mineRing = mine ? `ring-2 ${ring} ring-offset-1 ring-offset-black/80` : "";
          return (
            <button
              key={idx}
              type="button"
              disabled={operateBusy || (taken && !mine)}
              onClick={() => {
                if (!taken) trySit(idx);
              }}
              className={`flex min-h-[4.5rem] touch-manipulation flex-col rounded-lg border border-white/10 bg-black/35 px-1 py-1 text-left text-[10px] transition ${mineRing} ${actingHere} disabled:opacity-40`}
            >
              <div className="font-bold text-zinc-400">
                Seat {idx + 1}
                {mine ? <span className="ml-0.5 font-semibold text-emerald-300/90">· You</span> : null}
                {isActingSeat ? <span className="ml-0.5 font-semibold text-sky-300/90">· Turn</span> : null}
              </div>
              <div className="line-clamp-2 min-h-[2rem] text-[11px] text-white">
                {taken ? seat.displayName || "…" : "Open"}
              </div>
              {seat.inRound && seat.roundBet > 0 ? (
                <div className="text-emerald-300/90">Play {fmt(seat.roundBet)}</div>
              ) : null}
              {phase === "betting" && mine ? (
                <div className="text-[9px] text-zinc-500">Chosen play: {fmt(seat.intendedBet || 0)}</div>
              ) : null}
              {seat.hands?.length ? (
                <div className="mt-0.5 space-y-0.5">
                  {seat.hands.map((h, hi) => (
                    <div key={hi} className="flex flex-wrap gap-0.5">
                      {(h || []).map((c, ci) => (
                        <CardFace key={ci} code={c} small />
                      ))}
                    </div>
                  ))}
                </div>
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Play window + actions */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {phase === "betting" && mySeat ? (
          <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 p-2">
            <div className="text-[10px] text-zinc-400">
              Choose play amount (tap one). You can change until the play window ends.
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {playAmountOptions.map(amt => {
                const chosen = Math.floor(Number(mySeat.intendedBet) || 0) === amt;
                return (
                  <button
                    key={amt}
                    type="button"
                    disabled={operateBusy || actionLock || phase !== "betting"}
                    onClick={() => void applyQuickBet(amt)}
                    className={`min-h-[40px] min-w-[3.25rem] touch-manipulation rounded-lg border px-2 py-1.5 text-[11px] font-bold disabled:opacity-35 ${
                      chosen
                        ? "border-emerald-400/80 bg-emerald-900/50 text-emerald-100"
                        : "border-white/15 bg-black/40 text-zinc-200"
                    }`}
                  >
                    {fmt(amt)}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {phase === "acting" && isMyTurn ? (
          <div className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-950/30 p-2">
            <div className="mb-1 text-center text-[11px] font-bold text-sky-200">Your move</div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {[
                ["hit", "HIT", legal.hit],
                ["stand", "STAND", legal.stand],
                ["double", "DOUBLE", legal.double],
                ["split", "SPLIT", legal.split],
                ["surrender", "SURRENDER", legal.surrender],
              ].map(([op, label, ok]) => (
                <button
                  key={op}
                  type="button"
                  disabled={operateBusy || actionLock || !ok || phase !== "acting" || !isMyTurn}
                  onClick={guardAction(async () => {
                    const e = engineRef.current;
                    const ct = e?.currentTurn;
                    const ms = e?.seats?.find(s => s.participantKey === participantKey);
                    if (e?.phase !== "acting" || !ms || ct?.seatIndex !== ms.seatIndex) return;
                    await onOperate(op);
                  })}
                  className="min-h-[44px] touch-manipulation rounded-md bg-white/10 py-2 text-[10px] font-bold tracking-wide disabled:opacity-35 active:scale-[0.98]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* Bottom panel */}
      <div className="max-h-[min(30vh,9rem)] shrink-0 overflow-y-auto overscroll-y-contain rounded-lg border border-white/10 bg-black/30 p-2 text-[10px] text-zinc-400">
        <div className="font-semibold text-zinc-300">Table</div>
        <p className="mt-1 leading-snug">
          Persistent live table · six seats · spectate anytime. Vault moves only after server confirmation.{" "}
          <span className="text-zinc-500">
            Auto-unseat: two consecutive rounds without meeting table minimum play clears your seat (Tables does not vacate
            you).
          </span>
        </p>
      </div>

      {showInsuranceModal ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center pointer-events-auto">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-xl">
            <div className="text-center text-sm font-bold text-white">Side cover</div>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              The house start card is an ace. Optional cover is up to half of your main play.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceYes || phase !== "insurance"}
                onClick={guardAction(async () => {
                  if (engineRef.current?.phase !== "insurance") return;
                  await onOperate("insurance_yes");
                })}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl bg-amber-600 py-2 text-xs font-bold tracking-wide disabled:opacity-35"
              >
                INSURANCE
              </button>
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceNo || phase !== "insurance"}
                onClick={guardAction(async () => {
                  if (engineRef.current?.phase !== "insurance") return;
                  await onOperate("insurance_no");
                })}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl border border-white/20 py-2 text-xs font-bold disabled:opacity-35"
              >
                DECLINE
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {resultToastOpen && mySummary ? (
        <div className="pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom,0px))] left-2 right-2 z-30 mx-auto max-w-lg">
          <div className="rounded-xl border border-emerald-500/35 bg-zinc-950/95 px-3 py-2 shadow-lg backdrop-blur-sm">
            <div className="text-center text-[10px] font-bold uppercase tracking-wide text-emerald-300/90">Round result</div>
            <div className="mt-0.5 text-center text-sm font-black text-white">{mySummary.headline}</div>
            <div className="mt-0.5 text-center text-[11px] text-zinc-300">
              Net vault · <span className="font-semibold text-white">{fmt(mySummary.vaultDelta)}</span>
              {mySummary.totalReturned > 0 ? (
                <span className="text-zinc-500">
                  {" "}
                  · back {fmt(mySummary.totalReturned)}
                  {mySummary.totalRisked > 0 ? ` · in play ${fmt(mySummary.totalRisked)}` : ""}
                </span>
              ) : mySummary.totalRisked > 0 ? (
                <span className="text-zinc-500"> · in play {fmt(mySummary.totalRisked)}</span>
              ) : null}
            </div>
            {mySummary.resultShort ? (
              <div className="mt-0.5 text-center text-[10px] text-zinc-500">{mySummary.resultShort}</div>
            ) : null}
            {(mySummary.othersCompact || []).length > 0 ? (
              <div className="mt-1 border-t border-white/10 pt-1 text-[9px] leading-tight text-zinc-500">
                {(mySummary.othersCompact || [])
                  .slice(0, 4)
                  .map(o => `S${o.seatIndex + 1} ${o.status}`)
                  .join(" · ")}
                {(mySummary.othersCompact || []).length > 4 ? "…" : ""}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
