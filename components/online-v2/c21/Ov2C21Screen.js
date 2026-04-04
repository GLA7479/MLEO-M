"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { handTotal, splitCardCode } from "../../../lib/solo-v2/challenge21HandMath";
import { getOv2C21LegalFlags } from "../../../lib/online-v2/c21/ov2C21LegalMoves";
import {
  peekOnlineV2Vault,
  readOnlineV2Vault,
  subscribeOnlineV2Vault,
} from "../../../lib/online-v2/onlineV2VaultBridge";
import { OV2_C21_BETTING_PRE_LOCK_FREEZE_MS } from "../../../lib/online-v2/c21/ov2C21ClientConstants";

/** Same delay as `Ov2CwScreen` sit switch toast — only show if sit is slow. */
const OV2_C21_SIT_SWITCH_TOAST_DELAY_MS = 350;

function fmt(n) {
  const x = Math.floor(Number(n) || 0);
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
  return String(x);
}

/** Play amount for other-seat UI / inspector (committed or in-round only). */
function otherSeatCommittedPlayLabel(seat, phase, minBet) {
  if (!seat) return null;
  const rb = Math.floor(Number(seat.roundBet) || 0);
  if (seat.inRound && rb > 0 && phase !== "betting") return fmt(rb);
  if (phase === "betting") {
    const ib = Math.floor(Number(seat.intendedBet) || 0);
    if (seat.betCommitRecorded && ib >= minBet) return fmt(ib);
  }
  return null;
}

/** Acting-phase seat to follow for Auto Watch (non-self, occupied). */
function autoWatchTargetSeatIndex(phase, currentTurn, mySeatIndex, seatsForUi) {
  if (phase !== "acting" || currentTurn == null) return null;
  const idx = Math.floor(Number(currentTurn.seatIndex));
  if (!Number.isFinite(idx) || idx < 0 || idx > 5) return null;
  if (mySeatIndex != null && idx === mySeatIndex) return null;
  const s = seatsForUi[idx];
  if (!s?.participantKey) return null;
  return idx;
}

/** Signature for “who auto-watch is following” in acting phase; empty when not applicable. */
function autoWatchFollowKey(phase, currentTurn) {
  if (phase !== "acting" || currentTurn == null) return "";
  const si = Math.floor(Number(currentTurn.seatIndex));
  const hi = Math.floor(Number(currentTurn.handIndex));
  if (!Number.isFinite(si) || !Number.isFinite(hi)) return "";
  return `a:${si}:${hi}`;
}

/** Seat index from an `autoWatchFollowKey` value (`a:seat:hand`). */
function parseFollowKeySeatIndex(key) {
  if (!key || typeof key !== "string" || !key.startsWith("a:")) return null;
  const parts = key.split(":");
  if (parts.length < 2) return null;
  const si = Math.floor(Number(parts[1]));
  return Number.isFinite(si) ? si : null;
}

const AUTO_WATCH_DWELL_MS = 1050;

