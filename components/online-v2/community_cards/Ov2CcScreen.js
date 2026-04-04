"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isOv2CcHandBettingLive } from "../../../lib/online-v2/community_cards/ov2CcClientConstants";
import {
  OV2_CC_MOBILE_FELT_HEIGHT_CLASSES,
  OV2_CC_MOBILE_HERO_ZONE_CLASSES,
} from "../../../lib/online-v2/community_cards/ov2CcLayoutConstants";
import {
  ov2CcSeatRingBreakpointFromWidth,
  ov2CcSeatRingPercent,
} from "../../../lib/online-v2/community_cards/ov2CcSeatRingGeometry";
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

  const otherTurnSeconds = useMemo(() => {
    if (!handBettingLive || engine?.actionSeat == null || canAct || !engine?.actionDeadline) return null;
    void clock;
    return Math.max(0, Math.ceil((Number(engine.actionDeadline) - Date.now()) / 1000));
  }, [handBettingLive, engine?.actionSeat, engine?.actionDeadline, canAct, clock]);

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

  const [seatRingBp, setSeatRingBp] = useState("mo");
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const apply = () => setSeatRingBp(ov2CcSeatRingBreakpointFromWidth(window.innerWidth));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, []);

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
      turn =
        "ring-2 ring-amber-400/50 ring-offset-2 ring-offset-[#061510] shadow-[0_0_0_1px_rgba(251,191,36,0.18),0_8px_22px_rgba(0,0,0,0.42)]";
    } else if (isYou) {
      turn = "ring-1 ring-sky-400/45 ring-offset-1 ring-offset-[#061510]";
    }
    return `${base} ${state} ${turn}`;
  };

  const renderSeatNode = (s, i) => {
    const isYou = s.participantKey === participantKey;
    const isAct = engine.actionSeat === i;
    // Felt, hero strip, and bottom action area follow the active/in-hand skeleton; when idle, only seat % may differ.
    const pos = ov2CcSeatRingPercent(maxSeats, i, seatRingBp, { idleSeatSpreadOverride: !handBettingLive });
    return (
      <div
        key={i}
        className="pointer-events-auto absolute z-[8] w-[3.53rem] max-w-[23.4vw] sm:w-[4.05rem] sm:max-w-[4.46rem] md:w-[4.34rem] -translate-x-1/2 -translate-y-1/2"
        style={{ left: pos.left, top: pos.top }}
      >
        <button
          type="button"
          disabled={operateBusy || Boolean(s.participantKey)}
          onClick={() => {
            if (!s.participantKey) {
              setFormHint("");
              setPickSeat(i);
            }
          }}
          className={`${seatButtonClass(s, i)} w-full disabled:cursor-not-allowed disabled:opacity-55`}
        >
          <span className="text-[7px] font-bold uppercase tracking-wider text-zinc-500 sm:text-[8px]">
            Seat {i + 1}
          </span>
          <div className="flex flex-wrap items-center justify-center gap-x-0.5 gap-y-0">
            {engine.buttonSeat === i ? (
              <span className="rounded bg-amber-500/25 px-1 py-px text-[6px] font-bold text-amber-200 sm:text-[7px]">
                D
              </span>
            ) : null}
            {engine.sbSeat === i ? (
              <span className="rounded bg-zinc-500/20 px-1 py-px text-[6px] font-bold text-zinc-300 sm:text-[7px]">
                SB
              </span>
            ) : null}
            {engine.bbSeat === i ? (
              <span className="rounded bg-zinc-400/20 px-1 py-px text-[6px] font-bold text-zinc-200 sm:text-[7px]">
                BB
              </span>
            ) : null}
          </div>
          {s.participantKey ? (
            <>
              <span className="max-w-full truncate px-0.5 text-[8px] font-semibold text-zinc-100 sm:text-[9px]">
                {isYou ? "You" : s.displayName || "…"}
              </span>
              <span className="font-mono text-[9px] font-bold tabular-nums text-emerald-100/95 sm:text-[10px]">
                {Math.floor(s.stack || 0)}
              </span>
              {s.allIn && !s.folded ? (
                <span className="text-[6px] font-bold uppercase tracking-wide text-amber-300/95 sm:text-[7px]">
                  All-in
                </span>
              ) : null}
              {s.waitBb && !s.inCurrentHand ? (
                <span className="text-[6px] font-semibold text-amber-200/90 sm:text-[7px]">Wait BB</span>
              ) : null}
              {s.pendingSitOutAfterHand ? (
                <span className="text-[6px] text-amber-300/85 sm:text-[7px]">Sit out next</span>
              ) : null}
              {s.sitOut ? <span className="text-[6px] text-zinc-500 sm:text-[7px]">Sitting out</span> : null}
              {s.folded ? (
                <span className="text-[6px] font-semibold uppercase tracking-wide text-rose-300/90 sm:text-[7px]">
                  Folded
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-[8px] font-semibold text-emerald-300/85 sm:text-[9px]">Open</span>
          )}
          {isAct && handBettingLive && s.participantKey && !s.folded ? (
            <span className="text-[6px] font-bold uppercase tracking-widest text-amber-200/90 sm:text-[7px]">
              Acts
            </span>
          ) : null}
        </button>
      </div>
    );
  };

  const holeCardsToShow =
    mySeat && (viewerHoleCards?.length || mySeat.holeCards?.length)
      ? viewerHoleCards?.length
        ? viewerHoleCards
        : mySeat.holeCards || []
      : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 overflow-hidden bg-[#050708] text-zinc-100 max-sm:gap-0 sm:gap-1.5">
      <div className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col gap-0 max-sm:gap-0 sm:gap-2 lg:max-w-6xl lg:gap-2.5">
        <div className="relative flex min-h-0 flex-1 flex-col">
          {/* Mobile: one felt height for all phases (see ov2CcLayoutConstants). */}
          <div
            className={`relative mx-auto h-full min-h-0 w-full max-w-[920px] sm:min-h-[min(56vh,440px)] flex-1 rounded-[1.55rem] border border-black/55 bg-gradient-to-b from-[#5c4030] via-[#2e1e16] to-[#120b08] p-[2px] shadow-[0_28px_72px_rgba(0,0,0,0.58),inset_0_1px_0_rgba(255,255,255,0.06)] sm:rounded-[2.35rem] sm:p-1 md:min-h-[min(58vh,500px)] lg:rounded-[2.55rem] lg:p-[7px] ${OV2_CC_MOBILE_FELT_HEIGHT_CLASSES}`}
          >
            <div
              className="relative flex h-full min-h-0 w-full flex-col overflow-hidden rounded-[1.45rem] border border-black/45 shadow-[inset_0_2px_24px_rgba(0,0,0,0.35)] sm:rounded-[1.85rem] md:rounded-[2.05rem]"
              style={{
                background:
                  "radial-gradient(ellipse 86% 68% at 50% 42%, #168047 0%, #0e5c32 36%, #083a1f 70%, #03150c 100%)",
              }}
            >
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit]"
                style={{
                  background:
                    "radial-gradient(ellipse 58% 42% at 50% 36%, rgba(255,255,255,0.09) 0%, transparent 52%)",
                }}
              />
              <div className="pointer-events-none absolute inset-[4px] rounded-[1.2rem] border border-black/25 max-sm:inset-[3px] sm:inset-2 sm:rounded-[1.55rem] md:rounded-[1.75rem]" />
              <div className="pointer-events-none absolute inset-[7px] rounded-[1.05rem] border border-white/[0.06] max-sm:inset-[5px] sm:inset-3 sm:rounded-[1.35rem] md:rounded-[1.55rem]" />

              <div className="relative z-[4] flex min-h-0 flex-1 flex-col">
                <div className="pointer-events-none flex min-h-0 flex-1 flex-col items-center justify-end overflow-y-auto overflow-x-hidden px-[7%] pt-0 pb-0.5 max-sm:-translate-y-[4.75rem] max-sm:px-[6%] sm:-translate-y-11 md:-translate-y-8 sm:px-[13%] sm:pt-1.5 sm:pb-1 md:px-[15%] md:pt-2 md:pb-1.5">
                  <div className="flex w-full max-w-md flex-col items-center gap-0.5 sm:max-w-lg sm:gap-1 md:gap-1.5">
                    {handBettingLive ? (
                      <>
                        <div className="w-full text-center">
                          <p className="text-[12px] font-medium text-emerald-100/70 sm:text-[13px]">
                            <span className="text-white">{phaseLabel}</span>
                            {handSeqN > 0 ? (
                              <span className="text-emerald-200/55">
                                {" "}
                                · Hand <span className="tabular-nums text-emerald-100/85">{handSeqN}</span>
                              </span>
                            ) : null}
                            {currentBet > 0 ? (
                              <span className="text-emerald-200/45">
                                {" "}
                                · Match <span className="tabular-nums text-emerald-100/75">{currentBet}</span>
                              </span>
                            ) : null}
                          </p>
                          {engine.buttonSeat != null && engine.sbSeat != null && engine.bbSeat != null ? (
                            <p className="mt-0.5 text-[11px] text-emerald-200/40 sm:text-[12px]">
                              BTN {engine.buttonSeat + 1} · SB {engine.sbSeat + 1} · BB {engine.bbSeat + 1}
                            </p>
                          ) : null}
                          {phase === "between_hands" && nextHandInSec != null ? (
                            <p className="mt-0.5 text-[11px] font-medium text-amber-200/80 sm:text-[12px]">
                              Next hand ~{nextHandInSec}s
                            </p>
                          ) : null}
                          {engine.tableNotice ? (
                            <p className="mt-0.5 text-[11px] text-amber-200/75 sm:text-[12px]">{engine.tableNotice}</p>
                          ) : null}
                        </div>

                        <div className="relative z-[1] flex min-h-[2.75rem] flex-wrap items-center justify-center gap-1.5 max-sm:drop-shadow-[0_3px_8px_rgba(0,0,0,0.32)] drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)] sm:min-h-[3.1rem] sm:gap-2 md:min-h-[3.35rem]">
                          {(communityCards || []).length ? (
                            (communityCards || []).map((c, idx) => (
                              <Ov2CcPlayingCard
                                key={`${c}-${idx}`}
                                code={c}
                                size="lg"
                                className="sm:scale-[1.06] md:scale-110"
                              />
                            ))
                          ) : (
                            <div className="flex h-[2.75rem] items-center sm:h-[3.1rem]">
                              <span className="text-[12px] font-medium tracking-wide text-emerald-200/30 sm:text-[13px]">
                                Community cards
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="relative z-[2] flex flex-col items-center gap-0.5 max-sm:mt-0">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-emerald-200/40 sm:text-[10px]">
                            Pot
                          </span>
                          <div className="flex min-h-[2.4rem] items-center justify-center overflow-visible rounded-xl border border-black/35 bg-black/45 px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_6px_20px_rgba(0,0,0,0.42)] sm:rounded-2xl sm:px-7 sm:py-2.5">
                            <span className="relative block translate-y-px text-[18px] font-extrabold leading-none text-amber-100 sm:translate-y-0 sm:font-mono sm:text-2xl sm:font-bold sm:leading-[1.25] sm:tabular-nums md:text-3xl">
                              {Math.floor(pot || 0).toLocaleString?.() ?? Math.floor(pot || 0)}
                            </span>
                          </div>
                          <p className="mt-1 w-full min-h-[1.125rem] shrink-0 text-center text-[10px] font-medium uppercase leading-tight tracking-[0.14em] text-emerald-200/35 sm:min-h-[1.25rem] sm:text-[11px]">
                            {maxSeats}-max · {minBuy.toLocaleString?.() ?? minBuy}–{maxBuy.toLocaleString?.() ?? maxBuy} · {sb}/{bb}
                          </p>
                        </div>

                        {likelyBoardRunout ? (
                          <p className="text-center text-[11px] font-medium text-emerald-200/50 sm:text-[12px]">
                            All-in runout — dealing board
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <>
                        <div className="flex w-full min-h-[2.5rem] items-center justify-center px-1 text-center sm:min-h-[2.625rem]">
                          <p className="text-[12px] font-medium text-emerald-100/70 sm:text-[13px]">
                            <span className="text-white">{phaseLabel}</span>
                            {handSeqN > 0 ? (
                              <span className="text-emerald-200/55">
                                {" "}
                                · Hand <span className="tabular-nums text-emerald-100/85">{handSeqN}</span>
                              </span>
                            ) : null}
                            {currentBet > 0 ? (
                              <span className="text-emerald-200/45">
                                {" "}
                                · Match <span className="tabular-nums text-emerald-100/75">{currentBet}</span>
                              </span>
                            ) : null}
                          </p>
                        </div>

                        <div className="flex w-full min-h-[2.875rem] flex-col items-center justify-center gap-0.5 text-center sm:min-h-[3rem]">
                          <p className="min-h-[1.125rem] text-[11px] leading-tight text-emerald-200/40 sm:min-h-[1.25rem] sm:text-[12px]">
                            {engine.buttonSeat != null && engine.sbSeat != null && engine.bbSeat != null ? (
                              <>
                                BTN {engine.buttonSeat + 1} · SB {engine.sbSeat + 1} · BB {engine.bbSeat + 1}
                              </>
                            ) : (
                              <span className="invisible" aria-hidden>
                                &nbsp;
                              </span>
                            )}
                          </p>
                          <p className="min-h-[1.125rem] text-[11px] font-medium leading-tight sm:min-h-[1.25rem] sm:text-[12px]">
                            {engine.tableNotice ? (
                              <span className="text-amber-200/75">{engine.tableNotice}</span>
                            ) : phase === "between_hands" && nextHandInSec != null ? (
                              <span className="text-amber-200/80">Next hand ~{nextHandInSec}s</span>
                            ) : (
                              <span className="invisible" aria-hidden>
                                &nbsp;
                              </span>
                            )}
                          </p>
                        </div>

                        <div className="relative z-[1] flex min-h-[2.75rem] flex-nowrap items-center justify-center gap-1.5 max-sm:drop-shadow-[0_3px_8px_rgba(0,0,0,0.32)] drop-shadow-[0_6px_20px_rgba(0,0,0,0.45)] sm:min-h-[3.1rem] sm:gap-2 md:min-h-[3.35rem]">
                          {Array.from({ length: 5 }, (_, i) => {
                            const c = (communityCards || [])[i];
                            return (
                              <div key={`board-slot-${i}`} className="flex shrink-0 items-center justify-center">
                                {c ? (
                                  <Ov2CcPlayingCard
                                    code={c}
                                    size="lg"
                                    className="sm:scale-[1.06] md:scale-110"
                                  />
                                ) : (
                                  <div className="pointer-events-none opacity-0" aria-hidden>
                                    <Ov2CcPlayingCard faceDown size="lg" className="sm:scale-[1.06] md:scale-110" />
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        <div className="relative z-[2] flex flex-col items-center gap-0.5 max-sm:mt-0">
                          <span className="text-[9px] font-semibold uppercase tracking-[0.24em] text-emerald-200/40 sm:text-[10px]">
                            Pot
                          </span>
                          <div className="flex min-h-[2.4rem] items-center justify-center overflow-visible rounded-xl border border-black/35 bg-black/45 px-5 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_6px_20px_rgba(0,0,0,0.42)] sm:rounded-2xl sm:px-7 sm:py-2.5">
                            <span className="relative block translate-y-px text-[18px] font-extrabold leading-none text-amber-100 sm:translate-y-0 sm:font-mono sm:text-2xl sm:font-bold sm:leading-[1.25] sm:tabular-nums md:text-3xl">
                              {Math.floor(pot || 0).toLocaleString?.() ?? Math.floor(pot || 0)}
                            </span>
                          </div>
                          <p className="mt-1 w-full min-h-[1.125rem] shrink-0 text-center text-[10px] font-medium uppercase leading-tight tracking-[0.14em] text-emerald-200/35 sm:min-h-[1.25rem] sm:text-[11px]">
                            {maxSeats}-max · {minBuy.toLocaleString?.() ?? minBuy}–{maxBuy.toLocaleString?.() ?? maxBuy} · {sb}/{bb}
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div
                  className={`relative z-[10] flex w-full shrink-0 justify-center px-1 pb-[max(0.15rem,env(safe-area-inset-bottom,0px))] pt-0 pointer-events-none sm:h-[8.5rem] sm:max-h-none sm:items-center ${OV2_CC_MOBILE_HERO_ZONE_CLASSES}`}
                >
                  {mySeat ? (
                    <div className="flex max-h-full w-full max-w-[98%] flex-wrap items-center justify-center gap-2 drop-shadow-[0_10px_28px_rgba(0,0,0,0.55)] max-sm:max-h-none max-sm:-translate-y-4 max-sm:gap-2.5 sm:-translate-y-4 sm:items-end sm:gap-4 md:-translate-y-3">
                      {holeCardsToShow.length > 0
                        ? holeCardsToShow.map((c, idx) => (
                            <Ov2CcPlayingCard key={`felt-h-${idx}`} code={c} size="hero" />
                          ))
                        : null}
                    </div>
                  ) : (
                    <div
                      className="flex max-h-full w-full max-w-[98%] flex-wrap items-center justify-center gap-3 max-sm:max-h-none sm:items-end sm:gap-4"
                      aria-hidden
                    />
                  )}
                </div>
              </div>

              {engine.winnersDisplay?.seats?.length ? (
                <div
                  className="pointer-events-none absolute left-1/2 z-[8] flex w-full max-w-sm -translate-x-1/2 justify-center px-3 max-sm:bottom-[7.75rem] sm:bottom-[9.25rem]"
                  aria-live="polite"
                >
                  <div className="max-w-sm rounded-lg border border-emerald-500/22 bg-black/55 px-2.5 py-1.5 text-center text-[12px] text-emerald-200/95 shadow-[0_8px_24px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-[1px] sm:rounded-xl sm:px-3 sm:py-2 sm:text-[13px]">
                    <p className="font-semibold text-emerald-100">
                      Winner{engine.winnersDisplay.seats.length > 1 ? "s" : ""} · seat{" "}
                      {engine.winnersDisplay.seats.map(x => x + 1).join(", ")}
                    </p>
                    {engine.winnersDisplay.stacksWon && typeof engine.winnersDisplay.stacksWon === "object" ? (
                      <p className="mt-0.5 text-[11px] text-emerald-200/72 sm:text-[12px]">
                        {Object.entries(engine.winnersDisplay.stacksWon)
                          .map(([si, amt]) => `S${Number(si) + 1} +${amt}`)
                          .join(" · ")}
                      </p>
                    ) : null}
                  </div>
                </div>
              ) : null}

              <div
                className="pointer-events-none absolute right-2 top-2 z-[12] flex max-w-[min(42vw,9.5rem)] flex-col items-end gap-0.5 sm:right-3 sm:top-3 sm:max-w-[11rem] md:max-w-[12rem]"
                aria-live="polite"
              >
                {canAct && turnSecondsLeft != null ? (
                  <div
                    className="rounded-lg border border-amber-500/30 bg-black/55 px-2 py-1 text-right shadow-[0_4px_14px_rgba(0,0,0,0.35)] sm:rounded-full sm:px-2.5 sm:py-1"
                    aria-label="Your turn"
                  >
                    <span className="font-mono text-sm font-bold tabular-nums text-amber-100 sm:text-base">
                      {turnSecondsLeft}s
                    </span>
                  </div>
                ) : handBettingLive && engine?.actionSeat != null ? (
                  <div className="rounded-lg border border-white/[0.1] bg-black/45 px-2 py-1 text-right shadow-[0_4px_12px_rgba(0,0,0,0.3)] sm:rounded-full sm:px-2.5">
                    <span className="block text-[10px] font-medium text-emerald-200/55 sm:text-[11px]">
                      Seat {engine.actionSeat + 1}
                    </span>
                    {otherTurnSeconds != null ? (
                      <span className="font-mono text-xs font-bold tabular-nums text-amber-200/90 sm:text-sm">
                        {otherTurnSeconds}s
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="pointer-events-none absolute inset-0 z-[7]">
                {seats.length === 0 ? null : seats.map((s, i) => renderSeatNode(s, i))}
              </div>

              {seats.length === 0 ? (
                <div className="absolute inset-0 z-[9] flex items-center justify-center p-4">
                  <div className="pointer-events-auto max-w-sm rounded-xl border border-white/12 bg-black/40 px-4 py-4 text-center text-[11px] text-zinc-400 shadow-lg backdrop-blur-sm">
                    Seat layout not available yet. If this stays empty, run the Community Cards SQL migration and refresh.
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="shrink-0 rounded-2xl border border-white/[0.08] bg-[#0c1216] px-3 py-2.5 shadow-[0_8px_28px_rgba(0,0,0,0.45)] sm:px-4 sm:py-3">
          {mySeat ? (
            <div className="flex items-start justify-between gap-2">
              <p className="pt-0.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[12px]">Your stack</p>
              <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
                {!mySeat.sitOut && !mySeat.pendingSitOutAfterHand ? (
                  <button
                    type="button"
                    disabled={operateBusy}
                    className="min-h-[36px] rounded-lg border border-zinc-600/35 bg-zinc-900/60 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 touch-manipulation sm:min-h-[40px] sm:rounded-xl sm:px-4 sm:text-[12px]"
                    onClick={() => void runGameOp("sit_out")}
                  >
                    {betweenHands ? "Sit out" : "Next hand out"}
                  </button>
                ) : null}
                {betweenHands && (mySeat.sitOut || mySeat.pendingSitOutAfterHand) ? (
                  <button
                    type="button"
                    disabled={operateBusy || mySeat.pendingSitOutAfterHand}
                    className="min-h-[36px] rounded-lg border border-sky-600/35 bg-sky-950/40 px-3 py-1.5 text-[11px] font-semibold text-sky-100 touch-manipulation disabled:opacity-40 sm:min-h-[40px] sm:rounded-xl sm:px-4 sm:text-[12px]"
                    onClick={() => void runGameOp("sit_in")}
                    title={mySeat.pendingSitOutAfterHand ? "Wait until this hand ends" : undefined}
                  >
                    I&apos;m back
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <p className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-500 sm:text-[12px]">Your stack</p>
          )}
          {mySeat ? (
            <div className="mt-2 space-y-2.5">
              <p className="text-center font-mono text-2xl font-bold tabular-nums text-white sm:text-3xl">
                {Math.floor(mySeat.stack || 0).toLocaleString?.() ?? Math.floor(mySeat.stack || 0)}
              </p>
              <div className="min-h-[48px] shrink-0">
                {betweenHands ? (
                  <div className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded-xl border border-white/12 bg-black/45 px-3 py-2 text-sm text-white placeholder:text-zinc-600"
                      value={topUpDraft}
                      onChange={e => setTopUpDraft(e.target.value.replace(/[^\d]/g, ""))}
                      placeholder={`Top-up (max +${maxBuy - Math.floor(mySeat.stack || 0)})`}
                      inputMode="numeric"
                    />
                    <button
                      type="button"
                      disabled={operateBusy}
                      className="min-h-[44px] shrink-0 rounded-xl border border-emerald-600/40 bg-emerald-950/50 px-4 text-sm font-bold text-emerald-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
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
                ) : (
                  <div className="h-[48px] w-full shrink-0" aria-hidden />
                )}
              </div>
              <div className="min-h-[22px] shrink-0">
                {mySeat.pendingSitOutAfterHand && !betweenHands ? (
                  <p className="text-center text-[11px] text-amber-400/90 sm:text-[12px]">Leaving after this hand</p>
                ) : null}
              </div>
              {formHint ? <p className="text-center text-[12px] text-rose-400/90 sm:text-[13px]">{formHint}</p> : null}
            </div>
          ) : (
            <p className="mt-2 text-center text-sm text-zinc-500 sm:text-base">Take a seat to join</p>
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

      {actionHint ? (
        <p className="shrink-0 text-center text-[12px] text-rose-400/90 sm:text-[13px]">{actionHint}</p>
      ) : null}

      {mySeat ? (
        /* Mobile felt subtracts OV2_CC_MOBILE_ACTION_RESERVE_PX — keep min-h aligned with that constant */
        <div className="relative z-10 flex min-h-[134px] shrink-0 flex-col border-t border-white/[0.06] bg-[#070a0d] px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2.5 shadow-[0_-16px_48px_rgba(0,0,0,0.55)] sm:min-h-[140px] sm:px-4 sm:pb-3 sm:pt-3">
          {canAct ? (
            <div className="mx-auto w-full max-w-lg">
            <div className="flex items-stretch gap-2">
              <button
                type="button"
                disabled={actionClusterLocked}
                className="flex w-[4.5rem] shrink-0 flex-col justify-center rounded-lg border border-rose-500/55 bg-rose-950/60 py-2.5 text-[15px] font-bold uppercase leading-tight tracking-wide text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] touch-manipulation active:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-45 sm:w-[5rem] sm:text-[17px]"
                onClick={() => void runGameOp("fold")}
              >
                Fold
              </button>
              <div className="flex min-w-0 flex-1 gap-2">
                <button
                  type="button"
                  disabled={actionClusterLocked || canCallChips}
                  className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-green-500/50 bg-green-900/55 py-2.5 text-[16px] font-bold uppercase leading-snug tracking-wide text-green-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] active:bg-green-800/50 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[54px] sm:text-lg"
                  onClick={() => void runGameOp("check")}
                >
                  Check
                </button>
                <button
                  type="button"
                  disabled={actionClusterLocked || !canCallChips}
                  className="min-h-[52px] min-w-0 flex-1 rounded-xl border border-sky-500/55 bg-sky-800/55 py-2.5 text-[16px] font-bold uppercase leading-snug tracking-wide text-sky-50 touch-manipulation shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] active:bg-sky-700/45 disabled:cursor-not-allowed disabled:opacity-45 sm:min-h-[54px] sm:text-lg"
                  onClick={() => {
                    if (!canCallChips) return;
                    void runGameOp("call");
                  }}
                >
                  Call{canCallChips ? ` ${toCall}` : ""}
                </button>
              </div>
            </div>
            <div className="mt-2.5 flex gap-2 border-t border-white/[0.08] pt-2.5">
              {canBetOpen ? (
                <button
                  type="button"
                  disabled={actionClusterLocked}
                  className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-violet-500/50 bg-violet-900/50 py-2 text-[15px] font-bold uppercase leading-snug tracking-wide text-violet-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] touch-manipulation active:bg-violet-800/45 disabled:cursor-not-allowed disabled:opacity-45 sm:text-base"
                  onClick={() => void runGameOp("bet", { amount: bb })}
                >
                  Bet {bb}
                </button>
              ) : (
                <button
                  type="button"
                  disabled={actionClusterLocked || !canMinRaiseBtn}
                  className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-indigo-500/50 bg-indigo-900/50 py-2 text-[15px] font-bold uppercase leading-snug tracking-wide text-indigo-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] touch-manipulation active:bg-indigo-800/45 disabled:cursor-not-allowed disabled:opacity-45 sm:text-base"
                  onClick={() => void runGameOp("raise", { amount: minRaiseChips })}
                >
                  Raise +{minRaiseChips}
                </button>
              )}
              <button
                type="button"
                disabled={actionClusterLocked || !canQuickBumpBtn}
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-fuchsia-500/50 bg-fuchsia-900/50 py-2 text-[15px] font-bold uppercase leading-snug tracking-wide text-fuchsia-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] touch-manipulation active:bg-fuchsia-800/45 disabled:cursor-not-allowed disabled:opacity-45 sm:text-base"
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
                className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-amber-500/55 bg-amber-900/45 py-2 text-[15px] font-bold uppercase leading-snug tracking-wide text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] touch-manipulation active:bg-amber-800/40 disabled:cursor-not-allowed disabled:opacity-45 sm:text-base"
                onClick={() => void runGameOp("all_in")}
              >
                All-in
              </button>
            </div>
          </div>
          ) : (
            <div
              className="mx-auto w-full max-w-lg flex-1 shrink-0 rounded-lg bg-transparent sm:rounded-none"
              aria-hidden
            >
              <div className="min-h-[128px] w-full sm:min-h-[132px]" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
