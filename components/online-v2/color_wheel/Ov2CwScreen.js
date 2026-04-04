"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OV2_CW_SPINNING_MS,
  OV2_CW_WHEEL_NUMBERS,
  OV2_CW_SEGMENT_DEG,
  ov2CwColorForNumber,
  ov2CwIndexToCenterAngle,
  ov2CwPlayWins,
  ov2CwPayoutMultiplier,
} from "../../../lib/online-v2/color_wheel/ov2CwConstants";
import { OV2_CW_MAX_SEATS } from "../../../lib/online-v2/color_wheel/ov2CwTableIds";

function fmt(n) {
  const x = Math.floor(Number(n) || 0);
  if (x >= 1e6) return `${(x / 1e6).toFixed(2)}M`;
  if (x >= 1e3) return `${(x / 1e3).toFixed(2)}K`;
  return String(x);
}

/** Signed compact delta for vault line (matches OV2 C21-style toasts). */
function fmtVaultDelta(n) {
  const x = Math.floor(Number(n) || 0);
  if (x === 0) return "0";
  const sign = x > 0 ? "+" : "-";
  return `${sign}${fmt(Math.abs(x))}`;
}

/** Shown in UI for a play line (low/high/dozen as ranges; engine still uses playType ids). */
function ov2CwPlayDisplayText(playType, playValue) {
  const t = String(playType || "").trim();
  if (t === "low") return "1–18";
  if (t === "high") return "19–36";
  if (t === "dozen") {
    const v = Math.floor(Number(playValue) || 0);
    if (v === 1) return "1–12";
    if (v === 2) return "13–24";
    if (v === 3) return "25–36";
    return t;
  }
  if (playValue != null && (t === "number" || t === "column")) return `${t} ${playValue}`;
  return t;
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

function roundLeaderPk(engine) {
  const seats = engine?.seats;
  if (!Array.isArray(seats)) return null;
  for (const s of seats) {
    const pk = String(s?.participantKey || "").trim();
    if (pk) return pk;
  }
  return null;
}

function conicGradientStops() {
  const parts = [];
  for (let i = 0; i < OV2_CW_WHEEL_NUMBERS.length; i++) {
    const { color } = OV2_CW_WHEEL_NUMBERS[i];
    const hex = color === "red" ? "#b91c1c" : color === "black" ? "#27272a" : "#15803d";
    const a = i * OV2_CW_SEGMENT_DEG;
    const b = (i + 1) * OV2_CW_SEGMENT_DEG;
    parts.push(`${hex} ${a}deg ${b}deg`);
  }
  return `conic-gradient(from -90deg, ${parts.join(", ")})`;
}

const CONIC_BG = conicGradientStops();

/** Stronger deceleration tail than cubic — fast start, long slow settle (roulette feel). */
function easeOutQuint(t) {
  return 1 - (1 - t) ** 5;
}

function normalizeCwAngleDeg(x) {
  return ((x % 360) + 360) % 360;
}

/** Steady clockwise drift during place window — same RAF pipeline as spin, reads believable next to deceleration. */
const OV2_CW_PLACING_DRIFT_DEG_PER_SEC = 165;
const OV2_CW_DRIFT_MAX_DT_SEC = 0.12;

/** Counter parent wheel rotation so rim digits stay horizontal to the viewer (same reading direction always). */
function viewerHorizontalLabelDeg(wheelDeg) {
  return -wheelDeg;
}

export default function Ov2CwScreen({
  roomId,
  engine,
  tableStakeUnits,
  participantKey,
  displayName,
  onOperate,
  operateBusy,
  loadError,
}) {
  const [tick, setTick] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [myPlayPopupOpen, setMyPlayPopupOpen] = useState(false);
  const [lastResultPopupOpen, setLastResultPopupOpen] = useState(false);
  const [myPlayPopupAllOpen, setMyPlayPopupAllOpen] = useState(false);
  /** Occupied seat index for read-only player + bets + recent results panel */
  const [seatInspectorIndex, setSeatInspectorIndex] = useState(null);
  const [hint, setHint] = useState("");
  const [playAmount, setPlayAmount] = useState(String(tableStakeUnits || 100));
  /** Staged play panel picks (toggle until Place Play): keys `red` | `number:7` | `dozen:2` | … */
  const [pendingPlayKeys, setPendingPlayKeys] = useState([]);
  const wheelRotRef = useRef(0);
  const [wheelDisplayDeg, setWheelDisplayDeg] = useState(0);
  const spinRafRef = useRef(null);
  const placingDriftRafRef = useRef(null);
  /** Latest engine for spin RAF only — avoids restarting animation on every realtime `engine` reference change. */
  const engineSpinRef = useRef(engine);
  engineSpinRef.current = engine;
  /** When user dismisses the mobile sheet during a round, hold `roundSeq` to block auto-reopen until the next round. */
  const sheetDismissedRoundRef = useRef(null);
  const prevPhaseForSheetRef = useRef(null);
  const [roundOutcomeFlash, setRoundOutcomeFlash] = useState(null);
  const lastOutcomeFlashKeyRef = useRef("");

  useEffect(() => {
    setPlayAmount(String(Math.max(100, Math.floor(Number(tableStakeUnits) || 100))));
  }, [tableStakeUnits]);

  const togglePendingPlay = useCallback((playType, playValue = null) => {
    const key =
      playValue == null || playValue === ""
        ? String(playType || "").trim()
        : `${String(playType || "").trim()}:${Math.floor(Number(playValue))}`;
    if (!key) return;
    setPendingPlayKeys(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setTick(x => x + 1), 500);
    return () => window.clearInterval(id);
  }, []);

  const minPlay = Math.max(100, Math.floor(Number(tableStakeUnits) || 100));
  const maxPlay = Math.min(minPlay * 200, 10_000_000);

  const seatsForUi = useMemo(() => {
    const raw = Array.isArray(engine?.seats) ? engine.seats : [];
    return Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => {
      const s = raw[i];
      if (s && typeof s === "object") {
        return { ...s, seatIndex: i };
      }
      return { seatIndex: i, participantKey: null, displayName: null };
    });
  }, [engine?.seats]);

  const mySeat = useMemo(() => {
    if (!participantKey) return null;
    return seatsForUi.find(s => s.participantKey === participantKey) || null;
  }, [seatsForUi, participantKey]);

  const leaderPk = useMemo(() => roundLeaderPk(engine), [engine]);
  const imLeader = Boolean(participantKey && leaderPk === participantKey);

  const phase = String(engine?.phase || "lobby");
  const placingLive = phase === "placing";
  const spinning = phase === "spinning";
  const resultPhase = phase === "result";
  const lobby = phase === "lobby";
  const roundSeq = Math.max(0, Math.floor(Number(engine?.roundSeq) || 0));

  useEffect(() => {
    setPendingPlayKeys([]);
  }, [roundSeq]);

  void tick;
  const countdown = useMemo(() => {
    if (!engine?.phaseEndsAt) return null;
    return secsLeft(engine.phaseEndsAt);
  }, [engine?.phaseEndsAt, tick]);

  useEffect(() => {
    if (!spinning) {
      if (spinRafRef.current) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
      return undefined;
    }

    if (placingDriftRafRef.current) {
      cancelAnimationFrame(placingDriftRafRef.current);
      placingDriftRafRef.current = null;
    }

    const eng = engineSpinRef.current;
    if (eng?.pendingResultNumber == null) {
      if (spinRafRef.current) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
      return undefined;
    }

    const pending = Math.floor(Number(eng.pendingResultNumber));
    const winIdx = OV2_CW_WHEEL_NUMBERS.findIndex(e => e.num === pending);
    if (winIdx < 0) {
      if (spinRafRef.current) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
      return undefined;
    }

    /** Segment center on disk (top-CW). Need final rotate(to) with to ≡ -thetaSeg (mod 360) for top pointer. */
    const thetaSeg = ov2CwIndexToCenterAngle(winIdx);
    const from = wheelRotRef.current;
    const turns = 8;
    const targetRem = normalizeCwAngleDeg(-thetaSeg);
    const fromRem = normalizeCwAngleDeg(from);
    const remainder = (targetRem - fromRem + 360) % 360;
    const to = from + remainder + turns * 360;
    const t0 = performance.now();
    const dur = OV2_CW_SPINNING_MS;

    const step = now => {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / dur);
      const e = easeOutQuint(p);
      const cur = from + (to - from) * e;
      wheelRotRef.current = cur;
      setWheelDisplayDeg(cur);
      if (p < 1) {
        spinRafRef.current = requestAnimationFrame(step);
      } else {
        spinRafRef.current = null;
      }
    };
    spinRafRef.current = requestAnimationFrame(step);
    return () => {
      if (spinRafRef.current) cancelAnimationFrame(spinRafRef.current);
      spinRafRef.current = null;
    };
  }, [spinning]);

  useEffect(() => {
    if (!placingLive || spinning) {
      if (placingDriftRafRef.current) {
        cancelAnimationFrame(placingDriftRafRef.current);
        placingDriftRafRef.current = null;
      }
      return undefined;
    }

    let last = performance.now();
    const step = now => {
      const dt = Math.min(OV2_CW_DRIFT_MAX_DT_SEC, Math.max(0, (now - last) / 1000));
      last = now;
      const next = wheelRotRef.current + OV2_CW_PLACING_DRIFT_DEG_PER_SEC * dt;
      wheelRotRef.current = next;
      setWheelDisplayDeg(next);
      placingDriftRafRef.current = requestAnimationFrame(step);
    };
    placingDriftRafRef.current = requestAnimationFrame(step);
    return () => {
      if (placingDriftRafRef.current) {
        cancelAnimationFrame(placingDriftRafRef.current);
        placingDriftRafRef.current = null;
      }
    };
  }, [placingLive, spinning]);

  const dismissMobileSheet = useCallback(() => {
    if (placingLive) {
      sheetDismissedRoundRef.current = Math.max(1, roundSeq);
    }
    setSheetOpen(false);
  }, [placingLive, roundSeq]);

  const openMobileSheetManual = useCallback(() => {
    sheetDismissedRoundRef.current = null;
    setMyPlayPopupOpen(false);
    setLastResultPopupOpen(false);
    setMyPlayPopupAllOpen(false);
    setSeatInspectorIndex(null);
    setSheetOpen(true);
  }, []);

  useEffect(() => {
    if (sheetOpen) {
      setMyPlayPopupOpen(false);
      setLastResultPopupOpen(false);
      setMyPlayPopupAllOpen(false);
      setSeatInspectorIndex(null);
    }
  }, [sheetOpen]);

  useEffect(() => {
    if (seatInspectorIndex == null) return;
    const s = seatsForUi[seatInspectorIndex];
    if (!s?.participantKey) setSeatInspectorIndex(null);
  }, [seatInspectorIndex, seatsForUi]);

  useEffect(() => {
    if (seatInspectorIndex == null) return undefined;
    const onKey = e => {
      if (e.key === "Escape") setSeatInspectorIndex(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seatInspectorIndex]);

  useEffect(() => {
    if (!myPlayPopupOpen) setMyPlayPopupAllOpen(false);
  }, [myPlayPopupOpen]);

  useEffect(() => {
    const prev = prevPhaseForSheetRef.current;
    const now = phase;
    if (now !== "placing") {
      setSheetOpen(false);
    } else if (prev !== "placing") {
      const rs = Math.max(1, roundSeq);
      if (sheetDismissedRoundRef.current !== rs) {
        setSheetOpen(true);
      }
    }
    prevPhaseForSheetRef.current = now;
  }, [phase, roundSeq]);

  const doOp = useCallback(
    async (op, payload = {}) => {
      setHint("");
      const r = await onOperate(op, payload);
      if (r?.skipped) return r;
      if (!r?.ok) {
        const c = r?.json?.code || r?.code || r?.error?.code || "rejected";
        setHint(String(c));
      }
      return r;
    },
    [onOperate],
  );

  const onSit = useCallback(
    async seatIndex => {
      await doOp("sit", { seatIndex, displayName });
    },
    [doOp, displayName],
  );

  const submitPlay = useCallback(async () => {
    if (pendingPlayKeys.length === 0) return;
    const amt = Math.floor(Number(playAmount) || 0);
    const items = pendingPlayKeys.map(k => {
      const s = String(k);
      const i = s.indexOf(":");
      if (i < 0) return { playType: s, playValue: null };
      return { playType: s.slice(0, i), playValue: Math.floor(Number(s.slice(i + 1))) };
    });
    const r = await doOp("place_plays", { amount: amt, items });
    if (r?.skipped) return;
    if (r?.ok) setPendingPlayKeys([]);
  }, [doOp, playAmount, pendingPlayKeys]);

  const plays = Array.isArray(engine?.plays) ? engine.plays : [];
  const myPlays = useMemo(
    () => plays.filter(p => p.participantKey === participantKey && Math.floor(Number(p.roundSeq) || 0) === roundSeq),
    [plays, participantKey, roundSeq],
  );

  const inspectorSeatPlays = useMemo(() => {
    if (seatInspectorIndex == null) return [];
    const s = seatsForUi[seatInspectorIndex];
    const pk = String(s?.participantKey || "").trim();
    if (!pk) return [];
    return plays.filter(
      p => String(p.participantKey || "").trim() === pk && Math.floor(Number(p.roundSeq) || 0) === roundSeq,
    );
  }, [seatInspectorIndex, seatsForUi, plays, roundSeq]);

  useEffect(() => {
    if (!resultPhase || engine?.resultNumber == null || !participantKey) return undefined;
    const rs = roundSeq;
    const n = Math.floor(Number(engine.resultNumber));
    const flashKey = `${rs}:${n}`;
    if (lastOutcomeFlashKeyRef.current === flashKey) return undefined;

    const mine = plays.filter(
      p => p.participantKey === participantKey && Math.floor(Number(p.roundSeq) || 0) === rs,
    );
    if (mine.length === 0) {
      lastOutcomeFlashKeyRef.current = flashKey;
      return undefined;
    }

    let anyWin = false;
    let risked = 0;
    let returned = 0;
    for (const p of mine) {
      const amt = Math.max(0, Math.floor(Number(p.amount) || 0));
      risked += amt;
      const won = ov2CwPlayWins(p.playType, p.playValue, n);
      if (won) {
        anyWin = true;
        const mult = ov2CwPayoutMultiplier(p.playType);
        returned += Math.floor(amt * (1 + mult));
      }
    }
    const net = returned - risked;

    lastOutcomeFlashKeyRef.current = flashKey;
    setRoundOutcomeFlash({ win: anyWin, net, returned, risked });
    const t = window.setTimeout(() => {
      setRoundOutcomeFlash(null);
    }, 2000);

    return () => {
      window.clearTimeout(t);
      lastOutcomeFlashKeyRef.current = "";
    };
  }, [resultPhase, engine?.resultNumber, roundSeq, participantKey, plays]);

  useEffect(() => {
    if (!resultPhase) {
      setRoundOutcomeFlash(null);
      lastOutcomeFlashKeyRef.current = "";
    }
  }, [resultPhase]);

  const centerResult =
    resultPhase || spinning
      ? spinning
        ? null
        : Math.floor(Number(engine?.resultNumber) ?? -1)
      : null;
  const centerColor = resultPhase ? String(engine?.resultColor || ov2CwColorForNumber(centerResult ?? 0)) : null;

  if (!engine) {
    return (
      <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-zinc-500">
        {loadError ? `Load error: ${loadError}` : "Loading table…"}
      </div>
    );
  }

  const phaseLabel = lobby
    ? "Waiting"
    : placingLive
      ? "Place plays"
      : spinning
        ? "Spinning"
        : resultPhase
          ? "Result"
          : "—";

  const seatBtn = (s, i) => {
    const occ = Boolean(s.participantKey);
    const mine = s.participantKey === participantKey;
    const isRoundController = occ && leaderPk && s.participantKey === leaderPk;
    const base =
      "relative flex min-h-0 flex-col items-center justify-center gap-0 rounded-md border px-0.5 py-2.5 text-center touch-manipulation transition-[box-shadow,border-color,transform] active:scale-[0.99] max-sm:min-h-[2rem] max-sm:leading-none sm:min-h-[4.125rem] sm:gap-0.5 sm:rounded-xl sm:px-2 sm:py-3.5 sm:text-[11px] lg:min-h-[3.5rem] lg:rounded-lg lg:px-1.5 lg:py-3 lg:text-[10px]";
    if (!occ) {
      return (
        <button
          type="button"
          key={i}
          disabled={operateBusy}
          aria-label="Join table"
          onClick={() => void onSit(i)}
          className={`${base} border-amber-500/25 bg-gradient-to-b from-zinc-900/60 to-black/50 text-amber-100/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-amber-400/40 hover:shadow-[0_0_20px_-6px_rgba(245,158,11,0.35)] disabled:opacity-40 max-sm:text-[7px] sm:text-[10px]`}
        >
          <span className="font-bold leading-none text-amber-100 max-sm:text-[8px]">Join</span>
        </button>
      );
    }
    return (
      <button
        type="button"
        key={i}
        onClick={() => {
          setMyPlayPopupOpen(false);
          setLastResultPopupOpen(false);
          setSeatInspectorIndex(i);
        }}
        aria-haspopup="dialog"
        aria-expanded={seatInspectorIndex === i}
        aria-label={`Player: ${s.displayName || "Player"}`}
        className={`${base} cursor-pointer border-white/[0.12] bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(0,0,0,0.35)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/45 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 ${
          mine
            ? "z-[1] border-amber-400/45 shadow-[0_0_0_1px_rgba(251,191,36,0.25),0_0_28px_-8px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.08)]"
            : ""
        }`}
      >
        {isRoundController ? (
          <span className="absolute top-px right-px rounded bg-amber-500/25 px-0.5 py-px text-[5px] font-bold uppercase leading-none text-amber-200/95 sm:top-1 sm:right-1 sm:px-1 sm:text-[7px]">
            <span className="sm:hidden">L</span>
            <span className="hidden sm:inline">Lead</span>
          </span>
        ) : null}
        <span className="w-full min-w-0 truncate font-semibold tracking-tight text-zinc-50 max-sm:text-[7px] max-sm:leading-tight sm:text-xs">
          {s.displayName || "Player"}
        </span>
      </button>
    );
  };

  const statusSub = lobby
    ? imLeader
      ? "You can start a round."
      : "Waiting for table controller."
    : "";

  const wheelStageMax = "max-w-[min(92vw,17.5rem)] lg:max-w-[min(100%,22rem)] xl:max-w-[24rem]";

  const inspectorSeat =
    seatInspectorIndex != null && seatsForUi[seatInspectorIndex]?.participantKey
      ? seatsForUi[seatInspectorIndex]
      : null;

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-xl flex-col overflow-hidden sm:max-w-2xl md:max-w-3xl lg:max-w-4xl">
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/[0.1] bg-gradient-to-b from-zinc-900/40 via-zinc-950/50 to-black/55 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2 sm:gap-2 sm:p-3 lg:gap-2 lg:p-4">
          {/* Live / phase — full width of table card */}
          <div
            className={`flex w-full min-w-0 shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 sm:rounded-xl sm:px-3 sm:py-1.5 ${
              resultPhase
                ? "border-amber-500/25 bg-amber-950/20"
                : "border-white/[0.08] bg-zinc-950/70"
            }`}
          >
            <div className="min-w-0 flex-1 leading-tight">
              <span className="text-[7px] font-semibold uppercase tracking-wider text-amber-200/45 sm:text-[8px]">Live</span>
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0">
                <span className="text-[13px] font-bold text-white sm:text-sm">{phaseLabel}</span>
                {statusSub ? (
                  <span className="min-w-0 flex-1 truncate text-[9px] text-zinc-500 sm:text-[10px]">{statusSub}</span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Full-width game surface anchor: timer / Play sit at table corners; wheel stays in narrow stage */}
          <div className="relative w-full min-w-0 shrink-0">
            {countdown != null ? (
              <div
                className="pointer-events-none absolute right-0 top-0 z-[61] px-0.5 py-0 sm:px-1 sm:py-0.5"
                aria-label={`${countdown} seconds`}
              >
                <span className="inline-block bg-gradient-to-b from-amber-100 to-amber-400 bg-clip-text text-[13px] font-bold tabular-nums leading-tight tracking-wide text-transparent drop-shadow-[0_1px_4px_rgba(0,0,0,0.85)] sm:text-[15px] lg:text-[18px]">
                  {countdown}
                </span>
              </div>
            ) : null}
            {mySeat && !sheetOpen && (placingLive || spinning || resultPhase) ? (
              <button
                type="button"
                disabled={placingLive && operateBusy}
                onClick={() => (placingLive ? openMobileSheetManual() : dismissMobileSheet())}
                title={placingLive ? "Play panel" : "Close"}
                aria-label={placingLive ? "Open play panel" : "Close"}
                className="absolute left-0 top-0 z-[61] rounded-md border border-amber-500/45 bg-gradient-to-b from-amber-900/90 to-amber-950/95 px-2.5 py-1.5 text-[9px] font-bold leading-tight tracking-wide text-amber-50 shadow-md touch-manipulation disabled:opacity-40 sm:px-3 sm:py-2 sm:text-[10px] lg:text-[11px]"
              >
                {placingLive ? "PLAY PANEL" : "CLOSE"}
              </button>
            ) : null}

            <div className="absolute left-0 bottom-0 z-[61]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSeatInspectorIndex(null);
                    setLastResultPopupOpen(false);
                    setMyPlayPopupOpen(v => !v);
                  }}
                  className="rounded-md border border-amber-500/40 bg-gradient-to-b from-zinc-800/95 to-black/90 px-2.5 py-1.5 text-[11px] font-bold leading-none tracking-wide text-amber-100/90 shadow-md touch-manipulation sm:px-3 sm:py-2 sm:text-[12px] lg:text-[13px]"
                  aria-expanded={myPlayPopupOpen}
                  aria-label="My play quick view"
                >
                  My Play
                </button>
                {myPlayPopupOpen ? (
                  <div
                    className="absolute bottom-full left-0 z-[62] mb-1 flex max-h-[min(14rem,36vh)] w-[min(13rem,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-lg border border-white/[0.12] bg-zinc-950/98 shadow-xl backdrop-blur-sm"
                    role="dialog"
                    aria-label="My play"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-2 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/80">My Play</p>
                      <button
                        type="button"
                        className="rounded border border-white/10 bg-zinc-900/80 px-1.5 py-px text-[9px] font-semibold text-zinc-400 hover:text-zinc-200"
                        onClick={() => setMyPlayPopupOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-2">
                      {myPlays.length === 0 ? (
                        <p className="text-center text-[10px] text-zinc-500">No plays this round.</p>
                      ) : (
                        <ul className="space-y-1">
                          {myPlays.map(p => {
                            const won =
                              resultPhase && engine.resultNumber != null
                                ? ov2CwPlayWins(p.playType, p.playValue, Math.floor(Number(engine.resultNumber)))
                                : null;
                            const st =
                              placingLive || spinning
                                ? "pending"
                                : won === true
                                  ? "win"
                                  : won === false
                                    ? "loss"
                                    : "pending";
                            const color =
                              st === "win" ? "text-emerald-300" : st === "loss" ? "text-rose-300" : "text-zinc-400";
                            return (
                              <li
                                key={p.playId}
                                className={`flex justify-between gap-1 rounded border border-white/[0.06] bg-white/[0.03] px-1.5 py-1 text-[10px] ${color}`}
                              >
                                <span className="min-w-0 truncate">
                                  {ov2CwPlayDisplayText(p.playType, p.playValue)}
                                </span>
                                <span className="shrink-0 font-mono tabular-nums">{fmt(p.amount)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <button
                        type="button"
                        onClick={() => setMyPlayPopupAllOpen(v => !v)}
                        className="mt-2 w-full rounded border border-white/[0.1] bg-zinc-900/70 py-1 text-[9px] font-semibold text-amber-200/85 hover:border-amber-500/25"
                      >
                        {myPlayPopupAllOpen ? "Hide all plays" : "Show all plays"}
                      </button>
                      {myPlayPopupAllOpen ? (
                        <ul className="mt-1.5 space-y-0.5 border-t border-white/[0.06] pt-1.5">
                          {plays.filter(p => Math.floor(Number(p.roundSeq) || 0) === roundSeq).length === 0 ? (
                            <li className="py-0.5 text-center text-[9px] text-zinc-500">No table plays.</li>
                          ) : (
                            plays
                              .filter(p => Math.floor(Number(p.roundSeq) || 0) === roundSeq)
                              .map(p => {
                                const sn = Math.max(
                                  0,
                                  Math.min(OV2_CW_MAX_SEATS - 1, Math.floor(Number(p.seatIndex) || 0)),
                                );
                                const nm = seatsForUi[sn]?.displayName;
                                return (
                                  <li
                                    key={p.playId}
                                    className="flex justify-between gap-1 rounded px-0.5 py-0.5 text-[9px] text-zinc-400"
                                  >
                                    <span className="min-w-0 truncate">
                                      {nm || `Seat ${sn + 1}`} · {ov2CwPlayDisplayText(p.playType, p.playValue)}
                                    </span>
                                    <span className="shrink-0 font-mono tabular-nums">{fmt(p.amount)}</span>
                                  </li>
                                );
                              })
                          )}
                        </ul>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="absolute right-0 bottom-0 z-[61]">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setSeatInspectorIndex(null);
                    setMyPlayPopupOpen(false);
                    setLastResultPopupOpen(v => !v);
                  }}
                  className="rounded-md border border-amber-500/40 bg-gradient-to-b from-zinc-800/95 to-black/90 px-2.5 py-1.5 text-[11px] font-bold leading-none tracking-wide text-amber-100/90 shadow-md touch-manipulation sm:px-3 sm:py-2 sm:text-[12px] lg:text-[13px]"
                  aria-expanded={lastResultPopupOpen}
                  aria-label="Last results quick view"
                >
                  Last Result
                </button>
                {lastResultPopupOpen ? (
                  <div
                    className="absolute bottom-full right-0 z-[62] mb-1 flex max-h-[min(20rem,55vh)] w-[min(13rem,calc(100vw-1.25rem))] flex-col overflow-hidden rounded-lg border border-white/[0.12] bg-zinc-950/98 shadow-xl backdrop-blur-sm"
                    role="dialog"
                    aria-label="Last results"
                    onClick={e => e.stopPropagation()}
                  >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-2 py-1.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/80">Last Results</p>
                      <button
                        type="button"
                        className="rounded border border-white/10 bg-zinc-900/80 px-1.5 py-px text-[9px] font-semibold text-zinc-400 hover:text-zinc-200"
                        onClick={() => setLastResultPopupOpen(false)}
                      >
                        Close
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-2 py-2 [-webkit-overflow-scrolling:touch]">
                      {!Array.isArray(engine.history) || engine.history.length === 0 ? (
                        <p className="text-center text-[10px] text-zinc-500">No results yet.</p>
                      ) : (
                        <div className="flex max-w-full flex-wrap content-start gap-1">
                          {engine.history.slice(0, 24).map((h, idx) => {
                            const n = Math.floor(Number(h.resultNumber) || 0);
                            const c = String(h.resultColor || ov2CwColorForNumber(n));
                            return (
                              <div
                                key={`${h.roundSeq}-${idx}-pop`}
                                className={`flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-md border text-[10px] font-black tabular-nums ${
                                  c === "red"
                                    ? "border-red-500/35 bg-red-950/50 text-red-100"
                                    : c === "black"
                                      ? "border-zinc-600/50 bg-zinc-800/80 text-zinc-100"
                                      : "border-emerald-500/35 bg-emerald-950/50 text-emerald-100"
                                }`}
                              >
                                {n}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className={`relative z-[59] mx-auto w-full shrink-0 px-1 py-2 sm:px-1.5 sm:py-2.5 ${wheelStageMax}`}>
            <div className="relative flex w-full flex-col items-center overflow-visible">
              <div
                className="pointer-events-none absolute -inset-3 rounded-full bg-amber-500/[0.06] blur-2xl sm:-inset-4"
                aria-hidden
              />
              <div className="pointer-events-none relative z-[1] -mt-1 mb-0.5 flex justify-center">
                <div className="flex flex-col items-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
                  <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[11px] border-t-amber-300 sm:border-x-[9px] sm:border-t-[13px]" />
                  <div className="-mt-px h-0.5 w-1.5 rounded-sm bg-gradient-to-b from-amber-200 to-amber-600" />
                </div>
              </div>
              <div
                className="relative z-[1] mt-0 aspect-square w-full overflow-visible rounded-full p-1 shadow-[0_0_0_1px_rgba(251,191,36,0.1),0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-amber-500/15 sm:p-[3px]"
                style={{
                  background: "linear-gradient(145deg, rgba(39,39,42,0.85) 0%, rgba(9,9,11,0.92) 55%, rgba(50,28,8,0.3) 100%)",
                }}
              >
            <div className="relative h-full w-full overflow-visible">
              <div
                className="relative h-full w-full overflow-visible rounded-full border-2 border-zinc-800/95 shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)]"
                style={{
                  transform: `rotate(${wheelDisplayDeg}deg)`,
                  transition:
                    spinning || placingLive ? "none" : "transform 0.35s ease-out",
                }}
              >
                <div
                  className="absolute inset-0 overflow-hidden rounded-full"
                  style={{ background: CONIC_BG }}
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute inset-0 z-[10] overflow-visible"
                  aria-hidden
                >
                  {OV2_CW_WHEEL_NUMBERS.map((entry, i) => {
                    /** Match `conic-gradient(from -90deg, …)`: stop 0° sits at 9 o'clock; angles increase CW → add 270° to segment mid-angle from top. */
                    const thetaFromTop = (270 + (i + 0.5) * OV2_CW_SEGMENT_DEG) % 360;
                    const rad = (thetaFromTop * Math.PI) / 180;
                    /** Outer track toward bezel; tuned so digits hug rim without clipping the circle. */
                    const rimPct = 45.6;
                    const xPct = 50 + rimPct * Math.sin(rad);
                    const yPct = 50 - rimPct * Math.cos(rad);
                    const uprightDeg = viewerHorizontalLabelDeg(wheelDisplayDeg);
                    /** Extra push along radius (wheel-local % of box). */
                    const outPct = 2.15;
                    const leftPct = xPct + outPct * Math.sin(rad);
                    const topPct = yPct - outPct * Math.cos(rad);
                    const tc =
                      entry.color === "red"
                        ? "text-white"
                        : entry.color === "black"
                          ? "text-zinc-100"
                          : "text-white";
                    return (
                      <div
                        key={`rim-${entry.num}-${i}`}
                        className="absolute z-[10]"
                        style={{
                          left: `${leftPct}%`,
                          top: `${topPct}%`,
                          transform: `translate(-50%, -50%) rotate(${uprightDeg}deg)`,
                        }}
                      >
                        <span
                          className={`block min-w-[1.15em] text-center text-[11px] font-black tabular-nums leading-none sm:text-xs lg:text-sm xl:text-[0.95rem] ${tc} [text-shadow:0_0_4px_rgba(0,0,0,1),0_0_2px_rgba(0,0,0,1),0_1px_3px_rgba(0,0,0,0.95)]`}
                        >
                          {entry.num}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="absolute inset-[18%] z-20 flex flex-col items-center justify-center rounded-full border border-white/[0.12] bg-gradient-to-b from-zinc-950 via-zinc-950 to-black shadow-[inset_0_2px_6px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.05)] sm:inset-[18%] lg:inset-[19%]"
                  style={{
                    transform: `rotate(${viewerHorizontalLabelDeg(wheelDisplayDeg)}deg)`,
                    transition:
                      spinning || placingLive ? "none" : "transform 0.35s ease-out",
                  }}
                >
              {resultPhase && centerResult != null && centerResult >= 0 ? (
                <>
                  <span
                    className={`text-3xl font-black tabular-nums drop-shadow-sm sm:text-4xl md:text-5xl ${
                      centerColor === "red"
                        ? "text-red-400"
                        : centerColor === "black"
                          ? "text-zinc-100"
                          : "text-emerald-400"
                    }`}
                  >
                    {centerResult}
                  </span>
                  <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-widest text-zinc-500">Result</span>
                </>
              ) : spinning ? (
                <span className="text-sm font-semibold text-zinc-500 sm:text-base">…</span>
              ) : (
                <span className="px-2 text-center text-[9px] font-medium leading-snug text-zinc-500 sm:text-[10px]">
                  Color Wheel
                </span>
              )}
                </div>
              </div>
            </div>
          </div>
            </div>

          {lobby && imLeader ? (
            <button
              type="button"
              disabled={operateBusy}
              onClick={() => void doOp("start_round", {})}
              className="mx-auto mt-0.5 shrink-0 rounded-xl border border-amber-500/35 bg-gradient-to-b from-amber-700/85 to-amber-950/90 px-5 py-1.5 text-xs font-bold text-white shadow-md touch-manipulation disabled:opacity-40 sm:py-2 sm:text-sm"
            >
              Start Round
            </button>
          ) : null}
            </div>

          {myPlayPopupOpen || lastResultPopupOpen ? (
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close quick panels"
              className="absolute inset-0 z-[58] border-0 bg-black/35 p-0"
              onClick={() => {
                setMyPlayPopupOpen(false);
                setLastResultPopupOpen(false);
                setSeatInspectorIndex(null);
              }}
            />
          ) : null}

          </div>

          {Array.isArray(engine.history) && engine.history.length > 0 ? (
            <div className="w-full min-w-0 shrink-0">
              <div className="mb-1 flex items-center gap-2 lg:mb-1.5">
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" aria-hidden />
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/70">Last Results</p>
                <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" aria-hidden />
              </div>
              <div className="flex flex-wrap content-start gap-1 pb-0.5 sm:gap-1.5">
                {engine.history.slice(0, 8).map((h, idx) => {
                  const n = Math.floor(Number(h.resultNumber) || 0);
                  const c = String(h.resultColor || ov2CwColorForNumber(n));
                  return (
                    <div
                      key={`${h.roundSeq}-${idx}`}
                      className={`flex h-7 min-w-[1.6rem] shrink-0 items-center justify-center rounded-md border px-0.5 text-[10px] font-black tabular-nums shadow-sm sm:h-7 sm:min-w-[1.75rem] sm:text-[11px] ${
                        c === "red"
                          ? "border-red-500/35 bg-gradient-to-b from-red-950/70 to-red-950/40 text-red-100"
                          : c === "black"
                            ? "border-zinc-600/50 bg-gradient-to-b from-zinc-800 to-zinc-950 text-zinc-100"
                            : "border-emerald-500/35 bg-gradient-to-b from-emerald-950/70 to-emerald-950/35 text-emerald-100"
                      }`}
                    >
                      {n}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="grid w-full min-w-0 shrink-0 grid-cols-6 gap-0.5 sm:gap-2 lg:gap-2">
            {Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => seatBtn(seatsForUi[i], i))}
          </div>

          <div className="relative flex w-full shrink-0 flex-col gap-1.5 overflow-hidden rounded-xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/35 via-black/28 to-black/45 p-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:gap-2 sm:p-2">
            <div className="rounded-lg border border-white/[0.06] bg-black/35 p-2 sm:p-2" aria-label="My plays">
              {myPlays.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-white/10 bg-zinc-950/40 py-3 text-center">
                  <p className="text-[10px] font-medium text-zinc-500">No plays this round.</p>
                </div>
              ) : (
                <div className="mt-1.5 flex max-h-[min(5.5rem,30svh)] flex-wrap content-start gap-1 overflow-y-auto overscroll-y-contain [-ms-overflow-style:none] [scrollbar-width:none] sm:max-h-[6rem] lg:max-h-[7rem] [&::-webkit-scrollbar]:hidden">
                  {myPlays.map(p => {
                    const won =
                      resultPhase && engine.resultNumber != null
                        ? ov2CwPlayWins(p.playType, p.playValue, Math.floor(Number(engine.resultNumber)))
                        : null;
                    const st =
                      placingLive || spinning
                        ? "pending"
                        : won === true
                          ? "win"
                          : won === false
                            ? "loss"
                            : "pending";
                    const borderCls =
                      st === "win"
                        ? "border-emerald-500/35 bg-emerald-950/20"
                        : st === "loss"
                          ? "border-rose-500/35 bg-rose-950/15"
                          : "border-white/[0.08] bg-white/[0.04]";
                    const label = `${ov2CwPlayDisplayText(p.playType, p.playValue)} · ${fmt(p.amount)}`;
                    return (
                      <div
                        key={p.playId}
                        title={label}
                        className={`flex min-h-[2.35rem] min-w-[2.75rem] max-w-[4.5rem] flex-col items-center justify-center rounded-md border px-1 py-0.5 text-center shadow-sm ${borderCls}`}
                      >
                        <span className="line-clamp-2 text-[8px] font-semibold capitalize leading-tight text-zinc-200 sm:text-[9px]">
                          {ov2CwPlayDisplayText(p.playType, p.playValue)}
                        </span>
                        <span className="mt-0.5 font-mono text-[8px] font-bold tabular-nums text-amber-200/90 sm:text-[9px]">
                          {fmt(p.amount)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {hint ? <p className="shrink-0 text-center text-[11px] text-rose-300">{hint}</p> : null}
        </div>

        {sheetOpen ? (
          <div className="absolute inset-0 z-[80] flex" role="presentation">
            <button
              type="button"
              className="absolute inset-0 border-0 bg-black/70 backdrop-blur-[2px]"
              aria-label="Dismiss play panel"
              onClick={() => dismissMobileSheet()}
            />
            <div className="pointer-events-none relative z-10 flex min-h-0 w-full flex-1 flex-col justify-end lg:flex-row lg:items-stretch lg:justify-end lg:p-3">
              <div
                className="pointer-events-auto flex max-h-[min(88dvh,calc(100%-0.5rem))] w-full flex-col overflow-hidden rounded-t-2xl border border-amber-500/30 border-b-0 bg-gradient-to-b from-zinc-900 to-zinc-950 shadow-[0_-12px_48px_rgba(0,0,0,0.55)] max-lg:h-[min(88dvh,calc(100%-0.5rem))] lg:max-h-[min(calc(100%-1.5rem),720px)] lg:min-h-0 lg:h-auto lg:w-full lg:max-w-md lg:rounded-2xl lg:border-b lg:shadow-2xl"
                role="dialog"
                aria-label="Play panel"
              >
                <div className="mx-auto mt-2 h-1 w-11 shrink-0 rounded-full bg-zinc-600 lg:hidden" aria-hidden />
                <div className="relative flex min-h-[2.75rem] shrink-0 items-center justify-center border-b border-white/[0.06] px-4 py-2.5">
                  <p className="pointer-events-none absolute left-1/2 top-1/2 max-w-[calc(100%-5.5rem)] -translate-x-1/2 -translate-y-1/2 truncate text-center text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/70">
                    Play Panel
                  </p>
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 z-[1] -translate-y-1/2 rounded-lg border border-white/10 bg-zinc-900/90 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300 hover:border-white/20 hover:text-white sm:right-4 sm:text-[11px]"
                    onClick={() => dismissMobileSheet()}
                    aria-label="Close play panel"
                  >
                    Close
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2 pt-1.5 max-lg:flex max-lg:flex-col max-lg:overflow-hidden sm:px-4 sm:pb-3 sm:pt-2 lg:overflow-y-auto">
                  <PlayForm
                    minPlay={minPlay}
                    maxPlay={maxPlay}
                    playAmount={playAmount}
                    setPlayAmount={setPlayAmount}
                    pendingPlayKeys={pendingPlayKeys}
                    togglePendingPlay={togglePendingPlay}
                  />
                </div>
                <div className="shrink-0 border-t border-white/[0.06] bg-zinc-950/95 p-3 pt-2.5 shadow-[0_-8px_24px_rgba(0,0,0,0.35)]">
                  <button
                    type="button"
                    disabled={!mySeat || !placingLive || operateBusy || pendingPlayKeys.length === 0}
                    onClick={() => {
                      void submitPlay();
                    }}
                    className="w-full rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-500 via-amber-600 to-amber-900 py-3.5 text-base font-extrabold tracking-tight text-white shadow-[0_4px_24px_-4px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-40 sm:py-4"
                  >
                    Place Play
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {roundOutcomeFlash ? (
          <div
            className="pointer-events-none absolute inset-0 z-[90] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
            role="status"
            aria-live="polite"
          >
            <div
              className={`max-w-[min(19rem,92vw)] rounded-xl border px-3 py-2.5 text-center shadow-[0_12px_40px_rgba(0,0,0,0.5)] backdrop-blur-md sm:max-w-sm sm:px-4 sm:py-3 ${
                roundOutcomeFlash.win
                  ? "border-emerald-600/35 bg-[#06120e]/95"
                  : "border-rose-500/40 bg-[#14080a]/95"
              }`}
            >
              <div
                className={`text-center text-[10px] font-bold uppercase tracking-wide ${
                  roundOutcomeFlash.win ? "text-emerald-300/90" : "text-rose-300/95"
                }`}
              >
                Round result
              </div>
              <div
                className={`mt-0.5 text-center text-lg font-black sm:text-xl ${
                  roundOutcomeFlash.win ? "text-emerald-100" : "text-rose-100"
                }`}
              >
                {roundOutcomeFlash.win ? "You won" : "Loss"}
              </div>
              <div className="mt-0.5 text-center text-[11px] text-zinc-300">
                Net vault ·{" "}
                <span
                  className={`font-semibold ${
                    roundOutcomeFlash.net < 0
                      ? "text-rose-200"
                      : roundOutcomeFlash.net > 0
                        ? "text-emerald-200"
                        : "text-white"
                  }`}
                >
                  {fmtVaultDelta(roundOutcomeFlash.net)}
                </span>
                {roundOutcomeFlash.returned > 0 ? (
                  <span className="text-zinc-500">
                    {" "}
                    · back {fmt(roundOutcomeFlash.returned)}
                    {roundOutcomeFlash.risked > 0 ? ` · in play ${fmt(roundOutcomeFlash.risked)}` : ""}
                  </span>
                ) : roundOutcomeFlash.risked > 0 ? (
                  <span className="text-zinc-500"> · in play {fmt(roundOutcomeFlash.risked)}</span>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}

        {inspectorSeat ? (
          <div
            className="absolute inset-0 z-[75] flex items-end justify-center p-2 sm:items-center sm:p-3"
            role="presentation"
          >
            <button
              type="button"
              tabIndex={-1}
              aria-label="Close player details"
              className="absolute inset-0 border-0 bg-black/55 p-0 backdrop-blur-[1px]"
              onClick={() => setSeatInspectorIndex(null)}
            />
            <div
              role="dialog"
              aria-label="Player details"
              className="relative z-10 flex max-h-[min(78dvh,32rem)] w-full max-w-sm flex-col overflow-hidden rounded-xl border border-white/[0.12] bg-zinc-950/98 shadow-2xl backdrop-blur-sm"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/[0.08] px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/85">Player</p>
                  <p className="truncate text-sm font-semibold text-white">{inspectorSeat.displayName || "Player"}</p>
                  {inspectorSeat.participantKey === participantKey ||
                  (leaderPk && inspectorSeat.participantKey === leaderPk) ? (
                    <p className="text-[10px] text-zinc-500">
                      {inspectorSeat.participantKey === participantKey ? "You" : ""}
                      {inspectorSeat.participantKey === participantKey &&
                      leaderPk &&
                      inspectorSeat.participantKey === leaderPk
                        ? " · "
                        : ""}
                      {leaderPk && inspectorSeat.participantKey === leaderPk ? "Lead" : ""}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="shrink-0 rounded-lg border border-white/10 bg-zinc-900/90 px-2 py-1 text-[10px] font-semibold text-zinc-300 hover:text-white"
                  onClick={() => setSeatInspectorIndex(null)}
                >
                  Close
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2.5">
                {resultPhase && engine.resultNumber != null ? (
                  <p className="mb-2 text-center text-[11px] text-zinc-400">
                    This round:{" "}
                    <span className="font-mono font-bold tabular-nums text-amber-200">
                      {Math.floor(Number(engine.resultNumber))}
                    </span>
                  </p>
                ) : null}
                <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">Plays this round</p>
                {inspectorSeatPlays.length === 0 ? (
                  <p className="mt-1.5 text-center text-[11px] text-zinc-500">No plays this round.</p>
                ) : (
                  <ul className="mt-1.5 space-y-1">
                    {inspectorSeatPlays.map(p => {
                      const won =
                        resultPhase && engine.resultNumber != null
                          ? ov2CwPlayWins(p.playType, p.playValue, Math.floor(Number(engine.resultNumber)))
                          : null;
                      const st =
                        placingLive || spinning
                          ? "pending"
                          : won === true
                            ? "win"
                            : won === false
                              ? "loss"
                              : "pending";
                      const stLabel = st === "win" ? "Win" : st === "loss" ? "Loss" : "Pending";
                      const stColor =
                        st === "win" ? "text-emerald-400" : st === "loss" ? "text-rose-400" : "text-zinc-500";
                      return (
                        <li
                          key={p.playId}
                          className="flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-2 py-1.5 text-[11px]"
                        >
                          <span className="min-w-0 truncate text-zinc-200">
                            {ov2CwPlayDisplayText(p.playType, p.playValue)}
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-amber-200/90">{fmt(p.amount)}</span>
                          <span className={`shrink-0 text-[10px] font-semibold ${stColor}`}>{stLabel}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
                {inspectorSeat.participantKey === participantKey && placingLive ? (
                  <p className="mt-3 text-center text-[10px] text-zinc-500">Use Play to place plays.</p>
                ) : null}
                <p className="mt-4 text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-500">Last results</p>
                {!Array.isArray(engine.history) || engine.history.length === 0 ? (
                  <p className="mt-1 text-[11px] text-zinc-600">No results yet.</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {engine.history.slice(0, 16).map((h, idx) => {
                      const n = Math.floor(Number(h.resultNumber) || 0);
                      const c = String(h.resultColor || ov2CwColorForNumber(n));
                      return (
                        <div
                          key={`insp-${h.roundSeq}-${idx}`}
                          className={`flex h-7 min-w-[1.65rem] items-center justify-center rounded-md border text-[10px] font-black tabular-nums ${
                            c === "red"
                              ? "border-red-500/35 bg-red-950/50 text-red-100"
                              : c === "black"
                                ? "border-zinc-600/50 bg-zinc-800/80 text-zinc-100"
                                : "border-emerald-500/35 bg-emerald-950/50 text-emerald-100"
                          }`}
                        >
                          {n}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const _cwSelRing =
  "z-[1] ring-2 ring-amber-400 ring-offset-1 ring-offset-zinc-950 shadow-[0_0_12px_-2px_rgba(245,158,11,0.45)]";

/** Number grid tile — matches European wheel red/black/green per `ov2CwColorForNumber`. */
function ov2CwExactTileClasses(num, isSelected) {
  const color = ov2CwColorForNumber(num);
  const ring = isSelected ? _cwSelRing : "hover:brightness-110";
  if (color === "green") {
    return `border border-emerald-800/60 bg-gradient-to-b from-emerald-600 to-emerald-950 text-emerald-50 ${ring}`;
  }
  if (color === "red") {
    return `border border-red-900/55 bg-gradient-to-b from-red-600 to-red-950 text-red-50 ${ring}`;
  }
  return `border border-zinc-700/70 bg-gradient-to-b from-zinc-700 to-zinc-950 text-zinc-100 ${ring}`;
}

/** Play-type chip colors (conventional roulette / table cues). */
function ov2CwPlayKindClasses(kindId, isSelected) {
  const ring = isSelected ? _cwSelRing : "hover:brightness-110";
  const pick = (on, off) => (isSelected ? `${on} ${ring}` : `${off} ${ring}`);

  switch (kindId) {
    case "red":
      return pick(
        "border border-red-500/55 bg-gradient-to-b from-red-500 to-red-950 text-red-50",
        "border border-red-900/45 bg-gradient-to-b from-red-900/70 to-red-950 text-red-200",
      );
    case "black":
      return pick(
        "border border-zinc-500/50 bg-gradient-to-b from-zinc-600 to-black text-zinc-50",
        "border border-zinc-700/55 bg-gradient-to-b from-zinc-800 to-zinc-950 text-zinc-200",
      );
    case "even":
      return pick(
        "border border-sky-400/50 bg-gradient-to-b from-sky-600 to-sky-950 text-sky-50",
        "border border-sky-900/40 bg-gradient-to-b from-sky-900/55 to-sky-950 text-sky-200",
      );
    case "odd":
      return pick(
        "border border-violet-400/50 bg-gradient-to-b from-violet-600 to-violet-950 text-violet-50",
        "border border-violet-900/40 bg-gradient-to-b from-violet-900/55 to-violet-950 text-violet-200",
      );
    case "low":
      return pick(
        "border border-emerald-400/50 bg-gradient-to-b from-emerald-600 to-emerald-950 text-emerald-50",
        "border border-emerald-900/40 bg-gradient-to-b from-emerald-900/55 to-emerald-950 text-emerald-200",
      );
    case "high":
      return pick(
        "border border-orange-400/50 bg-gradient-to-b from-orange-600 to-orange-950 text-orange-50",
        "border border-orange-900/40 bg-gradient-to-b from-orange-900/55 to-orange-950 text-orange-200",
      );
    case "dozen":
      return pick(
        "border border-indigo-400/50 bg-gradient-to-b from-indigo-600 to-indigo-950 text-indigo-50",
        "border border-indigo-900/40 bg-gradient-to-b from-indigo-900/55 to-indigo-950 text-indigo-200",
      );
    case "column":
      return pick(
        "border border-cyan-400/50 bg-gradient-to-b from-cyan-600 to-cyan-950 text-cyan-50",
        "border border-cyan-900/40 bg-gradient-to-b from-cyan-900/55 to-cyan-950 text-cyan-200",
      );
    case "number":
      return pick(
        "border border-emerald-400/55 bg-gradient-to-b from-emerald-600 to-emerald-950 text-emerald-50",
        "border border-emerald-900/45 bg-gradient-to-b from-emerald-900/60 to-emerald-950 text-emerald-200",
      );
    default:
      return pick(
        "border border-amber-400/55 bg-gradient-to-b from-amber-600/35 to-amber-950/50 text-amber-50",
        "border border-white/[0.08] bg-zinc-900/50 text-zinc-400",
      );
  }
}

/** G1–G3 / C1–C3 — distinct hues per slot when active (classic dozen / column bands). */
function ov2CwGroupSlotClasses(playKind, slot, selected, enabled = true) {
  if (!enabled) {
    return "cursor-not-allowed border border-white/[0.05] bg-zinc-950/40 text-zinc-600 opacity-50";
  }
  const ring = selected ? _cwSelRing : "hover:brightness-110";

  if (playKind === "dozen") {
    const bySlot = {
      1: selected
        ? "border border-emerald-400/50 bg-gradient-to-b from-emerald-600 to-emerald-950 text-emerald-50"
        : "border border-emerald-900/40 bg-gradient-to-b from-emerald-900/50 to-emerald-950 text-emerald-200",
      2: selected
        ? "border border-sky-400/50 bg-gradient-to-b from-sky-600 to-sky-950 text-sky-50"
        : "border border-sky-900/40 bg-gradient-to-b from-sky-900/50 to-sky-950 text-sky-200",
      3: selected
        ? "border border-violet-400/50 bg-gradient-to-b from-violet-600 to-violet-950 text-violet-50"
        : "border border-violet-900/40 bg-gradient-to-b from-violet-900/50 to-violet-950 text-violet-200",
    };
    return `${bySlot[slot]} ${ring}`;
  }

  const bySlot = {
    1: selected
      ? "border border-rose-400/50 bg-gradient-to-b from-rose-600 to-rose-950 text-rose-50"
      : "border border-rose-900/40 bg-gradient-to-b from-rose-900/50 to-rose-950 text-rose-200",
    2: selected
      ? "border border-amber-400/50 bg-gradient-to-b from-amber-600 to-amber-950 text-amber-50"
      : "border border-amber-900/40 bg-gradient-to-b from-amber-900/50 to-amber-950 text-amber-200",
    3: selected
      ? "border border-teal-400/50 bg-gradient-to-b from-teal-600 to-teal-950 text-teal-50"
      : "border border-teal-900/40 bg-gradient-to-b from-teal-900/50 to-teal-950 text-teal-200",
  };
  return `${bySlot[slot]} ${ring}`;
}

function PlayForm({ minPlay, maxPlay, playAmount, setPlayAmount, pendingPlayKeys, togglePendingPlay }) {
  const bump = useCallback(
    m => {
      const cur = Math.floor(Number(playAmount) || 0);
      const n = Math.max(minPlay, Math.min(maxPlay, cur + m));
      setPlayAmount(String(n));
    },
    [playAmount, minPlay, maxPlay, setPlayAmount],
  );

  const has = useCallback(
    (playType, playValue = null) => {
      const key =
        playValue == null || playValue === ""
          ? String(playType || "").trim()
          : `${String(playType || "").trim()}:${Math.floor(Number(playValue))}`;
      return pendingPlayKeys.includes(key);
    },
    [pendingPlayKeys],
  );

  const kinds = [
    { id: "red", label: "Red" },
    { id: "black", label: "Black" },
    { id: "even", label: "Even" },
    { id: "odd", label: "Odd" },
    { id: "low", label: "1–18" },
    { id: "high", label: "19–36" },
  ];

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col gap-2">
      <div className="shrink-0 rounded-lg border border-white/[0.08] bg-black/40 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] lg:rounded-xl lg:p-3">
        <div className="flex items-center gap-1.5 lg:gap-2">
          <div className="flex shrink-0 gap-1 lg:gap-1.5">
            <button
              type="button"
              className="min-h-[30px] rounded-md border border-white/[0.1] bg-zinc-900/80 px-2 text-[12px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30 lg:min-h-[36px] lg:rounded-lg lg:px-2.5 lg:text-[13px]"
              onClick={() => bump(-minPlay)}
            >
              −min
            </button>
            <button
              type="button"
              className="min-h-[30px] rounded-md border border-white/[0.1] bg-zinc-900/80 px-2 text-[12px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30 lg:min-h-[36px] lg:rounded-lg lg:px-2.5 lg:text-[13px]"
              onClick={() => bump(minPlay)}
            >
              +min
            </button>
            <button
              type="button"
              className="min-h-[30px] rounded-md border border-white/[0.1] bg-zinc-900/80 px-2 text-[12px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30 lg:min-h-[36px] lg:rounded-lg lg:px-2.5 lg:text-[13px]"
              onClick={() => bump(minPlay * 4)}
            >
              +4×
            </button>
          </div>
          <input
            type="number"
            inputMode="numeric"
            className="ml-auto min-h-[32px] min-w-0 flex-1 rounded-lg border border-amber-500/25 bg-zinc-950/90 px-2 text-right font-mono text-sm font-bold tabular-nums text-amber-50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] focus:border-amber-400/50 focus:outline-none sm:max-w-[7.5rem] sm:flex-none lg:min-h-[40px] lg:w-[7.5rem] lg:rounded-xl lg:px-3 lg:text-base"
            value={playAmount}
            onChange={e => setPlayAmount(e.target.value)}
          />
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-3 gap-x-1 gap-y-2 sm:grid-cols-3 lg:gap-x-1.5 lg:gap-y-2">
        {kinds.map(k => (
          <button
            key={k.id}
            type="button"
            onClick={() => togglePendingPlay(k.id, null)}
            className={`min-h-[2rem] rounded-lg px-1.5 py-1 text-[11px] font-bold leading-tight transition-[filter,box-shadow] lg:min-h-[2.5rem] lg:rounded-xl lg:px-2 lg:py-1.5 lg:text-[14px] ${ov2CwPlayKindClasses(
              k.id,
              has(k.id, null),
            )}`}
          >
            {k.label}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 gap-1.5 lg:gap-2">
        {[1, 2, 3].map(g => (
          <button
            key={`dg${g}`}
            type="button"
            onClick={() => togglePendingPlay("dozen", g)}
            className={`flex min-h-[2rem] flex-1 items-center justify-center rounded-lg px-1.5 py-1 text-[11px] font-bold leading-tight transition-[filter,box-shadow] lg:min-h-[2.5rem] lg:rounded-xl lg:px-2 lg:py-1.5 lg:text-[14px] ${ov2CwGroupSlotClasses(
              "dozen",
              g,
              has("dozen", g),
              true,
            )}`}
            aria-label={
              g === 1 ? "Dozen 1–12, toggle" : g === 2 ? "Dozen 13–24, toggle" : "Dozen 25–36, toggle"
            }
          >
            {g === 1 ? "1–12" : g === 2 ? "13–24" : "25–36"}
          </button>
        ))}
      </div>
      <div className="flex shrink-0 gap-1.5 lg:gap-2">
        {[1, 2, 3].map(g => (
          <button
            key={`cg${g}`}
            type="button"
            onClick={() => togglePendingPlay("column", g)}
            className={`flex min-h-[2rem] flex-1 items-center justify-center rounded-lg px-1.5 py-1 text-[11px] font-bold leading-tight transition-[filter,box-shadow] lg:min-h-[2.5rem] lg:rounded-xl lg:px-2 lg:py-1.5 lg:text-[14px] ${ov2CwGroupSlotClasses(
              "column",
              g,
              has("column", g),
              true,
            )}`}
            aria-label={`Column ${g}, toggle`}
          >
            C{g}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:min-h-[11rem]">
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-lg border border-white/[0.06] bg-black/30 [-webkit-overflow-scrolling:touch] lg:max-h-44"
          role="listbox"
          aria-label="Pick numbers"
        >
          <div className="grid grid-cols-7 gap-0.5 p-1.5 lg:gap-1 lg:p-2">
            {Array.from({ length: 37 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => togglePendingPlay("number", n)}
                className={`flex aspect-square max-h-[1.85rem] min-h-0 w-full items-center justify-center rounded-md text-[12px] font-bold leading-none transition-[filter,box-shadow] lg:max-h-10 lg:rounded-lg lg:text-base ${ov2CwExactTileClasses(
                  n,
                  has("number", n),
                )}`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
