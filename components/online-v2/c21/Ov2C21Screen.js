"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { handTotal, splitCardCode } from "../../../lib/solo-v2/challenge21HandMath";
import { getOv2C21LegalFlags } from "../../../lib/online-v2/c21/ov2C21LegalMoves";

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

const SUIT_SYM = { h: "♥", d: "♦", c: "♣", s: "♠" };

function toDeckApiImageCode(code) {
  const s = String(code || "");
  if (!s) return null;
  let rank;
  let suitKey;
  if (s.length >= 3 && s.startsWith("10")) {
    rank = "0";
    suitKey = s.slice(2);
  } else {
    rank = s.slice(0, 1).toUpperCase();
    suitKey = s.slice(1);
  }
  const sm = { h: "H", d: "D", c: "C", s: "S" };
  const sk = String(suitKey || "s").toLowerCase();
  return `${rank}${sm[sk] || "S"}`;
}

function FallbackCardFace({ code, compact }) {
  const { rank, suit } = splitCardCode(code);
  const sym = SUIT_SYM[String(suit).toLowerCase()] || suit;
  const red = suit.toLowerCase() === "h" || suit.toLowerCase() === "d";
  return (
    <div
      className={`flex h-full w-full flex-col items-center justify-center rounded-md border border-zinc-500/80 bg-gradient-to-b from-white to-zinc-100 px-0.5 shadow-inner ${
        red ? "text-red-600" : "text-zinc-900"
      } ${compact ? "text-[9px] font-extrabold leading-none" : "text-xs font-extrabold leading-tight"}`}
    >
      <span>{rank}</span>
      <span className={compact ? "text-[11px]" : "text-base"}>{sym}</span>
    </div>
  );
}

/**
 * House: large for small hands; step down when 4+ cards (unchanged rule).
 * Seat hands: use `seatFit` from measured row width instead.
 */
function PlayingCardOv2({ code, hidden, handCardCount = 1, seatFit = null }) {
  const [imgErr, setImgErr] = useState(false);
  useEffect(() => {
    setImgErr(false);
  }, [code]);

  let classSize = "";
  let styleSize = null;
  let compactFallback = false;

  if (seatFit && typeof seatFit.wRem === "number" && typeof seatFit.hRem === "number") {
    styleSize = { width: `${seatFit.wRem}rem`, height: `${seatFit.hRem}rem`, flexShrink: 0 };
    compactFallback = Boolean(seatFit.compactFallback);
  } else {
    const n = Math.max(0, Math.floor(Number(handCardCount) || 0));
    const crowded = n >= 4;
    classSize = crowded
      ? "h-[2.95rem] w-[2.05rem] sm:h-[3.35rem] sm:w-[2.45rem]"
      : "h-[4.35rem] w-[3.05rem] sm:h-[4.55rem] sm:w-[3.2rem]";
    compactFallback = crowded;
  }

  const baseBox =
    "shrink-0 overflow-hidden rounded-md border shadow-[0_2px_6px_rgba(0,0,0,0.4)]";
  const boxClass = `${classSize} ${baseBox}`.trim();

  if (hidden) {
    return (
      <div
        className={`${boxClass} border-white/30`}
        style={styleSize || undefined}
      >
        <img
          src="/card-backs/poker-back.jpg"
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
        />
      </div>
    );
  }
  if (!code) {
    return (
      <div
        className={`${boxClass} border-white/20 bg-black/40`}
        style={styleSize || undefined}
      />
    );
  }
  const api = toDeckApiImageCode(code);
  const url = api ? `https://deckofcardsapi.com/static/img/${api}.png` : null;
  const showFallback = !url || imgErr;
  return (
    <div
      className={`${boxClass} relative border-white/25`}
      style={styleSize || undefined}
    >
      {url && !imgErr ? (
        <img
          src={url}
          alt=""
          className="h-full w-full object-cover"
          draggable={false}
          onError={() => setImgErr(true)}
        />
      ) : null}
      {showFallback ? (
        <div className="absolute inset-0">
          <FallbackCardFace code={code} compact={compactFallback} />
        </div>
      ) : null}
    </div>
  );
}

