"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const SUIT_SYM = { c: "♣", d: "♦", h: "♥", s: "♠" };

function cardLabel(code) {
  const s = String(code || "").trim();
  if (s.length < 2) return "?";
  const r = s[0] === "T" ? "10" : s[0];
  const suit = SUIT_SYM[s[1]] || s[1];
  return `${r}${suit}`;
}

export default function Ov2CcScreen({
  roomId,
  engine,
  viewerHoleCards = [],
  tableConfig,
  participantKey,
  displayName,
  onOperate,
  operateBusy,
  loadError,
}) {
  const minBuy = tableConfig?.tablePrice ?? 100;
  const maxBuy = tableConfig?.maxBuyin ?? minBuy * 10;
  const [buyInDraft, setBuyInDraft] = useState(String(minBuy));
  const [topUpDraft, setTopUpDraft] = useState("");
  const [pickSeat, setPickSeat] = useState(null);
  const [formHint, setFormHint] = useState("");
  const [actionHint, setActionHint] = useState("");

  useEffect(() => {
    setBuyInDraft(String(minBuy));
  }, [minBuy]);

  const mySeat = useMemo(() => {
    if (!Array.isArray(engine?.seats) || !participantKey) return null;
    return engine.seats.find(s => s.participantKey === participantKey) || null;
  }, [engine, participantKey]);

  const toCall = useMemo(() => {
    if (!mySeat || !engine) return 0;
    return Math.max(0, Math.floor(Number(engine.currentBet) || 0) - Math.floor(Number(mySeat.streetContrib) || 0));
  }, [mySeat, engine]);

  const handBettingLive = useMemo(
    () =>
      Boolean(
        engine &&
          engine.phase === "preflop" &&
          Math.floor(Number(engine.handSeq) || 0) > 0 &&
          engine.street,
      ),
    [engine],
  );

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

  const runGameOp = useCallback(
    async (op, payload = {}) => {
      setActionHint("");
      const r = await onOperate(op, payload);
      if (!r?.ok) {
        setActionHint(
          String(r?.code || r?.json?.code || r?.error?.payload?.code || r?.error?.message || "rejected"),
        );
      }
      return r;
    },
    [onOperate],
  );

  if (!engine) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-zinc-400">
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
      ? "between hands"
      : phase === "showdown"
        ? "showdown"
        : phase === "idle"
          ? "idle"
          : street
            ? String(street)
            : String(phase);
  const handSeqN = Math.floor(Number(engine.handSeq) || 0);
  const likelyBoardRunout =
    handBettingLive && engine.actionSeat == null && Math.floor(Number(pot) || 0) > 0;

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

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden text-white">
      <div className="shrink-0 text-center text-[10px] text-zinc-400">
        Table · {maxSeats}-max · minimum entry {minBuy.toLocaleString?.() ?? minBuy} · maximum entry{" "}
        {maxBuy.toLocaleString?.() ?? maxBuy} · blinds {sb}/{bb}
      </div>

      <div className="grid shrink-0 grid-cols-5 gap-1 sm:grid-cols-9">
        {seats.length === 0 ? (
          <div className="col-span-full rounded-lg border border-white/10 bg-black/20 px-2 py-3 text-center text-[11px] text-zinc-500">
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
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-lg border px-0.5 py-1 text-[9px] leading-tight transition touch-manipulation ${
                  s.participantKey
                    ? "border-white/20 bg-white/[0.06]"
                    : "border-dashed border-emerald-500/40 bg-emerald-950/20"
                } ${isYou ? "ring-1 ring-sky-400/60" : ""} ${isAct ? "ring-1 ring-amber-400/70" : ""} disabled:opacity-60`}
              >
                <span className="font-bold text-zinc-200">S{i + 1}</span>
                {engine.buttonSeat === i ? (
                  <span className="text-[7px] font-bold text-amber-300/90">D</span>
                ) : null}
                {engine.sbSeat === i ? (
                  <span className="text-[7px] font-bold text-zinc-400">SB</span>
                ) : null}
                {engine.bbSeat === i ? (
                  <span className="text-[7px] font-bold text-zinc-300">BB</span>
                ) : null}
                {s.participantKey ? (
                  <>
                    <span className="truncate text-[8px] text-zinc-400">
                      {isYou ? "You" : s.displayName || "…"}
                    </span>
                    <span className="text-[9px] text-emerald-200">{Math.floor(s.stack || 0)}</span>
                    {s.waitBb ? <span className="text-[7px] text-amber-300">Waiting for BB</span> : null}
                    {s.pendingSitOutAfterHand ? <span className="text-[7px] text-amber-400/90">Sit out next</span> : null}
                    {s.sitOut ? <span className="text-[7px] text-zinc-500">Sit out</span> : null}
                    {s.folded ? <span className="text-[7px] text-rose-400">Out</span> : null}
                  </>
                ) : (
                  <span className="text-[8px] text-emerald-300/80">Open</span>
                )}
              </button>
            );
          })
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto overflow-x-hidden rounded-xl border border-white/10 bg-black/30 px-2 py-3 [-webkit-overflow-scrolling:touch]">
        <div className="text-[11px] text-zinc-400">
          <span className="text-zinc-100">{phaseLabel}</span>
          {handSeqN > 0 ? (
            <span className="ml-1">
              · hand <span className="text-zinc-200">{handSeqN}</span>
            </span>
          ) : null}
          {currentBet > 0 ? (
            <span className="ml-2">
              · level <span className="text-zinc-200">{currentBet}</span>
            </span>
          ) : null}
          {engine.buttonSeat != null && engine.sbSeat != null && engine.bbSeat != null ? (
            <span className="mt-0.5 block text-[10px] text-zinc-500">
              BTN S{engine.buttonSeat + 1} · SB S{engine.sbSeat + 1} · BB S{engine.bbSeat + 1}
            </span>
          ) : null}
        </div>
        <div className="text-lg font-bold text-amber-200">Pot (table) {Math.floor(pot || 0)}</div>
        {canAct && turnSecondsLeft != null ? (
          <div className="text-sm font-bold text-amber-300">Your turn · {turnSecondsLeft}s</div>
        ) : handBettingLive && engine.actionSeat != null ? (
          <div className="text-[10px] text-zinc-500">
            Seat {engine.actionSeat + 1} to act
            {engine.actionDeadline
              ? ` · ${Math.max(0, Math.ceil((Number(engine.actionDeadline) - Date.now()) / 1000))}s`
              : ""}
          </div>
        ) : likelyBoardRunout ? (
          <div className="text-[10px] text-zinc-500">All-in — dealing remaining board</div>
        ) : null}
        <div className="flex min-h-[36px] flex-wrap items-center justify-center gap-1">
          {(communityCards || []).length ? (
            (communityCards || []).map((c, idx) => (
              <span
                key={`${c}-${idx}`}
                className="rounded-md border border-white/20 bg-zinc-900 px-2 py-1 font-mono text-sm"
              >
                {cardLabel(c)}
              </span>
            ))
          ) : (
            <span className="text-xs text-zinc-500">Community cards</span>
          )}
        </div>
        {engine.winnersDisplay?.seats?.length ? (
          <div className="text-center text-[11px] text-emerald-300">
            <p>
              Result · winning seat(s) {engine.winnersDisplay.seats.map(x => x + 1).join(", ")}
            </p>
            {engine.winnersDisplay.stacksWon &&
            typeof engine.winnersDisplay.stacksWon === "object" ? (
              <p className="mt-0.5 text-[10px] text-emerald-200/80">
                To stack:{" "}
                {Object.entries(engine.winnersDisplay.stacksWon)
                  .map(([si, amt]) => `S${Number(si) + 1} +${amt}`)
                  .join(" · ")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="relative z-10 shrink-0 rounded-xl border border-white/10 bg-black/25 px-2 py-2">
        <p className="text-center text-[10px] text-zinc-500">Your stack</p>
        {mySeat ? (
          <div className="mt-1 space-y-2">
            <p className="text-center text-lg font-bold text-white">{Math.floor(mySeat.stack || 0)}</p>
            <div className="flex min-h-[40px] flex-wrap items-center justify-center gap-1">
              {(viewerHoleCards?.length ? viewerHoleCards : mySeat.holeCards || []).map((c, idx) => (
                <span
                  key={`h-${idx}`}
                  className="rounded-md border border-sky-500/30 bg-sky-950/40 px-2 py-1 font-mono text-base"
                >
                  {cardLabel(c)}
                </span>
              ))}
            </div>
            <div className="flex flex-col gap-1">
              {betweenHands ? (
                <div className="flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-xs"
                    value={topUpDraft}
                    onChange={e => setTopUpDraft(e.target.value.replace(/[^\d]/g, ""))}
                    placeholder={`Top-up (max +${maxBuy - Math.floor(mySeat.stack || 0)})`}
                    inputMode="numeric"
                  />
                  <button
                    type="button"
                    disabled={operateBusy}
                    className="min-h-[44px] rounded-lg border border-emerald-500/40 bg-emerald-900/30 px-3 py-2 text-xs font-bold text-emerald-100 touch-manipulation"
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
              <div className="flex flex-wrap justify-center gap-1">
                {!mySeat.sitOut && !mySeat.pendingSitOutAfterHand ? (
                  <button
                    type="button"
                    disabled={operateBusy}
                    className="min-h-[40px] rounded border border-zinc-500/40 bg-zinc-800/50 px-3 py-2 text-[10px] font-semibold text-zinc-200 touch-manipulation"
                    onClick={() => void runGameOp("sit_out")}
                  >
                    {betweenHands ? "Sit out" : "Sit out next hand"}
                  </button>
                ) : null}
                {betweenHands && (mySeat.sitOut || mySeat.pendingSitOutAfterHand) ? (
                  <button
                    type="button"
                    disabled={operateBusy || mySeat.pendingSitOutAfterHand}
                    className="min-h-[40px] rounded border border-sky-500/40 bg-sky-950/40 px-3 py-2 text-[10px] font-semibold text-sky-100 touch-manipulation disabled:opacity-40"
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
          <p className="mt-1 text-center text-xs text-zinc-400">Join a seat to receive cards</p>
        )}
      </div>

      {pickSeat != null ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-zinc-900 p-4 shadow-xl">
            <p className="text-sm font-bold text-white">Seat {pickSeat + 1}</p>
            <p className="mt-1 text-[11px] text-zinc-400">
              Minimum entry {minBuy} · maximum entry {maxBuy}
            </p>
            <input
              className="mt-3 w-full rounded-lg border border-white/15 bg-black/40 px-2 py-2 text-sm"
              value={buyInDraft}
              onChange={e => setBuyInDraft(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
            />
            <div className="mt-2 flex gap-2">
              <button
                type="button"
                className="min-h-[44px] flex-1 rounded-lg border border-white/20 py-2 text-xs font-semibold touch-manipulation"
                onClick={() => setBuyInDraft(String(minBuy))}
              >
                Min
              </button>
              <button
                type="button"
                className="min-h-[44px] flex-1 rounded-lg border border-white/20 py-2 text-xs font-semibold touch-manipulation"
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
                className="min-h-[48px] flex-1 rounded-lg border border-white/20 py-2 text-sm touch-manipulation"
                onClick={() => {
                  setFormHint("");
                  setPickSeat(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="min-h-[48px] flex-1 rounded-lg border border-emerald-500/40 bg-emerald-800/40 py-2 text-sm font-bold text-emerald-100 touch-manipulation"
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

      {actionHint ? (
        <p className="shrink-0 text-center text-[10px] text-rose-400/90">{actionHint}</p>
      ) : null}
      {mySeat && canAct ? (
        <div className="relative z-10 grid shrink-0 grid-cols-3 gap-2 pb-[max(0.25rem,env(safe-area-inset-bottom))] sm:grid-cols-6">
          <button
            type="button"
            disabled={operateBusy}
            className="min-h-[48px] rounded-lg border border-rose-500/35 bg-rose-950/35 py-2.5 text-xs font-bold text-rose-100 touch-manipulation active:opacity-90"
            onClick={() => void runGameOp("fold")}
          >
            Fold
          </button>
          <button
            type="button"
            disabled={operateBusy || toCall > 0}
            className="min-h-[48px] rounded-lg border border-zinc-500/35 bg-zinc-800/40 py-2.5 text-xs font-bold touch-manipulation active:opacity-90"
            onClick={() => void runGameOp("check")}
          >
            Check
          </button>
          <button
            type="button"
            disabled={operateBusy || toCall <= 0}
            className="min-h-[48px] rounded-lg border border-sky-500/35 bg-sky-950/35 py-2.5 text-xs font-bold text-sky-100 touch-manipulation active:opacity-90"
            onClick={() => void runGameOp("call")}
          >
            Call {toCall > 0 ? toCall : ""}
          </button>
          {canBetOpen ? (
            <button
              type="button"
              disabled={operateBusy}
              className="min-h-[48px] rounded-lg border border-violet-500/35 bg-violet-950/35 py-2.5 text-xs font-bold text-violet-100 touch-manipulation active:opacity-90"
              onClick={() => void runGameOp("bet", { amount: bb })}
            >
              Bet {bb}
            </button>
          ) : (
            <button
              type="button"
              disabled={operateBusy || !canMinRaiseBtn}
              className="min-h-[48px] rounded-lg border border-violet-500/35 bg-violet-950/35 py-2.5 text-xs font-bold text-violet-100 touch-manipulation active:opacity-90 disabled:opacity-40"
              onClick={() => void runGameOp("raise", { amount: minRaiseChips })}
            >
              Raise +{minRaiseChips}
            </button>
          )}
          <button
            type="button"
            disabled={operateBusy || !canQuickBumpBtn}
            className="min-h-[48px] rounded-lg border border-violet-500/35 bg-violet-950/35 py-2.5 text-xs font-bold text-violet-100 touch-manipulation active:opacity-90 disabled:opacity-40"
            onClick={() => {
              const op = curBet === 0 && toCall === 0 ? "bet" : "raise";
              void runGameOp(op, { amount: quickAmount });
            }}
          >
            +{quickAmount}
          </button>
          <button
            type="button"
            disabled={operateBusy}
            className="min-h-[48px] rounded-lg border border-amber-500/40 bg-amber-950/35 py-2.5 text-xs font-bold text-amber-100 touch-manipulation active:opacity-90"
            onClick={() => void runGameOp("all_in")}
          >
            All-in
          </button>
        </div>
      ) : null}
    </div>
  );
}
