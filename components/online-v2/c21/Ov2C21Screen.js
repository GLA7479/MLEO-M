"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { handTotal, splitCardCode } from "../../../lib/solo-v2/challenge21HandMath";
import { getOv2C21LegalFlags } from "../../../lib/online-v2/c21/ov2C21LegalMoves";
import {
  peekOnlineV2Vault,
  readOnlineV2Vault,
  subscribeOnlineV2Vault,
} from "../../../lib/online-v2/onlineV2VaultBridge";

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
      ? "h-[3.6rem] w-[2.45rem] sm:h-[3.85rem] sm:w-[2.85rem]"
      : "h-[5.45rem] w-[3.75rem] sm:h-[5.75rem] sm:w-[4rem]";
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
  { wRem: 4.08, hRem: 5.95, compactFallback: false },
  { wRem: 3.52, hRem: 5.18, compactFallback: false },
  { wRem: 3.02, hRem: 4.42, compactFallback: true },
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
  const [lossBoardHold, setLossBoardHold] = useState(null);
  const lastToastRoundRef = useRef(null);
  const resultToastTimerRef = useRef(null);
  const actionLockRef = useRef(false);
  const betLockRef = useRef(false);
  const quickAddLockRef = useRef(false);
  const sitLockRef = useRef(false);
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const [playDraftStr, setPlayDraftStr] = useState("");
  const [economyHint, setEconomyHint] = useState("");
  const [vaultBalance, setVaultBalance] = useState(() => Math.max(0, Math.floor(Number(peekOnlineV2Vault().balance) || 0)));
  const [dealerRevealN, setDealerRevealN] = useState(0);
  const dealerRevealTimersRef = useRef([]);

  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let c = true;
    void readOnlineV2Vault({ fresh: true }).then(s => {
      if (c) setVaultBalance(Math.max(0, Math.floor(Number(s.balance) || 0)));
    });
    return () => {
      c = false;
    };
  }, [roomId]);

  useEffect(() => subscribeOnlineV2Vault(() => setVaultBalance(Math.max(0, Math.floor(Number(peekOnlineV2Vault().balance) || 0)))), []);

  const phase = engine?.phase || "betting";

  useEffect(() => {
    actionLockRef.current = false;
    setActionLock(false);
    setEconomyHint("");
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
      betCommitRecorded: false,
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

  /** Only show play after server-secured commit (betting) or active round stake. */
  const myPlayAmountLabel = useMemo(() => {
    if (!mySeat) return null;
    const rb = Math.floor(Number(mySeat.roundBet) || 0);
    if (mySeat.inRound && rb > 0) return fmt(rb);
    if (phase === "betting") {
      const ib = Math.floor(Number(mySeat.intendedBet) || 0);
      if (mySeat.betCommitRecorded && ib >= minBet) return fmt(ib);
    }
    return null;
  }, [mySeat, phase, minBet, engine?.roundSeq]);

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
    if (!mySummary) return;
    const vd = Number(mySummary.vaultDelta);
    if (vd >= 0) {
      setLossBoardHold(null);
      return;
    }
    if (phase !== "between_rounds" || !dealerRevealComplete) return;
    const rk = summaryDismissRound;
    const srcSeats = Array.isArray(engine?.seats) && engine.seats.length === 6 ? engine.seats : seatsForUi;
    setLossBoardHold(prev => {
      if (prev?.roundKey === rk) return prev;
      return {
        roundKey: rk,
        until: Date.now() + 10000,
        dealerHand: [...(engine?.dealerHand || [])],
        dealerHiddenVal: Boolean(engine?.dealerHidden),
        seatsSnap: srcSeats.map(s => ({
          hands: Array.isArray(s.hands) ? s.hands.map(h => [...h]) : [],
        })),
      };
    });
  }, [
    phase,
    dealerRevealComplete,
    mySummary,
    summaryDismissRound,
    engine?.dealerHand,
    engine?.dealerHidden,
    engine?.seats,
    seatsForUi,
  ]);

  useEffect(() => {
    if (!lossBoardHold) return;
    if (nowTick < lossBoardHold.until) return;
    setLossBoardHold(null);
  }, [nowTick, lossBoardHold]);

  const seatsForDisplay = useMemo(() => {
    const h = lossBoardHold && nowTick < lossBoardHold.until ? lossBoardHold.seatsSnap : null;
    if (!h) return seatsForUi;
    return seatsForUi.map((s, i) => ({
      ...s,
      hands: h[i]?.hands != null ? h[i].hands : s.hands,
    }));
  }, [seatsForUi, lossBoardHold, nowTick]);

  const displayMySeat = useMemo(
    () => (participantKey ? seatsForDisplay.find(s => s.participantKey === participantKey) : null),
    [seatsForDisplay, participantKey],
  );

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
    const toastMs = Number(mySummary?.vaultDelta) < 0 ? 10000 : 2000;
    if (resultToastTimerRef.current) window.clearTimeout(resultToastTimerRef.current);
    resultToastTimerRef.current = window.setTimeout(() => {
      setResultToastOpen(false);
      try {
        if (roomId) sessionStorage.setItem(`ov2_c21_rt_${roomId}_${summaryDismissRound}`, "1");
      } catch {
        /* ignore */
      }
      resultToastTimerRef.current = null;
    }, toastMs);
    return () => {
      if (resultToastTimerRef.current) {
        window.clearTimeout(resultToastTimerRef.current);
        resultToastTimerRef.current = null;
      }
    };
  }, [shouldShowResultToastAfterReveal, roomId, summaryDismissRound, mySummary?.vaultDelta]);

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
    () => getOv2C21LegalFlags({ phase, engine, participantKey, vaultBalance }),
    [phase, engine, participantKey, vaultBalance],
  );

  const mySplitHandCount = displayMySeat?.hands?.length || 0;
  const [splitViewIdx, setSplitViewIdx] = useState(0);
  const splitTurnKeyRef = useRef("");

  useEffect(() => {
    if (mySplitHandCount <= 1) {
      setSplitViewIdx(0);
      splitTurnKeyRef.current = "";
    }
  }, [mySplitHandCount]);

  useEffect(() => {
    if (mySplitHandCount <= 1) return;
    if (phase === "acting" && mySeat && currentTurn?.seatIndex === mySeat.seatIndex) {
      const k = `${currentTurn.seatIndex}-${currentTurn.handIndex}`;
      if (splitTurnKeyRef.current !== k) {
        splitTurnKeyRef.current = k;
        setSplitViewIdx(Math.min(Math.max(0, currentTurn.handIndex), mySplitHandCount - 1));
      }
    }
  }, [phase, mySeat, currentTurn, mySplitHandCount]);

  const myHandTotalLabel = useMemo(() => {
    if (!displayMySeat?.hands?.length) return null;
    if (mySplitHandCount > 1) {
      const h = displayMySeat.hands[Math.min(splitViewIdx, mySplitHandCount - 1)] || [];
      return h.length ? handTotal(h) : null;
    }
    const parts = displayMySeat.hands.filter(h => h && h.length).map(h => handTotal(h));
    return parts.length ? parts.join(" · ") : null;
  }, [displayMySeat, mySplitHandCount, splitViewIdx]);

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
  const vaultOkForCommit = vaultBalance >= parsedDraftPlay;
  const canSitToPlay = vaultBalance >= minBet;

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
    if (vaultBalance < raw) {
      setEconomyHint("Not enough vault for this play.");
      return;
    }
    betLockRef.current = true;
    try {
      const r = await onOperate("set_bet", { amount: raw });
      if (!r?.ok) {
        const code = r?.error?.code || r?.error?.payload?.code || "";
        setEconomyHint(
          code === "insufficient_vault"
            ? "Not enough vault for this play."
            : code === "DEVICE_REQUIRED"
              ? "Session required to commit play."
              : "Could not commit play. Try again.",
        );
      } else {
        try {
          const s = await readOnlineV2Vault({ fresh: true, forceServer: true });
          setVaultBalance(Math.max(0, Math.floor(Number(s.balance) || 0)));
        } catch {
          /* hook reconcile + subscribe */
        }
      }
    } finally {
      window.setTimeout(() => {
        betLockRef.current = false;
      }, 400);
    }
  }, [playDraftStr, maxBet, minBet, onOperate, operateBusy, vaultBalance]);

  const trySit = useCallback(
    idx => {
      if (sitLockRef.current || operateBusy) return;
      if (vaultBalance < minBet) {
        setEconomyHint("Not enough vault for this table minimum.");
        return;
      }
      sitLockRef.current = true;
      void onOperate("sit", { seatIndex: idx, displayName: displayName || "Guest" })
        .then(async r => {
          if (!r?.ok) {
            const code = r?.error?.code || r?.error?.payload?.code || "";
            setEconomyHint(
              code === "insufficient_vault_for_table"
                ? "Not enough vault for this table."
                : code === "DEVICE_REQUIRED"
                  ? "Session required to take a seat."
                  : "",
            );
          }
        })
        .finally(() => {
          window.setTimeout(() => {
            sitLockRef.current = false;
          }, 450);
        });
    },
    [displayName, minBet, onOperate, operateBusy, vaultBalance],
  );

  const lossHoldActive = Boolean(lossBoardHold && nowTick < lossBoardHold.until);
  const dealerRender = lossHoldActive ? lossBoardHold.dealerHand : dealer;
  const dealerHiddenRender = lossHoldActive ? lossBoardHold.dealerHiddenVal : dealerHidden;
  const dealerRevealNRender = lossHoldActive ? dealerRender.length : dealerRevealN;

  const visibleDealerCards =
    !dealerHiddenRender && dealerRevealNRender > 0 ? dealerRender.slice(0, dealerRevealNRender) : [];
  const dealerTotalCenter =
    dealerRender.length === 0
      ? null
      : dealerHiddenRender
        ? handTotal(dealerRender.slice(0, 1))
        : visibleDealerCards.length > 0
          ? handTotal(visibleDealerCards)
          : null;

  const dealerHandCount = dealerRender.length;
  const dealerRevealVisibleCount = dealerHiddenRender ? Math.min(2, dealerHandCount) : dealerRevealNRender;
  const dealerSigRender = dealerRender.join("|");
  const dealerGap = dealerRevealVisibleCount >= 4 ? "gap-0.5" : "gap-1";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden text-white">
      {loadError ? (
        <div className="shrink-0 px-0.5 text-center text-[10px] leading-tight text-red-300/95" role="alert">
          {loadError}
        </div>
      ) : null}
      {/* Board: no vertical scroll — flex fits within shell viewport */}
      <div className="flex min-h-0 flex-1 flex-col gap-px overflow-hidden overflow-x-hidden sm:gap-0.5">
        {/* HOUSE — label + timer corners; total top-center above cards */}
        <div className="relative h-[11.375rem] shrink-0 overflow-hidden rounded-xl border border-amber-900/40 bg-gradient-to-b from-zinc-900/90 to-black/60 px-1 sm:h-[10.375rem]">
          <div className="pointer-events-none absolute left-1 right-1 top-0.5 z-10 flex h-[1.05rem] items-center justify-between gap-1 leading-none">
            <span className="shrink-0 text-[8px] font-bold uppercase tracking-wide text-amber-200/85">House</span>
            <span
              className="shrink-0 text-right tabular-nums text-[15px] font-black tracking-tight text-amber-100 drop-shadow-md sm:text-lg"
              aria-live="polite"
              aria-atomic="true"
            >
              {houseCountdownSeconds}
            </span>
          </div>
          {dealerTotalCenter != null ? (
            <div className="pointer-events-none absolute left-1/2 top-[1.05rem] z-10 -translate-x-1/2 leading-none">
              <span className="text-[8px] font-semibold tabular-nums text-zinc-300/95">Total {dealerTotalCenter}</span>
            </div>
          ) : null}
          <div
            className={`absolute inset-x-1 top-[1.48rem] bottom-px flex items-center justify-center overflow-x-auto ${dealerGap}`}
          >
            {dealerRender.length === 0 ? (
              <span className="text-xs text-white/50">—</span>
            ) : dealerHiddenRender ? (
              dealerRender.map((c, i) => {
                if (i === 0) return <PlayingCardOv2 key="dh0" code={c} handCardCount={dealerHandCount} />;
                if (i === 1) return <PlayingCardOv2 key="dh1" hidden handCardCount={dealerHandCount} />;
                return null;
              })
            ) : (
              dealerRender.slice(0, dealerRevealNRender).map((c, i) => (
                <PlayingCardOv2
                  key={`d-${dealerSigRender}-${i}`}
                  code={c}
                  handCardCount={Math.max(1, dealerRevealNRender)}
                />
              ))
            )}
          </div>
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
            const seat = seatsForDisplay[idx];
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
                disabled={operateBusy || taken || (!taken && !canSitToPlay)}
                onClick={() => {
                  if (!taken) trySit(idx);
                }}
                className={`flex h-full min-h-0 touch-manipulation flex-col overflow-hidden rounded-md border border-white/10 bg-black/40 px-px py-0 text-left transition ${actingHere} disabled:opacity-40`}
              >
                <div className="flex h-[11px] max-h-[11px] shrink-0 items-center gap-px overflow-hidden leading-none">
                  {taken ? (
                    <>
                      <span className="min-w-0 flex-1 truncate text-left text-[6px] font-semibold leading-none text-white/90">
                        {String(seat.displayName || "").trim() || "…"}
                      </span>
                      {(() => {
                        const rb = Math.floor(Number(seat.roundBet) || 0);
                        if (seat.inRound && rb > 0 && phase !== "betting") {
                          return (
                            <span className="shrink-0 text-[5px] font-semibold tabular-nums leading-none text-emerald-300/85">
                              Play {fmt(rb)}
                            </span>
                          );
                        }
                        if (phase === "betting") {
                          const ib = Math.floor(Number(seat.intendedBet) || 0);
                          if (seat.betCommitRecorded && ib >= minBet) {
                            return (
                              <span className="shrink-0 text-[5px] font-semibold tabular-nums leading-none text-emerald-300/85">
                                Play {fmt(ib)}
                              </span>
                            );
                          }
                        }
                        return null;
                      })()}
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
                <div className="relative flex h-[calc(100%-11px)] min-h-0 w-full shrink-0 flex-col justify-center gap-px overflow-hidden">
                  {(() => {
                    const parts = (seat.hands || []).filter(h => h && h.length).map(h => handTotal(h));
                    const totalsLabel = parts.length ? parts.join(" · ") : null;
                    return taken && totalsLabel ? (
                      <span className="pointer-events-none absolute left-1/2 top-px z-[1] -translate-x-1/2 text-[5px] font-bold tabular-nums leading-none text-zinc-400/95">
                        {totalsLabel}
                      </span>
                    ) : null;
                  })()}
                  <div
                    className={`flex min-h-0 flex-1 flex-col justify-center gap-px overflow-hidden ${taken && (seat.hands || []).some(h => h && h.length) ? "pt-2" : ""}`}
                  >
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
                </div>
              </button>
            );
          })}
          </div>
        </div>

        {/* YOUR HAND — label corner; total top-center above cards */}
        <div className="relative h-[11.375rem] shrink-0 overflow-hidden rounded-xl border border-emerald-800/35 bg-gradient-to-b from-zinc-900/88 to-black/58 px-1 sm:h-[10.375rem]">
          <span className="pointer-events-none absolute left-1 top-0.5 z-10 text-[8px] font-bold uppercase leading-none tracking-wide text-emerald-200/85">
            Your hand
          </span>
          {myHandTotalLabel != null ? (
            <div className="pointer-events-none absolute left-1/2 top-[1.05rem] z-10 -translate-x-1/2 leading-none">
              <span className="text-[8px] font-semibold tabular-nums text-emerald-200/90">Total {myHandTotalLabel}</span>
            </div>
          ) : null}
          <div className="absolute right-1 top-0.5 z-20 flex max-w-[70%] flex-row flex-nowrap items-center justify-end gap-0.5">
            {myPlayAmountLabel ? (
              <span className="shrink-0 text-[6px] font-semibold tabular-nums leading-none text-emerald-300/90">
                Play {myPlayAmountLabel}
              </span>
            ) : null}
            {phase === "acting" && isMyTurn && legal.surrender ? (
              <button
                type="button"
                disabled={operateBusy || actionLock}
                onClick={guardAction(async () => {
                  const e = engineRef.current;
                  const ct = e?.currentTurn;
                  const ms = e?.seats?.find(s => s.participantKey === participantKey);
                  if (e?.phase !== "acting" || !ms || ct?.seatIndex !== ms.seatIndex) return;
                  await onOperate("surrender");
                })}
                className="shrink-0 touch-manipulation rounded border border-rose-500/35 bg-rose-950/40 px-1 py-px text-[6px] font-extrabold uppercase leading-none text-rose-100 disabled:opacity-25"
              >
                Surrender
              </button>
            ) : null}
            {phase === "acting" && isMyTurn ? (
              <span className="shrink-0 text-[6px] font-extrabold uppercase leading-none text-sky-300/95">Turn</span>
            ) : null}
          </div>
          <div className="absolute inset-x-1 top-[1.48rem] bottom-[1.65rem] flex flex-col items-center justify-center gap-px overflow-hidden">
            {mySeat ? (
              displayMySeat?.hands?.length ? (
                mySplitHandCount > 1 ? (
                  <SeatHandRow
                    hand={displayMySeat.hands[Math.min(splitViewIdx, mySplitHandCount - 1)] || []}
                    handKey={`mine-sv-${splitViewIdx}-${(displayMySeat.hands[Math.min(splitViewIdx, mySplitHandCount - 1)] || []).join("|")}`}
                    tiers={MY_HAND_TIERS}
                  />
                ) : (
                  displayMySeat.hands.map((h, hi) => (
                    <SeatHandRow
                      key={hi}
                      hand={h}
                      handKey={`mine-${hi}-${(h || []).join("|")}`}
                      tiers={MY_HAND_TIERS}
                    />
                  ))
                )
              ) : (
                <span className="text-[9px] text-zinc-500">—</span>
              )
            ) : (
              <span className="px-1 text-center text-[8px] leading-tight text-zinc-500">Pick an open seat above</span>
            )}
          </div>
          {mySeat && mySplitHandCount > 1 ? (
            <div className="absolute bottom-1 left-1 right-1 z-20 flex items-center justify-between gap-1">
              {displayMySeat.hands.map((_, hi) => {
                const isActionHere =
                  phase === "acting" && isMyTurn && currentTurn?.seatIndex === mySeat?.seatIndex && currentTurn?.handIndex === hi;
                return (
                  <button
                    key={hi}
                    type="button"
                    onClick={() => setSplitViewIdx(hi)}
                    className={`min-h-[22px] min-w-0 flex-1 touch-manipulation rounded border px-0.5 py-px text-[7px] font-extrabold uppercase leading-none ${
                      isActionHere
                        ? "border-sky-400 bg-sky-950/55 text-sky-100 shadow-[0_0_0_1px_rgba(56,189,248,0.35)]"
                        : splitViewIdx === hi
                          ? "border-emerald-500/45 bg-emerald-950/35 text-emerald-100"
                          : "border-white/12 bg-black/45 text-zinc-400"
                    }`}
                  >
                    Hand {hi + 1}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {/* Bottom controls — fixed height; mobile dock + safe-area */}
      <div className="flex h-[5.75rem] shrink-0 flex-col justify-center gap-0 overflow-hidden border-t border-white/5 pb-[max(0.25rem,env(safe-area-inset-bottom,0px))] pt-0 sm:h-[4.25rem] sm:pb-1.5 sm:pt-px">
        {phase === "betting" && mySeat ? (
          <div className="flex h-full min-h-0 flex-col justify-center rounded border border-white/10 bg-black/30 px-1 py-px sm:px-1.5 sm:py-0.5">
            <div className="shrink-0 text-[8px] leading-tight text-zinc-400">
              Choose play · +{fmt(minBet)} · Commit
            </div>
            <div className="mt-px flex shrink-0 flex-wrap items-center gap-0.5">
              <input
                value={playDraftStr}
                onChange={e => setPlayDraftStr(e.target.value)}
                inputMode="numeric"
                disabled={operateBusy || actionLock || phase !== "betting"}
                className="min-w-0 flex-1 rounded border border-white/15 bg-black/50 px-1 py-0.5 text-[11px] font-semibold text-white disabled:opacity-40"
                aria-label="Play amount"
              />
              <button
                type="button"
                disabled={operateBusy || actionLock || phase !== "betting"}
                onClick={() => bumpDraftByTableMin()}
                className="h-7 shrink-0 touch-manipulation rounded border border-white/20 bg-white/10 px-1.5 text-[9px] font-bold text-zinc-100 disabled:opacity-35"
              >
                +{fmt(minBet)}
              </button>
              <button
                type="button"
                disabled={operateBusy || actionLock || phase !== "betting" || !draftPlayValid || !vaultOkForCommit}
                onClick={() => void commitPlayAmount()}
                className="h-7 shrink-0 touch-manipulation rounded bg-emerald-600 px-2 text-[9px] font-bold text-white disabled:opacity-35"
              >
                Commit play
              </button>
            </div>
            {!draftPlayValid && playDraftStr.trim() !== "" ? (
              <div className="mt-px shrink-0 text-[7px] leading-tight text-amber-200/90">
                {fmt(minBet)}–{fmt(maxBet)}
              </div>
            ) : null}
            {economyHint ? (
              <div className="mt-px shrink-0 text-[7px] leading-tight text-rose-200/95" role="status">
                {economyHint}
              </div>
            ) : null}
            {draftPlayValid && !vaultOkForCommit ? (
              <div className="mt-px shrink-0 text-[7px] leading-tight text-amber-200/90">Vault too low for this amount.</div>
            ) : null}
          </div>
        ) : phase === "acting" && isMyTurn ? (
          <div className="grid w-full shrink-0 grid-cols-2 gap-px px-0.5 sm:grid-cols-4 sm:gap-0.5 sm:px-0.5">
            {[
              ["hit", "HIT", legal.hit],
              ["stand", "STAND", legal.stand],
              ["double", "DOUBLE", legal.double],
              ["split", "SPLIT", legal.split],
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
                className="min-h-[28px] touch-manipulation rounded border border-white/10 bg-white/10 py-0.5 text-[8px] font-bold tracking-wide disabled:opacity-35 active:scale-[0.98] sm:min-h-[30px] sm:text-[9px]"
              >
                {label}
              </button>
            ))}
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
        <div className="pointer-events-none fixed bottom-[calc(5.75rem+0.25rem+env(safe-area-inset-bottom,0px))] left-2 right-2 z-30 mx-auto max-w-lg sm:bottom-[calc(4.25rem+0.25rem+env(safe-area-inset-bottom,0px))]">
          <div
            className={`rounded-xl border bg-zinc-950/95 px-3 py-2 shadow-lg backdrop-blur-sm ${
              Number(mySummary.vaultDelta) < 0
                ? "border-rose-500/45"
                : Number(mySummary.vaultDelta) > 0
                  ? "border-emerald-500/35"
                  : "border-zinc-500/35"
            }`}
          >
            <div
              className={`text-center text-[10px] font-bold uppercase tracking-wide ${
                Number(mySummary.vaultDelta) < 0
                  ? "text-rose-300/95"
                  : Number(mySummary.vaultDelta) > 0
                    ? "text-emerald-300/90"
                    : "text-zinc-400"
              }`}
            >
              Round result
            </div>
            <div
              className={`mt-0.5 text-center text-sm font-black ${
                Number(mySummary.vaultDelta) < 0 ? "text-rose-100" : "text-white"
              }`}
            >
              {mySummary.headline}
            </div>
            <div className="mt-0.5 text-center text-[11px] text-zinc-300">
              Net vault ·{" "}
              <span
                className={`font-semibold ${
                  Number(mySummary.vaultDelta) < 0
                    ? "text-rose-200"
                    : Number(mySummary.vaultDelta) > 0
                      ? "text-emerald-200"
                      : "text-white"
                }`}
              >
                {fmt(mySummary.vaultDelta)}
              </span>
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