/** Width/height in rem + gap/overlap px for hand row auto-fit. */
const SEAT_HAND_TIERS = [
  { wRem: 3.02, hRem: 4.45, compactFallback: false },
  { wRem: 2.68, hRem: 3.92, compactFallback: false },
  { wRem: 2.28, hRem: 3.25, compactFallback: true },
  { wRem: 1.98, hRem: 2.82, compactFallback: true },
  { wRem: 1.72, hRem: 2.45, compactFallback: true },
  { wRem: 1.5, hRem: 2.14, compactFallback: true },
];

/** Primary player hand under HOUSE — larger tiers than table seats. */
const MY_HAND_TIERS = [
  { wRem: 3.45, hRem: 5.05, compactFallback: false },
  { wRem: 3.05, hRem: 4.45, compactFallback: false },
  { wRem: 2.65, hRem: 3.88, compactFallback: true },
  { wRem: 2.3, hRem: 3.35, compactFallback: true },
  { wRem: 2.0, hRem: 2.9, compactFallback: true },
  { wRem: 1.72, hRem: 2.5, compactFallback: true },
];

/** Other players — compact observer windows. */
const OTHER_HAND_TIERS = [
  { wRem: 2.38, hRem: 3.45, compactFallback: false },
  { wRem: 2.08, hRem: 3.02, compactFallback: true },
  { wRem: 1.82, hRem: 2.62, compactFallback: true },
  { wRem: 1.58, hRem: 2.28, compactFallback: true },
  { wRem: 1.38, hRem: 1.98, compactFallback: true },
  { wRem: 1.2, hRem: 1.72, compactFallback: true },
];

function pickSeatHandLayout(availPx, cardCount, tiers = SEAT_HAND_TIERS) {
  const n = Math.max(0, Math.floor(cardCount) || 0);
  const first = tiers[0] || SEAT_HAND_TIERS[0];
  if (n <= 0 || availPx <= 4) {
    return { wRem: first.wRem, hRem: first.hRem, gapPx: 3, overlapPx: 0, compactFallback: Boolean(first.compactFallback) };
  }
  const gaps = Math.max(0, n - 1);
  const rootPx = typeof window !== "undefined" ? parseFloat(getComputedStyle(document.documentElement).fontSize) || 16 : 16;

  for (let g = 4; g >= 2; g -= 2) {
    for (const tier of tiers) {
      const wPx = tier.wRem * rootPx;
      const total = n * wPx + gaps * g;
      if (total <= availPx) {
        return { ...tier, gapPx: g, overlapPx: 0 };
      }
    }
  }

  const smallest = tiers[tiers.length - 1];
  let wRem = smallest.wRem;
  let hRem = smallest.hRem;
  const wPx0 = wRem * rootPx;
  const minGap = 1;
  const base = n * wPx0 + gaps * minGap;
  let overlapPx = 0;
  if (base > availPx && gaps > 0) {
    overlapPx = Math.ceil((base - availPx) / gaps);
    const maxOv = Math.max(2, Math.floor(wPx0 * 0.42));
    overlapPx = Math.min(overlapPx, maxOv);
  }
  let lineWidth = n * wRem * rootPx + gaps * minGap - overlapPx * gaps;
  if (lineWidth > availPx && n > 0) {
    const scale = Math.max(0.55, availPx / lineWidth);
    wRem *= scale;
    hRem *= scale;
    lineWidth = n * wRem * rootPx + gaps * minGap - overlapPx * gaps;
    if (lineWidth > availPx && gaps > 0) {
      const need = Math.ceil((lineWidth - availPx) / gaps);
      overlapPx = Math.min(overlapPx + need, Math.floor(wRem * rootPx * 0.48));
    }
  }
  return { wRem, hRem, gapPx: minGap, overlapPx, compactFallback: true };
}

