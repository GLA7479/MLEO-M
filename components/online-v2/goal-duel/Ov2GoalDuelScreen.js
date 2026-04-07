"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

/** Canvas-only scale for dogs + ball; server snapshot coords unchanged. Py offset keeps feet on ground. */
const GD_VISUAL_ENTITY_SCALE = 1.32;

const finishDismissStorageKey = sid => `ov2_gd_finish_dismiss_${sid}`;

const BTN_PRIMARY =
  "rounded-lg border border-emerald-500/24 bg-gradient-to-b from-emerald-950/65 to-emerald-950 px-3 py-2 text-[11px] font-semibold text-emerald-100/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_3px_10px_rgba(0,0,0,0.26)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";
const BTN_SECONDARY =
  "rounded-lg border border-zinc-500/24 bg-gradient-to-b from-zinc-800/52 to-zinc-950 px-3 py-2 text-[11px] font-medium text-zinc-300/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_2px_10px_rgba(0,0,0,0.24)] transition-[transform,opacity] active:scale-[0.98] disabled:opacity-45";

/**
 * [LEFT][JUMP][KICK][RIGHT] — 6rem move columns on mobile; touch-none blocks browser gestures in the pad.
 */
const CTRL_ROW =
  "pointer-events-auto grid w-full touch-none select-none items-stretch justify-items-stretch gap-3 [-webkit-tap-highlight-color:transparent] [grid-template-columns:6rem_minmax(0,1fr)_minmax(0,1fr)_6rem] sm:gap-4";

/** Large hit target (6×6rem min on mobile); visible face stays ~4rem inside. */
const CTRL_MOVE_HIT =
  "relative flex min-h-[6rem] min-w-[6rem] max-w-[6rem] w-full touch-none select-none items-center justify-center self-center rounded-[24px] border border-transparent px-1 py-2 transition-[transform,opacity] active:scale-[0.99] [-webkit-tap-highlight-color:transparent] sm:min-h-[3.5rem] sm:min-w-[4.75rem] sm:max-w-[4.75rem] sm:px-1.5 sm:py-2";

/** Visible arrow ~4rem × 4rem (no downscale vs column). */
const CTRL_MOVE_FACE =
  "pointer-events-none flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-cyan-400/55 bg-gradient-to-b from-cyan-400/50 via-cyan-600/45 to-cyan-950/88 text-2xl text-cyan-50 shadow-[0_8px_32px_rgba(6,182,212,0.22),0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.22)] backdrop-blur-md sm:h-14 sm:w-14 sm:text-xl";

const CTRL_ACTION_HIT =
  "relative flex min-h-[6rem] w-full min-w-0 touch-none select-none flex-col items-center justify-center rounded-[24px] border border-transparent px-2 py-2.5 transition-[transform,opacity] active:scale-[0.99] [-webkit-tap-highlight-color:transparent] sm:min-h-[3.25rem] sm:px-2 sm:py-2";

const CTRL_ACTION_FACE =
  "pointer-events-none flex min-h-[4.5rem] w-full min-w-0 max-w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1 font-bold uppercase leading-none backdrop-blur-md sm:min-h-[3rem]";

const CTRL_JUMP_FACE = `${CTRL_ACTION_FACE} border-2 border-emerald-400/55 bg-gradient-to-b from-emerald-400/48 via-emerald-600/42 to-emerald-950/90 text-[11px] text-emerald-50 sm:text-[11px] shadow-[0_8px_32px_rgba(52,211,153,0.2),0_8px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]`;

const CTRL_KICK_FACE = `${CTRL_ACTION_FACE} border-2 border-red-500/65 bg-gradient-to-b from-red-500/58 via-red-600/45 to-red-950/92 text-[11px] text-red-50 sm:text-[11px] shadow-[0_8px_32px_rgba(248,113,113,0.35),0_8px_28px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.2)]`;