function otherSeatHandStatusLabel(phase, seatIndex, handIndex, seat, currentTurn) {
  const m = seat?.handMeta?.[handIndex];
  if (!m) return "—";
  if (m.surrendered) return "Yield";
  if (m.busted) return "Bust";
  if (m.stood) return "Stand";
  if (phase === "acting" && currentTurn?.seatIndex === seatIndex && currentTurn?.handIndex === handIndex) {
    return "Turn";
  }
  if (phase === "betting") return "Ready";
  if (phase === "insurance" && seat?.inRound && seat?.insuranceChoice == null) return "Option?";
  if (phase === "insurance") return "—";
  if (seat?.inRound && phase === "acting") return "Wait";
  if (phase === "between_rounds") return "Settled";
  return "—";
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
      className={`flex h-full w-full flex-col items-center justify-center rounded-[4px] border border-black/15 bg-[#faf9f7] px-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.85),0_1px_2px_rgba(0,0,0,0.12)] ${
        red ? "text-[#b91c1c]" : "text-[#0f172a]"
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
    "shrink-0 overflow-hidden rounded-[5px] border border-black/25 shadow-[0_3px_10px_rgba(0,0,0,0.45),0_1px_2px_rgba(0,0,0,0.35)] sm:rounded-[6px]";
  const boxClass = `${classSize} ${baseBox}`.trim();

  if (hidden) {
    return (
      <div
        className={`${boxClass} border-[#1e293b] bg-[#152238]`}
        style={styleSize || undefined}
      >
        <img
          src="/card-backs/poker-back.jpg"
          alt=""
          className="h-full w-full object-cover opacity-[0.97]"
          draggable={false}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-[inherit] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]"
          aria-hidden
        />
      </div>
    );
  }
  if (!code) {
    return (
      <div
        className={`${boxClass} border-white/10 bg-black/50`}
        style={styleSize || undefined}
      />
    );
  }
  const api = toDeckApiImageCode(code);
  const url = api ? `https://deckofcardsapi.com/static/img/${api}.png` : null;
  const showFallback = !url || imgErr;
  return (
    <div
      className={`${boxClass} relative border-black/20 [box-shadow:inset_0_0_0_1px_rgba(255,255,255,0.06),0_3px_12px_rgba(0,0,0,0.4)]`}
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

/** Player inspector popup — same ladder as main hand, scaled up for readability on near-black UI. */
const INSPECTOR_HAND_TIERS = MY_HAND_TIERS.map(t => ({
  wRem: Math.round(t.wRem * 1.14 * 100) / 100,
  hRem: Math.round(t.hRem * 1.14 * 100) / 100,
  compactFallback: t.compactFallback,
}));

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
  autoWatchEnabled = false,
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
  const [sitSwitchToastVisible, setSitSwitchToastVisible] = useState(false);
  const sitSwitchDelayTimerRef = useRef(null);
  const sitInFlightRef = useRef(false);
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
    return () => {
      if (sitSwitchDelayTimerRef.current) {
        window.clearTimeout(sitSwitchDelayTimerRef.current);
        sitSwitchDelayTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    let c = true;
    void readOnlineV2Vault({ fresh: true, forceServer: true }).then(s => {
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
  const minBet = Math.max(10, Math.floor(Number(tableStakeUnits) || 10));
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

  const phaseEndMs = phaseEndsMs(engine?.phaseEndsAt);
  const bettingPreRoundFreezeActive = useMemo(() => {
    if (phase !== "betting" || phaseEndMs <= 0) return false;
    return nowTick >= phaseEndMs - OV2_C21_BETTING_PRE_LOCK_FREEZE_MS;
  }, [phase, phaseEndMs, nowTick]);

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

  const [inspectorSeatIdx, setInspectorSeatIdx] = useState(null);
  const [inspectorSplitIdx, setInspectorSplitIdx] = useState(0);
  const manualInspectorOverrideRef = useRef(false);
  const phaseTurnClearRef = useRef({ phase: "", sig: "" });
  const dismissedAutoWatchFollowKeyRef = useRef("");
  const prevAutoWatchFollowKeyRef = useRef("");
  const prevFollowKeyForDwellRef = useRef("");
  const dwellHoldUntilRef = useRef(0);
  const dwellHoldSeatIdxRef = useRef(null);
  const dwellTimerRef = useRef(null);
  const [autoWatchDwellNonce, setAutoWatchDwellNonce] = useState(0);

  const clearAutoWatchDwell = useCallback(() => {
    if (dwellTimerRef.current != null) {
      window.clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
    dwellHoldUntilRef.current = 0;
    dwellHoldSeatIdxRef.current = null;
  }, []);

  useEffect(
    () => () => {
      if (dwellTimerRef.current != null) window.clearTimeout(dwellTimerRef.current);
    },
    [],
  );

  const dismissInspectorSheet = useCallback(
    (opts = {}) => {
      clearAutoWatchDwell();
      const recordAutoWatchDismiss = opts.recordAutoWatchDismiss === true;
      const clearManual = opts.clearManual !== false;
      if (clearManual) {
        manualInspectorOverrideRef.current = false;
      }
      setInspectorSeatIdx(null);
      if (recordAutoWatchDismiss && autoWatchEnabled) {
        dismissedAutoWatchFollowKeyRef.current = autoWatchFollowKey(phase, currentTurn);
      }
    },
    [autoWatchEnabled, phase, currentTurn, clearAutoWatchDwell],
  );

  useEffect(() => {
    if (autoWatchEnabled) return;
    clearAutoWatchDwell();
    prevFollowKeyForDwellRef.current = autoWatchFollowKey(phase, currentTurn);
    dismissedAutoWatchFollowKeyRef.current = "";
    if (!manualInspectorOverrideRef.current) {
      setInspectorSeatIdx(null);
    }
  }, [autoWatchEnabled, phase, currentTurn, clearAutoWatchDwell]);

  useEffect(() => {
    const sig =
      phase === "acting" && currentTurn != null
        ? `${currentTurn.seatIndex}-${currentTurn.handIndex}`
        : "";
    const prev = phaseTurnClearRef.current;
    if (prev.phase !== phase || (sig && prev.sig && sig !== prev.sig)) {
      manualInspectorOverrideRef.current = false;
    }
    phaseTurnClearRef.current = { phase, sig };
  }, [phase, currentTurn?.seatIndex, currentTurn?.handIndex]);

  useEffect(() => {
    const k = autoWatchFollowKey(phase, currentTurn);
    if (k !== prevAutoWatchFollowKeyRef.current) {
      dismissedAutoWatchFollowKeyRef.current = "";
      prevAutoWatchFollowKeyRef.current = k;
    }
  }, [phase, currentTurn?.seatIndex, currentTurn?.handIndex]);

  useEffect(() => {
    const k = autoWatchFollowKey(phase, currentTurn);
    const prev = prevFollowKeyForDwellRef.current;
    if (
      autoWatchEnabled &&
      prev &&
      prev !== k &&
      prev.startsWith("a:") &&
      Date.now() >= dwellHoldUntilRef.current
    ) {
      const oldSeat = parseFollowKeySeatIndex(prev);
      const wasOthersTurn =
        mySeat == null || (oldSeat != null && oldSeat !== mySeat.seatIndex);
      if (oldSeat != null && wasOthersTurn) {
        const occ = seatsForUi[oldSeat];
        if (occ?.participantKey) {
          const actingEnded = !k || !k.startsWith("a:");
          const newSeat = actingEnded ? null : parseFollowKeySeatIndex(k);
          const shouldDwell =
            actingEnded || (newSeat != null && newSeat !== oldSeat);
          if (shouldDwell) {
            const until = Date.now() + AUTO_WATCH_DWELL_MS;
            dwellHoldSeatIdxRef.current = oldSeat;
            dwellHoldUntilRef.current = until;
            if (dwellTimerRef.current != null) window.clearTimeout(dwellTimerRef.current);
            dwellTimerRef.current = window.setTimeout(() => {
              dwellTimerRef.current = null;
              dwellHoldUntilRef.current = 0;
              dwellHoldSeatIdxRef.current = null;
              setAutoWatchDwellNonce(n => n + 1);
            }, AUTO_WATCH_DWELL_MS);
          }
        }
      }
    }
    prevFollowKeyForDwellRef.current = k;
  }, [
    phase,
    currentTurn?.seatIndex,
    currentTurn?.handIndex,
    autoWatchEnabled,
    mySeat,
    seatsForUi,
  ]);

  useEffect(() => {
    if (!autoWatchEnabled) return;
    if (isMyTurn) {
      dismissInspectorSheet({ recordAutoWatchDismiss: false });
      return;
    }
    if (manualInspectorOverrideRef.current) return;

    const myIdx = mySeat != null ? mySeat.seatIndex : undefined;
    const now = Date.now();
    const dwellUntil = dwellHoldUntilRef.current;
    const dwellSeat = dwellHoldSeatIdxRef.current;

    if (dwellUntil > now && dwellSeat != null) {
      const ds = seatsForUi[dwellSeat];
      const dwellIsOther = myIdx == null || dwellSeat !== myIdx;
      if (ds?.participantKey && dwellIsOther) {
        setInspectorSeatIdx(dwellSeat);
        return;
      }
      clearAutoWatchDwell();
    }

    if (dwellUntil > 0 && dwellUntil <= now) {
      clearAutoWatchDwell();
    }

    const target = autoWatchTargetSeatIndex(phase, currentTurn, myIdx, seatsForUi);
    if (target == null) {
      if (!manualInspectorOverrideRef.current) dismissInspectorSheet({ recordAutoWatchDismiss: false });
      return;
    }
    const fk = autoWatchFollowKey(phase, currentTurn);
    if (fk && dismissedAutoWatchFollowKeyRef.current === fk) return;
    setInspectorSeatIdx(target);
  }, [
    autoWatchEnabled,
    isMyTurn,
    phase,
    currentTurn,
    mySeat,
    seatsForUi,
    dismissInspectorSheet,
    clearAutoWatchDwell,
    nowTick,
    autoWatchDwellNonce,
  ]);

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

  useEffect(() => {
    if (inspectorSeatIdx == null) return;
    const s = seatsForUi[inspectorSeatIdx];
    if (!s?.participantKey || s.participantKey === participantKey) {
      dismissInspectorSheet({ recordAutoWatchDismiss: false });
    }
  }, [inspectorSeatIdx, seatsForUi, participantKey, dismissInspectorSheet]);

  useEffect(() => {
    if (inspectorSeatIdx != null) setInspectorSplitIdx(0);
  }, [inspectorSeatIdx]);

  useEffect(() => {
    if (inspectorSeatIdx == null) return;
    const seat = engine?.seats?.[inspectorSeatIdx];
    const n = seat?.hands?.length || 0;
    if (n <= 1) {
      setInspectorSplitIdx(0);
      return;
    }
    if (phase === "acting" && currentTurn?.seatIndex === inspectorSeatIdx) {
      setInspectorSplitIdx(Math.min(Math.max(0, Number(currentTurn.handIndex) || 0), n - 1));
    }
  }, [inspectorSeatIdx, phase, currentTurn?.seatIndex, currentTurn?.handIndex, engine?.seats, engine?.roundSeq]);

  useEffect(() => {
    if (inspectorSeatIdx == null) return;
    const onKey = e => {
      if (e.key === "Escape") dismissInspectorSheet({ recordAutoWatchDismiss: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inspectorSeatIdx, dismissInspectorSheet]);

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
  /** After commit, HUD vault is post-debit; add back pledged intended bet so Play stays valid for same/higher draft until Reverse. */
  const committedPledge =
    mySeat?.betCommitRecorded ? Math.max(0, Math.floor(Number(mySeat.intendedBet) || 0)) : 0;
  const vaultOkForCommit = vaultBalance + committedPledge >= parsedDraftPlay;
  /** Same amount already committed — Play must look & behave off until draft changes or Reverse. */
  const playLockedInUi =
    Boolean(mySeat?.betCommitRecorded) &&
    committedPledge >= minBet &&
    parsedDraftPlay === committedPledge;
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
    const ms = e?.seats?.find(s => s.participantKey === participantKey);
    const pledge =
      ms?.betCommitRecorded ? Math.max(0, Math.floor(Number(ms.intendedBet) || 0)) : 0;
    if (vaultBalance + pledge < raw) {
      setEconomyHint("Not enough vault for this play.");
      return;
    }
    if (ms?.betCommitRecorded && pledge >= minBet && raw === pledge) return;
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
  }, [playDraftStr, maxBet, minBet, onOperate, operateBusy, participantKey, vaultBalance]);

  const uncommitPlayAmount = useCallback(async () => {
    const e = engineRef.current;
    if (e?.phase !== "betting" || betLockRef.current || operateBusy) return;
    const ms = e?.seats?.find(s => s.participantKey === participantKey);
    if (!ms?.betCommitRecorded) return;
    betLockRef.current = true;
    try {
      const r = await onOperate("clear_bet", {});
      if (!r?.ok) {
        const code = r?.error?.code || r?.error?.payload?.code || "";
        setEconomyHint(
          code === "pre_round_freeze"
            ? "Round is about to start — cannot uncommit now."
            : code === "DEVICE_REQUIRED"
              ? "Session required to uncommit."
              : "Could not uncommit. Try again.",
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
  }, [onOperate, operateBusy, participantKey]);

  const onAutoNextToggle = useCallback(
    async enabled => {
      if (operateBusy || actionLock) return;
      if (enabled && !draftPlayValid) return;
      await onOperate("set_auto_next", { enabled, stake: parsedDraftPlay });
    },
    [actionLock, draftPlayValid, onOperate, operateBusy, parsedDraftPlay],
  );

  const trySit = useCallback(
    async idx => {
      if (sitLockRef.current || operateBusy) return;
      if (vaultBalance < minBet) {
        setEconomyHint("Not enough vault for this minimum play.");
        return;
      }
      sitLockRef.current = true;
      if (sitSwitchDelayTimerRef.current) {
        window.clearTimeout(sitSwitchDelayTimerRef.current);
        sitSwitchDelayTimerRef.current = null;
      }
      sitInFlightRef.current = true;
      setSitSwitchToastVisible(false);
      sitSwitchDelayTimerRef.current = window.setTimeout(() => {
        sitSwitchDelayTimerRef.current = null;
        if (sitInFlightRef.current) setSitSwitchToastVisible(true);
      }, OV2_C21_SIT_SWITCH_TOAST_DELAY_MS);
      try {
        const r = await onOperate("sit", { seatIndex: idx, displayName: displayName || "Guest" });
        if (!r?.ok) {
          const code = r?.error?.code || r?.error?.payload?.code || "";
          setEconomyHint(
            code === "insufficient_vault_for_table"
              ? "Not enough vault for this level."
              : code === "DEVICE_REQUIRED"
                ? "Session required to take a seat."
                : code === "ALREADY_SEATED_ELSEWHERE"
                  ? r?.error?.message || "You already have a seat at another table."
                  : "",
          );
        }
      } finally {
        sitInFlightRef.current = false;
        if (sitSwitchDelayTimerRef.current) {
          window.clearTimeout(sitSwitchDelayTimerRef.current);
          sitSwitchDelayTimerRef.current = null;
        }
        setSitSwitchToastVisible(false);
        window.setTimeout(() => {
          sitLockRef.current = false;
        }, 450);
      }
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
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#030506] text-zinc-100">
      {sitSwitchToastVisible ? (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none fixed left-1/2 top-3 z-[200] w-[min(92vw,22rem)] -translate-x-1/2 rounded-xl border border-amber-500/35 bg-zinc-950/95 px-3 py-2.5 shadow-lg shadow-black/50 sm:px-3.5 sm:py-3"
        >
          <p className="text-center text-xs font-bold leading-tight text-amber-100 sm:text-sm">Switching tables…</p>
          <p className="mt-1 text-center text-[11px] leading-snug text-zinc-300 max-sm:hidden sm:text-xs">
            Releasing your previous seat and joining the new one. This may take a few seconds.
          </p>
          <p className="mt-1 text-center text-[11px] leading-snug text-zinc-300 sm:hidden">
            Joining table… this may take a few seconds.
          </p>
        </div>
      ) : null}
      {loadError ? (
        <div className="shrink-0 px-0.5 text-center text-[10px] leading-tight text-red-300/95" role="alert">
          {loadError}
        </div>
      ) : null}
      {/* Table felt: dealer-first stack; bottom rail stays outside for toast offset compatibility */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden overflow-x-hidden px-1 pb-1 pt-0.5 sm:px-2 sm:pb-1.5 sm:pt-1">
        <div
          className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border-0 shadow-none sm:rounded-[1.35rem]"
          style={{
            background:
              "radial-gradient(ellipse 95% 80% at 50% 0%, #14532d 0%, #0d3d24 42%, #071912 78%, #030806 100%)",
          }}
        >
          <div
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-80"
            style={{
              background:
                "radial-gradient(ellipse 55% 35% at 50% 12%, rgba(255,255,255,0.06) 0%, transparent 55%)",
            }}
          />

          <div className="relative z-[1] flex min-h-0 flex-1 flex-col overflow-hidden">
            {/* DEALER — fixed interior geometry preserved */}
            <div className="relative h-[11.375rem] shrink-0 overflow-hidden px-1 pt-0.5 sm:h-[10.375rem] sm:px-1.5 sm:pt-0.5">
              <div className="relative h-full overflow-hidden rounded-xl border-0 bg-gradient-to-b from-[#1a120d]/95 via-[#0f0c0a]/90 to-black/75 shadow-none">
                <div className="pointer-events-none absolute inset-x-1 top-0.5 z-10 grid h-[1.05rem] grid-cols-3 items-center leading-none">
                  <span className="min-w-0 truncate text-left text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/90">
                    Opponent
                  </span>
                  <span className="min-w-0 truncate text-center text-[10px] font-semibold tabular-nums text-zinc-100/95">
                    {dealerTotalCenter != null ? `Total ${dealerTotalCenter}` : "\u00a0"}
                  </span>
                  <span
                    className="min-w-0 truncate text-right tabular-nums text-[15px] font-black tracking-tight text-amber-100 drop-shadow-md sm:text-lg"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {houseCountdownSeconds}
                  </span>
                </div>
                <div
                  className={`absolute inset-x-1 top-[1.15rem] bottom-px flex items-center justify-center overflow-x-auto ${dealerGap}`}
                >
                  {dealerRender.length === 0 ? (
                    <span className="text-xs text-emerald-200/35">—</span>
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
            </div>

            {/* Same vertical gap as seat row → your hand */}
            <div className="h-2 max-sm:h-1.5 shrink-0" aria-hidden />

            {/* Player seats — compact row only in lobby (6 seats); full height when seated (5 others) */}
            <div
              className={
                otherSeatIndices.length <= 5
                  ? "relative z-[1] flex h-[3.875rem] shrink-0 items-end justify-center gap-0.5 overflow-hidden px-0.5 sm:h-[6.125rem] sm:gap-1.5 sm:px-1"
                  : "relative z-[1] flex h-[4rem] shrink-0 items-end justify-center gap-0.5 overflow-hidden px-0.5 sm:h-[6.125rem] sm:gap-1.5 sm:px-1"
              }
            >
              {otherSeatIndices.map(idx => {
                const seat = seatsForDisplay[idx];
                const taken = Boolean(seat?.participantKey);
                const otherPlayLbl = otherSeatCommittedPlayLabel(seat, phase, minBet);
                const isActingSeat = phase === "acting" && currentTurn?.seatIndex === idx;
                const actingHere = isActingSeat
                  ? "ring-2 ring-amber-400/55 ring-offset-2 ring-offset-[#030506]"
                  : "";
                const ariaSeat = taken
                  ? `${String(seat.displayName || "Player").trim() || "Player"}${isActingSeat ? " — turn to act" : ""}`
                  : `Open seat ${idx + 1}`;
                return (
                  <div
                    key={idx}
                    className="flex h-full min-h-0 min-w-0 max-w-[19vw] flex-1 flex-col justify-end sm:max-w-[6.25rem]"
                  >
                    <button
                      type="button"
                      aria-label={ariaSeat}
                      disabled={!taken && (operateBusy || !canSitToPlay)}
                      onClick={() => {
                        if (operateBusy && !taken) return;
                        if (taken) {
                          setInspectorSeatIdx(prev => {
                            const next = prev === idx ? null : idx;
                            if (next != null) {
                              manualInspectorOverrideRef.current = true;
                            } else {
                              manualInspectorOverrideRef.current = false;
                              clearAutoWatchDwell();
                              if (autoWatchEnabled) {
                                dismissedAutoWatchFollowKeyRef.current = autoWatchFollowKey(phase, currentTurn);
                              }
                            }
                            return next;
                          });
                          return;
                        }
                        void trySit(idx);
                      }}
                      className={`flex h-full min-h-0 w-full touch-manipulation flex-col overflow-hidden rounded-lg border border-white/[0.06] bg-black/25 px-px py-0 text-left shadow-none transition ${actingHere} ${inspectorSeatIdx === idx ? "ring-1 ring-emerald-400/50 ring-offset-2 ring-offset-[#030506]" : ""} ${!taken && (operateBusy || !canSitToPlay) ? "opacity-40" : ""}`}
                    >
                      <div className="grid h-[11px] max-h-[11px] shrink-0 grid-cols-3 items-center gap-px overflow-hidden leading-none">
                        {taken ? (
                          <>
                            <span className="min-w-0 truncate text-left text-[8px] font-semibold leading-none text-zinc-100">
                              {String(seat.displayName || "").trim() || "…"}
                            </span>
                            <span className="min-w-0 truncate text-center text-[7px] font-bold tabular-nums leading-none text-emerald-200/75">
                              {(() => {
                                const parts = (seat.hands || []).filter(h => h && h.length).map(h => handTotal(h));
                                return parts.length ? parts.join("·") : "\u00a0";
                              })()}
                            </span>
                            <span className="flex min-w-0 justify-end gap-px overflow-hidden">
                              {otherPlayLbl ? (
                                <span className="shrink-0 text-[7px] font-semibold tabular-nums leading-none text-emerald-300/90">
                                  Play {otherPlayLbl}
                                </span>
                              ) : null}
                              {isActingSeat ? (
                                <span className="shrink-0 rounded bg-amber-500/20 px-px text-[7px] font-extrabold uppercase leading-none text-amber-100">
                                  Turn
                                </span>
                              ) : null}
                            </span>
                          </>
                        ) : (
                          <span className="col-span-3 w-full text-center text-[8px] font-medium leading-none text-emerald-200/45">
                            Open
                          </span>
                        )}
                      </div>
                      <div className="relative flex h-[calc(100%-11px)] min-h-0 w-full shrink-0 flex-col justify-center gap-px overflow-hidden">
                        <div className="flex min-h-0 flex-1 flex-col justify-center gap-px overflow-hidden">
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
                  </div>
                );
              })}
            </div>

            {/* Same vertical gap as dealer → seat row */}
            <div className="h-2 max-sm:h-1.5 shrink-0" aria-hidden />

            {/* YOUR HAND — same internal measurements */}
            <div className="relative z-[1] h-[11.375rem] shrink-0 overflow-hidden px-1 pb-1 sm:h-[10.375rem] sm:px-1.5 sm:pb-1.5">
              <div className="relative h-full overflow-hidden rounded-xl border-0 bg-gradient-to-b from-[#0c1612]/95 via-[#050a08]/92 to-black/80 shadow-none">
                <div className="absolute inset-x-1 top-0.5 z-20 grid h-[1.05rem] grid-cols-3 items-center leading-none">
                  <span className="pointer-events-none min-w-0 truncate text-left text-[10px] font-bold uppercase leading-none tracking-[0.1em] text-emerald-200/88">
                    Your hand
                  </span>
                  <span className="pointer-events-none min-w-0 truncate text-center text-[10px] font-semibold tabular-nums text-emerald-100/92">
                    {myHandTotalLabel != null ? `Total ${myHandTotalLabel}` : "\u00a0"}
                  </span>
                  <div className="flex min-w-0 flex-row flex-nowrap items-center justify-end gap-0.5 overflow-hidden">
                    {myPlayAmountLabel ? (
                      <span className="shrink-0 text-[8px] font-semibold tabular-nums leading-none text-emerald-300/92">
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
                        className="shrink-0 touch-manipulation rounded border border-rose-600/40 bg-rose-950/50 px-1 py-px text-[8px] font-extrabold uppercase leading-none text-rose-50 disabled:opacity-25"
                      >
                        Surrender
                      </button>
                    ) : null}
                    {phase === "acting" && isMyTurn ? (
                      <span className="shrink-0 text-[8px] font-extrabold uppercase leading-none text-amber-200/95">
                        Turn
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="absolute inset-x-1 top-[1.15rem] bottom-[1.65rem] flex flex-col items-center justify-center gap-px overflow-hidden">
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
                      <span className="text-[9px] text-emerald-200/35">—</span>
                    )
                  ) : (
                    <span className="px-1 text-center text-[8px] leading-tight text-emerald-200/40">
                      Pick an open seat above
                    </span>
                  )}
                </div>
                {mySeat && mySplitHandCount > 1 ? (
                  <div className="absolute bottom-1 left-1 right-1 z-20 min-w-0 overflow-x-auto overflow-y-visible overscroll-x-contain [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    <div
                      className="mx-auto flex w-max min-w-full flex-nowrap items-center justify-center gap-0.5"
                      role="tablist"
                      aria-label="Split hands"
                    >
                      {displayMySeat.hands.map((_, hi) => {
                        const isActionHere =
                          phase === "acting" &&
                          isMyTurn &&
                          currentTurn?.seatIndex === mySeat?.seatIndex &&
                          currentTurn?.handIndex === hi;
                        return (
                          <button
                            key={`hand-tab-${hi}`}
                            type="button"
                            role="tab"
                            aria-selected={splitViewIdx === hi}
                            aria-current={isActionHere ? "step" : undefined}
                            title={isActionHere ? "Play this hand now" : `View hand ${hi + 1}`}
                            onClick={() => setSplitViewIdx(hi)}
                            className={`min-h-[22px] shrink-0 touch-manipulation rounded-md border px-1 py-px text-[7px] font-extrabold uppercase leading-none whitespace-nowrap min-w-[3.1rem] ${
                              isActionHere
                                ? "z-[1] border-2 border-amber-400/80 bg-[#1a1510] text-amber-50 shadow-[0_0_0_1px_rgba(251,191,36,0.35)]"
                                : splitViewIdx === hi
                                  ? "border-emerald-600/45 bg-emerald-950/40 text-emerald-100"
                                  : "border-white/10 bg-black/50 text-zinc-500"
                            }`}
                          >
                            Hand {hi + 1}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Reserve lower band for fixed result toast footprint — layout only, toast stays position:fixed */}
            <div
              className="shrink-0 min-h-[4.5rem] w-full max-sm:min-h-[5.25rem]"
              aria-hidden
            />
            <div className="min-h-0 flex-1" aria-hidden />
          </div>
        </div>
      </div>

      {/* Bottom controls — heights unchanged for toast math */}
      <div
        className={`flex shrink-0 flex-col justify-center gap-0 border-t-0 bg-transparent ${
          phase === "acting" && isMyTurn
            ? "max-sm:h-auto max-sm:min-h-0 max-sm:overflow-visible max-sm:py-1 max-sm:pb-[max(0.35rem,env(safe-area-inset-bottom,0px))] sm:h-[3.95rem] sm:overflow-hidden sm:py-0 sm:pb-1 sm:pt-px"
            : "h-[6.25rem] overflow-hidden pb-[max(0.2rem,env(safe-area-inset-bottom,0px))] pt-0 sm:h-[4.5rem] sm:pb-1 sm:pt-px"
        }`}
      >
        {phase === "betting" && mySeat ? (
          <div className="flex h-full min-h-0 flex-col justify-center gap-0 rounded-none border-0 bg-transparent px-1 py-0 sm:px-1.5 sm:py-0">
            <div className="flex min-h-0 w-full min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="relative min-w-0 flex-1">
                <input
                  value={playDraftStr}
                  onChange={e => setPlayDraftStr(e.target.value)}
                  inputMode="numeric"
                  disabled={operateBusy || actionLock || phase !== "betting"}
                  className="h-10 w-full min-w-0 rounded-md border border-white/[0.12] bg-[#050708] py-0 pl-1.5 pr-9 text-[13px] font-semibold leading-none text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] disabled:opacity-40 sm:text-sm"
                  aria-label="Play amount"
                />
                <button
                  type="button"
                  disabled={operateBusy || actionLock || phase !== "betting"}
                  onClick={() => setPlayDraftStr(String(minBet))}
                  className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 touch-manipulation items-center justify-center rounded text-zinc-300 hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:opacity-35"
                  aria-label="Reset amount to minimum play"
                  title="Reset to minimum play"
                >
                  <span className="text-[22px] leading-none" aria-hidden>
                    ↺
                  </span>
                </button>
              </div>
              <button
                type="button"
                disabled={operateBusy || actionLock || phase !== "betting"}
                onClick={() => bumpDraftByTableMin()}
                className="h-10 shrink-0 touch-manipulation rounded-md border border-white/[0.14] bg-white/[0.06] px-1.5 text-[11px] font-bold leading-none text-zinc-200 disabled:opacity-35 sm:px-2 sm:text-xs"
              >
                +{fmt(minBet)}
              </button>
              {mySeat?.betCommitRecorded ? (
                <button
                  type="button"
                  title={
                    bettingPreRoundFreezeActive
                      ? "Round about to start — reverse is paused briefly"
                      : "Reverse committed play and refund vault"
                  }
                  disabled={
                    operateBusy || actionLock || phase !== "betting" || bettingPreRoundFreezeActive
                  }
                  onClick={() => void uncommitPlayAmount()}
                  className="h-10 min-w-[5.25rem] shrink-0 touch-manipulation rounded-md border border-rose-900/50 bg-gradient-to-b from-rose-700 to-rose-950 px-2.5 text-[13px] font-extrabold leading-none text-rose-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] disabled:opacity-35 sm:min-w-[5.75rem] sm:px-3 sm:text-sm"
                >
                  Reverse
                </button>
              ) : null}
              <button
                type="button"
                disabled={
                  operateBusy ||
                  actionLock ||
                  phase !== "betting" ||
                  !draftPlayValid ||
                  !vaultOkForCommit ||
                  playLockedInUi
                }
                title={
                  playLockedInUi
                    ? "Play is locked in — change the amount or tap Reverse"
                    : undefined
                }
                onClick={() => void commitPlayAmount()}
                className="h-10 min-w-[5.25rem] shrink-0 touch-manipulation rounded-md border border-emerald-800/40 bg-gradient-to-b from-emerald-700 to-emerald-950 px-2.5 text-[13px] font-bold leading-none text-emerald-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.1)] enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-500 disabled:shadow-none disabled:saturate-0 sm:min-w-[5.75rem] sm:px-3 sm:text-sm"
              >
                Play
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(mySeat?.autoNextEnabled)}
                title="Auto-enter the next round with the stake shown (server-side). Stops after 3 rounds with no manual hit/stand/play, or if funds fail."
                disabled={
                  operateBusy ||
                  actionLock ||
                  bettingPreRoundFreezeActive ||
                  (!draftPlayValid && !mySeat?.autoNextEnabled)
                }
                onClick={() => void onAutoNextToggle(!Boolean(mySeat?.autoNextEnabled))}
                className={`h-10 min-w-[4.5rem] shrink-0 touch-manipulation rounded border px-2 py-0 text-center font-extrabold uppercase leading-tight shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-35 sm:min-w-[5.5rem] sm:px-2.5 ${
                  mySeat?.autoNextEnabled
                    ? "border-emerald-500/55 bg-emerald-950/55 text-emerald-100"
                    : "border-white/18 bg-zinc-950/90 text-zinc-400"
                }`}
              >
                <span className="flex h-full min-h-0 flex-col items-center justify-center gap-0 leading-none">
                  {mySeat?.autoNextEnabled ? (
                    <span className="mb-px text-[11px] text-emerald-200 sm:text-[12px]" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                  <span className="text-[8px] font-extrabold tracking-wide sm:text-[9px]">AUTO</span>
                  <span className="text-[8px] font-extrabold tracking-wide sm:text-[9px]">NEXT</span>
                </span>
              </button>
            </div>
            {!draftPlayValid && playDraftStr.trim() !== "" ? (
              <div className="mt-px shrink-0 text-[9px] leading-tight text-amber-200/90 sm:text-[10px]">
                {fmt(minBet)}–{fmt(maxBet)}
              </div>
            ) : null}
            {economyHint ? (
              <div className="mt-px shrink-0 text-[9px] leading-tight text-rose-200/95 sm:text-[10px]" role="status">
                {economyHint}
              </div>
            ) : null}
            {draftPlayValid && !vaultOkForCommit ? (
              <div className="mt-px shrink-0 text-[9px] leading-tight text-amber-200/90 sm:text-[10px]">Vault too low for this amount.</div>
            ) : null}
          </div>
        ) : phase === "acting" && isMyTurn ? (
          <div className="grid w-full shrink-0 grid-cols-4 gap-1.5 px-1 sm:gap-1 sm:px-1.5">
            {[
              ["hit", "HIT", legal.hit],
              ["stand", "STAND", legal.stand],
              ["double", "DOUBLE", legal.double],
              ["split", "SPLIT", legal.split],
            ].map(([op, label, ok]) => {
              // Inline gradient + appearance reset: iOS/Safari often drops Tailwind bg on native <button>.
              const shell =
                op === "hit"
                  ? "border-emerald-700/50 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]"
                  : op === "stand"
                    ? "border-slate-500/45 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                    : op === "double"
                      ? "border-amber-800/45 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "border-violet-900/45 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]";
              const fill =
                op === "hit"
                  ? {
                      WebkitAppearance: "none",
                      appearance: "none",
                      backgroundColor: "#064e3b",
                      backgroundImage: "linear-gradient(180deg,#0d7a5c 0%,#0a5c45 45%,#052e24 100%)",
                    }
                  : op === "stand"
                    ? {
                        WebkitAppearance: "none",
                        appearance: "none",
                        backgroundColor: "#1e3a5f",
                        backgroundImage: "linear-gradient(180deg,#334e68 0%,#243b53 50%,#152535 100%)",
                      }
                    : op === "double"
                      ? {
                          WebkitAppearance: "none",
                          appearance: "none",
                          backgroundColor: "#7c2d12",
                          backgroundImage: "linear-gradient(180deg,#9a3412 0%,#7c2d12 50%,#431407 100%)",
                        }
                      : {
                          WebkitAppearance: "none",
                          appearance: "none",
                          backgroundColor: "#4c1d6b",
                          backgroundImage: "linear-gradient(180deg,#5b21a6 0%,#4c1d6b 50%,#2e1065 100%)",
                        };
              return (
                <button
                  key={op}
                  type="button"
                  disabled={operateBusy || actionLock || !ok || phase !== "acting" || !isMyTurn}
                  style={fill}
                  onClick={guardAction(async () => {
                    const e = engineRef.current;
                    const ct = e?.currentTurn;
                    const ms = e?.seats?.find(s => s.participantKey === participantKey);
                    if (e?.phase !== "acting" || !ms || ct?.seatIndex !== ms.seatIndex) return;
                    await onOperate(op);
                  })}
                  className={`flex min-h-[4.5rem] min-w-0 items-center justify-center touch-manipulation appearance-none rounded-lg border-2 px-0.5 text-base font-bold leading-none tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:saturate-[0.65] active:scale-[0.98] sm:min-h-[30px] sm:px-0 sm:py-0.5 sm:text-[11px] ${shell}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="h-full rounded-lg border border-transparent bg-transparent" aria-hidden />
        )}
      </div>

      {showInsuranceModal ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center pointer-events-auto">
          <div className="w-full max-w-sm rounded-2xl border border-amber-900/35 bg-[#0c0f14] p-4 shadow-[0_24px_64px_rgba(0,0,0,0.65)]">
            <div className="text-center text-xs font-bold uppercase tracking-[0.18em] text-amber-200/85">Side cover</div>
            <p className="mt-2 text-center text-[11px] leading-snug text-zinc-400">
              The opener is an ace. Optional add-on is up to half of your main play.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceYes || phase !== "insurance"}
                onClick={guardAction(async () => {
                  if (engineRef.current?.phase !== "insurance") return;
                  await onOperate("insurance_yes");
                })}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl border border-amber-700/40 bg-gradient-to-b from-amber-800/90 to-amber-950/90 py-2 text-xs font-bold tracking-wide text-amber-50 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] disabled:opacity-35"
              >
                Add cover
              </button>
              <button
                type="button"
                disabled={operateBusy || actionLock || !legal.insuranceNo || phase !== "insurance"}
                onClick={guardAction(async () => {
                  if (engineRef.current?.phase !== "insurance") return;
                  await onOperate("insurance_no");
                })}
                className="min-h-[44px] flex-1 touch-manipulation rounded-xl border border-white/15 bg-black/40 py-2 text-xs font-bold text-zinc-200 disabled:opacity-35"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {inspectorSeatIdx != null && seatsForDisplay[inspectorSeatIdx]?.participantKey
        ? (() => {
            const s = seatsForDisplay[inspectorSeatIdx];
            const nh = s.hands?.length || 0;
            const hi = nh > 1 ? Math.min(Math.max(0, inspectorSplitIdx), nh - 1) : 0;
            const h = s.hands?.[hi] || [];
            const inspPlay = otherSeatCommittedPlayLabel(s, phase, minBet);
            const inspStatus = otherSeatHandStatusLabel(phase, inspectorSeatIdx, hi, s, currentTurn);
            const inspTotal = h.length ? handTotal(h) : null;
            const name = String(s.displayName || "").trim() || "Player";
            return (
              <div
                className="fixed inset-0 z-[55] flex items-center justify-center p-3 pointer-events-auto"
                role="dialog"
                aria-modal="true"
                aria-label={`${name} — hand detail`}
              >
                <button
                  type="button"
                  className="absolute inset-0 bg-black/55 backdrop-blur-[1px]"
                  aria-label="Close"
                  onClick={() => dismissInspectorSheet({ recordAutoWatchDismiss: true })}
                />
                <div
                  className="relative z-10 flex max-h-[min(72vh,24rem)] w-[min(92vw,17.75rem)] flex-col overflow-hidden rounded-xl border border-emerald-900/30 bg-[#070a0c] shadow-[0_24px_56px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)]"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex shrink-0 items-start justify-between gap-1 border-b border-white/[0.08] bg-[#0a0f12] px-2 py-1.5">
                    <div className="grid min-w-0 flex-1 grid-cols-3 items-center gap-0.5 leading-none">
                      <span className="min-w-0 truncate text-left text-[10px] font-bold text-white">{name}</span>
                      <span className="min-w-0 truncate text-center text-[10px] font-semibold tabular-nums text-zinc-100">
                        {inspTotal != null ? `Total ${inspTotal}` : "—"}
                      </span>
                      <span className="flex min-w-0 flex-col items-end gap-px text-right">
                        {inspPlay ? (
                          <span className="text-[8px] font-semibold tabular-nums text-emerald-400">Play {inspPlay}</span>
                        ) : null}
                        <span className="text-[8px] font-extrabold uppercase text-sky-300">{inspStatus}</span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => dismissInspectorSheet({ recordAutoWatchDismiss: true })}
                      className="shrink-0 rounded border border-zinc-500/70 bg-zinc-950 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white hover:bg-zinc-900"
                      aria-label="Close"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden bg-[#050808] px-2 py-3">
                    {h.length ? (
                      <SeatHandRow
                        hand={h}
                        handKey={`insp-${inspectorSeatIdx}-${hi}-${h.join("|")}`}
                        tiers={INSPECTOR_HAND_TIERS}
                      />
                    ) : (
                      <span className="text-[10px] text-zinc-400">No cards yet</span>
                    )}
                  </div>
                  {nh > 1 ? (
                    <div className="min-w-0 shrink-0 overflow-x-auto overflow-y-visible border-t border-white/[0.06] bg-[#080c0f] px-1 py-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex w-max min-w-full flex-nowrap justify-center gap-1">
                        {(s.hands || []).map((_, b) => {
                          const isAct =
                            phase === "acting" &&
                            currentTurn?.seatIndex === inspectorSeatIdx &&
                            currentTurn?.handIndex === b;
                          return (
                            <button
                              key={`insp-hand-${b}`}
                              type="button"
                              onClick={() => setInspectorSplitIdx(b)}
                              className={`min-h-[24px] shrink-0 touch-manipulation rounded border px-1 py-px text-[8px] font-extrabold uppercase leading-none whitespace-nowrap min-w-[2.75rem] ${
                                isAct
                                  ? "border-sky-400 bg-sky-950 text-sky-100"
                                  : inspectorSplitIdx === b
                                    ? "border-emerald-500/70 bg-emerald-950/80 text-emerald-100"
                                    : "border-zinc-600 bg-zinc-950 text-zinc-300"
                              }`}
                            >
                              Hand {b + 1}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })()
        : null}

      {resultToastOpen && mySummary ? (
        <div className="pointer-events-none fixed bottom-[calc(5.35rem+0.25rem+env(safe-area-inset-bottom,0px))] left-2 right-2 z-30 mx-auto max-w-lg sm:bottom-[calc(3.95rem+0.25rem+env(safe-area-inset-bottom,0px))]">
          <div
            className={`rounded-xl border px-3 py-2.5 shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md ${
              Number(mySummary.vaultDelta) < 0
                ? "border-rose-500/40 bg-[#14080a]/95"
                : Number(mySummary.vaultDelta) > 0
                  ? "border-emerald-600/35 bg-[#06120e]/95"
                  : "border-zinc-600/30 bg-[#0a0c10]/95"
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
