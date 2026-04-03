"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isOv2CcHandBettingLive } from "../../../lib/online-v2/community_cards/ov2CcClientConstants";
import Ov2CcPlayingCard from "./Ov2CcPlayingCard";

export default function Ov2CcScreen({
  roomId,
  engine,
  viewerHoleCards = [],
  tableConfig,
  participantKey,
  displayName,
  onOperate,
  operateBusy,
  operateSubmitStatus = "idle",
  loadError,
}) {
  const minBuy = tableConfig?.tablePrice ?? 100;
  const maxBuy = tableConfig?.maxBuyin ?? minBuy * 10;
  const [buyInDraft, setBuyInDraft] = useState(String(minBuy));
  const [topUpDraft, setTopUpDraft] = useState("");
  const [pickSeat, setPickSeat] = useState(null);
  const [formHint, setFormHint] = useState("");
  const [actionHint, setActionHint] = useState("");
  const [betweenTick, setBetweenTick] = useState(0);
  const prevHandSeqRef = useRef(null);

  useEffect(() => {
    setBuyInDraft(String(minBuy));
  }, [minBuy]);

  const mySeat = useMemo(() => {
    if (!Array.isArray(engine?.seats) || !participantKey) return null;
    return engine.seats.find(s => s.participantKey === participantKey) || null;
  }, [engine, participantKey]);

  const toCall = useMemo(() => {
    if (!mySeat || !engine) return 0;
    const cur = Math.floor(Number(engine.currentBet) || 0);
    const street = Math.floor(Number(mySeat.streetContrib) || 0);
    const chips = cur - street;
    if (!Number.isFinite(chips)) return 0;
    return Math.max(0, chips);
  }, [mySeat, engine]);

  const canCallChips = toCall > 0;

  const handBettingLive = useMemo(() => isOv2CcHandBettingLive(engine), [engine]);

  const canAct = Boolean(
    handBettingLive &&
      mySeat &&
      engine.actionSeat === mySeat.seatIndex &&
      mySeat.inCurrentHand &&
      !mySeat.folded &&
      !mySeat.allIn,
  );

  const [clock, setClock] = useState(0);

  useEffect(() => {
    if (!engine?.actionDeadline) return undefined;
    const id = window.setInterval(() => setClock(c => c + 1), 500);
    return () => window.clearInterval(id);
  }, [engine?.actionDeadline]);

  const turnSecondsLeft = useMemo(() => {
    if (!canAct || !engine?.actionDeadline) return null;
    void clock;
    return Math.max(0, Math.ceil((Number(engine.actionDeadline) - Date.now()) / 1000));
  }, [canAct, engine?.actionDeadline, clock]);

  const doOp = useCallback(async (op, payload = {}) => onOperate(op, payload), [onOperate]);

  const actionClusterLocked = operateBusy;

  const runGameOp = useCallback(
    async (op, payload = {}) => {
      setActionHint("");
      const r = await onOperate(op, payload);
      if (r?.skipped) return r;
      if (!r?.ok) {
        setActionHint(
          String(r?.code || r?.json?.code || r?.error?.payload?.code || r?.error?.message || "rejected"),
        );
      }
      return r;
    },
    [onOperate],
  );

  useEffect(() => {
    if (!engine) return;
    const hs = Math.floor(Number(engine.handSeq) || 0);
    if (prevHandSeqRef.current != null && hs !== prevHandSeqRef.current) {
      setActionHint("");
      setTopUpDraft("");
    }
    prevHandSeqRef.current = hs;
  }, [engine]);

  useEffect(() => {
    if (!engine) return;
    if (engine.phase === "between_hands" || engine.phase === "idle") {
      setActionHint("");
    }
  }, [engine?.phase]);

  useEffect(() => {
    if (!engine || engine.phase !== "between_hands" || typeof engine.phaseEndsAt !== "number") return undefined;
    const id = window.setInterval(() => setBetweenTick(c => c + 1), 500);
    return () => window.clearInterval(id);
  }, [engine?.phase, engine?.phaseEndsAt]);

  if (!engine) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-zinc-500">
        {loadError ? `Load error: ${loadError}` : "Loading table…"}
      </div>
    );
  }

  const { maxSeats, pot, communityCards, phase, currentBet, sb, bb } = engine;
  const street = engine.street;
  const betweenHands = phase === "idle" || phase === "between_hands";
  const seats = Array.isArray(engine.seats) ? engine.seats : [];
  const phaseLabel =
    phase === "between_hands"
      ? "Between hands"
      : phase === "showdown"
        ? "Showdown"
        : phase === "idle"
          ? "Idle"
          : street
            ? String(street).replace(/^./, c => c.toUpperCase())
            : String(phase);
  const handSeqN = Math.floor(Number(engine.handSeq) || 0);
  const likelyBoardRunout =
    handBettingLive && engine.actionSeat == null && Math.floor(Number(pot) || 0) > 0;
  void betweenTick;
  const nextHandInSec =
    phase === "between_hands" && typeof engine.phaseEndsAt === "number"
      ? Math.max(0, Math.ceil((Number(engine.phaseEndsAt) - Date.now()) / 1000))
      : null;

  const curBet = Math.floor(Number(currentBet) || 0);
  const minR = Math.floor(Number(engine.minRaise) || bb);
  const myStreet = Math.floor(Number(mySeat?.streetContrib) || 0);
  const stackFloor = Math.floor(Number(mySeat?.stack) || 0);
  const minTotalTarget = curBet + (toCall > 0 ? minR : bb);
  const minRaiseChips = Math.max(0, minTotalTarget - myStreet);
  const canOpenBet = curBet === 0 && toCall === 0;
  const canBetOpen = Boolean(canAct && canOpenBet && stackFloor >= bb);
  const canMinRaiseBtn = Boolean(canAct && !canOpenBet && minRaiseChips > 0 && minRaiseChips <= stackFloor);
  const quickBump = Math.max(minRaiseChips, bb * 2);
  const quickAmount = Math.min(quickBump, stackFloor);
  const canQuickBumpBtn = Boolean(
    canAct &&
      quickAmount > 0 &&
      (canOpenBet ? quickAmount >= bb : quickAmount >= minRaiseChips || quickAmount >= stackFloor),
  );

  const seatButtonClass = (s, i) => {
    const isYou = s.participantKey === participantKey;
    const isAct = engine.actionSeat === i;
    const occupied = Boolean(s.participantKey);
    const folded = occupied && s.folded;
    const allIn = occupied && s.allIn && !s.folded;
    const sitOut = occupied && s.sitOut;
    const base =
      "flex min-h-[56px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition touch-manipulation sm:min-h-[60px] sm:rounded-2xl sm:px-1.5 sm:py-2";
    if (!occupied) {
      return `${base} border-dashed border-emerald-600/35 bg-emerald-950/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] hover:border-emerald-500/45 hover:bg-emerald-950/25`;
    }
    let state = "border-white/[0.12] bg-black/35 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_14px_rgba(0,0,0,0.35)]";
    if (folded) state = "border-white/[0.08] bg-black/25 opacity-[0.42] grayscale-[0.35]";
    else if (sitOut) state = "border-zinc-600/25 bg-zinc-950/40 opacity-80";
    else if (allIn) state = "border-amber-600/35 bg-amber-950/20 shadow-[inset_0_0_0_1px_rgba(245,158,11,0.12)]";
    let turn = "";
    if (isAct && handBettingLive && !folded) {
      turn = "ring-2 ring-amber-400/45 ring-offset-2 ring-offset-[#0a1810] shadow-[0_0_0_1px_rgba(251,191,36,0.2),0_8px_24px_rgba(0,0,0,0.45)]";
    } else if (isYou) {
      turn = "ring-1 ring-sky-400/40 ring-offset-1 ring-offset-[#0a1810]";
    }
    return `${base} ${state} ${turn}`;
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden bg-[#060a0c] text-zinc-100">
      <p className="shrink-0 text-center text-[10px] font-medium tracking-wide text-zinc-500">
        {maxSeats}-max · min {minBuy.toLocaleString?.() ?? minBuy} · max {maxBuy.toLocaleString?.() ?? maxBuy} ·{" "}
        {sb}/{bb} blinds
      </p>

      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-2 lg:max-w-5xl lg:gap-3">
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-black/50 shadow-[0_16px_48px_rgba(0,0,0,0.65),inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-[2.25rem]"
          style={{
            background:
              "radial-gradient(ellipse 92% 72% at 50% 38%, #166534 0%, #0f4d28 38%, #0a3020 72%, #051910 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-90"
            style={{
              background:
                "radial-gradient(ellipse 70% 45% at 50% 35%, rgba(255,255,255,0.07) 0%, transparent 55%)",
            }}
          />
          <div className="pointer-events-none absolute inset-[5px] rounded-[1.55rem] border border-black/20 sm:inset-2 sm:rounded-[2.05rem]" />
          <div className="pointer-events-none absolute inset-x-4 top-3 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent sm:inset-x-8" />

          <div className="relative z-[1] shrink-0 px-2 pb-1 pt-3 sm:px-4 sm:pb-2 sm:pt-4">
            <div className="grid grid-cols-5 gap-1.5 sm:grid-cols-9 sm:gap-2">
              {seats.length === 0 ? (
                <div className="col-span-full rounded-xl border border-white/10 bg-black/25 px-3 py-4 text-center text-[11px] text-zinc-400">
                  Seat layout not available yet. If this stays empty, run the Community Cards SQL migration and refresh.
                </div>
              ) : (
                seats.map((s, i) => {
                  const isYou = s.participantKey === participantKey;
                  const isAct = engine.actionSeat === i;
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={operateBusy || Boolean(s.participantKey)}
                      onClick={() => {
                        if (!s.participantKey) {
                          setFormHint("");
                          setPickSeat(i);
                        }
                      }}
                      className={`${seatButtonClass(s, i)} disabled:cursor-not-allowed disabled:opacity-55`}
                    >
                      <span className="text-[8px] font-bold uppercase tracking-wider text-zinc-500 sm:text-[9px]">
                        Seat {i + 1}
                      </span>
                      <div className="flex flex-wrap items-center justify-center gap-x-1 gap-y-0">
                        {engine.buttonSeat === i ? (
                          <span className="rounded bg-amber-500/25 px-1 py-px text-[7px] font-bold text-amber-200">
                            D
                          </span>
                        ) : null}
                        {engine.sbSeat === i ? (
                          <span className="rounded bg-zinc-500/20 px-1 py-px text-[7px] font-bold text-zinc-300">
                            SB
                          </span>
                        ) : null}
                        {engine.bbSeat === i ? (
                          <span className="rounded bg-zinc-400/20 px-1 py-px text-[7px] font-bold text-zinc-200">
                            BB
                          </span>
                        ) : null}
                      </div>
                      {s.participantKey ? (
                        <>
                          <span className="max-w-full truncate px-0.5 text-[9px] font-semibold text-zinc-100 sm:text-[10px]">
                            {isYou ? "You" : s.displayName || "…"}
                          </span>
                          <span className="font-mono text-[10px] font-bold tabular-nums text-emerald-100/95 sm:text-[11px]">
                            {Math.floor(s.stack || 0)}
                          </span>
                          {s.allIn && !s.folded ? (
                            <span className="text-[7px] font-bold uppercase tracking-wide text-amber-300/95">
                              All-in
                            </span>
                          ) : null}
                          {s.waitBb && !s.inCurrentHand ? (
                            <span className="text-[7px] font-semibold text-amber-200/90">Wait BB</span>
                          ) : null}
                          {s.pendingSitOutAfterHand ? (
                            <span className="text-[7px] text-amber-300/85">Sit out next</span>
                          ) : null}
                          {s.sitOut ? <span className="text-[7px] text-zinc-500">Sitting out</span> : null}
                          {s.folded ? (
                            <span className="text-[7px] font-semibold uppercase tracking-wide text-rose-300/90">
                              Folded
                            </span>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-[9px] font-semibold text-emerald-300/85">Open</span>
                      )}
                      {isAct && handBettingLive && s.participantKey && !s.folded ? (
                        <span className="text-[7px] font-bold uppercase tracking-widest text-amber-200/90">
                          Acts
                        </span>
                      ) : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto overflow-x-hidden px-3 pb-4 pt-1 [-webkit-overflow-scrolling:touch] sm:gap-4 sm:px-6 sm:pb-6">
            <div className="w-full max-w-md text-center">
              <p className="text-[11px] font-medium text-emerald-100/75 sm:text-xs">
                <span className="text-white">{phaseLabel}</span>
                {handSeqN > 0 ? (
                  <span className="text-emerald-200/60">
                    {" "}
                    · Hand <span className="tabular-nums text-emerald-100/90">{handSeqN}</span>
                  </span>
                ) : null}
                {currentBet > 0 ? (
                  <span className="text-emerald-200/50">
                    {" "}
                    · Bet <span className="tabular-nums text-emerald-100/80">{currentBet}</span>
                  </span>
                ) : null}
              </p>
              {engine.buttonSeat != null && engine.sbSeat != null && engine.bbSeat != null ? (
                <p className="mt-1 text-[10px] text-emerald-200/45">
                  BTN {engine.buttonSeat + 1} · SB {engine.sbSeat + 1} · BB {engine.bbSeat + 1}
                </p>
              ) : null}
              {phase === "between_hands" && nextHandInSec != null ? (
                <p className="mt-1 text-[10px] font-medium text-amber-200/85">Next hand ~{nextHandInSec}s</p>
              ) : null}
              {engine.tableNotice ? (
                <p className="mt-1 text-[10px] text-amber-200/80">{engine.tableNotice}</p>
              ) : null}
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-semibold uppercase tracking-[0.2em] text-emerald-200/50">Pot</span>
              <div className="rounded-2xl border border-black/30 bg-black/40 px-6 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_8px_24px_rgba(0,0,0,0.4)] sm:px-8 sm:py-2.5">
                <span className="font-mono text-xl font-bold tabular-nums tracking-tight text-amber-100 sm:text-2xl">
                  {Math.floor(pot || 0).toLocaleString?.() ?? Math.floor(pot || 0)}
                </span>
              </div>
            </div>

            {canAct && turnSecondsLeft != null ? (
              <div className="rounded-full border border-amber-500/30 bg-black/35 px-4 py-1.5 text-xs font-semibold text-amber-100 shadow-[0_4px_16px_rgba(0,0,0,0.35)]">
                Your turn · <span className="tabular-nums">{turnSecondsLeft}</span>s
              </div>
            ) : handBettingLive && engine.actionSeat != null ? (
              <p className="text-center text-[10px] text-emerald-200/50">
                Seat {engine.actionSeat + 1} to act
                {engine.actionDeadline
                  ? ` · ${Math.max(0, Math.ceil((Number(engine.actionDeadline) - Date.now()) / 1000))}s`
                  : ""}
              </p>
            ) : likelyBoardRunout ? (
              <p className="text-center text-[10px] font-medium text-emerald-200/55">All-in runout — board dealing</p>
            ) : null}

            <div className="flex min-h-[52px] flex-wrap items-center justify-center gap-2 sm:min-h-[56px] sm:gap-2.5">
              {(communityCards || []).length ? (
                (communityCards || []).map((c, idx) => (
                  <Ov2CcPlayingCard key={`${c}-${idx}`} code={c} size="lg" className="sm:scale-105" />
                ))
              ) : (
                <div className="flex h-[3.25rem] items-center sm:h-[3.5rem]">
                  <span className="text-[11px] font-medium text-emerald-200/35">Board</span>
                </div>
              )}
            </div>

            {engine.winnersDisplay?.seats?.length ? (
              <div className="max-w-sm rounded-xl border border-emerald-500/25 bg-black/30 px-3 py-2 text-center text-[11px] text-emerald-200/95 shadow-inner">
                <p className="font-semibold text-emerald-100">
                  Winner{engine.winnersDisplay.seats.length > 1 ? "s" : ""} · seat{" "}
                  {engine.winnersDisplay.seats.map(x => x + 1).join(", ")}
                </p>
                {engine.winnersDisplay.stacksWon && typeof engine.winnersDisplay.stacksWon === "object" ? (
                  <p className="mt-1 text-[10px] text-emerald-200/75">
                    {Object.entries(engine.winnersDisplay.stacksWon)
                      .map(([si, amt]) => `S${Number(si) + 1} +${amt}`)
                      .join(" · ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#0c1216] px-3 py-3 shadow-[0_8px_28px_rgba(0,0,0,0.45)] sm:px-4">
          <p className="text-center text-[9px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Your stack</p>
          {mySeat ? (
            <div className="mt-2 space-y-3">
              <p className="text-center font-mono text-xl font-bold tabular-nums text-white sm:text-2xl">
                {Math.floor(mySeat.stack || 0).toLocaleString?.() ?? Math.floor(mySeat.stack || 0)}
              </p>
              <div className="flex min-h-[44px] flex-wrap items-center justify-center gap-2">
                {(viewerHoleCards?.length ? viewerHoleCards : mySeat.holeCards || []).map((c, idx) => (
                  <Ov2CcPlayingCard key={`h-${idx}`} code={c} size="md" />
                ))}
              </div>
              <div className="flex flex-col gap-2">
                {betweenHands ? (
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/45 px-3 py-2 text-xs text-white placeholder:text-zinc-600"
                      value={topUpDraft}
                      onChange={e => setTopUpDraft(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder={`Top-up (max +${maxBuy - Math.floor(mySeat.stack || 0)})`}
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      disabled={operateBusy}
                      className="min-h-[44px] shrink-0 rounded-xl border border-emerald-600/40 bg-emerald-950/50 px-4 text-xs font-bold text-emerald-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
                      onClick={async () => {
                        setFormHint("");
                        const cap = maxBuy - Math.floor(mySeat.stack || 0);
                        const n = Math.max(0, Math.floor(Number(topUpDraft) || 0));
                        if (n <= 0) {
                          setFormHint("Enter a top-up amount.");
                          return;
                        }
                        if (n > cap) {
                          setFormHint(`Top-up cannot exceed ${cap}.`);
                          return;
                        }
                        const r = await doOp("top_up", { amount: n });
                        if (r?.ok) {
                          setTopUpDraft("");
                          setFormHint("");
                        } else {
                          setTopUpDraft(String(n));
                          setFormHint(
                            String(r?.code || r?.json?.code || r?.error?.payload?.code || "Top-up failed."),
                          );
                        }
                      }}
                    >
                      Top-up
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-wrap justify-center gap-2">
                  {!mySeat.sitOut && !mySeat.pendingSitOutAfterHand ? (
                    <button
                      type="button"
                      disabled={operateBusy}
                      className="min-h-[40px] rounded-xl border border-zinc-600/35 bg-zinc-900/60 px-4 py-2 text-[10px] font-semibold text-zinc-200 touch-manipulation"
                      onClick={() => void runGameOp("sit_out")}
                    >
                      {betweenHands ? "Sit out" : "Sit out next hand"}
                    </button>
                  ) : null}
                  {betweenHands && (mySeat.sitOut || mySeat.pendingSitOutAfterHand) ? (
                    <button
                      type="button"
                      disabled={operateBusy || mySeat.pendingSitOutAfterHand}
                      className="min-h-[40px] rounded-xl border border-sky-600/35 bg-sky-950/40 px-4 py-2 text-[10px] font-semibold text-sky-100 touch-manipulation disabled:opacity-40"
                      onClick={() => void runGameOp("sit_in")}
                      title={mySeat.pendingSitOutAfterHand ? "Wait until this hand ends" : undefined}
                    >
                      I&apos;m back
                    </button>
                  ) : null}
                </div>
              </div>
              {mySeat.pendingSitOutAfterHand && !betweenHands ? (
                <p className="text-center text-[10px] text-amber-400/90">Sit out after this hand</p>
              ) : null}
              {formHint ? <p className="text-center text-[10px] text-rose-400/90">{formHint}</p> : null}
            </div>
          ) : (
            <p className="mt-2 text-center text-xs text-zinc-500">Take a seat to receive hole cards</p>
          )}
        </div>
      </div>

      {pickSeat != null ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/75 p-3 backdrop-blur-[2px] sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#111820] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
            <p className="text-sm font-bold text-white">Seat {pickSeat + 1}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Minimum entry {minBuy} · maximum entry {maxBuy}
            </p>
            <input
              className="mt-3 w-full rounded-xl border border-white/12 bg-black/50 px-3 py-2.5 text-sm"
              value={buyInDraft}
              onChange={e => setBuyInDraft(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 py-2 text-xs font-semibold touch-manipulation"
                onClick={() => setBuyInDraft(String(minBuy))}
              >
                Min
              </button>
              <button
                type="button"
                className="min-h-[44px] flex-1 rounded-xl border border-white/15 py-2 text-xs font-semibold touch-manipulation"
                onClick={() => setBuyInDraft(String(maxBuy))}
              >
                Max
              </button>
            </div>
            {formHint ? (
              <p className="mt-2 text-center text-[11px] text-rose-400/90">{formHint}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                className="min-h-[48px] flex-1 rounded-xl border border-white/15 py-2 text-sm touch-manipulation"
                onClick={() => {
                  setFormHint("");
                  setPickSeat(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-[48px] flex-1 rounded-xl border border-emerald-600/45 bg-emerald-950/50 py-2 text-sm font-bold text-emerald-50 touch-manipulation"
                disabled={operateBusy}
                onClick={async () => {
                  setFormHint("");
                  const n = Math.floor(Number(buyInDraft) || 0);
                  if (n < minBuy || n > maxBuy) {
                    setFormHint(`Use ${minBuy}–${maxBuy}.`);
                    return;
                  }
                  const r = await doOp("sit", {
                    seatIndex: pickSeat,
                    buyIn: n,
                    displayName,
                  });
                  if (r?.ok) {
                    setFormHint("");
                    setPickSeat(null);
                  } else {
                    setFormHint(
                      String(r?.code || r?.json?.code || r?.error?.payload?.code || "Could not take seat."),
                    );
                  }
                }}
              >
                Join table
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {operateSubmitStatus === "sending" ? (
        <p className="shrink-0 text-center text-[10px] text-amber-200/95">Sending…</p>
      ) : operateSubmitStatus === "resyncing" ? (
        <p className="shrink-0 text-center text-[10px] text-amber-200/95">Re-syncing…</p>
      ) : null}
      {actionHint ? (
        <p className="shrink-0 text-center text-[10px] text-rose-400/90">{actionHint}</p>
      ) : null}

      {mySeat && canAct ? (
        <div className="relative z-10 shrink-0 rounded-t-2xl border border-white/[0.08] border-b-0 bg-[#0a0e11] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-12px_40px_rgba(0,0,0,0.5)] sm:rounded-2xl sm:border-b sm:px-3 sm:py-3">
          <p className="mb-2 text-center text-[9px] font-semibold uppercase tracking-[0.2em] text-zinc-600">Actions</p>
          <div className="mx-auto flex max-w-2xl flex-col gap-2">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={actionClusterLocked}
                className="min-h-[48px] rounded-xl border border-rose-900/50 bg-rose-950/55 py-2.5 text-xs font-bold text-rose-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                onClick={() => void runGameOp("fold")}
              >
                Fold
              </button>
              <button
                type="button"
                disabled={actionClusterLocked || canCallChips}
                className="min-h-[48px] rounded-xl border border-zinc-600/40 bg-zinc-900/70 py-2.5 text-xs font-bold text-zinc-100 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                onClick={() => void runGameOp("check")}
              >
                Check
              </button>
              <button
                type="button"
                disabled={actionClusterLocked || !canCallChips}
                className="min-h-[48px] rounded-xl border border-sky-800/50 bg-sky-950/60 py-2.5 text-xs font-bold text-sky-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.3]"
                onClick={() => {
                  if (!canCallChips) return;
                  void runGameOp("call");
                }}
              >
                Call{canCallChips ? ` ${toCall}` : ""}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {canBetOpen ? (
                <button
                  type="button"
                  disabled={actionClusterLocked}
                  className="min-h-[48px] rounded-xl border border-emerald-800/45 bg-emerald-950/55 py-2.5 text-xs font-bold text-emerald-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                  onClick={() => void runGameOp("bet", { amount: bb })}
                >
                  Bet {bb}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionClusterLocked || !canMinRaiseBtn}
                  className="min-h-[48px] rounded-xl border border-violet-900/45 bg-violet-950/50 py-2.5 text-xs font-bold text-violet-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                  onClick={() => void runGameOp("raise", { amount: minRaiseChips })}
                >
                  Raise +{minRaiseChips}
                </button>
              )}
              <button
                type="button"
                disabled={actionClusterLocked || !canQuickBumpBtn}
                className="min-h-[48px] rounded-xl border border-indigo-900/45 bg-indigo-950/50 py-2.5 text-xs font-bold text-indigo-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                onClick={() => {
                  const op = curBet === 0 && toCall === 0 ? "bet" : "raise";
                  void runGameOp(op, { amount: quickAmount });
                }}
              >
                +{quickAmount}
              </button>
              <button
                type="button"
                disabled={actionClusterLocked}
                className="min-h-[48px] rounded-xl border border-amber-700/45 bg-amber-950/45 py-2.5 text-xs font-bold text-amber-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] active:opacity-90 disabled:cursor-not-allowed disabled:opacity-[0.32]"
                onClick={() => void runGameOp("all_in")}
              >
                All-in
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
