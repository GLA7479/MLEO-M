"use client";

import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2GoalDuelSession } from "../../../hooks/useOv2GoalDuelSession";
import {
  drawGoalDuelArena,
  drawGoalDuelDog,
  drawGoalDuelTennisBall,
  inferDogJumping,
  inferDogMotion,
  TEAM_RIVAL_DOG,
  TEAM_STAR_DOG,
} from "./ov2GoalDuelCanvasDraw";

/**
 * Raster assets — dogs face **right**; ball is centered in a square texture.
 * @see public/images/online-v2/goal-duel/
 */
const GD_SPRITE_HOME = "/images/online-v2/goal-duel/gd-dog-home.png";
const GD_SPRITE_AWAY = "/images/online-v2/goal-duel/gd-dog-away.png";
const GD_SPRITE_BALL = "/images/online-v2/goal-duel/gd-ball.png";

const finishDismissStorageKey = sid => `ov2_gd_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/** In-field floating controls: glass, no heavy “deck” chrome */
const CTRL_FLOAT_CLUSTER =
  "pointer-events-auto flex touch-manipulation select-none gap-1 rounded-xl border border-white/15 bg-zinc-900/55 p-1 shadow-[0_4px_20px_rgba(0,0,0,0.45)] backdrop-blur-md";

const CTRL_MOVE_BTN =
  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-cyan-400/30 bg-cyan-950/55 text-base text-cyan-50 shadow-inner transition-[transform,opacity] active:scale-95 sm:h-9 sm:w-9 sm:text-sm";

const CTRL_ACTION_BTN =
  "flex h-10 min-w-[3rem] flex-col items-center justify-center gap-0 rounded-lg border font-bold uppercase leading-none shadow-inner transition-[transform,opacity] active:scale-95 sm:h-9 sm:min-w-[3.25rem]";

const CTRL_JUMP_BTN = `${CTRL_ACTION_BTN} border-emerald-400/35 bg-emerald-950/55 text-[8px] text-emerald-100`;

const CTRL_KICK_BTN = `${CTRL_ACTION_BTN} border-rose-400/35 bg-rose-950/55 text-[8px] text-rose-100`;

/** @param {unknown} m */
function memberGdRematchRequested(m) {
  const meta = m?.meta;
  if (!meta || typeof meta !== "object") return false;
  const gd = /** @type {Record<string, unknown>} */ (meta).gd;
  if (!gd || typeof gd !== "object") return false;
  const r = /** @type {Record<string, unknown>} */ (gd).rematch_requested;
  return r === true || r === "true" || r === 1;
}

/**
 * @param {{ contextInput?: { room?: object, members?: unknown[], self?: { participant_key?: string }, onLeaveToLobby?: () => void|Promise<void>, leaveToLobbyBusy?: boolean } | null, onSessionRefresh?: (prev: string, rpcNew?: string, opts?: { expectClearedSession?: boolean }) => Promise<unknown> }} props
 */
export default function Ov2GoalDuelScreen({ contextInput = null, onSessionRefresh }) {
  const router = useRouter();
  const session = useOv2GoalDuelSession(contextInput ?? undefined);
  const {
    vm,
    snapshot,
    vaultClaimBusy,
    err,
    setErr,
    setInput,
    inputRef,
    requestRematch,
    cancelRematch,
    startNextMatch,
    isHost,
    roomMatchSeq,
  } = session;

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const [finishModalDismissedSessionId, setFinishModalDismissedSessionId] = useState("");
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  const vmRef = useRef(vm);
  vmRef.current = vm;
  const motionPrevRef = useRef(
    /** @type {{ p0x: number, p0y: number, p1x: number, p1y: number, bx: number, by: number, t: number }|null} */ (null)
  );
  const kickP0UntilRef = useRef(0);
  const kickP1UntilRef = useRef(0);
  const prevScoreRef = useRef(/** @type {[number, number]} */ ([0, 0]));
  const [goalFx, setGoalFx] = useState(/** @type {{ side: "left"|"right" }|null} */ (null));
  const [spriteHome, setSpriteHome] = useState(/** @type {CanvasImageSource|null} */ (null));
  const [spriteAway, setSpriteAway] = useState(/** @type {CanvasImageSource|null} */ (null));
  const [spriteBall, setSpriteBall] = useState(/** @type {CanvasImageSource|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];

  useEffect(() => {
    setFinishModalDismissedSessionId("");
  }, [vm.sessionId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    /** @type {HTMLImageElement|null} */
    let away = null;
    const home = new Image();
    home.onload = () => {
      if (cancelled) return;
      if (home.naturalWidth <= 0) {
        setSpriteHome(null);
        setSpriteAway(null);
        return;
      }
      setSpriteHome(home);
      away = new Image();
      away.onload = () => {
        if (cancelled) return;
        setSpriteAway(away && away.naturalWidth > 0 ? away : home);
      };
      away.onerror = () => {
        if (cancelled) return;
        setSpriteAway(home);
      };
      away.src = GD_SPRITE_AWAY;
    };
    home.onerror = () => {
      if (cancelled) return;
      setSpriteHome(null);
      setSpriteAway(null);
    };
    home.src = GD_SPRITE_HOME;
    return () => {
      cancelled = true;
      home.onload = null;
      home.onerror = null;
      if (away) {
        away.onload = null;
        away.onerror = null;
      }
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    let cancelled = false;
    const ball = new Image();
    ball.onload = () => {
      if (cancelled) return;
      setSpriteBall(ball.naturalWidth > 0 ? ball : null);
    };
    ball.onerror = () => {
      if (cancelled) return;
      setSpriteBall(null);
    };
    ball.src = GD_SPRITE_BALL;
    return () => {
      cancelled = true;
      ball.onload = null;
      ball.onerror = null;
    };
  }, []);

  useEffect(() => {
    const down = e => {
      if (vm.phase !== "playing") return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") setInput({ l: true });
      if (k === "arrowright" || k === "d") setInput({ r: true });
      if (k === " " || k === "w" || k === "arrowup") {
        e.preventDefault();
        setInput({ j: true });
      }
      if (k === "e" || k === "k") setInput({ k: true });
    };
    const up = e => {
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") setInput({ l: false });
      if (k === "arrowright" || k === "d") setInput({ r: false });
      if (k === " " || k === "w" || k === "arrowup") setInput({ j: false });
      if (k === "e" || k === "k") setInput({ k: false });
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [vm.phase, setInput]);

  const onRematch = useCallback(async () => {
    if (!roomId || rematchBusy) return;
    setRematchBusy(true);
    setErr("");
    try {
      const r = await requestRematch();
      if (!r.ok) setErr(r.error || "Rematch request failed");
    } finally {
      setRematchBusy(false);
    }
  }, [roomId, rematchBusy, requestRematch, setErr]);

  const onStartNext = useCallback(async () => {
    if (!roomId || !isHost || startNextBusy) return;
    setStartNextBusy(true);
    setErr("");
    try {
      const r = await startNextMatch(roomMatchSeq);
      if (!r.ok) {
        setErr(r.error || "Could not start next match");
        return;
      }
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(OV2_SHARED_LAST_ROOM_SESSION_KEY, roomId);
        } catch {
          /* ignore */
        }
      }
      if (typeof onSessionRefresh === "function") {
        const prev = snapshot?.sessionId != null ? String(snapshot.sessionId) : "";
        await onSessionRefresh(prev, "", { expectClearedSession: true });
      }
      await router.push(`/online-v2/rooms?room=${encodeURIComponent(roomId)}`);
    } finally {
      setStartNextBusy(false);
    }
  }, [
    roomId,
    isHost,
    startNextBusy,
    startNextMatch,
    roomMatchSeq,
    onSessionRefresh,
    snapshot?.sessionId,
    router,
    setErr,
  ]);

  const onExitToLobby = useCallback(async () => {
    if (!roomId || !pk || exitBusy) return;
    setExitBusy(true);
    setExitErr("");
    try {
      await leaveOv2RoomWithForfeitRetry({ room, room_id: roomId, participant_key: pk });
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.removeItem(OV2_SHARED_LAST_ROOM_SESSION_KEY);
        } catch {
          /* ignore */
        }
      }
      await router.push("/online-v2/rooms");
    } catch (e) {
      setExitErr(e?.message || String(e) || "Could not leave.");
    } finally {
      setExitBusy(false);
    }
  }, [roomId, pk, exitBusy, room, router]);

  const rematchCounts = useMemo(() => {
    let ready = 0;
    let seated = 0;
    for (const m of members) {
      if (m?.seat_index == null || m?.seat_index === "") continue;
      seated += 1;
      if (String(m?.wallet_state || "").trim() !== "committed") continue;
      if (memberGdRematchRequested(m)) ready += 1;
    }
    return { ready, seated };
  }, [members]);

  const finished = vm.phase === "finished";
  const finishSessionId = finished ? String(vm.sessionId || "").trim() : "";
  const finishModalDismissed =
    finishSessionId.length > 0 &&
    (finishModalDismissedSessionId === finishSessionId ||
      (typeof window !== "undefined" &&
        (() => {
          try {
            return window.sessionStorage.getItem(finishDismissStorageKey(finishSessionId)) === "1";
          } catch {
            return false;
          }
        })()));
  const showResultModal = finished && finishSessionId.length > 0 && !finishModalDismissed;

  const mySeat = vm.mySeat;
  const isDrawResult = Boolean(vm.result && vm.result.isDraw === true);
  const dismissFinishModal = useCallback(() => {
    if (!finishSessionId) return;
    setFinishModalDismissedSessionId(finishSessionId);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem(finishDismissStorageKey(finishSessionId), "1");
      } catch {
        /* ignore */
      }
    }
  }, [finishSessionId]);

  const winnerLabel = useMemo(() => {
    if (isDrawResult) return "Draw";
    if (vm.winnerSeat != null && mySeat != null) return vm.winnerSeat === mySeat ? "You won" : "You lost";
    return "Match over";
  }, [isDrawResult, vm.winnerSeat, mySeat]);

  useEffect(() => {
    if (vm.phase !== "playing") {
      motionPrevRef.current = null;
    }
  }, [vm.phase]);

  useEffect(() => {
    const s0 = Number(vm.score0) || 0;
    const s1 = Number(vm.score1) || 0;
    const [ps0, ps1] = prevScoreRef.current;
    if (vm.phase !== "playing") {
      prevScoreRef.current = [s0, s1];
      return;
    }
    if (s0 > ps0) {
      setGoalFx({ side: "left" });
      window.setTimeout(() => setGoalFx(null), 1700);
    } else if (s1 > ps1) {
      setGoalFx({ side: "right" });
      window.setTimeout(() => setGoalFx(null), 1700);
    }
    prevScoreRef.current = [s0, s1];
  }, [vm.phase, vm.score0, vm.score1]);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || vm.phase !== "playing") return undefined;
    const ctx = c.getContext("2d");
    if (!ctx) return undefined;

    let raf = 0;
    const paint = () => {
      const live = vmRef.current;
      const pub = live.public && typeof live.public === "object" ? live.public : {};
      const aw = Number(pub.arena?.w ?? 800) || 800;
      const ah = Number(pub.arena?.h ?? 400) || 400;
      const gy = Number(pub.arena?.groundY ?? 360) || 360;
      const gm = Number(pub.arena?.goalMargin ?? 48) || 48;
      const W = c.width;
      const H = c.height;
      const sx = W / aw;
      const sy = H / ah;

      const p0 = pub.p0 && typeof pub.p0 === "object" ? pub.p0 : {};
      const p1 = pub.p1 && typeof pub.p1 === "object" ? pub.p1 : {};
      const ball = pub.ball && typeof pub.ball === "object" ? pub.ball : {};
      const p0x = Number(p0.x ?? 180);
      const p0y = Number(p0.y ?? 338);
      const hw0 = Number(p0.hw ?? 14);
      const hh0 = Number(p0.hh ?? 22);
      const p1x = Number(p1.x ?? 620);
      const p1y = Number(p1.y ?? 338);
      const hw1 = Number(p1.hw ?? 14);
      const hh1 = Number(p1.hh ?? 22);
      const bx = Number(ball.x ?? 400);
      const by = Number(ball.y ?? 220);
      const br = Number(ball.r ?? 11);

      const prev = motionPrevRef.current;
      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dtSec = prev && prev.t > 0 ? Math.min(0.08, (nowMs - prev.t) / 1000) : 0.016;

      const bvx = prev ? (bx - prev.bx) / Math.max(dtSec, 0.001) : 0;
      const bvy = prev ? (by - prev.by) / Math.max(dtSec, 0.001) : 0;
      const bspeed = Math.hypot(bvx, bvy);

      if (bspeed > 220 && prev) {
        const d0 = Math.hypot(bx - p0x, by - p0y);
        const d1 = Math.hypot(bx - p1x, by - p1y);
        if (d0 < 54 && d0 <= d1) kickP0UntilRef.current = nowMs + 160;
        else if (d1 < 54) kickP1UntilRef.current = nowMs + 160;
      }

      const inp = inputRef?.current ?? { l: false, r: false, j: false, k: false };
      if (mySeat === 0 && inp.k) kickP0UntilRef.current = nowMs + 110;
      if (mySeat === 1 && inp.k) kickP1UntilRef.current = nowMs + 110;

      const m0 = inferDogMotion(prev, p0x, p0y, "p0", dtSec);
      const m1 = inferDogMotion(prev, p1x, p1y, "p1", dtSec);
      const runPhase = nowMs * 0.007;

      drawGoalDuelArena(ctx, W, H, aw, ah, gy, gm, sx, sy);

      const j0 = inferDogJumping(p0x, p0y, hh0, gy);
      const j1 = inferDogJumping(p1x, p1y, hh1, gy);
      const k0 = nowMs < kickP0UntilRef.current;
      const k1 = nowMs < kickP1UntilRef.current;

      drawGoalDuelDog(
        ctx,
        p0x,
        p0y,
        hw0,
        hh0,
        sx,
        sy,
        TEAM_STAR_DOG,
        {
          facing: m0.facing,
          jumping: j0,
          running: m0.running && !j0,
          kicking: k0,
          runPhase,
        },
        { variant: "star", sprite: spriteHome }
      );
      drawGoalDuelDog(
        ctx,
        p1x,
        p1y,
        hw1,
        hh1,
        sx,
        sy,
        TEAM_RIVAL_DOG,
        {
          facing: m1.facing,
          jumping: j1,
          running: m1.running && !j1,
          kicking: k1,
          runPhase: runPhase + 0.45,
        },
        { variant: "rival", sprite: spriteAway }
      );

      drawGoalDuelTennisBall(ctx, bx, by, br, sx, sy, bvx, bvy, { sprite: spriteBall });

      motionPrevRef.current = { p0x, p0y, p1x, p1y, bx, by, t: nowMs };
      raf = window.requestAnimationFrame(paint);
    };

    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [vm.phase, mySeat, inputRef, spriteHome, spriteAway, spriteBall]);

  return (
    <div className="flex min-h-0 w-full flex-col gap-2 overflow-visible px-1.5 pb-1 pt-1 sm:gap-3 sm:px-2">
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-400">Updating vault…</div>
      ) : null}

      {vm.phase === "playing" && mySeat != null ? (
        <>
          <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-zinc-900/95 via-zinc-900 to-zinc-950/95 px-1 py-1.5 shadow-[0_0_24px_rgba(251,191,36,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md sm:px-3 sm:py-2">
            <div className="mb-1 flex items-center justify-center gap-2 border-b border-white/5 pb-1">
              <span className="text-[8px] font-black uppercase tracking-[0.35em] text-amber-400/90 sm:text-[9px]">MLEO Park</span>
              <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" aria-hidden />
              <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 sm:text-[9px]">Arcade duel</span>
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-3">
              <div
                className={`flex min-w-0 flex-col justify-between rounded-xl border px-2 py-1.5 transition-[transform,box-shadow] duration-300 sm:px-3 sm:py-2 ${
                  mySeat === 0
                    ? "border-amber-400/40 bg-gradient-to-br from-amber-950/90 to-zinc-950/60 ring-1 ring-amber-500/20"
                    : "border-white/10 bg-zinc-800/35"
                } ${goalFx?.side === "left" ? "scale-[1.02] shadow-[0_0_24px_rgba(251,191,36,0.35)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="truncate text-[8px] font-black uppercase tracking-wider text-amber-300/90 sm:text-[9px]">
                    Home
                  </span>
                  <span className="shrink-0 text-[9px] font-bold text-zinc-500">{mySeat === 0 ? "You" : "Opp"}</span>
                </div>
                <span className="mt-0.5 font-mono text-2xl font-black tabular-nums leading-none text-amber-100 sm:text-3xl">
                  {vm.score0 ?? 0}
                </span>
              </div>

              <div className="flex min-w-[4.25rem] flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/90 to-emerald-950/70 px-2 py-1 shadow-[inset_0_0_20px_rgba(16,185,129,0.12)] sm:min-w-[5.25rem] sm:px-3 sm:py-1.5">
                <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">Time</span>
                <span className="font-mono text-lg font-black tabular-nums text-emerald-100 sm:text-2xl">
                  {vm.matchTimeLeftSec != null ? `${vm.matchTimeLeftSec}` : "—"}
                </span>
                <span className="text-[8px] font-semibold text-emerald-500/70">sec</span>
              </div>

              <div
                className={`flex min-w-0 flex-col justify-between rounded-xl border px-2 py-1.5 text-right transition-[transform,box-shadow] duration-300 sm:px-3 sm:py-2 ${
                  mySeat === 1
                    ? "border-sky-400/40 bg-gradient-to-bl from-sky-950/90 to-zinc-950/60 ring-1 ring-sky-500/20"
                    : "border-white/10 bg-zinc-800/35"
                } ${goalFx?.side === "right" ? "scale-[1.02] shadow-[0_0_24px_rgba(56,189,248,0.35)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="shrink-0 text-[9px] font-bold text-zinc-500">{mySeat === 1 ? "You" : "Opp"}</span>
                  <span className="truncate text-[8px] font-black uppercase tracking-wider text-sky-300/90 sm:text-[9px]">
                    Away
                  </span>
                </div>
                <span className="mt-0.5 font-mono text-2xl font-black tabular-nums leading-none text-sky-100 sm:text-3xl">
                  {vm.score1 ?? 0}
                </span>
              </div>
            </div>
          </div>

          <div className="relative mx-auto w-full max-w-[min(100%,36rem)] shrink-0 overflow-hidden rounded-2xl border border-amber-800/50 bg-transparent">
              <canvas ref={canvasRef} width={800} height={400} className="block h-auto w-full touch-none" />

            {goalFx ? (
              <div
                className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-start gap-2 pt-[6%]"
                key={goalFx.side}
              >
                <div
                  className={`relative skew-x-[-6deg] rounded-lg border-2 px-8 py-3 shadow-[0_0_40px_rgba(255,255,255,0.25)] sm:px-12 sm:py-4 ${
                    goalFx.side === "left"
                      ? "border-amber-300/70 bg-gradient-to-r from-amber-500/90 to-orange-600/85"
                      : "border-sky-300/70 bg-gradient-to-r from-sky-500/90 to-indigo-700/85"
                  }`}
                >
                  <span className="block text-center text-3xl font-black italic tracking-tighter text-white drop-shadow-[0_4px_0_rgba(0,0,0,0.35)] sm:text-5xl">
                    GOOOAL!
                  </span>
                </div>
              </div>
            ) : null}
            {goalFx ? (
              <div
                className={`pointer-events-none absolute inset-0 z-[25] mix-blend-screen ${
                  goalFx.side === "left" ? "bg-amber-400/25" : "bg-cyan-400/20"
                }`}
              />
            ) : null}
          </div>

          <div className="mx-auto flex w-full max-w-[min(100%,36rem)] shrink-0 items-center justify-between gap-2 px-0.5 pt-0.5 sm:px-1 sm:pt-1">
              <div className={`${CTRL_FLOAT_CLUSTER} items-center`}>
                <button
                  type="button"
                  aria-label="Move left"
                  className={CTRL_MOVE_BTN}
                  onPointerDown={() => setInput({ l: true })}
                  onPointerUp={() => setInput({ l: false })}
                  onPointerCancel={() => setInput({ l: false })}
                  onPointerLeave={() => setInput({ l: false })}
                >
                  ◀
                </button>
                <button
                  type="button"
                  aria-label="Move right"
                  className={CTRL_MOVE_BTN}
                  onPointerDown={() => setInput({ r: true })}
                  onPointerUp={() => setInput({ r: false })}
                  onPointerCancel={() => setInput({ r: false })}
                  onPointerLeave={() => setInput({ r: false })}
                >
                  ▶
                </button>
              </div>
              <div className={`${CTRL_FLOAT_CLUSTER} items-center`}>
                <button
                  type="button"
                  aria-label="Jump"
                  className={CTRL_JUMP_BTN}
                  onPointerDown={() => setInput({ j: true })}
                  onPointerUp={() => setInput({ j: false })}
                  onPointerCancel={() => setInput({ j: false })}
                  onPointerLeave={() => setInput({ j: false })}
                >
                  <span className="text-base leading-none sm:text-lg">▲</span>
                  <span>Jump</span>
                </button>
                <button
                  type="button"
                  aria-label="Kick"
                  className={CTRL_KICK_BTN}
                  onPointerDown={() => setInput({ k: true })}
                  onPointerUp={() => setInput({ k: false })}
                  onPointerCancel={() => setInput({ k: false })}
                  onPointerLeave={() => setInput({ k: false })}
                >
                  <span className="text-base leading-none sm:text-lg">⚡</span>
                  <span>Kick</span>
                </button>
              </div>
            </div>

          <p className="hidden shrink-0 text-center text-[10px] text-zinc-500 sm:block sm:text-[11px]">
            Desktop: A/D move · W or Space jump · E or K strike
          </p>
        </>
      ) : null}

      {!session.snapshot && room?.active_session_id ? (
        <div className="py-6 text-center text-[12px] text-zinc-500">Loading match…</div>
      ) : null}

      {showResultModal ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-2xl border border-white/15 bg-gradient-to-b from-zinc-900/95 to-zinc-950 p-4 shadow-2xl ring-1 ring-amber-500/10">
            <div className="text-center text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-500">Match result</div>
            <div
              className={`mt-2 text-center text-2xl font-black ${
                isDrawResult ? "text-zinc-200" : vm.winnerSeat === mySeat ? "text-emerald-300" : "text-rose-300"
              }`}
            >
              {winnerLabel}
            </div>
            {vm.result && typeof vm.result === "object" ? (
              <div className="mt-3 flex items-center justify-center gap-3 rounded-xl border border-amber-500/15 bg-gradient-to-b from-black/40 to-zinc-950/50 py-3">
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-amber-200/60">Home</span>
                  <span className="font-mono text-3xl font-black text-amber-200">{String(vm.result.score0 ?? vm.score0)}</span>
                </div>
                <span className="text-zinc-600">—</span>
                <div className="flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-sky-200/60">Away</span>
                  <span className="font-mono text-3xl font-black text-sky-200">{String(vm.result.score1 ?? vm.score1)}</span>
                </div>
              </div>
            ) : null}
            <div className="mt-4 flex flex-col gap-2">
              <button type="button" className={BTN_PRIMARY} disabled={rematchBusy} onClick={() => void onRematch()}>
                {rematchBusy ? "Requesting…" : "Request rematch"}
              </button>
              <button type="button" className={BTN_SECONDARY} disabled={rematchBusy} onClick={() => void cancelRematch()}>
                Cancel rematch
              </button>
              {isHost ? (
                <button
                  type="button"
                  className={BTN_PRIMARY}
                  disabled={startNextBusy || rematchCounts.ready < 2}
                  onClick={() => void onStartNext()}
                >
                  {startNextBusy ? "Starting…" : `Start next match (${rematchCounts.ready}/2 rematch)`}
                </button>
              ) : (
                <p className="text-center text-[11px] text-zinc-500">Host starts the next match when both players rematch.</p>
              )}
              <button type="button" className={BTN_SECONDARY} onClick={() => dismissFinishModal()}>
                Dismiss
              </button>
              <button
                type="button"
                className="mt-1 text-[11px] text-zinc-500 underline"
                disabled={exitBusy}
                onClick={() => void onExitToLobby()}
              >
                {exitBusy ? "Leaving…" : "Exit to lobby"}
              </button>
              {exitErr ? <p className="text-[11px] text-red-300">{exitErr}</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {finished && !showResultModal ? (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40 p-3 text-[11px] text-zinc-400">
          <p className="font-semibold text-zinc-200">{winnerLabel}</p>
          <p className="mt-1">Result dismissed — you can rematch from the lobby or use buttons below if still available.</p>
        </div>
      ) : null}
    </div>
  );
}
