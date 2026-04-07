"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OV2_SHARED_LAST_ROOM_SESSION_KEY } from "../../../lib/online-v2/onlineV2GameRegistry";
import { leaveOv2RoomWithForfeitRetry } from "../../../lib/online-v2/ov2RoomsApi";
import { useOv2GoalDuelSession } from "../../../hooks/useOv2GoalDuelSession";
import {
  drawGoalDuelArena,
  drawGoalDuelDog,
  drawGoalDuelKickImpacts,
  drawGoalDuelTennisBall,
  goalDuelScreenShakeSum,
  inferDogJumping,
  inferDogMotion,
  TEAM_RIVAL_DOG,
  TEAM_STAR_DOG,
} from "./ov2GoalDuelCanvasDraw";
import { gdAdvancePresentation, gdCreatePresentationState } from "./ov2GoalDuelPresentation";

/**
 * Raster assets — dogs face **right**; ball is centered in a square texture.
 * @see public/images/online-v2/goal-duel/
 */
const GD_SPRITE_HOME = "/images/online-v2/goal-duel/gd-dog-home.png";
const GD_SPRITE_AWAY = "/images/online-v2/goal-duel/gd-dog-away.png";
const GD_SPRITE_BALL = "/images/online-v2/goal-duel/gd-ball.png";

/** Canvas-only scale for dogs + ball; server snapshot coords unchanged. Py offset keeps feet on ground. */
const GD_VISUAL_ENTITY_SCALE = 1.32;

/** Injected once — scoped by `.gd-no-select` class on this screen’s root only. */
const GD_SCREEN_NO_SELECT_CSS = `
.gd-no-select {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
.gd-no-select * {
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}
@keyframes gd-gd-goal-flash {
  0% { opacity: 0.42; }
  30% { opacity: 0.14; }
  100% { opacity: 0; }
}
@keyframes gd-gd-goal-wrap-pulse {
  0% { filter: brightness(1) saturate(1); }
  12% { filter: brightness(1.09) saturate(1.06); }
  100% { filter: brightness(1) saturate(1); }
}
@keyframes gd-gd-goal-vignette {
  0% { opacity: 0.38; }
  25% { opacity: 0.2; }
  100% { opacity: 0; }
}
@keyframes gd-gd-timer-urgent-10 {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.88; }
}
@keyframes gd-gd-timer-urgent-5 {
  0%, 100% { transform: scale(1); text-shadow: 0 0 0 rgba(16,185,129,0); }
  50% { transform: scale(1.03); text-shadow: 0 0 12px rgba(52,211,153,0.45); }
}
/* Pad pressed — toggled via classList only (no React state); matches prior Tailwind press look */
.gd-no-select .gd-pad-row button.gd-pad-down {
  transform: scale(0.97);
  box-shadow: inset 0 2px 8px rgba(0, 0, 0, 0.36);
}
.gd-no-select .gd-pad-row .gd-pad-face.gd-pad-face--move.gd-pad-face-down {
  transform: scale(0.96);
  filter: brightness(1.1);
  box-shadow: 0 4px 20px rgba(6, 182, 212, 0.38), inset 0 2px 0 rgba(255, 255, 255, 0.28);
}
.gd-no-select .gd-pad-row .gd-pad-face.gd-pad-face--jump.gd-pad-face-down {
  transform: scale(0.96);
  filter: brightness(1.1);
  box-shadow: 0 6px 24px rgba(52, 211, 153, 0.42), inset 0 2px 0 rgba(255, 255, 255, 0.26);
}
.gd-no-select .gd-pad-row .gd-pad-face.gd-pad-face--kick.gd-pad-face-down {
  transform: scale(0.96);
  filter: brightness(1.1);
  box-shadow: 0 6px 26px rgba(248, 113, 113, 0.48), inset 0 2px 0 rgba(255, 255, 255, 0.24);
}
.gd-no-select .gd-pad-row button {
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
`.trim();

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * [LEFT][JUMP][KICK][RIGHT] — 6rem move columns on mobile; `touch-none` avoids scroll/zoom stealing gestures.
 */
const CTRL_ROW =
  "pointer-events-auto grid w-full touch-none select-none items-stretch justify-items-stretch gap-3 [-webkit-tap-highlight-color:transparent] [grid-template-columns:6rem_minmax(0,1fr)_minmax(0,1fr)_6rem] sm:gap-4";

/** Large hit target (6×6rem min on mobile); visible face stays ~4rem inside. */
const CTRL_MOVE_HIT_BASE =
  "relative flex min-h-[6rem] min-w-[6rem] max-w-[6rem] w-full touch-none select-none items-center justify-center self-center rounded-[24px] border border-transparent px-1 py-2 transition-[transform,box-shadow,filter] duration-75 sm:min-h-[3.5rem] sm:min-w-[4.75rem] sm:max-w-[4.75rem] sm:px-1.5 sm:py-2";

/** Visible arrow ~4rem × 4rem (no downscale vs column). */
const CTRL_MOVE_FACE_BASE =
  "pointer-events-none flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-cyan-400/55 bg-gradient-to-b from-cyan-400/50 via-cyan-600/45 to-cyan-950/88 text-2xl text-cyan-50 shadow-[0_8px_32px_rgba(6,182,212,0.22),0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md transition-[transform,box-shadow,filter] duration-75 sm:h-14 sm:w-14 sm:text-xl";

const CTRL_ACTION_HIT_BASE =
  "relative flex min-h-[6rem] w-full min-w-0 touch-none select-none flex-col items-center justify-center rounded-[24px] border border-transparent px-2 py-2.5 transition-[transform,box-shadow,filter] duration-75 sm:min-h-[3.25rem] sm:px-2 sm:py-2";

const CTRL_ACTION_FACE_BASE =
  "pointer-events-none flex min-h-[4.5rem] w-full min-w-0 max-w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1 font-bold uppercase leading-none backdrop-blur-md transition-[transform,box-shadow,filter] duration-75 sm:min-h-[3rem]";

