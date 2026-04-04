"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  OV2_CW_SPINNING_MS,
  OV2_CW_WHEEL_NUMBERS,
  OV2_CW_SEGMENT_DEG,
  ov2CwColorForNumber,
  ov2CwPlayWins,
} from "../../../lib/online-v2/color_wheel/ov2CwConstants";
import { OV2_CW_MAX_SEATS } from "../../../lib/online-v2/color_wheel/ov2CwTableIds";

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

function easeOutCubic(t) {
  return 1 - (1 - t) ** 3;
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
  const [allPlaysOpen, setAllPlaysOpen] = useState(false);
  const [hint, setHint] = useState("");
  const [playAmount, setPlayAmount] = useState(String(tableStakeUnits || 100));
  const [playKind, setPlayKind] = useState("red");
  const [numberPick, setNumberPick] = useState(7);
  const [groupPick, setGroupPick] = useState(1);
  const wheelRotRef = useRef(0);
  const [wheelDisplayDeg, setWheelDisplayDeg] = useState(0);
  const spinRafRef = useRef(null);
  /** When user dismisses the mobile sheet during a round, hold `roundSeq` to block auto-reopen until the next round. */
  const sheetDismissedRoundRef = useRef(null);
  const prevPhaseForSheetRef = useRef(null);

  useEffect(() => {
    setPlayAmount(String(Math.max(100, Math.floor(Number(tableStakeUnits) || 100))));
  }, [tableStakeUnits]);

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

  void tick;
  const countdown = useMemo(() => {
    if (!engine?.phaseEndsAt) return null;
    return secsLeft(engine.phaseEndsAt);
  }, [engine?.phaseEndsAt, tick]);

  useEffect(() => {
    if (!spinning || engine?.spinTargetAngle == null) {
      if (spinRafRef.current) {
        cancelAnimationFrame(spinRafRef.current);
        spinRafRef.current = null;
      }
      return undefined;
    }
    const targetAngle = Number(engine.spinTargetAngle);
    const from = wheelRotRef.current;
    const turns = 6;
    const to = from + turns * 360 - targetAngle;
    const t0 = performance.now();
    const dur = OV2_CW_SPINNING_MS;

    const step = now => {
      const elapsed = now - t0;
      const p = Math.min(1, elapsed / dur);
      const e = easeOutCubic(p);
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
  }, [spinning, engine?.spinTargetAngle, engine?.roundSeq]);

  const dismissMobileSheet = useCallback(() => {
    if (placingLive) {
      sheetDismissedRoundRef.current = Math.max(1, roundSeq);
    }
    setSheetOpen(false);
  }, [placingLive, roundSeq]);

  const openMobileSheetManual = useCallback(() => {
    sheetDismissedRoundRef.current = null;
    setSheetOpen(true);
  }, []);

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
    const amt = Math.floor(Number(playAmount) || 0);
    let playType = playKind;
    let playValue = null;
    if (playKind === "number") {
      playType = "number";
      playValue = Math.floor(Number(numberPick) || 0);
    } else if (playKind === "dozen" || playKind === "column") {
      playType = playKind;
      playValue = Math.floor(Number(groupPick) || 1);
    }
    await doOp("place_play", { playType, playValue, amount: amt });
  }, [doOp, playAmount, playKind, numberPick, groupPick]);

  const plays = Array.isArray(engine?.plays) ? engine.plays : [];
  const myPlays = useMemo(
    () => plays.filter(p => p.participantKey === participantKey && Math.floor(Number(p.roundSeq) || 0) === roundSeq),
    [plays, participantKey, roundSeq],
  );

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
      "relative flex min-h-0 flex-col items-center justify-center gap-0 rounded-md border px-0.5 py-0.5 text-center touch-manipulation transition-[box-shadow,border-color,transform] active:scale-[0.99] max-sm:min-h-[1.5rem] max-sm:leading-none sm:min-h-[3.25rem] sm:gap-0.5 sm:rounded-xl sm:px-2 sm:py-1.5 sm:text-[11px] lg:min-h-[3.5rem]";
    if (!occ) {
      return (
        <button
          type="button"
          key={i}
          disabled={operateBusy}
          onClick={() => void onSit(i)}
          className={`${base} border-amber-500/25 bg-gradient-to-b from-zinc-900/60 to-black/50 text-amber-100/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] hover:border-amber-400/40 hover:shadow-[0_0_20px_-6px_rgba(245,158,11,0.35)] disabled:opacity-40 max-sm:text-[7px] sm:text-[10px]`}
        >
          <span className="font-bold leading-none text-amber-100 max-sm:text-[8px]">Join</span>
          <span className="font-mono tabular-nums leading-none text-zinc-500 max-sm:text-[6px] sm:text-[10px]">
            {i + 1}
          </span>
        </button>
      );
    }
    return (
      <div
        key={i}
        className={`${base} border-white/[0.12] bg-gradient-to-b from-zinc-900/90 to-zinc-950/95 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_4px_24px_rgba(0,0,0,0.35)] ${
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
        <span className="max-w-full truncate font-semibold tracking-tight text-zinc-50 max-sm:max-w-[2.75rem] max-sm:text-[7px] max-sm:leading-tight sm:text-xs">
          {s.displayName || "Player"}
        </span>
        <span
          className={`font-medium leading-none max-sm:text-[6px] sm:text-[10px] ${mine ? "text-amber-300/90" : "text-zinc-500"}`}
        >
          {mine ? "You" : `${i + 1}`}
        </span>
      </div>
    );
  };

  const statusSub = lobby
    ? imLeader
      ? "You can start a round."
      : "Waiting for table controller."
    : "";

  return (
    <div className="relative mx-auto flex h-full min-h-0 w-full max-w-xl flex-col gap-1.5 overflow-y-auto overflow-x-hidden pb-2 sm:max-w-2xl sm:gap-2 sm:pb-3 md:max-w-3xl lg:max-w-4xl xl:max-w-5xl">
      {/* Live status — compact broadcast strip (no vault, no timer) */}
      <div
        className={`flex shrink-0 items-center gap-2 rounded-lg border px-2 py-1 sm:rounded-xl sm:px-3 sm:py-1.5 ${
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
              <span className="min-w-0 truncate text-[9px] text-zinc-500 sm:text-[10px]">{statusSub}</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* Wheel stage — timer pinned to wheel face (non-rotating); rim labels upright inside disk */}
      <div className="relative mx-auto flex w-full max-w-[min(88vw,16.5rem)] shrink-0 flex-col items-center sm:max-w-[19.5rem] md:max-w-[22rem] lg:max-w-[24rem] xl:max-w-[25rem]">
        <div
          className="pointer-events-none absolute -inset-4 rounded-full bg-amber-500/[0.06] blur-2xl sm:-inset-6"
          aria-hidden
        />
        <div className="pointer-events-none absolute top-0 left-1/2 z-20 -translate-x-1/2 -translate-y-0.5">
          <div className="flex flex-col items-center drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)]">
            <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[11px] border-t-amber-300 sm:border-x-[9px] sm:border-t-[13px]" />
            <div className="-mt-px h-0.5 w-1.5 rounded-sm bg-gradient-to-b from-amber-200 to-amber-600" />
          </div>
        </div>
        <div
          className="relative mt-1 aspect-square w-full rounded-full p-1 shadow-[0_0_0_1px_rgba(251,191,36,0.1),0_8px_32px_rgba(0,0,0,0.45)] ring-1 ring-amber-500/15 sm:mt-1.5 sm:p-[3px]"
          style={{
            background: "linear-gradient(145deg, rgba(39,39,42,0.85) 0%, rgba(9,9,11,0.92) 55%, rgba(50,28,8,0.3) 100%)",
          }}
        >
          <div className="relative h-full w-full">
            {countdown != null ? (
              <div
                className={`pointer-events-none absolute right-px top-px z-50 sm:right-0.5 sm:top-0.5 ${
                  placingLive && countdown <= 5
                    ? "border-amber-400/50 bg-black/90"
                    : "border-white/20 bg-black/80"
                } rounded px-1 py-px shadow-sm backdrop-blur-sm sm:px-1.5 sm:py-0.5`}
              >
                <span className="block text-[5px] font-semibold uppercase leading-none text-zinc-500 sm:text-[6px]">Time</span>
                <span
                  className={`font-mono text-[11px] font-bold tabular-nums leading-none sm:text-xs ${
                    placingLive && countdown <= 5 ? "text-amber-300" : "text-amber-100/90"
                  }`}
                >
                  {countdown}
                </span>
              </div>
            ) : null}
            <div
              className="relative h-full w-full overflow-hidden rounded-full border-2 border-zinc-800/95 shadow-[inset_0_2px_10px_rgba(0,0,0,0.45)]"
              style={{
                background: CONIC_BG,
                transform: `rotate(${wheelDisplayDeg}deg)`,
                transition: spinning ? "none" : "transform 0.35s ease-out",
              }}
            >
              {OV2_CW_WHEEL_NUMBERS.map((entry, i) => {
                const thetaFromTop = (i + 0.5) * OV2_CW_SEGMENT_DEG;
                const rad = (thetaFromTop * Math.PI) / 180;
                const rimPct = 33;
                const xPct = 50 + rimPct * Math.sin(rad);
                const yPct = 50 - rimPct * Math.cos(rad);
                const uprightDeg = -(wheelDisplayDeg + thetaFromTop);
                const tc =
                  entry.color === "red"
                    ? "text-white"
                    : entry.color === "black"
                      ? "text-zinc-50"
                      : "text-white";
                return (
                  <div
                    key={`rim-${entry.num}-${i}`}
                    className="pointer-events-none absolute z-[5]"
                    style={{
                      left: `${xPct}%`,
                      top: `${yPct}%`,
                      transform: `translate(-50%, -50%) rotate(${uprightDeg}deg)`,
                    }}
                  >
                    <span
                      className={`block text-center text-[6px] font-black tabular-nums leading-none sm:text-[7px] ${tc} [text-shadow:0_0_2px_rgba(0,0,0,1),0_1px_2px_rgba(0,0,0,0.85)]`}
                    >
                      {entry.num}
                    </span>
                  </div>
                );
              })}
            <div className="absolute inset-[16%] z-20 flex flex-col items-center justify-center rounded-full border border-white/[0.12] bg-gradient-to-b from-zinc-950 via-zinc-950 to-black shadow-[inset_0_2px_6px_rgba(0,0,0,0.8),0_1px_0_rgba(255,255,255,0.05)] sm:inset-[17%]">
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
          className="mx-auto shrink-0 rounded-xl border border-amber-500/35 bg-gradient-to-b from-amber-700/85 to-amber-950/90 px-5 py-2 text-xs font-bold text-white shadow-md touch-manipulation disabled:opacity-40 sm:px-6 sm:py-2.5 sm:text-sm"
        >
          Start Round
        </button>
      ) : null}

      <div className="grid shrink-0 grid-cols-6 gap-0.5 sm:gap-2 lg:gap-2.5">
        {Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => seatBtn(seatsForUi[i], i))}
      </div>

      {/* Table surface: history + plays — floating Play Panel (mobile) is absolute, out of flow */}
      <div className="relative flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-zinc-900/40 via-black/30 to-black/50 p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:gap-3 sm:p-3">
        {placingLive && mySeat ? (
          <button
            type="button"
            disabled={operateBusy}
            onClick={() => openMobileSheetManual()}
            className="absolute bottom-[max(1rem,calc(0.5rem+env(safe-area-inset-bottom,0px)))] left-1/2 z-30 flex min-w-[10.5rem] -translate-x-1/2 items-center justify-center rounded-full border border-amber-500/45 bg-gradient-to-b from-amber-800/90 to-amber-950/95 px-5 py-2 text-[11px] font-bold tracking-wide text-amber-50 shadow-[0_4px_18px_rgba(0,0,0,0.5)] touch-manipulation disabled:opacity-40 sm:hidden"
          >
            Play Panel
          </button>
        ) : null}
        {Array.isArray(engine.history) && engine.history.length > 0 ? (
          <div className="shrink-0">
            <div className="mb-1.5 flex items-center gap-2">
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" aria-hidden />
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-200/70">Last Results</p>
              <span className="h-px flex-1 bg-gradient-to-r from-transparent via-amber-500/25 to-transparent" aria-hidden />
            </div>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
              {engine.history.slice(0, 10).map((h, idx) => {
                const n = Math.floor(Number(h.resultNumber) || 0);
                const c = String(h.resultColor || ov2CwColorForNumber(n));
                return (
                  <div
                    key={`${h.roundSeq}-${idx}`}
                    className={`flex h-10 min-w-[2.5rem] flex-col items-center justify-center rounded-xl border text-xs font-black tabular-nums shadow-sm sm:h-11 sm:min-w-[2.75rem] sm:text-sm ${
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

        <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/35 p-2.5 sm:p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-400">My Plays</p>
          {myPlays.length === 0 ? (
            <div className="mt-3 flex flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-zinc-950/40 py-6 text-center">
              <p className="text-[11px] font-medium text-zinc-500">No plays this round.</p>
            </div>
          ) : (
            <ul className="mt-2 space-y-1.5">
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
                    className={`flex justify-between gap-2 rounded-lg border border-white/[0.05] bg-white/[0.02] px-2 py-1.5 text-[11px] ${color}`}
                  >
                    <span className="min-w-0 truncate">
                      {p.playType}
                      {p.playValue != null && p.playType === "number" ? ` ${p.playValue}` : ""}
                      {p.playValue != null && (p.playType === "dozen" || p.playType === "column") ? ` ${p.playValue}` : ""}
                    </span>
                    <span className="shrink-0 font-mono tabular-nums">{fmt(p.amount)}</span>
                  </li>
                );
              })}
            </ul>
          )}

          <button
            type="button"
            onClick={() => setAllPlaysOpen(v => !v)}
            className="mt-3 w-full rounded-lg border border-white/[0.08] bg-zinc-900/50 py-2 text-[11px] font-semibold text-amber-200/80 transition-colors hover:border-amber-500/25 hover:bg-zinc-900/80"
          >
            {allPlaysOpen ? "Hide all plays" : "Show all plays"}
          </button>
          {allPlaysOpen ? (
            <ul className="mt-2 space-y-1 border-t border-white/[0.06] pt-2">
              {plays
                .filter(p => Math.floor(Number(p.roundSeq) || 0) === roundSeq)
                .map(p => {
                  const sn = Math.max(0, Math.min(OV2_CW_MAX_SEATS - 1, Math.floor(Number(p.seatIndex) || 0)));
                  const nm = seatsForUi[sn]?.displayName;
                  return (
                    <li
                      key={p.playId}
                      className="flex justify-between gap-2 rounded-md px-1 py-0.5 text-[10px] text-zinc-400"
                    >
                      <span className="min-w-0 truncate">
                        {nm || `Seat ${sn + 1}`} · {p.playType}{" "}
                        {p.playValue != null ? String(p.playValue) : ""}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums">{fmt(p.amount)}</span>
                    </li>
                  );
                })}
            </ul>
          ) : null}
        </div>
      </div>

      {hint ? <p className="shrink-0 text-center text-[11px] text-rose-300">{hint}</p> : null}

      {/* Desktop inline panel */}
      <div className="hidden shrink-0 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/35 via-zinc-950/80 to-black/60 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_8px_32px_-8px_rgba(0,0,0,0.5)] sm:block sm:p-4">
        <div className="mb-3 flex items-center gap-2 border-b border-white/[0.06] pb-2">
          <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/75">Play Panel</span>
          <span className="text-[10px] text-zinc-500">Amount · type · place</span>
        </div>
        <PlayForm
          minPlay={minPlay}
          maxPlay={maxPlay}
          playAmount={playAmount}
          setPlayAmount={setPlayAmount}
          playKind={playKind}
          setPlayKind={setPlayKind}
          numberPick={numberPick}
          setNumberPick={setNumberPick}
          groupPick={groupPick}
          setGroupPick={setGroupPick}
          disabled={!mySeat || !placingLive || operateBusy}
          onSubmit={() => void submitPlay()}
        />
      </div>

      {sheetOpen ? (
        <div
          className="fixed inset-0 z-30 flex flex-col justify-end bg-black/70 backdrop-blur-[2px] sm:hidden"
          role="presentation"
          onClick={() => dismissMobileSheet()}
        >
          <div
            className="max-h-[85dvh] overflow-y-auto rounded-t-[1.25rem] border border-amber-500/20 border-b-0 bg-gradient-to-b from-zinc-900 to-zinc-950 p-4 pb-3 shadow-[0_-12px_48px_rgba(0,0,0,0.55)]"
            role="dialog"
            aria-label="Play panel"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-3 h-1 w-11 rounded-full bg-zinc-600" />
            <div className="mb-3 text-center">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-200/70">Play Panel</p>
              <p className="text-xs text-zinc-500">Amount · type · place</p>
            </div>
            <PlayForm
              minPlay={minPlay}
              maxPlay={maxPlay}
              playAmount={playAmount}
              setPlayAmount={setPlayAmount}
              playKind={playKind}
              setPlayKind={setPlayKind}
              numberPick={numberPick}
              setNumberPick={setNumberPick}
              groupPick={groupPick}
              setGroupPick={setGroupPick}
              disabled={!mySeat || !placingLive || operateBusy}
              onSubmit={() => {
                void submitPlay().then(() => setSheetOpen(false));
              }}
            />
            <button
              type="button"
              className="mt-3 w-full rounded-xl border border-white/[0.1] bg-zinc-900/80 py-2.5 text-sm font-semibold text-zinc-300"
              onClick={() => dismissMobileSheet()}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlayForm({
  minPlay,
  maxPlay,
  playAmount,
  setPlayAmount,
  playKind,
  setPlayKind,
  numberPick,
  setNumberPick,
  groupPick,
  setGroupPick,
  disabled,
  onSubmit,
}) {
  const bump = useCallback(
    m => {
      const cur = Math.floor(Number(playAmount) || 0);
      const n = Math.max(minPlay, Math.min(maxPlay, cur + m));
      setPlayAmount(String(n));
    },
    [playAmount, minPlay, maxPlay, setPlayAmount],
  );

  const kinds = [
    { id: "red", label: "Red" },
    { id: "black", label: "Black" },
    { id: "even", label: "Even" },
    { id: "odd", label: "Odd" },
    { id: "low", label: "Low 1–18" },
    { id: "high", label: "High 19–36" },
    { id: "dozen", label: "Group" },
    { id: "column", label: "Column" },
    { id: "number", label: "Exact #" },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-white/[0.08] bg-black/40 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Amount</p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1.5">
            <button
              type="button"
              className="min-h-[36px] rounded-lg border border-white/[0.1] bg-zinc-900/80 px-2.5 text-[11px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30"
              onClick={() => bump(-minPlay)}
            >
              −min
            </button>
            <button
              type="button"
              className="min-h-[36px] rounded-lg border border-white/[0.1] bg-zinc-900/80 px-2.5 text-[11px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30"
              onClick={() => bump(minPlay)}
            >
              +min
            </button>
            <button
              type="button"
              className="min-h-[36px] rounded-lg border border-white/[0.1] bg-zinc-900/80 px-2.5 text-[11px] font-semibold text-zinc-200 shadow-sm hover:border-amber-500/30"
              onClick={() => bump(minPlay * 4)}
            >
              +4×
            </button>
          </div>
          <input
            type="number"
            inputMode="numeric"
            className="ml-auto min-h-[40px] w-[7.5rem] rounded-xl border border-amber-500/25 bg-zinc-950/90 px-3 text-right font-mono text-base font-bold tabular-nums text-amber-50 shadow-[inset_0_2px_6px_rgba(0,0,0,0.4)] focus:border-amber-400/50 focus:outline-none"
            value={playAmount}
            onChange={e => setPlayAmount(e.target.value)}
          />
        </div>
      </div>

      <div>
        <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Play type</p>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
          {kinds.map(k => (
            <button
              key={k.id}
              type="button"
              onClick={() => setPlayKind(k.id)}
              className={`min-h-[2.25rem] rounded-xl border px-2 py-1.5 text-[10px] font-bold leading-tight transition-colors sm:min-h-[2.5rem] sm:text-[11px] ${
                playKind === k.id
                  ? "border-amber-400/55 bg-gradient-to-b from-amber-600/35 to-amber-950/50 text-amber-50 shadow-[0_0_20px_-8px_rgba(245,158,11,0.5),inset_0_1px_0_rgba(255,255,255,0.08)]"
                  : "border-white/[0.08] bg-zinc-900/50 text-zinc-400 hover:border-white/15 hover:bg-zinc-800/50 hover:text-zinc-200"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </div>

      {playKind === "number" ? (
        <div>
          <p className="mb-2 text-[9px] font-bold uppercase tracking-[0.12em] text-zinc-500">Exact number</p>
          <div className="grid max-h-40 grid-cols-7 gap-1 overflow-y-auto rounded-xl border border-white/[0.06] bg-black/30 p-2 sm:max-h-44">
            {Array.from({ length: 37 }, (_, n) => (
              <button
                key={n}
                type="button"
                onClick={() => setNumberPick(n)}
                className={`aspect-square max-h-9 rounded-lg text-[11px] font-bold sm:max-h-10 sm:text-xs ${
                  numberPick === n
                    ? "bg-gradient-to-b from-amber-500 to-amber-700 text-white shadow-md"
                    : "bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {(playKind === "dozen" || playKind === "column") && (
        <div className="flex gap-2">
          {[1, 2, 3].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupPick(g)}
              className={`min-h-[2.75rem] flex-1 rounded-xl border py-2 text-xs font-extrabold ${
                groupPick === g
                  ? "border-amber-400/50 bg-gradient-to-b from-amber-600/30 to-amber-950/40 text-amber-50"
                  : "border-white/[0.08] bg-zinc-900/60 text-zinc-400"
              }`}
            >
              {playKind === "dozen" ? `G${g}` : `C${g}`}
            </button>
          ))}
        </div>
      )}
      <p className="text-center text-[10px] leading-relaxed text-zinc-500">
        Min {fmt(minPlay)} · Max {fmt(maxPlay)}. Successful plays return stake plus a multiplier set by play type (see info).
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="w-full rounded-2xl border border-amber-400/40 bg-gradient-to-b from-amber-500 via-amber-600 to-amber-900 py-3.5 text-base font-extrabold tracking-tight text-white shadow-[0_4px_24px_-4px_rgba(245,158,11,0.45),inset_0_1px_0_rgba(255,255,255,0.2)] disabled:opacity-40 sm:py-4"
      >
        Place Play
      </button>
    </div>
  );
}