function SeatHandRow({ hand, handKey, tiers = SEAT_HAND_TIERS }) {
  const rowRef = useRef(null);
  const [layout, setLayout] = useState(() => pickSeatHandLayout(200, (hand || []).length, tiers));
  const cards = hand || [];
  const n = cards.length;

  useEffect(() => {
    const el = rowRef.current;
    if (!el || n < 1) return undefined;
    const run = () => {
      const w = el.clientWidth;
      setLayout(pickSeatHandLayout(w, n, tiers));
    };
    run();
    const ro = new ResizeObserver(run);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, handKey, tiers]);

  if (n < 1) return null;

  const fit = {
    wRem: layout.wRem,
    hRem: layout.hRem,
    compactFallback: layout.compactFallback,
  };

  return (
    <div
      ref={rowRef}
      className="flex w-full min-w-0 flex-row flex-nowrap items-center justify-center"
      style={{ gap: layout.gapPx }}
    >
      {cards.map((c, ci) => (
        <div
          key={`${handKey}-${ci}-${c}`}
          className="shrink-0"
          style={ci > 0 && layout.overlapPx > 0 ? { marginLeft: -layout.overlapPx } : undefined}
        >
          <PlayingCardOv2 code={c} seatFit={fit} />
        </div>
      ))}
    </div>
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
  loadError = "",
}) {
  const [nowTick, setNowTick] = useState(() => Date.now());
  const [actionLock, setActionLock] = useState(false);
  const [resultToastOpen, setResultToastOpen] = useState(false);
  const lastToastRoundRef = useRef(null);
  const resultToastTimerRef = useRef(null);
  const actionLockRef = useRef(false);
  const betLockRef = useRef(false);
  const quickAddLockRef = useRef(false);
  const sitLockRef = useRef(false);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [playDraftStr, setPlayDraftStr] = useState("");
  const [dealerRevealN, setDealerRevealN] = useState(0);
  const dealerRevealTimersRef = useRef([]);

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

  const mySeatIndex = mySeat?.seatIndex;
  const otherSeatIndices = useMemo(() => {
    if (mySeatIndex != null && mySeatIndex >= 0 && mySeatIndex < 6) {
      return [0, 1, 2, 3, 4, 5].filter(i => i !== mySeatIndex);
    }
    return [0, 1, 2, 3, 4, 5];
  }, [mySeatIndex]);

  const intendedBetFloor = Math.floor(Number(mySeat?.intendedBet) || 0);

  useEffect(() => {
    if (phase !== "betting" || !mySeat) return;
    const v = intendedBetFloor >= minBet ? intendedBetFloor : minBet;
    setPlayDraftStr(String(v));
  }, [phase, engine?.roundSeq, intendedBetFloor, minBet, mySeat?.seatIndex, mySeat?.participantKey]);

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

  const dealer = engine?.dealerHand || [];
  const dealerHidden = Boolean(engine?.dealerHidden);
  const dealerSig = dealer.join("|");
  const dealerRevealComplete =
    dealer.length === 0 ||
    dealerHidden ||
    (dealer.length > 0 && dealerRevealN >= dealer.length);

  const shouldShowResultToastAfterReveal = shouldShowResultToast && dealerRevealComplete;

  useEffect(() => {
    if (!shouldShowResultToastAfterReveal || !roomId || !summaryDismissRound) {
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
  }, [shouldShowResultToastAfterReveal, roomId, summaryDismissRound]);

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

  /** Seconds left: turn timer in acting when set, else phase window. */
  const houseCountdownSeconds = useMemo(() => {
    if (phase === "acting" && engine?.turnDeadline != null && phaseEndsMs(engine.turnDeadline) > 0) {
      return Math.max(0, Math.ceil((phaseEndsMs(engine.turnDeadline) - nowTick) / 1000));
    }
    return secsLeft(engine?.phaseEndsAt);
  }, [phase, engine?.turnDeadline, engine?.phaseEndsAt, nowTick]);

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

  useEffect(() => {
    dealerRevealTimersRef.current.forEach(clearTimeout);
    dealerRevealTimersRef.current = [];
    if (dealer.length === 0) {
      setDealerRevealN(0);
      return undefined;
    }
    if (dealerHidden) {
      setDealerRevealN(1);
      return undefined;
    }
    /** Readable sequential reveal: pause after up card, then each hole/extra card. */
    const PAUSE_AFTER_UP_MS = 980;
    const PAUSE_BETWEEN_CARDS_MS = 920;
    setDealerRevealN(1);
    for (let k = 2; k <= dealer.length; k++) {
      const delay = PAUSE_AFTER_UP_MS + (k - 2) * PAUSE_BETWEEN_CARDS_MS;
      const t = window.setTimeout(() => setDealerRevealN(k), delay);
      dealerRevealTimersRef.current.push(t);
    }
    return () => {
      dealerRevealTimersRef.current.forEach(clearTimeout);
      dealerRevealTimersRef.current = [];
    };
  }, [dealerSig, dealerHidden, dealer.length]);

  const parsedDraftPlay = Math.floor(Number(String(playDraftStr).replace(/\D/g, "")) || 0);
  const draftPlayValid = parsedDraftPlay >= minBet && parsedDraftPlay <= maxBet;

  const bumpDraftByTableMin = useCallback(() => {
    if (engineRef.current?.phase !== "betting" || operateBusy || quickAddLockRef.current) return;
    quickAddLockRef.current = true;
    setPlayDraftStr(prev => {
      const cur = Math.floor(Number(String(prev).replace(/\D/g, "")) || 0);
      const base = cur < minBet ? minBet : cur;
      const next = Math.min(maxBet, base + minBet);
      return String(next);
    });
    window.setTimeout(() => {
      quickAddLockRef.current = false;
    }, 140);
  }, [maxBet, minBet, operateBusy]);

  const commitPlayAmount = useCallback(async () => {
    const e = engineRef.current;
    if (e?.phase !== "betting" || betLockRef.current || operateBusy) return;
    const raw = Math.floor(Number(String(playDraftStr).replace(/\D/g, "")) || 0);
    if (raw < minBet || raw > maxBet) return;
    betLockRef.current = true;
    try {
      await onOperate("set_bet", { amount: raw });
    } finally {
      window.setTimeout(() => {
        betLockRef.current = false;
      }, 400);
    }
  }, [playDraftStr, maxBet, minBet, onOperate, operateBusy]);

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

  const visibleDealerCards = !dealerHidden && dealerRevealN > 0 ? dealer.slice(0, dealerRevealN) : [];
  const dealerTotalLive =
    !dealerHidden && visibleDealerCards.length > 0 ? handTotal(visibleDealerCards) : null;
  const dealerHandCount = dealer.length;
  const dealerGap = dealerHandCount >= 4 ? "gap-0.5" : "gap-1";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-white">
      {loadError ? (
        <div className="shrink-0 px-0.5 text-center text-[10px] leading-tight text-red-300/95" role="alert">
          {loadError}
        </div>
      ) : null}
      {/* Board: no vertical scroll — flex fits within shell viewport */}
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden overflow-x-hidden sm:gap-1">
        {/* HOUSE — same height as MY HAND; larger on desktop */}
        <div className="relative flex h-[8.775rem] shrink-0 flex-col rounded-xl border border-amber-900/40 bg-gradient-to-b from-zinc-900/90 to-black/60 px-1.5 py-1 sm:h-[7.75rem]">
          <div
            className="pointer-events-none absolute right-1.5 top-0.5 z-10 min-w-[1.75rem] text-right tabular-nums text-[17px] font-black leading-none tracking-tight text-amber-100 drop-shadow-md sm:text-xl"
            aria-live="polite"
            aria-atomic="true"
          >
            {houseCountdownSeconds}
          </div>
          <div className="shrink-0 text-center text-[10px] font-bold uppercase tracking-wide text-amber-200/80">House</div>
          <div className={`flex min-h-0 flex-1 items-center justify-center overflow-x-auto py-0.5 ${dealerGap}`}>
            {dealer.length === 0 ? (
              <span className="text-xs text-white/50">—</span>
            ) : dealerHidden ? (
              dealer.map((c, i) => {
                if (i === 0) return <PlayingCardOv2 key="dh0" code={c} handCardCount={dealerHandCount} />;
                if (i === 1) return <PlayingCardOv2 key="dh1" hidden handCardCount={dealerHandCount} />;
                return null;
              })
            ) : (
              dealer.map((c, i) => {
                const up = i < dealerRevealN;
                return (
                  <PlayingCardOv2
                    key={`d-${dealerSig}-${i}`}
                    code={up ? c : undefined}
                    hidden={!up}
                    handCardCount={dealerHandCount}
                  />
                );
              })
            )}
          </div>
          {!dealerHidden && dealer.length > 0 ? (
            <div className="h-[14px] shrink-0 text-center text-[10px] leading-[14px] text-zinc-400">
              {dealerTotalLive != null ? `Total ${dealerTotalLive}` : "\u00a0"}
            </div>
          ) : (
            <div className="h-[14px] shrink-0" aria-hidden />
          )}
        </div>

        {/* Other seats — mobile: compact fixed height (no scroll); sm+: grows in middle */}
        <div
          className={
            otherSeatIndices.length <= 5
              ? "flex h-[3.875rem] shrink-0 flex-col overflow-hidden sm:min-h-[8.75rem] sm:flex-1"
              : "flex h-[8rem] shrink-0 flex-col overflow-hidden sm:min-h-[8.75rem] sm:flex-1"
          }
        >
          <div
            className={
              otherSeatIndices.length <= 5
                ? "grid h-full w-full grid-cols-5 gap-0.5 sm:min-h-0 sm:gap-1"
                : "grid h-full w-full grid-cols-3 grid-rows-2 gap-1 sm:min-h-0 sm:grid-cols-6 sm:grid-rows-1 sm:gap-1"
            }
          >
          {otherSeatIndices.map(idx => {
            const seat = seatsForUi[idx];
            const taken = Boolean(seat?.participantKey);
            const isActingSeat = phase === "acting" && currentTurn?.seatIndex === idx;
            const actingHere = isActingSeat ? `ring-2 ring-sky-400 ring-offset-1 ring-offset-black/80` : "";
            const ariaSeat = taken
              ? `${String(seat.displayName || "Player").trim() || "Player"}${isActingSeat ? " — turn to act" : ""}`
              : `Open seat ${idx + 1}`;
            return (
              <button
                key={idx}
                type="button"
                aria-label={ariaSeat}
                disabled={operateBusy || taken}
                onClick={() => {
                  if (!taken) trySit(idx);
                }}
                className={`flex h-full min-h-0 touch-manipulation flex-col overflow-hidden rounded-md border border-white/10 bg-black/40 px-px py-0 text-left transition ${actingHere} disabled:opacity-40`}
              >
                <div className="flex h-[10px] max-h-[10px] shrink-0 items-center gap-px overflow-hidden leading-none">
                  {taken ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-[6px] font-semibold leading-none text-white/90">
                        {String(seat.displayName || "").trim() || "…"}
                      </span>
                      {isActingSeat ? (
                        <span className="shrink-0 rounded px-px text-[5px] font-extrabold uppercase leading-none text-sky-200">
                          Turn
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <span className="w-full text-center text-[6px] font-medium leading-none text-white/50">Open</span>
                  )}
                </div>
                <div className="flex h-[calc(100%-10px)] min-h-0 w-full shrink-0 flex-col justify-center gap-px overflow-hidden">
                  {seat.hands?.length ? (
                    seat.hands.map((h, hi) => (
                      <SeatHandRow
                        key={hi}
                        hand={h}
                        handKey={`o-${idx}-${hi}-${(h || []).join("|")}`}
                        tiers={OTHER_HAND_TIERS}
                      />
                    ))
                  ) : null}
                </div>
              </button>
            );
          })}
          </div>
        </div>

        {/* MY HAND — fixed height = HOUSE; below other players */}
        <div className="relative flex h-[8.775rem] shrink-0 flex-col rounded-xl border border-emerald-800/35 bg-gradient-to-b from-zinc-900/88 to-black/58 px-1.5 py-1 sm:h-[7.75rem]">
          <div className="shrink-0 text-center text-[10px] font-bold uppercase tracking-wide text-emerald-200/85">Your hand</div>
          <div className="flex min-h-0 flex-1 flex-col justify-center gap-px overflow-hidden px-0.5">
            {mySeat ? (
              mySeat.hands?.length ? (
                mySeat.hands.map((h, hi) => (
                  <SeatHandRow
                    key={hi}
                    hand={h}
                    handKey={`mine-${hi}-${(h || []).join("|")}`}
                    tiers={MY_HAND_TIERS}
                  />
                ))
              ) : (
                <div className="text-center text-[9px] text-zinc-500">—</div>
              )
            ) : (
              <div className="text-center text-[9px] leading-tight text-zinc-500">Pick an open seat above</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom controls — fixed height; mobile dock + safe-area */}
      <div className="flex h-[11rem] shrink-0 flex-col justify-start gap-1 overflow-hidden border-t border-white/5 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom,0px))] sm:h-[7rem] sm:pb-2">
        {phase === "betting" && mySeat ? (
          <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border border-white/10 bg-black/25 px-2 py-1 sm:py-1.5">
            <div className="shrink-0 text-[10px] text-zinc-400">
              Choose play amount · type exact or use +{fmt(minBet)} · then Commit play
            </div>
            <div className="mt-1 flex shrink-0 flex-wrap items-center gap-1.5">
              <input
                value={playDraftStr}
                onChange={e => setPlayDraftStr(e.target.value)}
                inputMode="numeric"
                disabled={operateBusy || actionLock || phase !== "betting"}
                className="min-w-0 flex-1 rounded-md border border-white/15 bg-black/50 px-2 py-1.5 text-sm font-semibold text-white disabled:opacity-40"
                aria-label="Play amount"
              />
              <button
                type="button"
                disabled={operateBusy || actionLock || phase !== "betting"}
                onClick={() => bumpDraftByTableMin()}
                className="h-10 shrink-0 touch-manipulation rounded-lg border border-white/20 bg-white/10 px-2.5 text-[11px] font-bold text-zinc-100 disabled:opacity-35"
              >
                +{fmt(minBet)}
              </button>
              <button
                type="button"
                disabled={operateBusy || actionLock || phase !== "betting" || !draftPlayValid}
                onClick={() => void commitPlayAmount()}
                className="h-10 shrink-0 touch-manipulation rounded-lg bg-emerald-600 px-3 text-[11px] font-bold text-white disabled:opacity-35"
              >
                Commit play
              </button>
            </div>
            {!draftPlayValid && playDraftStr.trim() !== "" ? (
              <div className="mt-0.5 shrink-0 text-[9px] text-amber-200/90">
                Enter between {fmt(minBet)} and {fmt(maxBet)}
              </div>
            ) : (
              <div className="h-[14px] shrink-0" aria-hidden />
            )}
          </div>
        ) : phase === "acting" && isMyTurn ? (
          <div className="flex h-full min-h-0 flex-col justify-center rounded-lg border border-sky-500/30 bg-sky-950/30 px-1 py-1 sm:py-1.5">
            <div className="mb-0.5 shrink-0 text-center text-[11px] font-bold text-sky-200">Your move</div>
            <div className="grid shrink-0 grid-cols-3 gap-1 sm:grid-cols-6">
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
                  className="min-h-[40px] touch-manipulation rounded-md bg-white/10 py-2 text-[10px] font-bold tracking-wide disabled:opacity-35 active:scale-[0.98] sm:min-h-[40px]"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full rounded-lg border border-transparent bg-transparent" aria-hidden />
        )}
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
        <div className="pointer-events-none fixed bottom-[calc(11rem+0.65rem+env(safe-area-inset-bottom,0px))] left-2 right-2 z-30 mx-auto max-w-lg sm:bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
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