const CTRL_JUMP_FACE_BASE = `${CTRL_ACTION_FACE_BASE} border-2 border-emerald-400/55 bg-gradient-to-b from-emerald-400/48 via-emerald-600/42 to-emerald-950/90 text-[11px] text-emerald-50 sm:text-[11px] shadow-[0_8px_32px_rgba(52,211,153,0.2),0_8px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]`;

const CTRL_KICK_FACE_BASE = `${CTRL_ACTION_FACE_BASE} border-2 border-red-500/65 bg-gradient-to-b from-red-500/58 via-red-600/45 to-red-950/92 text-[11px] text-red-50 sm:text-[11px] shadow-[0_8px_32px_rgba(248,113,113,0.35),0_8px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]`;

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
    inputRef,
    requestRematch,
    cancelRematch,
    startNextMatch,
    gdDebug: gdDebugStats,
    isHost,
    roomMatchSeq,
    isUiPreview = false,
  } = session;

  const gdDebug =
    typeof process !== "undefined" &&
    process.env.NODE_ENV === "development" &&
    typeof window !== "undefined" &&
    window.localStorage?.getItem("ov2_gd_debug") === "1";

  /** Dev-only isolate modes (debug only; no query params). */
  const readGdMode = debugEnabled => {
    if (!debugEnabled || typeof window === "undefined") return "";
    try {
      return String(window.localStorage?.getItem("ov2_gd_mode") || "").trim();
    } catch {
      return "";
    }
  };

  /**
   * Mirrors/unmirrors a public state the same way server does (involutive).
   * Debug-only diagnostic: allows rendering raw world when seat 1 snapshot is mirrored.
   * @param {Record<string, any>} pub
   * @param {number} aw
   */
  const gdMirrorPublicState = (pub, aw) => {
    const out = { ...pub };
    const flipX = o => {
      if (!o || typeof o !== "object") return o;
      const x = Number(o.x);
      const vx = Number(o.vx);
      const face = Number(o.face);
      const r = "r" in o ? Number(o.r) : undefined;
      const base = { ...o };
      if (Number.isFinite(x)) base.x = aw - x;
      if (Number.isFinite(vx)) base.vx = -vx;
      if (Number.isFinite(face)) base.face = -face;
      if (r !== undefined && Number.isFinite(r) && Number.isFinite(x)) base.x = aw - x; // keep r untouched
      return base;
    };
    out.ball = flipX(out.ball);
    out.p0 = flipX(out.p0);
    out.p1 = flipX(out.p1);
    return out;
  };

  const drawGdDebugOverlay = (ctx, W, H, lines) => {
    if (!lines || lines.length === 0) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 0.92;
    const pad = 8;
    const lh = 14;
    const boxW = Math.min(W - 10, 520);
    const boxH = Math.min(H - 10, pad * 2 + lh * (lines.length + 1));
    ctx.fillStyle = "rgba(0,0,0,0.62)";
    ctx.fillRect(5, 5, boxW, boxH);
    ctx.globalAlpha = 1;
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    let y = 5 + pad + lh;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 5 + pad, y);
      y += lh;
    }
    ctx.restore();
  };

  const [rematchBusy, setRematchBusy] = useState(false);
  const [startNextBusy, setStartNextBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const [exitErr, setExitErr] = useState("");
  const canvasRef = useRef(/** @type {HTMLCanvasElement|null} */ (null));
  /** Render-only predicted + smoothed positions (authoritative state remains `vm.public` from server). */
  const presentationRef = useRef(/** @type {ReturnType<typeof gdCreatePresentationState>|null} */ (null));
  /** Root of this screen — `contextmenu` listener scoped here (not `window`). */
  const gdScreenRootRef = useRef(/** @type {HTMLDivElement|null} */ (null));
  const vmRef = useRef(vm);
  vmRef.current = vm;
  /** Desktop keyboard — merged with pad via computePadInput. */
  const kbdRef = useRef(/** @type {{ l: boolean, r: boolean, j: boolean, k: boolean }} */ ({
    l: false,
    r: false,
    j: false,
    k: false,
  }));

  /**
   * `PointerEvent.pointerId` → which pad control (independent; true multi-touch).
   */
  const pointerPadMapRef = useRef(/** @type {Map<number, "left"|"right"|"jump"|"kick">} */ (new Map()));

  /** Pad button + face nodes — pressed look is `classList` only (`gd-pad-down` / `gd-pad-face-down`). */
  const padUiRef = useRef({
    l: { hit: /** @type {HTMLButtonElement|null} */ (null), face: /** @type {HTMLElement|null} */ (null) },
    r: { hit: null, face: null },
    j: { hit: null, face: null },
    k: { hit: null, face: null },
  });

  const resetPadInputAndVisuals = useCallback(() => {
    kbdRef.current = { l: false, r: false, j: false, k: false };
    pointerPadMapRef.current.clear();
    const cur = inputRef.current;
    cur.l = cur.r = cur.j = cur.k = cur.jTap = cur.kTap = false;
    const ui = padUiRef.current;
    const keys = /** @type {const} */ (["l", "r", "j", "k"]);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      ui[key].hit?.classList.remove("gd-pad-down");
      ui[key].face?.classList.remove("gd-pad-face-down");
    }
  }, []);

  const computePadInput = useCallback(() => {
    const k = kbdRef.current;
    const map = pointerPadMapRef.current;
    let left = false;
    let right = false;
    let jump = false;
    let kick = false;
    map.forEach(v => {
      if (v === "left") left = true;
      if (v === "right") right = true;
      if (v === "jump") jump = true;
      if (v === "kick") kick = true;
    });
    const cur = inputRef.current;
    cur.l = k.l || left;
    cur.r = k.r || right;
    cur.j = k.j || jump;
    cur.k = k.k || kick;
    const ui = padUiRef.current;
    const keys = /** @type {const} */ (["l", "r", "j", "k"]);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      const down = cur[key];
      const h = ui[key].hit;
      const f = ui[key].face;
      if (h) {
        if (down) h.classList.add("gd-pad-down");
        else h.classList.remove("gd-pad-down");
      }
      if (f) {
        if (down) f.classList.add("gd-pad-face-down");
        else f.classList.remove("gd-pad-face-down");
      }
    }
  }, []);

  /** @param {"left"|"right"|"jump"|"kick"} key */
  const handlePointerDownPad = useCallback(
    (key, e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault();
      pointerPadMapRef.current.set(e.pointerId, key);
      if (key === "jump") inputRef.current.jTap = true;
      if (key === "kick") inputRef.current.kTap = true;
      const el = /** @type {HTMLButtonElement|null} */ (e.currentTarget);
      el?.blur();
      try {
        if (el && typeof el.setPointerCapture === "function") el.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported or duplicate */
      }
      computePadInput();
    },
    [computePadInput]
  );

  const handlePointerEndPad = useCallback(
    e => {
      pointerPadMapRef.current.delete(e.pointerId);
      const el = /** @type {HTMLButtonElement|null} */ (e.currentTarget);
      try {
        if (el && typeof el.releasePointerCapture === "function" && el.hasPointerCapture?.(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      computePadInput();
    },
    [computePadInput]
  );

  const handleLostPointerCapturePad = useCallback(
    e => {
      pointerPadMapRef.current.delete(e.pointerId);
      computePadInput();
    },
    [computePadInput]
  );

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    /** Drops one pointer from the pad map — multi-touch safe (does not clear other fingers). */
    const onWinPointer = ev => {
      if (pointerPadMapRef.current.delete(ev.pointerId)) {
        computePadInput();
      }
    };
    window.addEventListener("pointerup", onWinPointer);
    window.addEventListener("pointercancel", onWinPointer);
    return () => {
      window.removeEventListener("pointerup", onWinPointer);
      window.removeEventListener("pointercancel", onWinPointer);
    };
  }, [computePadInput]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const onVis = () => {
      if (document.visibilityState !== "hidden") return;
      if (pointerPadMapRef.current.size === 0 && !kbdRef.current.l && !kbdRef.current.r && !kbdRef.current.j && !kbdRef.current.k) {
        return;
      }
      resetPadInputAndVisuals();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [resetPadInputAndVisuals]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const reset = () => resetPadInputAndVisuals();
    window.addEventListener("blur", reset);
    window.addEventListener("pagehide", reset);
    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("pagehide", reset);
    };
  }, [resetPadInputAndVisuals]);

  useEffect(() => {
    return () => {
      resetPadInputAndVisuals();
    };
  }, [resetPadInputAndVisuals]);

  const motionPrevRef = useRef(
    /** @type {{ p0x: number, p0y: number, p1x: number, p1y: number, bx: number, by: number, t: number }|null} */ (null)
  );
  const kickP0UntilRef = useRef(0);
  const kickP1UntilRef = useRef(0);
  /** Render-only kick bursts + shake; pruned in the canvas loop. */
  const kickFlashesRef = useRef(
    /** @type {Array<{ ax: number, ay: number, startMs: number, durationMs: number }>} */ ([])
  );
  const shakePulsesRef = useRef(/** @type {Array<{ until: number, start: number, amp: number }>} */ ([]));
  const prevKickHeldRef = useRef(false);
  /** Throttle ball-proximity kick FX (collision block runs every frame while overlapping). */
  const lastBallKickFxP0Ref = useRef(0);
  const lastBallKickFxP1Ref = useRef(0);
  const prevScoreRef = useRef(/** @type {[number, number]} */ ([0, 0]));
  const [goalFx, setGoalFx] = useState(/** @type {{ scorer: 0|1 }|null} */ (null));
  const [spriteHome, setSpriteHome] = useState(/** @type {CanvasImageSource|null} */ (null));
  const [spriteAway, setSpriteAway] = useState(/** @type {CanvasImageSource|null} */ (null));
  const [spriteBall, setSpriteBall] = useState(/** @type {CanvasImageSource|null} */ (null));

  const room = contextInput?.room;
  const roomId = room?.id != null ? String(room.id) : "";
  const pk = contextInput?.self?.participant_key != null ? String(contextInput.self.participant_key).trim() : "";
  const members = Array.isArray(contextInput?.members) ? contextInput.members : [];
  const onLeaveToLobby = typeof contextInput?.onLeaveToLobby === "function" ? contextInput.onLeaveToLobby : null;
  const leaveToLobbyBusy = Boolean(contextInput?.leaveToLobbyBusy);

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
    if (vm.phase !== "playing") {
      resetPadInputAndVisuals();
      kickFlashesRef.current = [];
      shakePulsesRef.current = [];
      prevKickHeldRef.current = false;
      lastBallKickFxP0Ref.current = 0;
      lastBallKickFxP1Ref.current = 0;
    }
  }, [vm.phase, resetPadInputAndVisuals]);

  useEffect(() => {
    const down = e => {
      if (vm.phase !== "playing") return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") kbdRef.current.l = true;
      if (key === "arrowright" || key === "d") kbdRef.current.r = true;
      if (key === " " || key === "w" || key === "arrowup") {
        e.preventDefault();
        if (!kbdRef.current.j) inputRef.current.jTap = true;
        kbdRef.current.j = true;
      }
      if (key === "e" || key === "k") {
        if (!kbdRef.current.k) inputRef.current.kTap = true;
        kbdRef.current.k = true;
      }
      computePadInput();
    };
    const up = e => {
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") kbdRef.current.l = false;
      if (key === "arrowright" || key === "d") kbdRef.current.r = false;
      if (key === " " || key === "w" || key === "arrowup") kbdRef.current.j = false;
      if (key === "e" || key === "k") kbdRef.current.k = false;
      computePadInput();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [vm.phase, computePadInput]);

  useEffect(() => {
    const el = gdScreenRootRef.current;
    if (!el) return undefined;
    /** @param {MouseEvent} e */
    const onCtx = e => {
      e.preventDefault();
    };
    el.addEventListener("contextmenu", onCtx);
    return () => el.removeEventListener("contextmenu", onCtx);
  }, []);

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
  /** Single post-match UI: result modal only (no dismissed / dead-end fallback). */
  const showResultModal = finished && finishSessionId.length > 0;

  const mySeat = vm.mySeat;

  const matchTimeLeftNum =
    vm.matchTimeLeftSec != null && Number.isFinite(Number(vm.matchTimeLeftSec))
      ? Number(vm.matchTimeLeftSec)
      : null;
  const timerUrgent10 =
    vm.phase === "playing" && matchTimeLeftNum != null && matchTimeLeftNum <= 10 && matchTimeLeftNum >= 0;
  const timerUrgent5 =
    vm.phase === "playing" && matchTimeLeftNum != null && matchTimeLeftNum <= 5 && matchTimeLeftNum >= 0;

  const isDrawResult = Boolean(vm.result && vm.result.isDraw === true);

  const winnerLabel = useMemo(() => {
    if (isDrawResult) return "Draw";
    if (vm.winnerSeat != null && mySeat != null) return vm.winnerSeat === mySeat ? "You won" : "You lost";
    return "Match over";
  }, [isDrawResult, vm.winnerSeat, mySeat]);

  useEffect(() => {
    if (vm.phase !== "playing") {
      motionPrevRef.current = null;
      presentationRef.current = null;
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
      setGoalFx({ scorer: 0 });
      window.setTimeout(() => setGoalFx(null), 1700);
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      shakePulsesRef.current.push({ start: now, until: now + 400, amp: 3.5 });
    } else if (s1 > ps1) {
      setGoalFx({ scorer: 1 });
      window.setTimeout(() => setGoalFx(null), 1700);
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      shakePulsesRef.current.push({ start: now, until: now + 400, amp: 3.5 });
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
      let pub = live.public && typeof live.public === "object" ? live.public : {};
      const aw = Number(pub.arena?.w ?? 800) || 800;
      const ah = Number(pub.arena?.h ?? 400) || 400;
      const gy = Number(pub.arena?.groundY ?? 360) || 360;
      const gm = Number(pub.arena?.goalMargin ?? 48) || 48;
      const W = c.width;
      const H = c.height;
      const sx = W / aw;
      const sy = H / ah;

      const debugEnabled =
        typeof process !== "undefined" &&
        process.env.NODE_ENV === "development" &&
        typeof window !== "undefined" &&
        window.localStorage?.getItem("ov2_gd_debug") === "1";
      const gdMode = readGdMode(debugEnabled);
      const authOnlyRender = debugEnabled && gdMode === "authOnly";
      const debugUnmirror = debugEnabled && gdMode === "unmirror" && (mySeat === 1 || mySeat === "1");
      if (debugUnmirror) {
        pub = gdMirrorPublicState(/** @type {any} */ (pub), aw);
      }

      const p0Auth = pub.p0 && typeof pub.p0 === "object" ? pub.p0 : {};
      const p1Auth = pub.p1 && typeof pub.p1 === "object" ? pub.p1 : {};
      const ballAuth = pub.ball && typeof pub.ball === "object" ? pub.ball : {};
      const hw0 = Number(p0Auth.hw ?? 14);
      const hh0 = Number(p0Auth.hh ?? 22);
      const hw1 = Number(p1Auth.hw ?? 14);
      const hh1 = Number(p1Auth.hh ?? 22);

      const prev = motionPrevRef.current;
      const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dtSec = prev && prev.t > 0 ? Math.min(0.08, (nowMs - prev.t) / 1000) : 0.016;

      const inp = inputRef.current;
      const kh = Boolean(inp.k);
      const kickEdge = kh && !prevKickHeldRef.current;

      let p0x;
      let p0y;
      let p1x;
      let p1y;
      let bx;
      let by;
      let br;
      if (!authOnlyRender && !isUiPreview && (mySeat === 0 || mySeat === 1)) {
        if (!presentationRef.current) presentationRef.current = gdCreatePresentationState();
        gdAdvancePresentation(presentationRef.current, pub, inp, mySeat, dtSec, {
          sessionId: String(live.sessionId ?? ""),
          score0: Number(live.score0) || 0,
          score1: Number(live.score1) || 0,
          revision: Number(live.revision ?? 0),
          localKickEdge: kickEdge,
        });
        const pr = presentationRef.current;
        p0x = pr.p0.x;
        p0y = pr.p0.y;
        p1x = pr.p1.x;
        p1y = pr.p1.y;
        bx = pr.ball.x + pr.ballNudgeX;
        by = pr.ball.y + pr.ballNudgeY;
        br = pr.ball.r;
      } else {
        p0x = Number(p0Auth.x ?? 180);
        p0y = Number(p0Auth.y ?? 338);
        p1x = Number(p1Auth.x ?? 620);
        p1y = Number(p1Auth.y ?? 338);
        bx = Number(ballAuth.x ?? 400);
        by = Number(ballAuth.y ?? 220);
        br = Number(ballAuth.r ?? 11);
      }

      const vs = GD_VISUAL_ENTITY_SCALE;
      const hw0d = hw0 * vs;
      const hh0d = hh0 * vs;
      const p0yDraw = p0y - hh0 * (vs - 1);
      const hw1d = hw1 * vs;
      const hh1d = hh1 * vs;
      const p1yDraw = p1y - hh1 * (vs - 1);
      const brd = br * vs;

      shakePulsesRef.current = shakePulsesRef.current.filter(p => nowMs < p.until);
      kickFlashesRef.current = kickFlashesRef.current.filter(f => nowMs < f.startMs + f.durationMs + 24);
      if (kickFlashesRef.current.length > 10) {
        kickFlashesRef.current.splice(0, kickFlashesRef.current.length - 10);
      }
      if (shakePulsesRef.current.length > 6) {
        shakePulsesRef.current.splice(0, shakePulsesRef.current.length - 6);
      }

      const bvx = prev ? (bx - prev.bx) / Math.max(dtSec, 0.001) : 0;
      const bvy = prev ? (by - prev.by) / Math.max(dtSec, 0.001) : 0;

      const p0ax = Number(p0Auth.x ?? 180);
      const p0ay = Number(p0Auth.y ?? 338);
      const p1ax = Number(p1Auth.x ?? 620);
      const p1ay = Number(p1Auth.y ?? 338);
      const authBx = Number(ballAuth.x ?? 400);
      const authBy = Number(ballAuth.y ?? 220);
      const authBvx = Number(ballAuth.vx ?? 0);
      const authBvy = Number(ballAuth.vy ?? 0);
      const authBspeed = Math.hypot(authBvx, authBvy);

      /** Contact flash: gate + distances use authoritative ball/players so FX aligns with server truth. */
      if (authBspeed > 220 && prev) {
        const d0 = Math.hypot(authBx - p0ax, authBy - p0ay);
        const d1 = Math.hypot(authBx - p1ax, authBy - p1ay);
        if (d0 < 54 && d0 <= d1) {
          kickP0UntilRef.current = nowMs + 160;
          if (nowMs - lastBallKickFxP0Ref.current > 105) {
            lastBallKickFxP0Ref.current = nowMs;
            kickFlashesRef.current.push({ ax: authBx, ay: authBy, startMs: nowMs, durationMs: 158 });
            shakePulsesRef.current.push({ start: nowMs, until: nowMs + 128, amp: 1.08 });
          }
        } else if (d1 < 54) {
          kickP1UntilRef.current = nowMs + 160;
          if (nowMs - lastBallKickFxP1Ref.current > 105) {
            lastBallKickFxP1Ref.current = nowMs;
            kickFlashesRef.current.push({ ax: authBx, ay: authBy, startMs: nowMs, durationMs: 158 });
            shakePulsesRef.current.push({ start: nowMs, until: nowMs + 128, amp: 1.08 });
          }
        }
      }

      if (mySeat === 0 && inp.k) kickP0UntilRef.current = nowMs + 110;
      if (mySeat === 1 && inp.k) kickP1UntilRef.current = nowMs + 110;

      prevKickHeldRef.current = kh;
      if (kickEdge && mySeat === 0) {
        kickFlashesRef.current.push({ ax: p0x, ay: p0y - hh0 * 0.42, startMs: nowMs, durationMs: 142 });
        shakePulsesRef.current.push({ start: nowMs, until: nowMs + 118, amp: 0.92 });
      } else if (kickEdge && mySeat === 1) {
        kickFlashesRef.current.push({ ax: p1x, ay: p1y - hh1 * 0.42, startMs: nowMs, durationMs: 142 });
        shakePulsesRef.current.push({ start: nowMs, until: nowMs + 118, amp: 0.92 });
      }

      const m0 = inferDogMotion(prev, p0x, p0y, "p0", dtSec);
      const m1 = inferDogMotion(prev, p1x, p1y, "p1", dtSec);
      /** Server sim sets p0.face≈+1 / p1.face≈−1 at rest; inferDogMotion used +1 for both when |vx| is tiny. */
      const signFace = v => (Number(v) >= 0 ? 1 : -1);
      const f0Srv = signFace(p0Auth.face ?? 1);
      const f1Srv = signFace(p1Auth.face ?? -1);
      const vxTh = 25;
      const facing0 = Math.abs(m0.vx) > vxTh ? m0.facing : f0Srv;
      const facing1 = Math.abs(m1.vx) > vxTh ? m1.facing : f1Srv;
      const runPhase = nowMs * 0.007;
      const idlePhase = nowMs * 0.00285;

      const sh = goalDuelScreenShakeSum(nowMs, shakePulsesRef.current);
      ctx.save();
      ctx.translate(sh.dx, sh.dy);

      drawGoalDuelArena(ctx, W, H, aw, ah, gy, gm, sx, sy);

      const j0 = inferDogJumping(p0x, p0y, hh0, gy);
      const j1 = inferDogJumping(p1x, p1y, hh1, gy);
      const k0 = nowMs < kickP0UntilRef.current;
      const k1 = nowMs < kickP1UntilRef.current;

      drawGoalDuelDog(
        ctx,
        p0x,
        p0yDraw,
        hw0d,
        hh0d,
        sx,
        sy,
        TEAM_STAR_DOG,
        {
          /** Home (star) sprite is authored facing opposite arena convention; flip draw only for p0. */
          facing: -facing0,
          jumping: j0,
          running: m0.running && !j0,
          kicking: k0,
          runPhase,
          idlePhase,
        },
        { variant: "star", sprite: spriteHome }
      );
      drawGoalDuelDog(
        ctx,
        p1x,
        p1yDraw,
        hw1d,
        hh1d,
        sx,
        sy,
        TEAM_RIVAL_DOG,
        {
          facing: facing1,
          jumping: j1,
          running: m1.running && !j1,
          kicking: k1,
          runPhase: runPhase + 0.45,
          idlePhase: idlePhase + 1.1,
        },
        { variant: "rival", sprite: spriteAway }
      );

      drawGoalDuelTennisBall(ctx, bx, by, brd, sx, sy, bvx, bvy, { sprite: spriteBall });

      drawGoalDuelKickImpacts(ctx, kickFlashesRef.current, nowMs, sx, sy);
      ctx.restore();

      if (debugEnabled) {
        const scr = { l: Boolean(inp.l), r: Boolean(inp.r), j: Boolean(inp.j), k: Boolean(inp.k) };
        const world = gdDebugStats?.lastSend;
        const authLocalKey = mySeat === 0 ? "p0" : "p1";
        const authLocal = authLocalKey === "p0" ? p0Auth : p1Auth;
        const ax = Number(authLocal.x ?? NaN);
        const ay = Number(authLocal.y ?? NaN);
        const dx = Number.isFinite(ax) ? ax - (mySeat === 0 ? p0x : p1x) : NaN;
        const dy = Number.isFinite(ay) ? ay - (mySeat === 0 ? p0y : p1y) : NaN;
        const dist = Number.isFinite(dx) && Number.isFinite(dy) ? Math.hypot(dx, dy) : NaN;

        const lines = [
          `GD_DEBUG mode=${gdMode || "presentation"} seat=${String(mySeat)} rev=${String(live.revision ?? "")}`,
          `screen intent: L=${scr.l} R=${scr.r} J=${scr.j} K=${scr.k}  jTap=${Boolean(inp.jTap)} kTap=${Boolean(inp.kTap)}`,
          `world(send): ${world ? `L=${world.l} R=${world.r} J=${world.j} K=${world.k}` : "(no send yet)"}`,
          `timing: lastSend=${Math.round(Number(gdDebugStats?.lastStepSendMs || 0))}ms lastRecv=${Math.round(
            Number(gdDebugStats?.lastSnapshotReceiveMs || 0)
          )}ms`,
          `local authΔ: dx=${Number.isFinite(dx) ? dx.toFixed(1) : "?"} dy=${Number.isFinite(dy) ? dy.toFixed(1) : "?"} dist=${
            Number.isFinite(dist) ? dist.toFixed(1) : "?"
          }`,
          `auth p0=(${Number(p0Auth.x ?? 0).toFixed(1)},${Number(p0Auth.y ?? 0).toFixed(1)}) p1=(${Number(p1Auth.x ?? 0).toFixed(
            1
          )},${Number(p1Auth.y ?? 0).toFixed(1)}) ball=(${Number(ballAuth.x ?? 0).toFixed(1)},${Number(ballAuth.y ?? 0).toFixed(1)})`,
          `pres p0=(${p0x.toFixed(1)},${p0y.toFixed(1)}) p1=(${p1x.toFixed(1)},${p1y.toFixed(1)}) ball=(${bx.toFixed(1)},${by.toFixed(
            1
          )})`,
        ];
        drawGdDebugOverlay(ctx, W, H, lines);
      }

      motionPrevRef.current = { p0x, p0y, p1x, p1y, bx, by, t: nowMs };
      raf = window.requestAnimationFrame(paint);
    };

    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [vm.phase, mySeat, inputRef, spriteHome, spriteAway, spriteBall, isUiPreview]);

  return (
    <>
      <style>{GD_SCREEN_NO_SELECT_CSS}</style>
      <div
        ref={gdScreenRootRef}
        className="gd-no-select flex h-full min-h-0 min-w-0 w-full flex-1 flex-col gap-1 overflow-hidden px-1 pb-5 pt-1 sm:gap-1.5 sm:px-1.5 sm:pb-6"
      >
      {err ? <div className="rounded-lg border border-red-500/30 bg-red-950/35 px-2 py-1.5 text-[11px] text-red-100">{err}</div> : null}
      {vaultClaimBusy ? (
        <div className="rounded-lg border border-zinc-500/20 bg-zinc-900/40 px-2 py-1 text-[10px] text-zinc-400">Updating vault…</div>
      ) : null}

      {vm.phase === "playing" && mySeat != null ? (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="relative z-10 mx-auto w-full max-w-3xl shrink-0 overflow-hidden rounded-2xl border border-amber-500/25 bg-gradient-to-b from-zinc-900/95 via-zinc-900 to-zinc-950/95 px-1 py-1.5 shadow-[0_0_24px_rgba(251,191,36,0.06),inset_0_1px_0_rgba(255,255,255,0.05)] backdrop-blur-md sm:px-3 sm:py-2">
            <div className="mb-1 flex items-center justify-center gap-2 border-b border-white/5 pb-1">
              <span className="text-[8px] font-black uppercase tracking-[0.35em] text-amber-400/90 sm:text-[9px]">MLEO Park</span>
              <span className="h-1 w-1 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" aria-hidden />
              <span className="text-[8px] font-bold uppercase tracking-widest text-zinc-500 sm:text-[9px]">Arcade duel</span>
            </div>
            {/*
              Seat 0: Home | Time | Away (world order).
              Seat 1 (mirrored snapshot): Away | Time | Home — viewer-relative; p1/your dog on visual left.
            */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-1.5 sm:gap-3">
              <div
                className={`flex min-w-0 flex-col justify-between rounded-xl border px-2 py-1.5 transition-[transform,box-shadow] duration-300 sm:px-3 sm:py-2 ${
                  mySeat === 0 ? "order-1 text-left" : "order-3 text-right"
                } ${
                  mySeat === 0
                    ? "border-amber-400/40 bg-gradient-to-br from-amber-950/90 to-zinc-950/60 ring-1 ring-amber-500/20"
                    : "border-white/10 bg-zinc-800/35"
                } ${goalFx?.scorer === 0 ? "scale-[1.02] shadow-[0_0_24px_rgba(251,191,36,0.35)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  {mySeat === 0 ? (
                    <>
                      <span className="truncate text-[8px] font-black uppercase tracking-wider text-amber-300/90 sm:text-[9px]">
                        Home
                      </span>
                      <span className="shrink-0 text-[9px] font-bold text-zinc-500">You</span>
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 text-[9px] font-bold text-zinc-500">Opp</span>
                      <span className="truncate text-[8px] font-black uppercase tracking-wider text-amber-300/90 sm:text-[9px]">
                        Home
                      </span>
                    </>
                  )}
                </div>
                <span
                  className={`mt-0.5 font-mono text-2xl font-black tabular-nums leading-none text-amber-100 sm:text-3xl ${
                    mySeat === 0 ? "" : "text-right"
                  }`}
                >
                  {vm.score0 ?? 0}
                </span>
              </div>

              <div
                className={`order-2 flex min-w-[4.25rem] flex-col items-center justify-center rounded-xl border px-2 py-1 shadow-[inset_0_0_20px_rgba(16,185,129,0.12)] transition-[box-shadow,border-color] duration-300 sm:min-w-[5.25rem] sm:px-3 sm:py-1.5 ${
                  timerUrgent5
                    ? "border-amber-400/55 bg-gradient-to-b from-amber-950/88 to-emerald-950/70 shadow-[inset_0_0_28px_rgba(245,158,11,0.22),0_0_18px_rgba(251,191,36,0.22)]"
                    : timerUrgent10
                      ? "border-emerald-400/45 bg-gradient-to-b from-emerald-950/92 to-emerald-950/68 shadow-[inset_0_0_24px_rgba(16,185,129,0.2),0_0_12px_rgba(52,211,153,0.12)]"
                      : "border-emerald-500/30 bg-gradient-to-b from-emerald-950/90 to-emerald-950/70"
                }`}
              >
                <span
                  className={`text-[7px] font-bold uppercase tracking-[0.2em] ${
                    timerUrgent5 ? "text-amber-300/95" : timerUrgent10 ? "text-emerald-300/90" : "text-emerald-400/80"
                  }`}
                >
                  Time
                </span>
                <span
                  className={`font-mono text-lg font-black tabular-nums sm:text-2xl ${
                    timerUrgent5
                      ? "text-amber-100 [animation:gd-gd-timer-urgent-5_0.85s_ease-in-out_infinite]"
                      : timerUrgent10
                        ? "text-emerald-50 [animation:gd-gd-timer-urgent-10_1.25s_ease-in-out_infinite]"
                        : "text-emerald-100"
                  }`}
                >
                  {vm.matchTimeLeftSec != null ? `${vm.matchTimeLeftSec}` : "—"}
                </span>
                <span
                  className={`text-[8px] font-semibold ${
                    timerUrgent5 ? "text-amber-400/85" : timerUrgent10 ? "text-emerald-400/85" : "text-emerald-500/70"
                  }`}
                >
                  sec
                </span>
              </div>

              <div
                className={`flex min-w-0 flex-col justify-between rounded-xl border px-2 py-1.5 transition-[transform,box-shadow] duration-300 sm:px-3 sm:py-2 ${
                  mySeat === 0 ? "order-3 text-right" : "order-1 text-left"
                } ${
                  mySeat === 1
                    ? "border-sky-400/40 bg-gradient-to-bl from-sky-950/90 to-zinc-950/60 ring-1 ring-sky-500/20"
                    : "border-white/10 bg-zinc-800/35"
                } ${goalFx?.scorer === 1 ? "scale-[1.02] shadow-[0_0_24px_rgba(56,189,248,0.35)]" : ""}`}
              >
                <div className="flex items-start justify-between gap-1">
                  {mySeat === 0 ? (
                    <>
                      <span className="shrink-0 text-[9px] font-bold text-zinc-500">Opp</span>
                      <span className="truncate text-[8px] font-black uppercase tracking-wider text-sky-300/90 sm:text-[9px]">
                        Away
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="truncate text-[8px] font-black uppercase tracking-wider text-sky-300/90 sm:text-[9px]">
                        Away
                      </span>
                      <span className="shrink-0 text-[9px] font-bold text-zinc-500">You</span>
                    </>
                  )}
                </div>
                <span
                  className={`mt-0.5 font-mono text-2xl font-black tabular-nums leading-none text-sky-100 sm:text-3xl ${
                    mySeat === 0 ? "text-right" : "text-left"
                  }`}
                >
                  {vm.score1 ?? 0}
                </span>
              </div>
            </div>
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col justify-between gap-0">
            <div className="flex w-full shrink-0 flex-col items-center py-0.5 sm:py-1 max-md:-mx-2 max-md:w-[calc(100%+1rem)]">
              <div
                className={`relative mx-auto aspect-[2/1] w-full min-h-0 min-w-0 max-w-[min(100%,60rem)] max-h-full overflow-hidden rounded-2xl border border-amber-800/40 bg-black/20 shadow-[0_16px_48px_rgba(0,0,0,0.4)] md:max-h-[min(480px,calc(100dvh-19rem))] lg:max-h-[min(520px,calc(100dvh-18rem))] ${
                  goalFx ? "[animation:gd-gd-goal-wrap-pulse_0.55s_ease-out_1]" : ""
                }`}
              >
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={400}
                  className="absolute inset-0 block h-full w-full touch-manipulation"
                />

                {goalFx ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-[22] bg-[radial-gradient(circle_at_50%_55%,rgba(0,0,0,0)_0%,rgba(0,0,0,0.42)_72%,rgba(0,0,0,0.62)_100%)] [animation:gd-gd-goal-vignette_0.65s_ease-out_1]"
                    aria-hidden
                  />
                ) : null}
                {goalFx ? (
                  <div
                    className={`pointer-events-none absolute inset-0 z-[24] mix-blend-screen [animation:gd-gd-goal-flash_0.45s_ease-out_1] ${
                      goalFx.scorer === 0 ? "bg-amber-200/30" : "bg-cyan-200/28"
                    }`}
                    aria-hidden
                  />
                ) : null}
                {goalFx ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-start gap-2 pt-[6%]"
                    key={goalFx.scorer}
                  >
                    <div
                      className={`relative skew-x-[-6deg] rounded-xl border-[3px] px-9 py-3.5 shadow-[0_0_52px_rgba(255,255,255,0.32),0_12px_40px_rgba(0,0,0,0.45)] ring-2 ring-white/25 sm:px-14 sm:py-5 ${
                        goalFx.scorer === 0
                          ? "border-amber-200/85 bg-gradient-to-r from-amber-400/95 via-orange-500/92 to-orange-700/88"
                          : "border-sky-200/85 bg-gradient-to-r from-sky-400/95 via-indigo-600/92 to-indigo-900/88"
                      }`}
                    >
                      <span className="block text-center text-3xl font-black italic tracking-tighter text-white drop-shadow-[0_5px_0_rgba(0,0,0,0.42),0_0_24px_rgba(255,255,255,0.35)] sm:text-5xl">
                        GOOOAL!
                      </span>
                    </div>
                  </div>
                ) : null}
                {goalFx ? (
                  <div
                    className={`pointer-events-none absolute inset-0 z-[25] mix-blend-screen ${
                      goalFx.scorer === 0 ? "bg-amber-400/28" : "bg-cyan-400/24"
                    }`}
                  />
                ) : null}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-1.5 pb-4 pt-2 sm:gap-2 sm:pb-5 sm:pt-3">
            <div
              className={`gd-pad-row ${CTRL_ROW} mx-auto min-w-0 max-w-[min(100%,60rem)] px-0.5 sm:px-1`}
              style={{ touchAction: "none" }}
            >
              <button
                type="button"
                draggable={false}
                aria-label="Move left"
                ref={el => {
                  padUiRef.current.l.hit = el;
                }}
                className={CTRL_MOVE_HIT_BASE}
                onPointerDown={e => handlePointerDownPad("left", e)}
                onPointerUp={handlePointerEndPad}
                onPointerCancel={handlePointerEndPad}
                onLostPointerCapture={handleLostPointerCapturePad}
              >
                <span
                  ref={el => {
                    padUiRef.current.l.face = el;
                  }}
                  className={`${CTRL_MOVE_FACE_BASE} gd-pad-face gd-pad-face--move`}
                  aria-hidden
                >
                  ◀
                </span>
              </button>
              <button
                type="button"
                draggable={false}
                aria-label="Jump"
                ref={el => {
                  padUiRef.current.j.hit = el;
                }}
                className={CTRL_ACTION_HIT_BASE}
                onPointerDown={e => handlePointerDownPad("jump", e)}
                onPointerUp={handlePointerEndPad}
                onPointerCancel={handlePointerEndPad}
                onLostPointerCapture={handleLostPointerCapturePad}
              >
                <span
                  ref={el => {
                    padUiRef.current.j.face = el;
                  }}
                  className={`${CTRL_JUMP_FACE_BASE} gd-pad-face gd-pad-face--jump`}
                >
                  <span className="text-2xl leading-none sm:text-2xl" aria-hidden>
                    ▲
                  </span>
                  <span>Jump</span>
                </span>
              </button>
              <button
                type="button"
                draggable={false}
                aria-label="Kick"
                ref={el => {
                  padUiRef.current.k.hit = el;
                }}
                className={CTRL_ACTION_HIT_BASE}
                onPointerDown={e => handlePointerDownPad("kick", e)}
                onPointerUp={handlePointerEndPad}
                onPointerCancel={handlePointerEndPad}
                onLostPointerCapture={handleLostPointerCapturePad}
              >
                <span
                  ref={el => {
                    padUiRef.current.k.face = el;
                  }}
                  className={`${CTRL_KICK_FACE_BASE} gd-pad-face gd-pad-face--kick`}
                >
                  <span className="text-2xl leading-none sm:text-2xl" aria-hidden>
                    ⚡
                  </span>
                  <span>Kick</span>
                </span>
              </button>
              <button
                type="button"
                draggable={false}
                aria-label="Move right"
                ref={el => {
                  padUiRef.current.r.hit = el;
                }}
                className={CTRL_MOVE_HIT_BASE}
                onPointerDown={e => handlePointerDownPad("right", e)}
                onPointerUp={handlePointerEndPad}
                onPointerCancel={handlePointerEndPad}
                onLostPointerCapture={handleLostPointerCapturePad}
              >
                <span
                  ref={el => {
                    padUiRef.current.r.face = el;
                  }}
                  className={`${CTRL_MOVE_FACE_BASE} gd-pad-face gd-pad-face--move`}
                  aria-hidden
                >
                  ▶
                </span>
              </button>
            </div>

            <p className="hidden shrink-0 text-center text-[10px] text-zinc-500 sm:block sm:text-[11px]">
              Desktop: A/D move · W or Space jump · E or K strike
            </p>

            {roomId && pk ? (
              <div className="mx-auto flex w-full max-w-[min(100%,60rem)] shrink-0 flex-col items-end gap-0.5 px-0.5 pb-0 pt-1 sm:px-1 sm:pt-1.5">
                <button
                  type="button"
                  title="Leave the match — counts as forfeit; opponent wins."
                  disabled={leaveToLobbyBusy || exitBusy}
                  className="text-[10px] font-semibold text-red-200/95 underline decoration-red-400/50 transition hover:text-red-100 disabled:opacity-45 sm:text-[11px]"
                  onClick={() => void (onLeaveToLobby ? onLeaveToLobby() : onExitToLobby())}
                >
                  {leaveToLobbyBusy || exitBusy ? "Leaving…" : "Leave"}
                </button>
                {exitErr && !onLeaveToLobby ? <span className="max-w-full text-right text-[9px] text-red-300/95">{exitErr}</span> : null}
              </div>
            ) : null}
          </div>
          </div>
        </div>
      ) : null}

      {!session.snapshot && room?.active_session_id ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">Loading match…</p>
          <p className="max-w-sm text-[11px] leading-snug text-zinc-500">
            If this takes too long, leave the table or return to the lobby — you are not stuck here.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={leaveToLobbyBusy || exitBusy}
              className={BTN_SECONDARY}
              onClick={() => void (onLeaveToLobby ? onLeaveToLobby() : onExitToLobby())}
            >
              {leaveToLobbyBusy || exitBusy ? "Leaving…" : "Leave table"}
            </button>
            <Link
              href="/online-v2/rooms"
              className="text-[11px] font-semibold text-sky-300/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-200"
            >
              Back to lobby
            </Link>
          </div>
        </div>
      ) : null}

      {session.snapshot &&
      room?.active_session_id &&
      !(vm.phase === "playing" && mySeat != null) &&
      !finished ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-4 py-8 text-center">
          <p className="text-sm text-zinc-300">
            {vm.phase === "playing" && mySeat == null
              ? "You are not seated in this match."
              : vm.phase && vm.phase !== "playing" && vm.phase !== "finished"
                ? "Waiting for the match…"
                : "Match is not ready yet."}
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              disabled={leaveToLobbyBusy || exitBusy}
              className={BTN_SECONDARY}
              onClick={() => void (onLeaveToLobby ? onLeaveToLobby() : onExitToLobby())}
            >
              {leaveToLobbyBusy || exitBusy ? "Leaving…" : "Leave table"}
            </button>
            <Link
              href="/online-v2/rooms"
              className="text-[11px] font-semibold text-sky-300/90 underline decoration-sky-500/30 underline-offset-2 transition hover:text-sky-200"
            >
              Back to lobby
            </Link>
          </div>
        </div>
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
                {mySeat === 1 ? (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-sky-200/60">Away</span>
                      <span className="font-mono text-3xl font-black text-sky-200">{String(vm.result.score1 ?? vm.score1)}</span>
                    </div>
                    <span className="text-zinc-600">—</span>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-200/60">Home</span>
                      <span className="font-mono text-3xl font-black text-amber-200">{String(vm.result.score0 ?? vm.score0)}</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-amber-200/60">Home</span>
                      <span className="font-mono text-3xl font-black text-amber-200">{String(vm.result.score0 ?? vm.score0)}</span>
                    </div>
                    <span className="text-zinc-600">—</span>
                    <div className="flex flex-col items-center gap-0.5">
                      <span className="text-[8px] font-bold uppercase tracking-wider text-sky-200/60">Away</span>
                      <span className="font-mono text-3xl font-black text-sky-200">{String(vm.result.score1 ?? vm.score1)}</span>
                    </div>
                  </>
                )}
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
      </div>
    </>
  );
}
