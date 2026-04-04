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
import { peekOnlineV2Vault, subscribeOnlineV2Vault } from "../../../lib/online-v2/onlineV2VaultBridge";

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
  const [vaultBal, setVaultBal] = useState(null);
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

  useEffect(() => {
    const apply = () => {
      const v = peekOnlineV2Vault();
      setVaultBal(v?.balance ?? null);
    };
    apply();
    return subscribeOnlineV2Vault(apply);
  }, []);

  useEffect(() => {
    const v = peekOnlineV2Vault();
    setVaultBal(v?.balance ?? null);
  }, [roomId]);

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
  const roundSeq = Math.max(0, Math.floor(Number(engine?.roundSeq) || 0));
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
    const base =
      "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1 text-center text-[10px] touch-manipulation sm:min-h-[56px] sm:text-[11px]";
    if (!occ) {
      return (
        <button
          type="button"
          key={i}
          disabled={operateBusy}
          onClick={() => void onSit(i)}
          className={`${base} border-dashed border-amber-600/40 bg-amber-950/20 text-amber-100/90`}
        >
          <span className="font-bold">Join</span>
          <span className="text-amber-200/60">Seat {i + 1}</span>
        </button>
      );
    }
    return (
      <div
        key={i}
        className={`${base} border-white/15 bg-black/40 ${mine ? "ring-1 ring-amber-400/50" : ""}`}
      >
        <span className="max-w-full truncate font-semibold text-zinc-100">{s.displayName || "Player"}</span>
        <span className="text-zinc-500">{mine ? "You" : `Seat ${i + 1}`}</span>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-hidden pb-14 sm:pb-2">
      <div className="flex shrink-0 items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5">
        <div className="min-w-0">
          <p className="text-[11px] font-bold text-zinc-100">{phaseLabel}</p>
          <p className="text-[10px] text-zinc-500">
            {lobby
              ? imLeader
                ? "You can start a round."
                : "Waiting for table controller."
              : countdown != null
                ? `${countdown}s`
                : "—"}
          </p>
        </div>
        <div className="text-right text-[10px] text-zinc-400">
          Vault ~<span className="text-zinc-200">{fmt(vaultBal ?? 0)}</span>
        </div>
      </div>

      <div className="relative mx-auto flex w-full max-w-[min(100%,360px)] shrink-0 flex-col items-center">
        <div className="pointer-events-none absolute top-0 left-1/2 z-10 -translate-x-1/2 -translate-y-0">
          <div className="h-0 w-0 border-x-[8px] border-x-transparent border-t-[12px] border-t-amber-400 drop-shadow-md" />
        </div>
        <div
          className="relative mt-3 aspect-square w-[min(88vw,320px)] rounded-full border-4 border-amber-900/50 shadow-[0_8px_40px_rgba(0,0,0,0.45)]"
          style={{
            background: CONIC_BG,
            transform: `rotate(${wheelDisplayDeg}deg)`,
            transition: spinning ? "none" : "transform 0.35s ease-out",
          }}
        >
          <div className="absolute inset-[18%] flex flex-col items-center justify-center rounded-full border-2 border-white/20 bg-zinc-950/90 shadow-inner">
            {resultPhase && centerResult != null && centerResult >= 0 ? (
              <>
                <span
                  className={`text-3xl font-black tabular-nums sm:text-4xl ${
                    centerColor === "red"
                      ? "text-red-400"
                      : centerColor === "black"
                        ? "text-zinc-200"
                        : "text-emerald-400"
                  }`}
                >
                  {centerResult}
                </span>
                <span className="text-[9px] font-medium uppercase tracking-wide text-zinc-500">Result</span>
              </>
            ) : spinning ? (
              <span className="text-sm font-semibold text-zinc-400">…</span>
            ) : (
              <span className="text-center text-[10px] leading-tight text-zinc-500">Color Wheel</span>
            )}
          </div>
        </div>
      </div>

      {lobby && imLeader ? (
        <button
          type="button"
          disabled={operateBusy}
          onClick={() => void doOp("start_round", {})}
          className="mx-auto shrink-0 rounded-xl border border-amber-500/45 bg-amber-900/40 px-4 py-2.5 text-sm font-bold text-amber-50 touch-manipulation disabled:opacity-40"
        >
          Start Round
        </button>
      ) : null}

      <div className="grid shrink-0 grid-cols-3 gap-1.5 sm:grid-cols-6">
        {Array.from({ length: OV2_CW_MAX_SEATS }, (_, i) => seatBtn(seatsForUi[i], i))}
      </div>

      {Array.isArray(engine.history) && engine.history.length > 0 ? (
        <div className="shrink-0">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500">Last Results</p>
          <div className="flex gap-1 overflow-x-auto pb-1">
            {engine.history.slice(0, 10).map((h, idx) => {
              const n = Math.floor(Number(h.resultNumber) || 0);
              const c = String(h.resultColor || ov2CwColorForNumber(n));
              return (
                <div
                  key={`${h.roundSeq}-${idx}`}
                  className={`flex h-9 min-w-[2.25rem] flex-col items-center justify-center rounded-lg border text-xs font-bold ${
                    c === "red"
                      ? "border-red-500/40 bg-red-950/40 text-red-200"
                      : c === "black"
                        ? "border-zinc-600 bg-zinc-900 text-zinc-100"
                        : "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                  }`}
                >
                  {n}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-white/10 bg-black/25 p-2">
        <p className="text-[11px] font-semibold text-zinc-200">My Plays</p>
        {myPlays.length === 0 ? (
          <p className="mt-1 text-[11px] text-zinc-500">No plays this round.</p>
        ) : (
          <ul className="mt-1 space-y-1">
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
                <li key={p.playId} className={`flex justify-between gap-2 text-[11px] ${color}`}>
                  <span className="min-w-0 truncate">
                    {p.playType}
                    {p.playValue != null && p.playType === "number" ? ` ${p.playValue}` : ""}
                    {p.playValue != null && (p.playType === "dozen" || p.playType === "column") ? ` ${p.playValue}` : ""}
                  </span>
                  <span className="shrink-0 tabular-nums">{fmt(p.amount)}</span>
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => setAllPlaysOpen(v => !v)}
          className="mt-2 text-[11px] font-medium text-amber-300/90 underline"
        >
          {allPlaysOpen ? "Hide all plays" : "Show all plays"}
        </button>
        {allPlaysOpen ? (
          <ul className="mt-1 space-y-1 border-t border-white/10 pt-2">
            {plays
              .filter(p => Math.floor(Number(p.roundSeq) || 0) === roundSeq)
              .map(p => {
                const sn = Math.max(0, Math.min(OV2_CW_MAX_SEATS - 1, Math.floor(Number(p.seatIndex) || 0)));
                const nm = seatsForUi[sn]?.displayName;
                return (
                  <li key={p.playId} className="flex justify-between gap-2 text-[10px] text-zinc-400">
                    <span className="min-w-0 truncate">
                      {nm || `Seat ${sn + 1}`} · {p.playType}{" "}
                      {p.playValue != null ? String(p.playValue) : ""}
                    </span>
                    <span className="shrink-0 tabular-nums">{fmt(p.amount)}</span>
                  </li>
                );
              })}
          </ul>
        ) : null}
      </div>

      {hint ? <p className="shrink-0 text-center text-[11px] text-rose-300">{hint}</p> : null}

      {/* Mobile play entry */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-zinc-950/95 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:hidden">
        <button
          type="button"
          disabled={!mySeat || !placingLive || operateBusy}
          onClick={() => setSheetOpen(true)}
          className="flex min-h-[48px] w-full items-center justify-center rounded-xl border border-amber-500/40 bg-amber-900/35 text-sm font-bold text-amber-50 disabled:opacity-40"
        >
          Play Panel
        </button>
      </div>

      {/* Desktop inline panel */}
      <div className="hidden shrink-0 rounded-lg border border-amber-500/25 bg-amber-950/20 p-3 sm:block">
        <p className="mb-2 text-[11px] font-semibold text-amber-100/90">Play Panel</p>
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
          className="fixed inset-0 z-30 flex flex-col justify-end bg-black/60 sm:hidden"
          role="presentation"
          onClick={() => setSheetOpen(false)}
        >
          <div
            className="max-h-[85dvh] overflow-y-auto rounded-t-2xl border border-white/15 bg-zinc-950 p-3 shadow-2xl"
            role="dialog"
            aria-label="Play panel"
            onClick={e => e.stopPropagation()}
          >
            <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-zinc-700" />
            <p className="mb-2 text-center text-sm font-bold text-white">Play Panel</p>
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
              className="mt-3 w-full rounded-lg border border-white/15 py-2 text-sm text-zinc-300"
              onClick={() => setSheetOpen(false)}
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
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-[11px]" onClick={() => bump(-minPlay)}>
          −min
        </button>
        <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-[11px]" onClick={() => bump(minPlay)}>
          +min
        </button>
        <button type="button" className="rounded-lg border border-white/15 px-2 py-1 text-[11px]" onClick={() => bump(minPlay * 4)}>
          +4×
        </button>
        <input
          type="number"
          inputMode="numeric"
          className="ml-auto w-28 rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-right text-sm text-white"
          value={playAmount}
          onChange={e => setPlayAmount(e.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {kinds.map(k => (
          <button
            key={k.id}
            type="button"
            onClick={() => setPlayKind(k.id)}
            className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${
              playKind === k.id ? "border-amber-400/60 bg-amber-900/40 text-amber-50" : "border-white/12 bg-black/30 text-zinc-300"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>
      {playKind === "number" ? (
        <div className="grid max-h-36 grid-cols-7 gap-1 overflow-y-auto">
          {Array.from({ length: 37 }, (_, n) => (
            <button
              key={n}
              type="button"
              onClick={() => setNumberPick(n)}
              className={`rounded-md py-1 text-[11px] font-bold ${
                numberPick === n ? "bg-amber-600 text-white" : "bg-zinc-800 text-zinc-200"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
      {(playKind === "dozen" || playKind === "column") && (
        <div className="flex gap-2">
          {[1, 2, 3].map(g => (
            <button
              key={g}
              type="button"
              onClick={() => setGroupPick(g)}
              className={`flex-1 rounded-lg border py-2 text-xs font-bold ${
                groupPick === g ? "border-amber-400 bg-amber-900/35 text-amber-50" : "border-white/12 bg-black/30"
              }`}
            >
              {playKind === "dozen" ? `G${g}` : `C${g}`}
            </button>
          ))}
        </div>
      )}
      <p className="text-[10px] text-zinc-500">
        Min {fmt(minPlay)} · Max {fmt(maxPlay)}. Successful plays return stake plus a multiplier set by play type (see info).
      </p>
      <button
        type="button"
        disabled={disabled}
        onClick={onSubmit}
        className="w-full rounded-xl border border-amber-500/45 bg-amber-700/50 py-3 text-sm font-bold text-white disabled:opacity-40"
      >
        Place Play
      </button>
    </div>
  );
}
