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
  const [betInput, setBetInput] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [actionLock, setActionLock] = useState(false);
  const [resultDismissedSeq, setResultDismissedSeq] = useState(0);
  const lastHandledSummaryRoundRef = useRef(null);
  const actionLockRef = useRef(false);
  const betLockRef = useRef(false);
  const sitLockRef = useRef(false);

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

  useEffect(() => {
    if (!roomId || !mySummary || !summaryDismissRound) return;
    if (lastHandledSummaryRoundRef.current !== summaryDismissRound) {
      lastHandledSummaryRoundRef.current = summaryDismissRound;
      try {
        const k = `ov2_c21_dismiss_${roomId}_${summaryDismissRound}`;
        setResultDismissedSeq(sessionStorage.getItem(k) === "1" ? summaryDismissRound : 0);
      } catch {
        setResultDismissedSeq(0);
      }
      return;
    }
    try {
      const k = `ov2_c21_dismiss_${roomId}_${summaryDismissRound}`;
      if (sessionStorage.getItem(k) === "1") setResultDismissedSeq(summaryDismissRound);
    } catch {
      /* ignore */
    }
  }, [roomId, mySummary, summaryDismissRound]);

  const showResultModal =
    Boolean(mySummary) &&
    summaryMatchesEngineRound &&
    (phase === "between_rounds" || phase === "betting") &&
    resultDismissedSeq !== summaryDismissRound;

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
    if (phase === "acting" && engine?.turnDeadline) {
      const tl = Math.max(0, Math.ceil((phaseEndsMs(engine.turnDeadline) - nowTick) / 1000));
      const si = engine?.currentTurn?.seatIndex;
      const seatBit = typeof si === "number" ? ` · Seat ${si + 1}` : "";
      return `Turn${seatBit} · ${tl}s / ${Math.round(OV2_C21_TURN_MS / 1000)}s`;
    }
    if (dur > 0) return `${phase.replace(/_/g, " ")} · ${left}s / ${dur}s`;
    return phase.replace(/_/g, " ");
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
      return "Spectating · open seat to play · no seat held (two missed min plays unseats)";
    }
    if (mySeat.inRound) {
      if (phase === "acting" && isMyTurn) return "Acting now · your hand · in this round";
      if (phase === "acting") return "In this round · waiting for another seat";
      if (phase === "insurance") return "In this round · side cover choice";
      if (phase === "betting") return "Seated · in this round · set play before lock";
      if (phase === "between_rounds") return "Seated · in this round · break before next lock";
      return "In this round";
    }
    return "Seated · not in this round · you join on next lock";
  }, [participantKey, mySeat, phase, isMyTurn]);

  const dealer = engine?.dealerHand || [];
  const dealerHidden = Boolean(engine?.dealerHidden);

  const submitBet = useCallback(async () => {
    if (betLockRef.current || operateBusy) return;
    betLockRef.current = true;
    try {
      const n = Math.floor(Number(String(betInput).replace(/\D/g, "")) || 0);
      await onOperate("set_bet", { amount: n });
    } finally {
      window.setTimeout(() => {
        betLockRef.current = false;
      }, 360);
    }
  }, [betInput, onOperate, operateBusy]);

  const applyQuickBet = useCallback(
    async units => {
      if (betLockRef.current || operateBusy) return;
      betLockRef.current = true;
      try {
        await onOperate("set_bet", { amount: Math.min(maxBet, minBet * units) });
      } finally {
        window.setTimeout(() => {
          betLockRef.current = false;
        }, 360);
      }
    },
    [maxBet, minBet, onOperate, operateBusy],
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
                <div className="text-[9px] text-zinc-500">Bet: {fmt(seat.intendedBet || 0)}</div>
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

      {/* Bet + actions */}
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden">
        {phase === "betting" && mySeat ? (
          <div className="shrink-0 rounded-lg border border-white/10 bg-black/25 p-2">
            <div className="text-[10px] text-zinc-400">
              Set play amount ({fmt(minBet)} – {fmt(maxBet)}). You can change it until time runs out.
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <input
                value={betInput}
                onChange={e => setBetInput(e.target.value)}
                inputMode="numeric"
                placeholder={String(minBet)}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/40 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={operateBusy || actionLock}
                onClick={() => void submitBet()}
                className="min-h-[40px] touch-manipulation rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-bold disabled:opacity-40"
              >
                Apply
              </button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {[1, 2, 5, 10].map(m => (
                <button
                  key={m}
                  type="button"
                  disabled={operateBusy || actionLock}
                  onClick={() => void applyQuickBet(m)}
                  className="min-h-[36px] touch-manipulation rounded border border-white/15 px-2 py-0.5 text-[10px] text-zinc-200"
                >
                  {fmt(minBet * m)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {phase === "acting" && isMyTurn ? (
          <div className="shrink-0 rounded-lg border border-sky-500/30 bg-sky-950/30 p-2">
            <div className="mb-1 text-center text-[11px] font-bold text-sky-200">Your move</div>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {[
                ["hit", "Draw", legal.hit],
                ["stand", "Stay", legal.stand],
                ["double", "Match stake", legal.double],
                ["split", "Split pair", legal.split],
                ["surrender", "Yield half", legal.surrender],
              ].map(([op, label, ok]) => (
                <button
                  key={op}
                  type="button"
                  disabled={operateBusy || actionLock || !ok}
                  onClick={guardAction(() => onOperate(op))}
                  className="min-h-[44px] touch-manipulation rounded-md bg-white/10 py-2 text-[10px] font-semibold disabled:opacity-35 active:scale-[0.98]"
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
            Auto-unseat: two consecutive rounds without meeting min play clears your seat (Tables does not vacate you).
          </span>
        </p>
      </div>

      {showInsuranceModal ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-xl">
            <div className="text-center text-sm font-bold text-white">Side cover offer</div>
            <p className="mt-2 text-center text-[11px] text-zinc-400">
              The house start card is an ace. You may take optional side cover for half of your main play.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceYes}
                onClick={guardAction(() => onOperate("insurance_yes"))}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl bg-amber-600 py-2 text-xs font-bold disabled:opacity-35"
              >
                Take cover
              </button>
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceNo}
                onClick={guardAction(() => onOperate("insurance_no"))}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl border border-white/20 py-2 text-xs font-bold disabled:opacity-35"
              >
                Decline
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center">
          <div className="max-h-[min(85dvh,32rem)] w-full max-w-md overflow-hidden rounded-2xl border border-white/15 bg-zinc-950 shadow-xl">
            <div className="border-b border-white/10 px-3 py-2 text-center text-sm font-bold text-white">
              Round result
            </div>
            <div className="max-h-[min(52dvh,18rem)] overflow-y-auto overscroll-y-contain px-3 py-3 text-sm">
              <div className="rounded-lg border border-emerald-500/25 bg-emerald-950/20 p-2">
                <div className="text-xs font-bold text-emerald-200/90">Your result</div>
                <div className="mt-1 text-lg font-black text-white">{mySummary.headline}</div>
                <div className="mt-1 text-xs text-zinc-300">
                  Net vault change this round:{" "}
                  <span className="font-semibold text-white">{fmt(mySummary.vaultDelta)}</span>
                </div>
                {mySummary.totalReturned > 0 ? (
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    Credited back this settle: <span className="font-mono text-zinc-200">{fmt(mySummary.totalReturned)}</span>
                    {mySummary.totalRisked > 0 ? (
                      <span className="text-zinc-500"> (risked {fmt(mySummary.totalRisked)})</span>
                    ) : null}
                  </div>
                ) : mySummary.totalRisked > 0 ? (
                  <div className="mt-0.5 text-[11px] text-zinc-400">
                    At risk this round: <span className="font-mono text-zinc-200">{fmt(mySummary.totalRisked)}</span>
                  </div>
                ) : null}
                {mySummary.resultShort ? (
                  <p className="mt-1 text-[11px] text-zinc-400">Outcome: {mySummary.resultShort}</p>
                ) : null}
                <ul className="mt-2 space-y-0.5 text-[11px] leading-snug text-zinc-300">
                  {mySummary.detailLines?.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>
              <div className="mt-3 rounded-lg border border-white/10 bg-black/25 p-2">
                <div className="text-[10px] font-bold uppercase tracking-wide text-zinc-500">
                  Other players (compact)
                </div>
                <ul className="mt-1.5 space-y-1.5">
                  {(mySummary.othersCompact || []).length === 0 ? (
                    <li className="text-[11px] text-zinc-500">No other active plays this round.</li>
                  ) : (
                    (mySummary.othersCompact || []).map(o => (
                      <li
                        key={o.seatIndex}
                        className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-0.5 border-b border-white/[0.06] pb-1.5 text-[11px] last:border-0 last:pb-0"
                      >
                        <span className="min-w-0 truncate text-zinc-200" title={`Seat ${o.seatIndex + 1} · ${o.name}`}>
                          S{o.seatIndex + 1} · {o.name}
                        </span>
                        <span className="shrink-0 text-right font-mono text-zinc-400">{o.status}</span>
                        <span className="col-span-2 min-w-0 break-words text-[10px] leading-snug text-zinc-500">
                          {o.resultShort || o.headline}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </div>
            <div className="border-t border-white/10 p-2">
              <button
                type="button"
                className="min-h-[44px] w-full touch-manipulation rounded-xl bg-white/10 py-2 text-sm font-bold"
                onClick={() => {
                  const rs = summaryDismissRound;
                  try {
                    if (roomId) sessionStorage.setItem(`ov2_c21_dismiss_${roomId}_${rs}`, "1");
                  } catch {
                    /* ignore */
                  }
                  setResultDismissedSeq(rs);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