/** @param {number} pointerId */
function gdPtrKey(pointerId) {
  return `p:${pointerId}`;
}
/** @param {number} touchId */
function gdTouchKey(touchId) {
  return `t:${touchId}`;
}

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
  /** Desktop keyboard (merged with touch in commitInputFromRefs). */
  const kbdRef = useRef(/** @type {{ l: boolean, r: boolean, j: boolean, k: boolean }} */ ({
    l: false,
    r: false,
    j: false,
    k: false,
  }));
  /** Touch move: exclusive l/r from pointer arbitration (never both true). */
  const touchMoveRef = useRef(/** @type {{ l: boolean, r: boolean }} */ ({ l: false, r: false }));
  /** Keys `p:${pointerId}` (mouse/pen) or `t:${touchId}` — avoids double-count when both APIs exist. */
  const movePtrLRef = useRef(/** @type {Set<string>} */ (new Set()));
  const movePtrRRef = useRef(/** @type {Set<string>} */ (new Set()));
  /** Last pointerdown on a move button while both sides have ≥1 pointer — wins tie. */
  const lastMoveDownRef = useRef(/** @type {"l"|"r"|null} */ (null));
  const ptrJRef = useRef(/** @type {Set<string>} */ (new Set()));
  const ptrKRef = useRef(/** @type {Set<string>} */ (new Set()));

  /** Native non-passive touch listeners (React synthetic touch is passive → preventDefault ignored). */
  const ctrlPadLRef = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const ctrlPadRRef = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const ctrlPadJRef = useRef(/** @type {HTMLButtonElement|null} */ (null));
  const ctrlPadKRef = useRef(/** @type {HTMLButtonElement|null} */ (null));

  const commitInputFromRefs = useCallback(() => {
    const k = kbdRef.current;
    const t = touchMoveRef.current;
    setInput({
      l: k.l || t.l,
      r: k.r || t.r,
      j: k.j || ptrJRef.current.size > 0,
      k: k.k || ptrKRef.current.size > 0,
    });
  }, [setInput]);

  const syncTouchMove = useCallback(() => {
    const L = movePtrLRef.current.size;
    const R = movePtrRRef.current.size;
    let tl = false;
    let tr = false;
    if (L === 0 && R === 0) {
      tl = false;
      tr = false;
    } else if (L > 0 && R === 0) {
      tl = true;
    } else if (R > 0 && L === 0) {
      tr = true;
    } else {
      const last = lastMoveDownRef.current;
      if (last === "l") {
        tl = true;
      } else {
        tr = true;
      }
    }
    touchMoveRef.current = { l: tl, r: tr };
    commitInputFromRefs();
  }, [commitInputFromRefs]);
  const motionPrevRef = useRef(
    /** @type {{ p0x: number, p0y: number, p1x: number, p1y: number, bx: number, by: number, t: number }|null} */ (null)
  );
  const kickP0UntilRef = useRef(0);
  const kickP1UntilRef = useRef(0);
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
    if (vm.phase !== "playing") {
      kbdRef.current = { l: false, r: false, j: false, k: false };
      touchMoveRef.current = { l: false, r: false };
      movePtrLRef.current.clear();
      movePtrRRef.current.clear();
      lastMoveDownRef.current = null;
      ptrJRef.current.clear();
      ptrKRef.current.clear();
      setInput({ l: false, r: false, j: false, k: false });
    }
  }, [vm.phase, setInput]);

  const activateMove = useCallback(
    (side, key) => {
      if (vmRef.current.phase !== "playing") return;
      const set = side === "l" ? movePtrLRef.current : movePtrRRef.current;
      set.add(key);
      lastMoveDownRef.current = side;
      syncTouchMove();
    },
    [syncTouchMove]
  );

  const deactivateMove = useCallback(
    (side, key) => {
      const set = side === "l" ? movePtrLRef.current : movePtrRRef.current;
      if (!set.delete(key)) return;
      syncTouchMove();
    },
    [syncTouchMove]
  );

  const deactivateMoveForced = useCallback(
    (side, key) => {
      const set = side === "l" ? movePtrLRef.current : movePtrRRef.current;
      set.delete(key);
      syncTouchMove();
    },
    [syncTouchMove]
  );

  const activateAction = useCallback(
    (kind, key) => {
      if (vmRef.current.phase !== "playing") return;
      const set = kind === "j" ? ptrJRef.current : ptrKRef.current;
      set.add(key);
      commitInputFromRefs();
    },
    [commitInputFromRefs]
  );

  const deactivateAction = useCallback(
    (kind, key) => {
      const set = kind === "j" ? ptrJRef.current : ptrKRef.current;
      if (!set.delete(key)) return;
      commitInputFromRefs();
    },
    [commitInputFromRefs]
  );

  const deactivateActionForced = useCallback(
    (kind, key) => {
      const set = kind === "j" ? ptrJRef.current : ptrKRef.current;
      set.delete(key);
      commitInputFromRefs();
    },
    [commitInputFromRefs]
  );

  const bindMoveControls = useCallback(
    side => ({
      onPointerDown: e => {
        if (e.pointerType === "touch") return;
        if (vmRef.current.phase !== "playing") return;
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const key = gdPtrKey(e.pointerId);
        activateMove(side, key);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerUp: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        const set = side === "l" ? movePtrLRef.current : movePtrRRef.current;
        if (!set.has(key)) return;
        deactivateMove(side, key);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerCancel: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        deactivateMoveForced(side, key);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onLostPointerCapture: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        deactivateMoveForced(side, key);
      },
    }),
    [activateMove, deactivateMove, deactivateMoveForced]
  );

  const bindActionControls = useCallback(
    kind => ({
      onPointerDown: e => {
        if (e.pointerType === "touch") return;
        if (vmRef.current.phase !== "playing") return;
        e.preventDefault();
        e.stopPropagation();
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const key = gdPtrKey(e.pointerId);
        activateAction(kind, key);
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerUp: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        const set = kind === "j" ? ptrJRef.current : ptrKRef.current;
        if (!set.has(key)) return;
        deactivateAction(kind, key);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onPointerCancel: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        deactivateActionForced(kind, key);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          /* ignore */
        }
      },
      onLostPointerCapture: e => {
        if (e.pointerType === "touch") return;
        const key = gdPtrKey(e.pointerId);
        deactivateActionForced(kind, key);
      },
    }),
    [activateAction, deactivateAction, deactivateActionForced]
  );

  useEffect(() => {
    const down = e => {
      if (vm.phase !== "playing") return;
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") kbdRef.current.l = true;
      if (key === "arrowright" || key === "d") kbdRef.current.r = true;
      if (key === " " || key === "w" || key === "arrowup") {
        e.preventDefault();
        kbdRef.current.j = true;
      }
      if (key === "e" || key === "k") kbdRef.current.k = true;
      commitInputFromRefs();
    };
    const up = e => {
      const key = e.key.toLowerCase();
      if (key === "arrowleft" || key === "a") kbdRef.current.l = false;
      if (key === "arrowright" || key === "d") kbdRef.current.r = false;
      if (key === " " || key === "w" || key === "arrowup") kbdRef.current.j = false;
      if (key === "e" || key === "k") kbdRef.current.k = false;
      commitInputFromRefs();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [vm.phase, commitInputFromRefs]);

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

  /** Touch input uses native `{ passive: false }` listeners so `preventDefault` suppresses scroll/gesture. */
  useLayoutEffect(() => {
    if (typeof window === "undefined" || vm.phase !== "playing" || mySeat == null) return undefined;

    const passiveOpts = /** @type {AddEventListenerOptions} */ ({ passive: false });

    /** @param {"l"|"r"} side */
    const moveTouchStart = side => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      if (vmRef.current.phase !== "playing") return;
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        activateMove(side, gdTouchKey(changedTouches[i].identifier));
      }
    };
    /** @param {"l"|"r"} side */
    const moveTouchEnd = side => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        deactivateMove(side, gdTouchKey(changedTouches[i].identifier));
      }
    };
    /** @param {"l"|"r"} side */
    const moveTouchCancel = side => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        deactivateMoveForced(side, gdTouchKey(changedTouches[i].identifier));
      }
    };

    /** @param {"j"|"k"} kind */
    const actionTouchStart = kind => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      if (vmRef.current.phase !== "playing") return;
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        activateAction(kind, gdTouchKey(changedTouches[i].identifier));
      }
    };
    /** @param {"j"|"k"} kind */
    const actionTouchEnd = kind => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        deactivateAction(kind, gdTouchKey(changedTouches[i].identifier));
      }
    };
    /** @param {"j"|"k"} kind */
    const actionTouchCancel = kind => /** @param {TouchEvent} e */ e => {
      e.preventDefault();
      e.stopPropagation();
      const { changedTouches } = e;
      for (let i = 0; i < changedTouches.length; i++) {
        deactivateActionForced(kind, gdTouchKey(changedTouches[i].identifier));
      }
    };

    const pairs = [
      { el: ctrlPadLRef.current, start: moveTouchStart("l"), end: moveTouchEnd("l"), cancel: moveTouchCancel("l") },
      { el: ctrlPadRRef.current, start: moveTouchStart("r"), end: moveTouchEnd("r"), cancel: moveTouchCancel("r") },
      { el: ctrlPadJRef.current, start: actionTouchStart("j"), end: actionTouchEnd("j"), cancel: actionTouchCancel("j") },
      { el: ctrlPadKRef.current, start: actionTouchStart("k"), end: actionTouchEnd("k"), cancel: actionTouchCancel("k") },
    ];

    const cleanups = [];
    for (const p of pairs) {
      if (!p.el) continue;
      p.el.addEventListener("touchstart", p.start, passiveOpts);
      p.el.addEventListener("touchend", p.end, passiveOpts);
      p.el.addEventListener("touchcancel", p.cancel, passiveOpts);
      cleanups.push(() => {
        p.el.removeEventListener("touchstart", p.start, passiveOpts);
        p.el.removeEventListener("touchend", p.end, passiveOpts);
        p.el.removeEventListener("touchcancel", p.cancel, passiveOpts);
      });
    }

    return () => {
      cleanups.forEach(fn => fn());
    };
  }, [
    vm.phase,
    mySeat,
    activateMove,
    deactivateMove,
    deactivateMoveForced,
    activateAction,
    deactivateAction,
    deactivateActionForced,
  ]);

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
      setGoalFx({ scorer: 0 });
      window.setTimeout(() => setGoalFx(null), 1700);
    } else if (s1 > ps1) {
      setGoalFx({ scorer: 1 });
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

      const vs = GD_VISUAL_ENTITY_SCALE;
      const hw0d = hw0 * vs;
      const hh0d = hh0 * vs;
      const p0yDraw = p0y - hh0 * (vs - 1);
      const hw1d = hw1 * vs;
      const hh1d = hh1 * vs;
      const p1yDraw = p1y - hh1 * (vs - 1);
      const brd = br * vs;

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
      /** Server sim sets p0.face≈+1 / p1.face≈−1 at rest; inferDogMotion used +1 for both when |vx| is tiny. */
      const signFace = v => (Number(v) >= 0 ? 1 : -1);
      const f0Srv = signFace(p0.face ?? 1);
      const f1Srv = signFace(p1.face ?? -1);
      const vxTh = 25;
      const facing0 = Math.abs(m0.vx) > vxTh ? m0.facing : f0Srv;
      const facing1 = Math.abs(m1.vx) > vxTh ? m1.facing : f1Srv;
      const runPhase = nowMs * 0.007;

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
        },
        { variant: "rival", sprite: spriteAway }
      );

      drawGoalDuelTennisBall(ctx, bx, by, brd, sx, sy, bvx, bvy, { sprite: spriteBall });

      motionPrevRef.current = { p0x, p0y, p1x, p1y, bx, by, t: nowMs };
      raf = window.requestAnimationFrame(paint);
    };

    raf = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(raf);
  }, [vm.phase, mySeat, inputRef, spriteHome, spriteAway, spriteBall]);

  return (
    <div className="flex h-full min-h-0 min-w-0 w-full flex-1 flex-col gap-1 overflow-hidden px-1 pb-5 pt-1 sm:gap-1.5 sm:px-1.5 sm:pb-6">
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

              <div className="order-2 flex min-w-[4.25rem] flex-col items-center justify-center rounded-xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/90 to-emerald-950/70 px-2 py-1 shadow-[inset_0_0_20px_rgba(16,185,129,0.12)] sm:min-w-[5.25rem] sm:px-3 sm:py-1.5">
                <span className="text-[7px] font-bold uppercase tracking-[0.2em] text-emerald-400/80">Time</span>
                <span className="font-mono text-lg font-black tabular-nums text-emerald-100 sm:text-2xl">
                  {vm.matchTimeLeftSec != null ? `${vm.matchTimeLeftSec}` : "—"}
                </span>
                <span className="text-[8px] font-semibold text-emerald-500/70">sec</span>
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
                className="relative mx-auto aspect-[2/1] w-full min-h-0 min-w-0 max-w-[min(100%,60rem)] max-h-full overflow-hidden rounded-2xl border border-amber-800/40 bg-black/20 shadow-[0_16px_48px_rgba(0,0,0,0.4)] md:max-h-[min(480px,calc(100dvh-19rem))] lg:max-h-[min(520px,calc(100dvh-18rem))]"
              >
                <canvas
                  ref={canvasRef}
                  width={800}
                  height={400}
                  className="absolute inset-0 block h-full w-full touch-none"
                />

                {goalFx ? (
                  <div
                    className="pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-start gap-2 pt-[6%]"
                    key={goalFx.scorer}
                  >
                    <div
                      className={`relative skew-x-[-6deg] rounded-lg border-2 px-8 py-3 shadow-[0_0_40px_rgba(255,255,255,0.25)] sm:px-12 sm:py-4 ${
                        goalFx.scorer === 0
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
                      goalFx.scorer === 0 ? "bg-amber-400/25" : "bg-cyan-400/20"
                    }`}
                  />
                ) : null}
              </div>
            </div>

            <div className="flex w-full shrink-0 flex-col gap-1.5 pb-4 pt-2 sm:gap-2 sm:pb-5 sm:pt-3">
            <div className={`${CTRL_ROW} mx-auto min-w-0 max-w-[min(100%,60rem)] px-0.5 sm:px-1`}>
              <button ref={ctrlPadLRef} type="button" draggable={false} aria-label="Move left" className={CTRL_MOVE_HIT} {...bindMoveControls("l")}>
                <span className={CTRL_MOVE_FACE} aria-hidden>
                  ◀
                </span>
              </button>
              <button ref={ctrlPadJRef} type="button" draggable={false} aria-label="Jump" className={CTRL_ACTION_HIT} {...bindActionControls("j")}>
                <span className={CTRL_JUMP_FACE}>
                  <span className="text-2xl leading-none sm:text-2xl" aria-hidden>
                    ▲
                  </span>
                  <span>Jump</span>
                </span>
              </button>
              <button ref={ctrlPadKRef} type="button" draggable={false} aria-label="Kick" className={CTRL_ACTION_HIT} {...bindActionControls("k")}>
                <span className={CTRL_KICK_FACE}>
                  <span className="text-2xl leading-none sm:text-2xl" aria-hidden>
                    ⚡
                  </span>
                  <span>Kick</span>
                </span>
              </button>
              <button ref={ctrlPadRRef} type="button" draggable={false} aria-label="Move right" className={CTRL_MOVE_HIT} {...bindMoveControls("r")}>
                <span className={CTRL_MOVE_FACE} aria-hidden>
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
      !finished &&
      !showResultModal ? (
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
